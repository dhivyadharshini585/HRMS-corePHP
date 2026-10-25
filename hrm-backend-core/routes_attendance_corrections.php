<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// MISSED CHECK-OUT CORRECTION MODULE
// ==========================================

if (!function_exists('getAttendanceSubtreeIds')) {
    function getAttendanceSubtreeIds($db, $rootId) {
        if (!$rootId) return [];
        $stmt = $db->query("SELECT id, manager_id FROM employees WHERE deleted_at IS NULL");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $childrenMap = [];
        foreach ($rows as $r) {
            $mId = $r['manager_id'] ? (int)$r['manager_id'] : 0;
            if (!isset($childrenMap[$mId])) $childrenMap[$mId] = [];
            $childrenMap[$mId][] = (int)$r['id'];
        }
        $descendants = [];
        $queue = [(int)$rootId];
        $visited = [(int)$rootId => true];
        while (!empty($queue)) {
            $curr = array_shift($queue);
            if (isset($childrenMap[$curr])) {
                foreach ($childrenMap[$curr] as $childId) {
                    if (!isset($visited[$childId])) {
                        $visited[$childId] = true;
                        $descendants[] = $childId;
                        $queue[] = $childId;
                    }
                }
            }
        }
        return $descendants;
    }
}

if (!function_exists('canReviewEmployeeAttendance')) {
    function canReviewEmployeeAttendance($db, array $user, $targetEmployeeId): bool {
        if (empty($targetEmployeeId)) return false;
        $targetEmployeeId = (int)$targetEmployeeId;
        $reviewerEmployeeId = !empty($user['employee_id']) ? (int)$user['employee_id'] : null;

        // Self-approval is strictly forbidden
        if ($reviewerEmployeeId !== null && $reviewerEmployeeId === $targetEmployeeId) {
            return false;
        }

        $userRoles = $user['roles'] ?? [];
        $role = $user['role'] ?? '';

        // Only authenticated users with actual 'Manager' role have review/approval authority by default
        $isManager = ($role === 'Manager' || in_array('Manager', $userRoles, true)) && !empty($reviewerEmployeeId);
        if ($isManager) {
            $subordinateIds = function_exists('getEmployeeDescendantIds') 
                ? getEmployeeDescendantIds($db, $reviewerEmployeeId) 
                : getAttendanceSubtreeIds($db, $reviewerEmployeeId);
            return in_array($targetEmployeeId, $subordinateIds, true);
        }

        // Do not grant HR Executive, HR Admin, or Super Admin approval permissions by default
        return false;
    }
}

if (!function_exists('fetchAttendanceCorrectionHistory')) {
    function fetchAttendanceCorrectionHistory($db, $attendanceId, $excludeId = null) {
        $query = "
            SELECT ac.id, ac.attendance_id, ac.employee_id, ac.requested_check_out, 
                   ac.approved_check_out, ac.reason, ac.status, ac.remarks, ac.reviewed_by, 
                   ac.reviewed_at, ac.created_at, ac.updated_at,
                   u.name as reviewer_name, u.email as reviewer_email
            FROM attendance_corrections ac
            LEFT JOIN users u ON ac.reviewed_by = u.id
            WHERE ac.attendance_id = :att_id
        ";
        $params = ['att_id' => (int)$attendanceId];
        if ($excludeId) {
            $query .= " AND ac.id != :exclude_id";
            $params['exclude_id'] = (int)$excludeId;
        }
        $query .= " ORDER BY ac.id ASC";
        $stmt = $db->prepare($query);
        $stmt->execute($params);
        return $stmt->fetchAll(PDO::FETCH_ASSOC);
    }
}

