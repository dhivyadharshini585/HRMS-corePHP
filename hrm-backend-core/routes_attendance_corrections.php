<?php

require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';
require_once __DIR__ . '/routes_organization.php';

// ==========================================
// ATTENDANCE CORRECTIONS MODULE
// ==========================================

/**
 * Helper to calculate working hours from timestamps using standard HRMS application formula:
 * round((strtotime($checkOut) - strtotime($checkIn)) / 3600, 2)
 */
function calculateAttendanceWorkingHours(string $checkIn, string $checkOut): float {
    $tIn = strtotime($checkIn);
    $tOut = strtotime($checkOut);
    if ($tIn === false || $tOut === false || $tOut <= $tIn) {
        return 0.0;
    }
    return round(($tOut - $tIn) / 3600.0, 2);
}

/**
 * Helper to determine attendance status based on working hours:
 * >= 4.0 hours -> 'Present', > 0.0 hours -> 'Half Day'
 */
function determineAttendanceStatusFromHours(float $hours): string {
    return ($hours >= 4.0) ? 'Present' : 'Half Day';
}

/**
 * POST /api/attendance/corrections
 * Submit a correction request for an authenticated employee's attendance record.
 */
Router::post('/api/attendance/corrections', function() {
    $user = Auth::user();
    $empId = $user['employee_id'] ?? null;

    if (empty($empId)) {
        http_response_code(403);
        echo json_encode(['error' => 'No employee profile linked to authenticated user.']);
        return;
    }

    $db = Database::getConnection();

    // Decode request payload
    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if (!is_array($input)) {
        global $input;
        if (!is_array($input)) {
            $input = [];
        }
    }

    // Validation
    $errors = [];

    // 1. attendance_id
    $attendanceId = $input['attendance_id'] ?? null;
    if (empty($attendanceId) || !is_numeric($attendanceId) || (int)$attendanceId <= 0) {
        $errors['attendance_id'] = 'Valid attendance_id is required.';
    } else {
        $attendanceId = (int)$attendanceId;
    }

    // 2. requested timestamps
    $reqCheckIn = !empty($input['requested_check_in']) ? trim($input['requested_check_in']) : null;
    $reqCheckOut = !empty($input['requested_check_out']) ? trim($input['requested_check_out']) : null;

    if ($reqCheckIn === null && $reqCheckOut === null) {
        $errors['requested_times'] = 'At least one of requested_check_in or requested_check_out must be provided.';
    }

    $timeCheckIn = null;
    if ($reqCheckIn !== null) {
        $timeCheckIn = strtotime($reqCheckIn);
        if ($timeCheckIn === false) {
            $errors['requested_check_in'] = 'requested_check_in must be a valid datetime.';
        } else {
            $reqCheckIn = date('Y-m-d H:i:s', $timeCheckIn);
        }
    }

    $timeCheckOut = null;
    if ($reqCheckOut !== null) {
        $timeCheckOut = strtotime($reqCheckOut);
        if ($timeCheckOut === false) {
            $errors['requested_check_out'] = 'requested_check_out must be a valid datetime.';
        } else {
            $reqCheckOut = date('Y-m-d H:i:s', $timeCheckOut);
        }
    }

    if ($timeCheckIn !== null && $timeCheckOut !== null) {
        if ($timeCheckOut <= $timeCheckIn) {
            $errors['requested_order'] = 'Requested check-out time must be chronologically after requested check-in time.';
        }
    }

    // 3. reason
    $reason = isset($input['reason']) ? trim((string)$input['reason']) : '';
    if (mb_strlen($reason) < 5 || mb_strlen($reason) > 1000) {
        $errors['reason'] = 'Reason is required and must be between 5 and 1000 characters.';
    }

    // 4. evidence_details (optional text)
    $evidenceDetails = isset($input['evidence_details']) ? trim((string)$input['evidence_details']) : null;
    if ($evidenceDetails !== null && mb_strlen($evidenceDetails) > 2000) {
        $errors['evidence_details'] = 'Evidence details cannot exceed 2000 characters.';
    }
    if ($evidenceDetails === '') {
        $evidenceDetails = null;
    }

    if (!empty($errors)) {
        http_response_code(400);
        echo json_encode(['errors' => $errors]);
        return;
    }

    // Verify ownership of attendance record
    $attStmt = $db->prepare("SELECT id, employee_id, attendance_date, check_in, check_out FROM attendances WHERE id = :id LIMIT 1");
    $attStmt->execute(['id' => $attendanceId]);
    $attendanceRecord = $attStmt->fetch(PDO::FETCH_ASSOC);

    if (!$attendanceRecord) {
        http_response_code(404);
        echo json_encode(['error' => 'Attendance record not found.']);
        return;
    }

    if ((int)$attendanceRecord['employee_id'] !== (int)$empId) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden: You do not own this attendance record.']);
        return;
    }

    // Execute atomic transaction: insert correction + initial history event
    $db->beginTransaction();
    try {
        $insertStmt = $db->prepare("
            INSERT INTO attendance_corrections (
                attendance_id, employee_id, requested_check_in, requested_check_out,
                reason, evidence_details, status, created_at, updated_at
            ) VALUES (
                :attendance_id, :employee_id, :req_check_in, :req_check_out,
                :reason, :evidence_details, 'Pending', NOW(), NOW()
            )
        ");
        $insertStmt->execute([
            'attendance_id'     => $attendanceId,
            'employee_id'       => $empId,
            'req_check_in'      => $reqCheckIn,
            'req_check_out'     => $reqCheckOut,
            'reason'            => $reason,
            'evidence_details'  => $evidenceDetails
        ]);
        $correctionId = (int)$db->lastInsertId();

        $snapshotData = [
            'attendance_id'       => $attendanceId,
            'attendance_date'     => $attendanceRecord['attendance_date'],
            'original_check_in'   => $attendanceRecord['check_in'],
            'original_check_out'  => $attendanceRecord['check_out'],
            'requested_check_in'  => $reqCheckIn,
            'requested_check_out' => $reqCheckOut,
            'reason'              => $reason,
            'evidence_details'    => $evidenceDetails
        ];

        $histStmt = $db->prepare("
            INSERT INTO attendance_correction_history (
                correction_id, action, actor_user_id, actor_employee_id,
                from_status, to_status, remarks, snapshot_data, created_at
            ) VALUES (
                :correction_id, 'submitted', :actor_user_id, :actor_employee_id,
                NULL, 'Pending', NULL, :snapshot_data, NOW()
            )
        ");
        $histStmt->execute([
            'correction_id'     => $correctionId,
            'actor_user_id'     => $user['user_id'],
            'actor_employee_id' => $empId,
            'snapshot_data'     => json_encode($snapshotData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        ]);

        $db->commit();

        http_response_code(201);
        echo json_encode([
            'message' => 'Attendance correction request submitted successfully.',
            'data' => [
                'id'                  => $correctionId,
                'attendance_id'       => $attendanceId,
                'employee_id'         => $empId,
                'requested_check_in'  => $reqCheckIn,
                'requested_check_out' => $reqCheckOut,
                'reason'              => $reason,
                'evidence_details'    => $evidenceDetails,
                'status'              => 'Pending',
                'created_at'          => date('Y-m-d H:i:s')
            ]
        ]);
    } catch (\PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }

        // Precision check for unique constraint uq_active_attendance_correction
        $isDup = ($e->getCode() == 23000 || $e->getCode() === '23000')
            && (strpos($e->getMessage(), '1062') !== false || strpos($e->getMessage(), 'Duplicate entry') !== false);

        if ($isDup && strpos($e->getMessage(), 'uq_active_attendance_correction') !== false) {
            http_response_code(409);
            echo json_encode([
                'error' => 'Conflict: An active correction request (Pending or Escalated) already exists for this attendance session.'
            ]);
            return;
        }

        error_log('[AttendanceCorrection] Database error on submission: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'An internal database error occurred while processing your request.']);
    } catch (\Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('[AttendanceCorrection] Unexpected error on submission: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'An unexpected internal error occurred.']);
    }
});

/**
 * GET /api/attendance/corrections/my
 * List authenticated employee's attendance corrections with audit timeline.
 * NOTE: Registered before /{id} to ensure literal '/my' is matched first.
 */
Router::get('/api/attendance/corrections/my', function() {
    $user = Auth::user();
    $empId = $user['employee_id'] ?? null;

    if (empty($empId)) {
        http_response_code(403);
        echo json_encode(['error' => 'No employee profile linked to authenticated user.']);
        return;
    }

    $db = Database::getConnection();

    $statusFilter = isset($_GET['status']) ? trim($_GET['status']) : null;
    $validStatuses = ['Pending', 'Escalated', 'Approved', 'Rejected'];

    $sql = "
        SELECT 
            ac.id,
            ac.attendance_id,
            ac.employee_id,
            a.attendance_date,
            a.check_in AS original_check_in,
            a.check_out AS original_check_out,
            ac.requested_check_in,
            ac.requested_check_out,
            ac.reason,
            ac.evidence_details,
            ac.status,
            ac.escalated_to,
            ac.escalation_reason,
            ac.escalated_at,
            ac.manager_remarks,
            ac.hr_remarks,
            ac.reviewed_at,
            ac.created_at,
            ac.updated_at
        FROM attendance_corrections ac
        LEFT JOIN attendances a ON ac.attendance_id = a.id
        WHERE ac.employee_id = :emp_id
    ";

    $params = ['emp_id' => $empId];

    if ($statusFilter !== null && in_array($statusFilter, $validStatuses, true)) {
        $sql .= " AND ac.status = :status";
        $params['status'] = $statusFilter;
    }

    $sql .= " ORDER BY ac.created_at DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $corrections = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($corrections)) {
        echo json_encode(['data' => []]);
        return;
    }

    // Fetch history records for all returned corrections
    $correctionIds = array_column($corrections, 'id');
    $placeholders = implode(',', array_fill(0, count($correctionIds), '?'));

    $histStmt = $db->prepare("
        SELECT 
            h.id,
            h.correction_id,
            h.action,
            h.actor_user_id,
            h.actor_employee_id,
            CONCAT(u.name) AS actor_name,
            h.from_status,
            h.to_status,
            h.remarks,
            h.snapshot_data,
            h.created_at
        FROM attendance_correction_history h
        LEFT JOIN users u ON h.actor_user_id = u.id
        WHERE h.correction_id IN ($placeholders)
        ORDER BY h.id ASC
    ");
    $histStmt->execute($correctionIds);
    $histRows = $histStmt->fetchAll(PDO::FETCH_ASSOC);

    $histMap = [];
    foreach ($histRows as $hr) {
        $cId = (int)$hr['correction_id'];
        if (!isset($histMap[$cId])) {
            $histMap[$cId] = [];
        }
        if (!empty($hr['snapshot_data']) && is_string($hr['snapshot_data'])) {
            $hr['snapshot_data'] = json_decode($hr['snapshot_data'], true);
        }
        $histMap[$cId][] = $hr;
    }

    foreach ($corrections as &$c) {
        $cId = (int)$c['id'];
        $c['history'] = $histMap[$cId] ?? [];
    }
    unset($c);

    echo json_encode(['data' => $corrections]);
});

/**
 * GET /api/attendance/corrections/pending
 * Retrieve pending/actionable attendance correction requests scoped to the authenticated reviewer.
 * NOTE: Registered before /{id} to ensure literal '/pending' is matched first.
 *
 * Authorization rules:
 * 1. Managers may retrieve only requests they are authorized to review within their reporting hierarchy.
 * 2. Authorized HR reviewers are Super Admin, HR Admin, and HR Executive.
 * 3. HR reviewers can retrieve escalated requests through the shared HR review queue.
 * 4. Finance/Payroll Admin does not receive reviewer permissions solely because of their role.
 * 5. Preserve manager-first review for ordinary employees who have a reporting manager.
 * 6. Preserve exceptions for employees without a manager and for a manager's own correction request.
 * 7. Managers cannot review escalated requests.
 * 8. Users cannot review their own correction requests (strict self-action exclusion).
 * 9. Approved and Rejected requests never appear in the actionable pending queue.
 */
Router::get('/api/attendance/corrections/pending', function() {
    $user = Auth::user();
    $currentEmpId = $user['employee_id'] ?? null;
    $userRoles = $user['roles'] ?? [];

    $isAuthorizedHR = !empty(array_intersect(['Super Admin', 'HR Admin', 'HR Executive'], $userRoles));

    $db = Database::getConnection();

    $descendantIds = [];
    if ($currentEmpId !== null) {
        $descendantIds = getEmployeeDescendantIds($db, $currentEmpId);
    }
    $isManager = !empty($descendantIds);

    // Fail closed: Users who are neither authorized HR reviewers nor managers with direct/indirect reports
    if (!$isAuthorizedHR && !$isManager) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden: You are not authorized to access the reviewer queue.']);
        return;
    }

    $statusFilter = isset($_GET['status']) ? trim($_GET['status']) : null;
    $statusCondition = "q.status IN ('Pending', 'Escalated')";
    if ($statusFilter !== null) {
        if ($statusFilter === 'Pending') {
            $statusCondition = "q.status = 'Pending'";
        } elseif ($statusFilter === 'Escalated') {
            if (!$isAuthorizedHR) {
                // Non-HR reviewers cannot view escalated requests
                echo json_encode(['data' => []]);
                return;
            }
            $statusCondition = "q.status = 'Escalated'";
        } else {
            // Unsupported or terminal filter requested on pending queue
            echo json_encode(['data' => []]);
            return;
        }
    }

    $params = [];
    $selfExclusion = "1=1";
    if ($currentEmpId !== null) {
        $selfExclusion = "q.employee_id != :current_emp_id";
        $params['current_emp_id'] = $currentEmpId;
    }

    $authCondition = "";
    if ($isAuthorizedHR) {
        // HR can review:
        // 1. Any Escalated request
        // 2. Pending request where employee has no manager (emp_manager_id IS NULL)
        // 3. Pending request where employee is a manager (target_is_manager = 1)
        $hrBranch = "(
            q.status = 'Escalated' 
            OR (q.status = 'Pending' AND (q.emp_manager_id IS NULL OR q.target_is_manager = 1))
        )";

        if ($isManager && !empty($descendantIds)) {
            // HR is also a reporting manager: can also review ordinary direct descendants in Pending
            $placeholders = [];
            foreach ($descendantIds as $idx => $dId) {
                $pName = "desc_hr_{$idx}";
                $placeholders[] = ":{$pName}";
                $params[$pName] = $dId;
            }
            $inDesc = implode(',', $placeholders);
            $hrBranch = "(
                {$hrBranch} 
                OR (q.status = 'Pending' AND q.employee_id IN ({$inDesc}) AND q.target_is_manager = 0)
            )";
        }
        $authCondition = $hrBranch;
    } else {
        // Pure manager (non-HR): only Pending requests of non-manager reporting descendants
        $placeholders = [];
        foreach ($descendantIds as $idx => $dId) {
            $pName = "desc_mgr_{$idx}";
            $placeholders[] = ":{$pName}";
            $params[$pName] = $dId;
        }
        $inDesc = implode(',', $placeholders);
        $authCondition = "(q.status = 'Pending' AND q.employee_id IN ({$inDesc}) AND q.target_is_manager = 0)";
    }

    $sql = "
        SELECT * FROM (
            SELECT 
                ac.id,
                ac.attendance_id,
                ac.employee_id,
                CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
                e.employee_code,
                e.department_id,
                d.name AS department_name,
                e.manager_id AS emp_manager_id,
                (
                    EXISTS (
                        SELECT 1 FROM model_has_roles mhr 
                        JOIN roles r ON mhr.role_id = r.id 
                        WHERE mhr.model_id = e.user_id 
                          AND mhr.model_type = 'App\\\\Models\\\\User' 
                          AND r.name = 'Manager'
                    )
                    OR EXISTS (
                        SELECT 1 FROM employees sub 
                        WHERE sub.manager_id = e.id 
                          AND sub.deleted_at IS NULL
                    )
                ) AS target_is_manager,
                a.attendance_date,
                a.check_in AS original_check_in,
                a.check_out AS original_check_out,
                ac.requested_check_in,
                ac.requested_check_out,
                ac.reason,
                ac.evidence_details,
                ac.evidence_file,
                ac.evidence_original_name,
                ac.status,
                ac.escalated_to,
                ac.escalation_reason,
                ac.escalated_by,
                ac.escalated_at,
                ac.manager_remarks,
                ac.hr_remarks,
                ac.reviewed_by,
                ac.reviewed_at,
                ac.created_at,
                ac.updated_at
            FROM attendance_corrections ac
            JOIN employees e ON ac.employee_id = e.id
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN attendances a ON ac.attendance_id = a.id
        ) AS q
        WHERE ({$selfExclusion})
          AND ({$statusCondition})
          AND ({$authCondition})
        ORDER BY q.created_at DESC
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $corrections = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($corrections)) {
        echo json_encode(['data' => []]);
        return;
    }

    // Fetch history records for all returned corrections
    $correctionIds = array_column($corrections, 'id');
    $placeholders = implode(',', array_fill(0, count($correctionIds), '?'));

    $histStmt = $db->prepare("
        SELECT 
            h.id,
            h.correction_id,
            h.action,
            h.actor_user_id,
            h.actor_employee_id,
            CONCAT(u.name) AS actor_name,
            h.from_status,
            h.to_status,
            h.remarks,
            h.snapshot_data,
            h.created_at
        FROM attendance_correction_history h
        LEFT JOIN users u ON h.actor_user_id = u.id
        WHERE h.correction_id IN ($placeholders)
        ORDER BY h.id ASC
    ");
    $histStmt->execute($correctionIds);
    $histRows = $histStmt->fetchAll(PDO::FETCH_ASSOC);

    $histMap = [];
    foreach ($histRows as $hr) {
        $cId = (int)$hr['correction_id'];
        if (!isset($histMap[$cId])) {
            $histMap[$cId] = [];
        }
        if (!empty($hr['snapshot_data']) && is_string($hr['snapshot_data'])) {
            $hr['snapshot_data'] = json_decode($hr['snapshot_data'], true);
        }
        $histMap[$cId][] = $hr;
    }

    foreach ($corrections as &$c) {
        $cId = (int)$c['id'];
        $c['history'] = $histMap[$cId] ?? [];
    }
    unset($c);

    echo json_encode(['data' => $corrections]);
});