// -------------------------------------------------------------
// 1. Submit Correction Request
// -------------------------------------------------------------
$handleCreateCorrectionRequest = function() {
    $user = Auth::user();
    $empId = $user['employee_id'] ?? null;
    if (empty($empId)) {
        http_response_code(403);
        echo json_encode(['message' => 'No employee profile linked to authenticated user.']);
        return;
    }

    global $input;
    $rawInput = !empty($input) && is_array($input) ? $input : (json_decode(file_get_contents('php://input'), true) ?: []);
    $data = !empty($_POST) ? array_merge($rawInput, $_POST) : $rawInput;
    $db = Database::getConnection();

    $attendanceId = !empty($data['attendance_id']) ? (int)$data['attendance_id'] : null;

    // Locate the unresolved attendance session
    if ($attendanceId) {
        $stmt = $db->prepare("SELECT * FROM attendances WHERE id = :id AND employee_id = :emp_id LIMIT 1");
        $stmt->execute(['id' => $attendanceId, 'emp_id' => $empId]);
        $attendance = $stmt->fetch(PDO::FETCH_ASSOC);
    } else {
        $stmt = $db->prepare("SELECT * FROM attendances WHERE employee_id = :emp_id AND check_out IS NULL ORDER BY check_in DESC LIMIT 1");
        $stmt->execute(['emp_id' => $empId]);
        $attendance = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    if (!$attendance) {
        http_response_code(404);
        echo json_encode(['message' => 'No matching attendance session found for correction.']);
        return;
    }

    if ($attendance['check_out'] !== null) {
        http_response_code(400);
        echo json_encode(['message' => 'Attendance session is already closed and does not have a missing checkout.']);
        return;
    }

    // Check for existing pending request for this attendance session
    $checkPending = $db->prepare("
        SELECT id, requested_check_out, reason, created_at, status 
        FROM attendance_corrections 
        WHERE attendance_id = :att_id AND status = 'Pending' 
        LIMIT 1
    ");
    $checkPending->execute(['att_id' => $attendance['id']]);
    $existingPending = $checkPending->fetch(PDO::FETCH_ASSOC);
    if ($existingPending) {
        http_response_code(409);
        echo json_encode([
            'message' => 'A correction request is already pending for this attendance session.',
            'correction_request' => $existingPending
        ]);
        return;
    }

    // Validate reported checkout datetime
    $rawCheckout = trim($data['requested_check_out'] ?? '');
    if (empty($rawCheckout)) {
        http_response_code(422);
        echo json_encode(['message' => 'Reported checkout datetime is mandatory.']);
        return;
    }

    $reportedTs = strtotime($rawCheckout);
    if ($reportedTs === false) {
        http_response_code(422);
        echo json_encode(['message' => 'Invalid reported checkout datetime format.']);
        return;
    }

    $checkInTs = strtotime($attendance['check_in']);
    if ($reportedTs <= $checkInTs) {
        http_response_code(422);
        echo json_encode(['message' => "Reported checkout time must be strictly after original check-in time ({$attendance['check_in']})."]);
        return;
    }

    if ($reportedTs > time() + 60) {
        http_response_code(422);
        echo json_encode(['message' => 'Reported checkout time cannot be in the future.']);
        return;
    }

    $reason = trim($data['reason'] ?? '');
    if (empty($reason)) {
        http_response_code(422);
        echo json_encode(['message' => 'Reason for missed checkout is mandatory.']);
        return;
    }

    $evidenceDetails = trim($data['evidence_details'] ?? '');

    // Secure evidence file handling
    $evidenceFilePath = null;
    $evidenceOriginalName = null;
    $fileUploaded = $_FILES['evidence_file'] ?? $_FILES['evidence'] ?? null;
    if ($fileUploaded && isset($fileUploaded['error']) && $fileUploaded['error'] === UPLOAD_ERR_OK) {
        $allowedExts = ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'doc', 'docx', 'txt'];
        $origName = basename($fileUploaded['name']);
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));

        if (!in_array($ext, $allowedExts, true)) {
            http_response_code(422);
            echo json_encode(['message' => 'Invalid evidence file type. Allowed: ' . implode(', ', $allowedExts)]);
            return;
        }

        if ($fileUploaded['size'] > 10 * 1024 * 1024) { // 10MB limit
            http_response_code(422);
            echo json_encode(['message' => 'Evidence file exceeds maximum allowed size (10MB).']);
            return;
        }

        $secureStorageDir = __DIR__ . '/storage/attendance_evidence';
        if (!is_dir($secureStorageDir)) {
            mkdir($secureStorageDir, 0755, true);
        }

        $safeName = 'ev_' . (int)$empId . '_' . time() . '_' . bin2hex(random_bytes(4)) . '.' . $ext;
        $destPath = $secureStorageDir . '/' . $safeName;
        if (move_uploaded_file($fileUploaded['tmp_name'], $destPath)) {
            $evidenceFilePath = 'storage/attendance_evidence/' . $safeName;
            $evidenceOriginalName = $origName;
        }
    }

    $reportedFormatted = date('Y-m-d H:i:s', $reportedTs);

    try {
        $insertStmt = $db->prepare("
            INSERT INTO attendance_corrections (
                attendance_id, employee_id, requested_check_in, requested_check_out,
                reason, evidence_file, evidence_original_name, evidence_details,
                status, created_at, updated_at
            ) VALUES (
                :attendance_id, :employee_id, :requested_check_in, :requested_check_out,
                :reason, :evidence_file, :evidence_original_name, :evidence_details,
                'Pending', NOW(), NOW()
            )
        ");

        $insertStmt->execute([
            'attendance_id' => $attendance['id'],
            'employee_id' => $empId,
            'requested_check_in' => $attendance['check_in'],
            'requested_check_out' => $reportedFormatted,
            'reason' => $reason,
            'evidence_file' => $evidenceFilePath,
            'evidence_original_name' => $evidenceOriginalName,
            'evidence_details' => $evidenceDetails ?: null,
        ]);

        $correctionId = (int)$db->lastInsertId();

        // Audit log
        $audit = $db->prepare("
            INSERT INTO audit_logs (
                user_id, employee_id, action, entity_type, entity_id, description,
                new_values, ip_address, user_agent, created_at, updated_at
            ) VALUES (
                :uid, :eid, 'ATTENDANCE_CORRECTION_SUBMITTED', 'AttendanceCorrection', :id, :desc,
                :new, :ip, :ua, NOW(), NOW()
            )
        ");
        $audit->execute([
            'uid' => $user['user_id'],
            'eid' => $empId,
            'id' => $correctionId,
            'desc' => "Missed checkout correction request submitted by Employee #{$empId}",
            'new' => json_encode([
                'attendance_id' => $attendance['id'],
                'requested_check_out' => $reportedFormatted,
                'reason' => $reason
            ]),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
            'ua' => $_SERVER['HTTP_USER_AGENT'] ?? 'Web'
        ]);

        $created = $db->query("SELECT * FROM attendance_corrections WHERE id = " . $correctionId)->fetch(PDO::FETCH_ASSOC);

        http_response_code(201);
        echo json_encode([
            'message' => 'Missed check-out correction request submitted successfully.',
            'correction_request' => $created
        ]);
    } catch (\PDOException $e) {
        if ($e->getCode() == 23000 || strpos($e->getMessage(), 'uq_pending_attendance') !== false) {
            http_response_code(409);
            echo json_encode(['message' => 'A correction request is already pending for this attendance session.']);
            return;
        }
        http_response_code(500);
        echo json_encode(['message' => 'Database error: ' . $e->getMessage()]);
    }
};

Router::post('/api/attendance/correction-requests', $handleCreateCorrectionRequest);
Router::post('/api/attendance/corrections', $handleCreateCorrectionRequest);

// -------------------------------------------------------------
// 2. List Correction Requests (Review Queue and Employee Mine)
// -------------------------------------------------------------
$handleListCorrectionRequests = function($isReviewQueue = false) {
    $user = Auth::user();
    $db = Database::getConnection();

    $userRoles = $user['roles'] ?? [];
    $role = $user['role'] ?? '';
    $userEmpId = !empty($user['employee_id']) ? (int)$user['employee_id'] : null;

    // Only authenticated users with the actual 'Manager' role have review queue access
    $isManager = ($role === 'Manager' || in_array('Manager', $userRoles, true)) && !empty($userEmpId);

    $requestedScope = $_GET['scope'] ?? ($isReviewQueue ? 'review' : 'mine');
    $statusFilter = $_GET['status'] ?? null;
    $empFilter = $_GET['employee_id'] ?? null;
    $attFilter = $_GET['attendance_id'] ?? null;

    $query = "
        SELECT ac.*, 
               e.first_name, e.last_name, e.employee_code, e.manager_id,
               d.name as department_name,
               des.title as designation_title,
               a.attendance_date, a.check_in as original_check_in, a.check_out as original_check_out, a.status as attendance_status,
               u.name as reviewer_name, u.email as reviewer_email
        FROM attendance_corrections ac
        JOIN employees e ON ac.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        JOIN attendances a ON ac.attendance_id = a.id
        LEFT JOIN users u ON ac.reviewed_by = u.id
        WHERE 1=1
    ";
    $params = [];

    if ($requestedScope === 'review' || $requestedScope === 'pending' || $requestedScope === 'team' || $isReviewQueue) {
        if (!$isManager) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized to access manager review queue. Only managers can review correction requests.']);
            return;
        }

        // Manager can only view direct and indirect reports in their subtree
        $subordinateIds = function_exists('getEmployeeDescendantIds') 
            ? getEmployeeDescendantIds($db, $userEmpId) 
            : getAttendanceSubtreeIds($db, $userEmpId);

        if (empty($subordinateIds)) {
            echo json_encode(['data' => []]);
            return;
        }

        $inList = implode(',', array_map('intval', $subordinateIds));
        $query .= " AND ac.employee_id IN ($inList)";

        if (!empty($empFilter) && in_array((int)$empFilter, $subordinateIds, true)) {
            $query .= " AND ac.employee_id = ?";
            $params[] = (int)$empFilter;
        }
    } else {
        // Mine: Employee's own requests
        if (empty($userEmpId)) {
            echo json_encode(['data' => []]);
            return;
        }
        $query .= " AND ac.employee_id = ?";
        $params[] = $userEmpId;
    }

    if (!empty($statusFilter)) {
        $query .= " AND ac.status = ?";
        $params[] = $statusFilter;
    }

    if (!empty($attFilter)) {
        $query .= " AND ac.attendance_id = ?";
        $params[] = (int)$attFilter;
    }

    $query .= " ORDER BY ac.created_at DESC";

    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $data = [];
    foreach ($rows as $r) {
        $r['employee'] = [
            'id' => $r['employee_id'],
            'first_name' => $r['first_name'],
            'last_name' => $r['last_name'],
            'employee_code' => $r['employee_code'],
            'department_name' => $r['department_name'],
            'designation_title' => $r['designation_title']
        ];
        $r['attendance'] = [
            'id' => $r['attendance_id'],
            'attendance_date' => $r['attendance_date'],
            'check_in' => $r['original_check_in'],
            'check_out' => $r['original_check_out'],
            'status' => $r['attendance_status']
        ];
        $r['reviewer'] = $r['reviewed_by'] ? [
            'id' => $r['reviewed_by'],
            'name' => $r['reviewer_name'],
            'email' => $r['reviewer_email']
        ] : null;

        // Attach previous review history for this session
        $r['review_history'] = fetchAttendanceCorrectionHistory($db, $r['attendance_id'], $r['id']);

        $data[] = $r;
    }

    echo json_encode(['data' => $data]);
};

// CRITICAL ROUTE ORDER: Register review routes BEFORE {id} routes
Router::get('/api/attendance/correction-requests/review', function() use ($handleListCorrectionRequests) {
    $handleListCorrectionRequests(true);
});
Router::get('/api/attendance/corrections/review', function() use ($handleListCorrectionRequests) {
    $handleListCorrectionRequests(true);
});

Router::get('/api/attendance/correction-requests', function() use ($handleListCorrectionRequests) {
    $handleListCorrectionRequests(false);
});
Router::get('/api/attendance/corrections', function() use ($handleListCorrectionRequests) {
    $handleListCorrectionRequests(false);
});

// -------------------------------------------------------------
// 3. Single Correction Request Details
// -------------------------------------------------------------
$handleGetCorrectionRequestById = function($id) {
    $user = Auth::user();
    $db = Database::getConnection();

    $stmt = $db->prepare("
        SELECT ac.*, 
               e.first_name, e.last_name, e.employee_code, e.manager_id,
               d.name as department_name, des.title as designation_title,
               a.attendance_date, a.check_in as original_check_in, a.check_out as original_check_out, a.status as attendance_status,
               u.name as reviewer_name, u.email as reviewer_email
        FROM attendance_corrections ac
        JOIN employees e ON ac.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        JOIN attendances a ON ac.attendance_id = a.id
        LEFT JOIN users u ON ac.reviewed_by = u.id
        WHERE ac.id = :id
        LIMIT 1
    ");
    $stmt->execute(['id' => (int)$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$r) {
        http_response_code(404);
        echo json_encode(['message' => 'Correction request not found']);
        return;
    }

    $isOwner = (!empty($user['employee_id']) && (int)$user['employee_id'] === (int)$r['employee_id']);
    $isReviewer = canReviewEmployeeAttendance($db, $user, $r['employee_id']);

    if (!$isOwner && !$isReviewer) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized access to this correction request']);
        return;
    }

    $r['employee'] = [
        'id' => $r['employee_id'],
        'first_name' => $r['first_name'],
        'last_name' => $r['last_name'],
        'employee_code' => $r['employee_code'],
        'department_name' => $r['department_name'],
        'designation_title' => $r['designation_title']
    ];
    $r['attendance'] = [
        'id' => $r['attendance_id'],
        'attendance_date' => $r['attendance_date'],
        'check_in' => $r['original_check_in'],
        'check_out' => $r['original_check_out'],
        'status' => $r['attendance_status']
    ];
    $r['reviewer'] = $r['reviewed_by'] ? [
        'id' => $r['reviewed_by'],
        'name' => $r['reviewer_name'],
        'email' => $r['reviewer_email']
    ] : null;

    $r['review_history'] = fetchAttendanceCorrectionHistory($db, $r['attendance_id'], $r['id']);

    echo json_encode(['data' => $r]);
};

Router::get('/api/attendance/correction-requests/{id}', $handleGetCorrectionRequestById);
Router::get('/api/attendance/corrections/{id}', $handleGetCorrectionRequestById);

// -------------------------------------------------------------
// 4. Approve Correction Request
// -------------------------------------------------------------
$handleApproveCorrectionRequest = function($id) {
    $user = Auth::user();
    global $input;
    $rawInput = !empty($input) && is_array($input) ? $input : (json_decode(file_get_contents('php://input'), true) ?: []);
    $data = !empty($_POST) ? array_merge($rawInput, $_POST) : $rawInput;
    $db = Database::getConnection();

    $approvedCheckOut = trim($data['approved_check_out'] ?? '');
    if (empty($approvedCheckOut)) {
        http_response_code(422);
        echo json_encode(['message' => 'Approved checkout datetime is mandatory.']);
        return;
    }

    $managerRemarks = trim($data['remarks'] ?? '');

    $db->beginTransaction();
    try {
        // 1. Lock correction request and verify pending status
        $corrStmt = $db->prepare("SELECT * FROM attendance_corrections WHERE id = :id FOR UPDATE");
        $corrStmt->execute(['id' => (int)$id]);
        $correction = $corrStmt->fetch(PDO::FETCH_ASSOC);

        if (!$correction) {
            $db->rollBack();
            http_response_code(404);
            echo json_encode(['message' => 'Correction request not found.']);
            return;
        }

        if ($correction['status'] !== 'Pending') {
            $db->rollBack();
            http_response_code(400);
            echo json_encode(['message' => 'Correction request is already ' . strtolower($correction['status']) . '.']);
            return;
        }

        // Revalidate reviewer authorization (strictly blocks self-approval)
        if (!canReviewEmployeeAttendance($db, $user, $correction['employee_id'])) {
            $db->rollBack();
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized to approve this correction request or self-approval is forbidden.']);
            return;
        }

        // 2. Lock attendance session and verify open status
        $attStmt = $db->prepare("SELECT * FROM attendances WHERE id = :id FOR UPDATE");
        $attStmt->execute(['id' => $correction['attendance_id']]);
        $attendance = $attStmt->fetch(PDO::FETCH_ASSOC);

        if (!$attendance) {
            $db->rollBack();
            http_response_code(404);
            echo json_encode(['message' => 'Linked attendance session not found.']);
            return;
        }

        if ($attendance['check_out'] !== null) {
            $db->rollBack();
            http_response_code(400);
            echo json_encode(['message' => 'Attendance session is already closed and not eligible for correction.']);
            return;
        }

        // 3. Validate manager-selected checkout time
        $approvedTs = strtotime($approvedCheckOut);
        if ($approvedTs === false) {
            $db->rollBack();
            http_response_code(422);
            echo json_encode(['message' => 'Invalid approved checkout datetime format.']);
            return;
        }

        $checkInTs = strtotime($attendance['check_in']);
        if ($approvedTs <= $checkInTs) {
            $db->rollBack();
            http_response_code(422);
            echo json_encode(['message' => "Approved checkout time must be after check-in time ({$attendance['check_in']})."]);
            return;
        }

        if ($approvedTs > time() + 60) {
            $db->rollBack();
            http_response_code(422);
            echo json_encode(['message' => 'Approved checkout time cannot be in the future.']);
            return;
        }

        $workingMinutes = (int)round(($approvedTs - $checkInTs) / 60);
        if ($workingMinutes <= 0) {
            $db->rollBack();
            http_response_code(422);
            echo json_encode(['message' => 'Calculated working duration must be positive.']);
            return;
        }

        $approvedFormatted = date('Y-m-d H:i:s', $approvedTs);

        // 4. Overlap check against other attendance records for this employee
        $overlapStmt = $db->prepare("
            SELECT id FROM attendances
            WHERE employee_id = :emp_id 
              AND id != :curr_id
              AND (
                (check_out IS NOT NULL AND check_in < :approved_check_out AND check_out > :check_in)
                OR
                (check_out IS NULL AND check_in >= :check_in AND check_in < :approved_check_out)
              )
            LIMIT 1
        ");
        $overlapStmt->execute([
            'emp_id' => $correction['employee_id'],
            'curr_id' => $attendance['id'],
            'approved_check_out' => $approvedFormatted,
            'check_in' => $attendance['check_in']
        ]);
        if ($overlapStmt->fetch()) {
            $db->rollBack();
            http_response_code(422);
            echo json_encode(['message' => 'Approved checkout time causes an overlap with another attendance session.']);
            return;
        }

        // 5. Update attendances table
        $remarksAppend = "Missed check-out corrected & approved by " . $user['name'];
        if (!empty($managerRemarks)) {
            $remarksAppend .= ": " . $managerRemarks;
        }

        $updateAtt = $db->prepare("
            UPDATE attendances SET
                check_out = :approved_check_out,
                working_minutes = :working_minutes,
                remarks = CASE 
                    WHEN remarks IS NULL OR remarks = '' THEN :remarks_suffix
                    ELSE CONCAT(remarks, ' | ', :remarks_suffix)
                END,
                updated_at = NOW()
            WHERE id = :id AND check_out IS NULL
        ");
        $updateAtt->execute([
            'approved_check_out' => $approvedFormatted,
            'working_minutes' => $workingMinutes,
            'remarks_suffix' => $remarksAppend,
            'id' => $attendance['id']
        ]);

        if ($updateAtt->rowCount() === 0) {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['message' => 'Concurrent conflict: attendance session was already closed.']);
            return;
        }

        // 6. Update attendance_corrections table
        $updateCorr = $db->prepare("
            UPDATE attendance_corrections SET
                status = 'Approved',
                approved_check_out = :approved_check_out,
                reviewed_by = :reviewed_by,
                reviewed_at = NOW(),
                remarks = :remarks,
                updated_at = NOW()
            WHERE id = :id AND status = 'Pending'
        ");
        $updateCorr->execute([
            'approved_check_out' => $approvedFormatted,
            'reviewed_by' => $user['user_id'],
            'remarks' => $managerRemarks ?: null,
            'id' => $correction['id']
        ]);

        if ($updateCorr->rowCount() === 0) {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['message' => 'Concurrent conflict: correction request was already updated.']);
            return;
        }

        // 7. Audit log entry
        $auditStmt = $db->prepare("
            INSERT INTO audit_logs (
                user_id, employee_id, action, entity_type, entity_id, description,
                old_values, new_values, ip_address, user_agent, created_at, updated_at
            ) VALUES (
                :uid, :eid, 'ATTENDANCE_CORRECTION_APPROVED', 'AttendanceCorrection', :entity_id, :desc,
                :old, :new, :ip, :ua, NOW(), NOW()
            )
        ");
        $auditStmt->execute([
            'uid' => $user['user_id'],
            'eid' => $user['employee_id'] ?? null,
            'entity_id' => $correction['id'],
            'desc' => "Missed checkout correction approved for Employee #{$correction['employee_id']} by {$user['name']}",
            'old' => json_encode(['attendance_check_out' => null, 'status' => 'Pending']),
            'new' => json_encode([
                'approved_check_out' => $approvedFormatted,
                'working_minutes' => $workingMinutes,
                'status' => 'Approved',
                'reviewed_by' => $user['user_id'],
                'remarks' => $managerRemarks ?: null
            ]),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
            'ua' => $_SERVER['HTTP_USER_AGENT'] ?? 'Web'
        ]);

        $db->commit();

        $updatedAttendance = $db->query("SELECT * FROM attendances WHERE id = " . (int)$attendance['id'])->fetch(PDO::FETCH_ASSOC);
        $updatedCorrection = $db->query("SELECT * FROM attendance_corrections WHERE id = " . (int)$correction['id'])->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'message' => 'Correction request approved and attendance session updated successfully.',
            'attendance' => $updatedAttendance,
            'correction' => $updatedCorrection
        ]);
    } catch (\Throwable $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['message' => 'Server error during approval: ' . $e->getMessage()]);
    }
};