/**
 * GET /api/attendance/corrections/{id}
 * Retrieve details and audit timeline of a specific attendance correction request.
 * Authorized for:
 * 1. The requesting employee
 * 2. Managers whose reporting subtree includes the employee (getEmployeeDescendantIds)
 * 3. Users with explicit HR roles ('Super Admin', 'HR Admin', 'HR Executive')
 */
Router::get('/api/attendance/corrections/{id}', function($id) {
    $user = Auth::user();
    $currentEmpId = $user['employee_id'] ?? null;
    $userRoles = $user['roles'] ?? [];

    if (empty($id) || !is_numeric($id) || (int)$id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid correction ID.']);
        return;
    }

    $db = Database::getConnection();

    $stmt = $db->prepare("
        SELECT 
            ac.id,
            ac.attendance_id,
            ac.employee_id,
            CONCAT(e.first_name, ' ', e.last_name) AS employee_name,
            e.employee_code,
            e.department_id,
            e.manager_id,
            a.attendance_date,
            a.check_in AS original_check_in,
            a.check_out AS original_check_out,
            ac.requested_check_in,
            ac.requested_check_out,
            ac.reason,
            ac.evidence_file,
            ac.evidence_original_name,
            ac.evidence_details,
            ac.status,
            ac.escalated_to,
            ac.escalation_reason,
            ac.escalated_by,
            ac.escalated_at,
            ac.manager_remarks,
            ac.hr_remarks,
            ac.reviewed_by,
            ac.reviewed_at,
            ac.created_at,
            ac.updated_at
        FROM attendance_corrections ac
        LEFT JOIN employees e ON ac.employee_id = e.id
        LEFT JOIN attendances a ON ac.attendance_id = a.id
        WHERE ac.id = :id
        LIMIT 1
    ");
    $stmt->execute(['id' => (int)$id]);
    $correction = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$correction) {
        http_response_code(404);
        echo json_encode(['error' => 'Attendance correction request not found.']);
        return;
    }

    $targetEmpId = (int)$correction['employee_id'];

    // Authorization check
    $isOwner = ($currentEmpId !== null && (int)$currentEmpId === $targetEmpId);

    $isAuthorizedHR = !empty(array_intersect(['Super Admin', 'HR Admin', 'HR Executive'], $userRoles));

    $isManager = false;
    if (!$isOwner && !$isAuthorizedHR && $currentEmpId !== null) {
        $descendantIds = getEmployeeDescendantIds($db, $currentEmpId);
        if (in_array($targetEmpId, $descendantIds, true)) {
            $isManager = true;
        }
    }

    if (!$isOwner && !$isManager && !$isAuthorizedHR) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden: You are not authorized to view this correction request.']);
        return;
    }

    // Retrieve full audit timeline
    $histStmt = $db->prepare("
        SELECT 
            h.id,
            h.correction_id,
            h.action,
            h.actor_user_id,
            h.actor_employee_id,
            u.name AS actor_name,
            h.from_status,
            h.to_status,
            h.remarks,
            h.snapshot_data,
            h.created_at
        FROM attendance_correction_history h
        LEFT JOIN users u ON h.actor_user_id = u.id
        WHERE h.correction_id = :id
        ORDER BY h.id ASC
    ");
    $histStmt->execute(['id' => (int)$id]);
    $timeline = $histStmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($timeline as &$event) {
        if (!empty($event['snapshot_data']) && is_string($event['snapshot_data'])) {
            $event['snapshot_data'] = json_decode($event['snapshot_data'], true);
        }
    }
    unset($event);

    $correction['timeline'] = $timeline;

    echo json_encode(['data' => $correction]);
});