Router::post('/api/attendance/correction-requests/{id}/approve', $handleApproveCorrectionRequest);
Router::put('/api/attendance/correction-requests/{id}/approve', $handleApproveCorrectionRequest);
Router::post('/api/attendance/corrections/{id}/approve', $handleApproveCorrectionRequest);
Router::put('/api/attendance/corrections/{id}/approve', $handleApproveCorrectionRequest);

// -------------------------------------------------------------
// 5. Reject Correction Request
// -------------------------------------------------------------
$handleRejectCorrectionRequest = function($id) {
    $user = Auth::user();
    global $input;
    $rawInput = !empty($input) && is_array($input) ? $input : (json_decode(file_get_contents('php://input'), true) ?: []);
    $data = !empty($_POST) ? array_merge($rawInput, $_POST) : $rawInput;
    $db = Database::getConnection();

    $remarks = trim($data['remarks'] ?? '');
    if (empty($remarks)) {
        http_response_code(422);
        echo json_encode(['message' => 'Rejection comments/explanation are mandatory.']);
        return;
    }

    $db->beginTransaction();
    try {
        $corrStmt = $db->prepare("SELECT * FROM attendance_corrections WHERE id = :id FOR UPDATE");
        $corrStmt->execute(['id' => (int)$id]);
        $correction = $corrStmt->fetch(PDO::FETCH_ASSOC);

        if (!$correction) {
            $db->rollBack();
            http_response_code(404);
            echo json_encode(['message' => 'Correction request not found.']);
            return;
        }

        if ($correction['status'] !== 'Pending') {
            $db->rollBack();
            http_response_code(400);
            echo json_encode(['message' => 'Correction request is already ' . strtolower($correction['status']) . '.']);
            return;
        }

        if (!canReviewEmployeeAttendance($db, $user, $correction['employee_id'])) {
            $db->rollBack();
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized to reject this correction request or self-rejection is forbidden.']);
            return;
        }

        $updateCorr = $db->prepare("
            UPDATE attendance_corrections SET
                status = 'Rejected',
                reviewed_by = :reviewed_by,
                reviewed_at = NOW(),
                remarks = :remarks,
                updated_at = NOW()
            WHERE id = :id AND status = 'Pending'
        ");
        $updateCorr->execute([
            'reviewed_by' => $user['user_id'],
            'remarks' => $remarks,
            'id' => $correction['id']
        ]);

        if ($updateCorr->rowCount() === 0) {
            $db->rollBack();
            http_response_code(409);
            echo json_encode(['message' => 'Concurrent conflict: correction request was already updated.']);
            return;
        }

        // Attendance session remains open (check_out is still NULL)
        $auditStmt = $db->prepare("
            INSERT INTO audit_logs (
                user_id, employee_id, action, entity_type, entity_id, description,
                old_values, new_values, ip_address, user_agent, created_at, updated_at
            ) VALUES (
                :uid, :eid, 'ATTENDANCE_CORRECTION_REJECTED', 'AttendanceCorrection', :entity_id, :desc,
                :old, :new, :ip, :ua, NOW(), NOW()
            )
        ");
        $auditStmt->execute([
            'uid' => $user['user_id'],
            'eid' => $user['employee_id'] ?? null,
            'entity_id' => $correction['id'],
            'desc' => "Missed checkout correction rejected for Employee #{$correction['employee_id']} by {$user['name']}",
            'old' => json_encode(['status' => 'Pending']),
            'new' => json_encode([
                'status' => 'Rejected',
                'reviewed_by' => $user['user_id'],
                'remarks' => $remarks
            ]),
            'ip' => $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1',
            'ua' => $_SERVER['HTTP_USER_AGENT'] ?? 'Web'
        ]);

        $db->commit();

        $updatedCorrection = $db->query("SELECT * FROM attendance_corrections WHERE id = " . (int)$correction['id'])->fetch(PDO::FETCH_ASSOC);

        echo json_encode([
            'message' => 'Correction request rejected. Attendance session remains open for employee resubmission.',
            'correction' => $updatedCorrection
        ]);
    } catch (\Throwable $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['message' => 'Server error during rejection: ' . $e->getMessage()]);
    }
};

Router::post('/api/attendance/correction-requests/{id}/reject', $handleRejectCorrectionRequest);
Router::put('/api/attendance/correction-requests/{id}/reject', $handleRejectCorrectionRequest);
Router::post('/api/attendance/corrections/{id}/reject', $handleRejectCorrectionRequest);
Router::put('/api/attendance/corrections/{id}/reject', $handleRejectCorrectionRequest);

// -------------------------------------------------------------
// 6. Evidence Retrieval / Download
// -------------------------------------------------------------
$handleGetCorrectionEvidence = function($id) {
    $user = Auth::user();
    $db = Database::getConnection();

    $stmt = $db->prepare("SELECT * FROM attendance_corrections WHERE id = :id LIMIT 1");
    $stmt->execute(['id' => (int)$id]);
    $correction = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$correction || empty($correction['evidence_file'])) {
        http_response_code(404);
        echo json_encode(['message' => 'Evidence file not found.']);
        return;
    }

    $isOwner = (!empty($user['employee_id']) && (int)$user['employee_id'] === (int)$correction['employee_id']);
    $isReviewer = canReviewEmployeeAttendance($db, $user, $correction['employee_id']);

    if (!$isOwner && !$isReviewer) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized to access this evidence file.']);
        return;
    }

    $fullPath = __DIR__ . '/' . $correction['evidence_file'];
    if (!file_exists($fullPath)) {
        http_response_code(404);
        echo json_encode(['message' => 'Stored evidence file is missing from filesystem.']);
        return;
    }

    $mime = mime_content_type($fullPath) ?: 'application/octet-stream';
    $originalName = !empty($correction['evidence_original_name']) 
        ? $correction['evidence_original_name'] 
        : basename($fullPath);

    header('Content-Type: ' . $mime);
    header('Content-Disposition: inline; filename="' . addslashes($originalName) . '"');
    header('Content-Length: ' . filesize($fullPath));
    header('Cache-Control: private, max-age=0, must-revalidate');
    readfile($fullPath);
    exit;
};

Router::get('/api/attendance/correction-requests/{id}/evidence', $handleGetCorrectionEvidence);
Router::get('/api/attendance/corrections/{id}/evidence', $handleGetCorrectionEvidence);