/**
 * PUT /api/attendance/corrections/{id}/approve
 * Approve an attendance correction request and atomically update the live attendance record.
 */
Router::put('/api/attendance/corrections/{id}/approve', function($id) {
    $user = Auth::user();
    $currentEmpId = $user['employee_id'] ?? null;
    $userRoles = $user['roles'] ?? [];

    if (empty($id) || !is_numeric($id) || (int)$id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid correction ID.']);
        return;
    }

    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if (!is_array($input)) {
        global $input;
        if (!is_array($input)) {
            $input = [];
        }
    }

    $remarks = isset($input['remarks']) ? trim((string)$input['remarks']) : null;
    if ($remarks !== null && mb_strlen($remarks) > 2000) {
        http_response_code(400);
        echo json_encode(['error' => 'Remarks cannot exceed 2000 characters.']);
        return;
    }
    if ($remarks === '') {
        $remarks = null;
    }

    // Optional reviewer adjusted check out
    $adjCheckOut = !empty($input['approved_check_out']) ? trim($input['approved_check_out']) : null;
    if ($adjCheckOut !== null) {
        $tAdj = strtotime($adjCheckOut);
        if ($tAdj === false) {
            http_response_code(400);
            echo json_encode(['error' => 'approved_check_out must be a valid datetime string.']);
            return;
        }
        $adjCheckOut = date('Y-m-d H:i:s', $tAdj);
    }

    $db = Database::getConnection();
    $db->beginTransaction();

    try {
        // Pessimistic Row Locking
        $stmt = $db->prepare("
            SELECT 
                ac.*,
                e.manager_id AS emp_manager_id,
                (
                    EXISTS (
                        SELECT 1 FROM model_has_roles mhr 
                        JOIN roles r ON mhr.role_id = r.id 
                        WHERE mhr.model_id = e.user_id 
                          AND mhr.model_type = 'App\\\\Models\\\\User' 
                          AND r.name = 'Manager'
                    )
                    OR EXISTS (
                        SELECT 1 FROM employees sub 
                        WHERE sub.manager_id = e.id 
                          AND sub.deleted_at IS NULL
                    )
                ) AS target_is_manager,
                a.check_in AS live_check_in,
                a.check_out AS live_check_out,
                a.working_minutes AS live_working_minutes,
                a.status AS live_status
            FROM attendance_corrections ac
            JOIN employees e ON ac.employee_id = e.id
            JOIN attendances a ON ac.attendance_id = a.id
            WHERE ac.id = :id
            FOR UPDATE
        ");
        $stmt->execute(['id' => (int)$id]);
        $correction = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$correction) {
            $db->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Attendance correction request not found.']);
            return;
        }

        $targetEmpId = (int)$correction['employee_id'];
        $currentStatus = $correction['status'];

        // Terminal State Check (Immutable)
        if ($currentStatus === 'Approved' || $currentStatus === 'Rejected') {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['error' => "Conflict: This attendance correction request has already been finalized ({$currentStatus}) and cannot be modified."]);
            return;
        }

        // Strict Self-Action Prevention (all roles)
        if ($currentEmpId !== null && (int)$currentEmpId === $targetEmpId) {
            $db->rollBack();
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: You cannot approve your own attendance correction request.']);
            return;
        }

        $isAuthorizedHR = !empty(array_intersect(['Super Admin', 'HR Admin', 'HR Executive'], $userRoles));

        $isReportingManager = false;
        if ($currentEmpId !== null) {
            $descendants = getEmployeeDescendantIds($db, $currentEmpId);
            if (in_array($targetEmpId, $descendants, true)) {
                $isReportingManager = true;
            }
        }

        $empMgrId = $correction['emp_manager_id'] ? (int)$correction['emp_manager_id'] : null;

        // Authorization by Status
        if ($currentStatus === 'Pending') {
            $canApprove = false;
            $actorType = null;
            $targetIsManager = !empty($correction['target_is_manager']);

            if ($targetIsManager) {
                // A manager's own request must be reviewed directly by authorized HR reviewers
                // The manager's reporting manager cannot review it under ordinary manager workflow
                if ($isAuthorizedHR) {
                    $canApprove = true;
                    $actorType = 'hr';
                }
            } else {
                // Ordinary employee request: reporting manager first, or HR if employee has no manager
                if ($isReportingManager) {
                    $canApprove = true;
                    $actorType = 'manager';
                } elseif ($isAuthorizedHR && $empMgrId === null) {
                    $canApprove = true;
                    $actorType = 'hr';
                }
            }

            if (!$canApprove) {
                $db->rollBack();
                http_response_code(403);
                $errorMsg = ($targetIsManager && $isReportingManager)
                    ? 'Forbidden: A manager\'s attendance correction request must be reviewed directly by authorized HR reviewers.'
                    : 'Forbidden: You are not authorized to approve this pending correction request.';
                echo json_encode(['error' => $errorMsg]);
                return;
            }
        } elseif ($currentStatus === 'Escalated') {
            if (!$isAuthorizedHR) {
                $db->rollBack();
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden: Only authorized HR reviewers can approve escalated correction requests.']);
                return;
            }
            $actorType = 'hr';
        } else {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['error' => "Conflict: Request cannot be approved from status '{$currentStatus}'."]);
            return;
        }

        // Effective Timestamps Selection
        $effectiveCheckIn = !empty($correction['requested_check_in']) ? $correction['requested_check_in'] : $correction['live_check_in'];
        $effectiveCheckOut = $adjCheckOut !== null 
            ? $adjCheckOut 
            : (!empty($correction['requested_check_out']) ? $correction['requested_check_out'] : $correction['live_check_out']);

        if (empty($effectiveCheckIn) || empty($effectiveCheckOut)) {
            $db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Bad Request: Both check-in and check-out timestamps must be established to approve attendance.']);
            return;
        }

        $tIn = strtotime($effectiveCheckIn);
        $tOut = strtotime($effectiveCheckOut);
        if ($tIn === false || $tOut === false || $tOut <= $tIn) {
            $db->rollBack();
            http_response_code(400);
            echo json_encode(['error' => 'Bad Request: Effective check-out timestamp must be chronologically after check-in.']);
            return;
        }

        // Recalculate Working Hours and Status using verified application formulas
        $recalculatedHours = calculateAttendanceWorkingHours($effectiveCheckIn, $effectiveCheckOut);
        $recalculatedStatus = determineAttendanceStatusFromHours($recalculatedHours);
        $recalculatedMinutes = (int)round(($tOut - $tIn) / 60.0);

        $liveWorkingHours = $correction['live_working_minutes'] !== null 
            ? round((int)$correction['live_working_minutes'] / 60.0, 2) 
            : (($correction['live_check_in'] && $correction['live_check_out']) 
                ? calculateAttendanceWorkingHours($correction['live_check_in'], $correction['live_check_out']) 
                : null);

        // 1. Update live attendances table
        $attUpdate = $db->prepare("
            UPDATE attendances
            SET check_in = :check_in,
                check_out = :check_out,
                working_minutes = :minutes,
                status = :status,
                updated_at = NOW()
            WHERE id = :att_id
        ");
        $attUpdate->execute([
            'check_in' => $effectiveCheckIn,
            'check_out' => $effectiveCheckOut,
            'minutes'  => $recalculatedMinutes,
            'status'   => $recalculatedStatus,
            'att_id'   => (int)$correction['attendance_id']
        ]);

        // 2. Update attendance_corrections table
        $mgrRemarks = ($actorType === 'manager') ? $remarks : $correction['manager_remarks'];
        $hrRemarks = ($actorType === 'hr') ? $remarks : $correction['hr_remarks'];

        $corrUpdate = $db->prepare("
            UPDATE attendance_corrections
            SET status = 'Approved',
                approved_check_out = :approved_check_out,
                manager_remarks = :mgr_remarks,
                hr_remarks = :hr_remarks,
                reviewed_by = :reviewed_by,
                reviewed_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        ");
        $corrUpdate->execute([
            'approved_check_out' => $effectiveCheckOut,
            'mgr_remarks'        => $mgrRemarks,
            'hr_remarks'         => $hrRemarks,
            'reviewed_by'        => $user['user_id'],
            'id'                 => (int)$id
        ]);

        // 3. Insert audit history event
        $snapshot = [
            'previous_attendance' => [
                'check_in'        => $correction['live_check_in'],
                'check_out'       => $correction['live_check_out'],
                'working_minutes' => $correction['live_working_minutes'],
                'working_hours'   => $liveWorkingHours,
                'status'          => $correction['live_status']
            ],
            'applied_attendance' => [
                'check_in'        => $effectiveCheckIn,
                'check_out'       => $effectiveCheckOut,
                'working_minutes' => $recalculatedMinutes,
                'working_hours'   => $recalculatedHours,
                'status'          => $recalculatedStatus
            ],
            'reviewer_role'      => $user['role'] ?? 'Reviewer',
            'actor_type'         => $actorType,
            'approved_check_out' => $effectiveCheckOut
        ];

        $histStmt = $db->prepare("
            INSERT INTO attendance_correction_history (
                correction_id, action, actor_user_id, actor_employee_id,
                from_status, to_status, remarks, snapshot_data, created_at
            ) VALUES (
                :correction_id, 'approved', :actor_user_id, :actor_employee_id,
                :from_status, 'Approved', :remarks, :snapshot_data, NOW()
            )
        ");
        $histStmt->execute([
            'correction_id'     => (int)$id,
            'actor_user_id'     => $user['user_id'],
            'actor_employee_id' => $currentEmpId,
            'from_status'       => $currentStatus,
            'remarks'           => $remarks,
            'snapshot_data'     => json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        ]);

        $db->commit();

        http_response_code(200);
        echo json_encode([
            'message' => 'Attendance correction approved successfully.',
            'data' => [
                'id'                  => (int)$id,
                'attendance_id'       => (int)$correction['attendance_id'],
                'status'              => 'Approved',
                'effective_check_in'  => $effectiveCheckIn,
                'effective_check_out' => $effectiveCheckOut,
                'working_hours'       => $recalculatedHours,
                'working_minutes'     => $recalculatedMinutes,
                'attendance_status'   => $recalculatedStatus,
                'reviewed_at'         => date('Y-m-d H:i:s')
            ]
        ]);
    } catch (\Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('[AttendanceCorrection] Approval error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'An internal database error occurred while approving the correction request.']);
    }
});

/**
 * PUT /api/attendance/corrections/{id}/reject
 * Reject an attendance correction request with mandatory reviewer remarks.
 */
Router::put('/api/attendance/corrections/{id}/reject', function($id) {
    $user = Auth::user();
    $currentEmpId = $user['employee_id'] ?? null;
    $userRoles = $user['roles'] ?? [];

    if (empty($id) || !is_numeric($id) || (int)$id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid correction ID.']);
        return;
    }

    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if (!is_array($input)) {
        global $input;
        if (!is_array($input)) {
            $input = [];
        }
    }

    $remarks = isset($input['remarks']) ? trim((string)$input['remarks']) : '';
    if (mb_strlen($remarks) < 5 || mb_strlen($remarks) > 2000) {
        http_response_code(400);
        echo json_encode(['error' => 'Reviewer remarks are required for rejection and must be between 5 and 2000 characters.']);
        return;
    }

    $db = Database::getConnection();
    $db->beginTransaction();

    try {
        // Pessimistic Row Locking
        $stmt = $db->prepare("
            SELECT 
                ac.*,
                e.manager_id AS emp_manager_id,
                (
                    EXISTS (
                        SELECT 1 FROM model_has_roles mhr 
                        JOIN roles r ON mhr.role_id = r.id 
                        WHERE mhr.model_id = e.user_id 
                          AND mhr.model_type = 'App\\\\Models\\\\User' 
                          AND r.name = 'Manager'
                    )
                    OR EXISTS (
                        SELECT 1 FROM employees sub 
                        WHERE sub.manager_id = e.id 
                          AND sub.deleted_at IS NULL
                    )
                ) AS target_is_manager
            FROM attendance_corrections ac
            JOIN employees e ON ac.employee_id = e.id
            WHERE ac.id = :id
            FOR UPDATE
        ");
        $stmt->execute(['id' => (int)$id]);
        $correction = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$correction) {
            $db->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Attendance correction request not found.']);
            return;
        }

        $targetEmpId = (int)$correction['employee_id'];
        $currentStatus = $correction['status'];

        // Terminal State Check (Immutable)
        if ($currentStatus === 'Approved' || $currentStatus === 'Rejected') {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['error' => "Conflict: This attendance correction request has already been finalized ({$currentStatus}) and cannot be modified."]);
            return;
        }

        // Strict Self-Action Prevention (all roles)
        if ($currentEmpId !== null && (int)$currentEmpId === $targetEmpId) {
            $db->rollBack();
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: You cannot reject your own attendance correction request.']);
            return;
        }

        $isAuthorizedHR = !empty(array_intersect(['Super Admin', 'HR Admin', 'HR Executive'], $userRoles));

        $isReportingManager = false;
        if ($currentEmpId !== null) {
            $descendants = getEmployeeDescendantIds($db, $currentEmpId);
            if (in_array($targetEmpId, $descendants, true)) {
                $isReportingManager = true;
            }
        }

        $empMgrId = $correction['emp_manager_id'] ? (int)$correction['emp_manager_id'] : null;

        // Authorization by Status
        if ($currentStatus === 'Pending') {
            $canReject = false;
            $actorType = null;
            $targetIsManager = !empty($correction['target_is_manager']);

            if ($targetIsManager) {
                // A manager's own request must be reviewed directly by authorized HR reviewers
                // The manager's reporting manager cannot review it under ordinary manager workflow
                if ($isAuthorizedHR) {
                    $canReject = true;
                    $actorType = 'hr';
                }
            } else {
                // Ordinary employee request: reporting manager first, or HR if employee has no manager
                if ($isReportingManager) {
                    $canReject = true;
                    $actorType = 'manager';
                } elseif ($isAuthorizedHR && $empMgrId === null) {
                    $canReject = true;
                    $actorType = 'hr';
                }
            }

            if (!$canReject) {
                $db->rollBack();
                http_response_code(403);
                $errorMsg = ($targetIsManager && $isReportingManager)
                    ? 'Forbidden: A manager\'s attendance correction request must be reviewed directly by authorized HR reviewers.'
                    : 'Forbidden: You are not authorized to reject this pending correction request.';
                echo json_encode(['error' => $errorMsg]);
                return;
            }
        } elseif ($currentStatus === 'Escalated') {
            if (!$isAuthorizedHR) {
                $db->rollBack();
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden: Only authorized HR reviewers can reject escalated correction requests.']);
                return;
            }
            $actorType = 'hr';
        } else {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['error' => "Conflict: Request cannot be rejected from status '{$currentStatus}'."]);
            return;
        }

        $mgrRemarks = ($actorType === 'manager') ? $remarks : $correction['manager_remarks'];
        $hrRemarks = ($actorType === 'hr') ? $remarks : $correction['hr_remarks'];

        // 1. Update attendance_corrections (live attendances table remains untouched)
        $corrUpdate = $db->prepare("
            UPDATE attendance_corrections
            SET status = 'Rejected',
                manager_remarks = :mgr_remarks,
                hr_remarks = :hr_remarks,
                reviewed_by = :reviewed_by,
                reviewed_at = NOW(),
                updated_at = NOW()
            WHERE id = :id
        ");
        $corrUpdate->execute([
            'mgr_remarks' => $mgrRemarks,
            'hr_remarks'  => $hrRemarks,
            'reviewed_by' => $user['user_id'],
            'id'          => (int)$id
        ]);

        // 2. Insert audit history event
        $snapshot = [
            'rejection_remarks' => $remarks,
            'actor_type'        => $actorType,
            'reviewer_role'     => $user['role'] ?? 'Reviewer'
        ];

        $histStmt = $db->prepare("
            INSERT INTO attendance_correction_history (
                correction_id, action, actor_user_id, actor_employee_id,
                from_status, to_status, remarks, snapshot_data, created_at
            ) VALUES (
                :correction_id, 'rejected', :actor_user_id, :actor_employee_id,
                :from_status, 'Rejected', :remarks, :snapshot_data, NOW()
            )
        ");
        $histStmt->execute([
            'correction_id'     => (int)$id,
            'actor_user_id'     => $user['user_id'],
            'actor_employee_id' => $currentEmpId,
            'from_status'       => $currentStatus,
            'remarks'           => $remarks,
            'snapshot_data'     => json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        ]);

        $db->commit();

        http_response_code(200);
        echo json_encode([
            'message' => 'Attendance correction rejected successfully.',
            'data' => [
                'id'          => (int)$id,
                'status'      => 'Rejected',
                'remarks'     => $remarks,
                'reviewed_at' => date('Y-m-d H:i:s')
            ]
        ]);
    } catch (\Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('[AttendanceCorrection] Rejection error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'An internal database error occurred while rejecting the correction request.']);
    }
});

/**
 * PUT /api/attendance/corrections/{id}/escalate
 * Escalate a pending attendance correction request to the HR review queue.
 * Authorized for the employee's reporting manager only.
 */
Router::put('/api/attendance/corrections/{id}/escalate', function($id) {
    $user = Auth::user();
    $currentEmpId = $user['employee_id'] ?? null;

    if (empty($id) || !is_numeric($id) || (int)$id <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid correction ID.']);
        return;
    }

    $rawInput = file_get_contents('php://input');
    $input = json_decode($rawInput, true);
    if (!is_array($input)) {
        global $input;
        if (!is_array($input)) {
            $input = [];
        }
    }

    $reason = isset($input['escalation_reason']) ? trim((string)$input['escalation_reason']) : '';
    if (mb_strlen($reason) < 5 || mb_strlen($reason) > 2000) {
        http_response_code(400);
        echo json_encode(['error' => 'Escalation reason is required and must be between 5 and 2000 characters.']);
        return;
    }

    // Default destination group server-side to 'HR Admin'
    $escalatedTo = 'HR Admin';

    $db = Database::getConnection();
    $db->beginTransaction();

    try {
        // Pessimistic Row Locking
        $stmt = $db->prepare("
            SELECT 
                ac.*,
                e.manager_id AS emp_manager_id,
                (
                    EXISTS (
                        SELECT 1 FROM model_has_roles mhr 
                        JOIN roles r ON mhr.role_id = r.id 
                        WHERE mhr.model_id = e.user_id 
                          AND mhr.model_type = 'App\\\\Models\\\\User' 
                          AND r.name = 'Manager'
                    )
                    OR EXISTS (
                        SELECT 1 FROM employees sub 
                        WHERE sub.manager_id = e.id 
                          AND sub.deleted_at IS NULL
                    )
                ) AS target_is_manager
            FROM attendance_corrections ac
            JOIN employees e ON ac.employee_id = e.id
            WHERE ac.id = :id
            FOR UPDATE
        ");
        $stmt->execute(['id' => (int)$id]);
        $correction = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$correction) {
            $db->rollBack();
            http_response_code(404);
            echo json_encode(['error' => 'Attendance correction request not found.']);
            return;
        }

        $targetEmpId = (int)$correction['employee_id'];
        $currentStatus = $correction['status'];

        // Terminal State Check (Immutable)
        if ($currentStatus === 'Approved' || $currentStatus === 'Rejected') {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['error' => "Conflict: This attendance correction request has already been finalized ({$currentStatus}) and cannot be escalated."]);
            return;
        }

        if ($currentStatus === 'Escalated') {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['error' => 'Conflict: This attendance correction request is already escalated.']);
            return;
        }

        // Strict Self-Action Prevention
        if ($currentEmpId !== null && (int)$currentEmpId === $targetEmpId) {
            $db->rollBack();
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: You cannot escalate your own attendance correction request.']);
            return;
        }

        // A manager's own request is reviewed directly by authorized HR and cannot be escalated
        $targetIsManager = !empty($correction['target_is_manager']);
        if ($targetIsManager) {
            $db->rollBack();
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: A manager\'s attendance correction request is reviewed directly by authorized HR reviewers and cannot be escalated.']);
            return;
        }

        // HR reviewers cannot escalate requests (only reporting managers can escalate)
        $userRoles = $user['roles'] ?? [];
        $isAuthorizedHR = !empty(array_intersect(['Super Admin', 'HR Admin', 'HR Executive'], $userRoles));
        if ($isAuthorizedHR) {
            $db->rollBack();
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: Only the employee\'s reporting manager can escalate a pending correction request.']);
            return;
        }

        // Only the reporting manager in the employee's subtree can escalate
        $isReportingManager = false;
        if ($currentEmpId !== null) {
            $descendants = getEmployeeDescendantIds($db, $currentEmpId);
            if (in_array($targetEmpId, $descendants, true)) {
                $isReportingManager = true;
            }
        }

        if (!$isReportingManager) {
            $db->rollBack();
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden: Only the employee\'s reporting manager can escalate a pending correction request.']);
            return;
        }

        // 1. Update attendance_corrections table
        $corrUpdate = $db->prepare("
            UPDATE attendance_corrections
            SET status = 'Escalated',
                escalated_to = :escalated_to,
                escalation_reason = :reason,
                escalated_by = :escalated_by,
                escalated_at = NOW(),
                manager_remarks = :manager_remarks,
                updated_at = NOW()
            WHERE id = :id
        ");
        $corrUpdate->execute([
            'escalated_to'     => $escalatedTo,
            'reason'           => $reason,
            'escalated_by'     => $user['user_id'],
            'manager_remarks'  => $reason,
            'id'               => (int)$id
        ]);

        // 2. Insert audit history event
        $snapshot = [
            'escalated_to'      => $escalatedTo,
            'escalation_reason' => $reason,
            'escalated_by_user' => $user['user_id']
        ];

        $histStmt = $db->prepare("
            INSERT INTO attendance_correction_history (
                correction_id, action, actor_user_id, actor_employee_id,
                from_status, to_status, remarks, snapshot_data, created_at
            ) VALUES (
                :correction_id, 'escalated', :actor_user_id, :actor_employee_id,
                'Pending', 'Escalated', :remarks, :snapshot_data, NOW()
            )
        ");
        $histStmt->execute([
            'correction_id'     => (int)$id,
            'actor_user_id'     => $user['user_id'],
            'actor_employee_id' => $currentEmpId,
            'remarks'           => $reason,
            'snapshot_data'     => json_encode($snapshot, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        ]);

        $db->commit();

        http_response_code(200);
        echo json_encode([
            'message' => 'Attendance correction escalated to HR successfully.',
            'data' => [
                'id'                => (int)$id,
                'status'            => 'Escalated',
                'escalated_to'      => $escalatedTo,
                'escalation_reason' => $reason,
                'escalated_at'      => date('Y-m-d H:i:s')
            ]
        ]);
    } catch (\Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('[AttendanceCorrection] Escalation error: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['error' => 'An internal database error occurred while escalating the correction request.']);
    }
});
