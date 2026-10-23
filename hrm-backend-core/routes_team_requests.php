<?php

/**
 * Team Member Requests (Requisition) Routes
 * Module: routes_team_requests.php
 */

require_once __DIR__ . '/core/Auth.php';
require_once __DIR__ . '/core/Database.php';

// Safe helper to obtain the logged in employee ID across environments
if (!function_exists('getLoggedInEmployeeId')) {
    function getLoggedInEmployeeId($userId, $db) {
        $stmt = $db->prepare("SELECT id FROM employees WHERE user_id = :uid AND deleted_at IS NULL LIMIT 1");
        $stmt->execute([':uid' => $userId]);
        $id = $stmt->fetchColumn();
        if ($id) return (int)$id;

        $userStmt = $db->prepare("SELECT email FROM users WHERE id = :uid LIMIT 1");
        $userStmt->execute([':uid' => $userId]);
        $email = $userStmt->fetchColumn();
        if ($email) {
            $empStmt = $db->prepare("SELECT id FROM employees WHERE email = :email AND deleted_at IS NULL LIMIT 1");
            $empStmt->execute([':email' => $email]);
            $empId = $empStmt->fetchColumn();
            if ($empId) {
                $update = $db->prepare("UPDATE employees SET user_id = :uid WHERE id = :eid");
                $update->execute([':uid' => $userId, ':eid' => $empId]);
                return (int)$empId;
            }
        }
        return null;
    }
}

// Decimal-safe helper to validate and normalize DECIMAL(12,2) strings without float conversion
if (!function_exists('validateAndNormalizeDecimal12_2')) {
    function validateAndNormalizeDecimal12_2($value, &$errorMessage) {
        if ($value === null || $value === '') {
            return null;
        }

        if (!is_string($value) && !is_int($value) && !is_float($value)) {
            $errorMessage = 'must be a valid numeric value';
            return false;
        }

        $str = trim((string)$value);
        if ($str === '') {
            return null;
        }

        if (!preg_match('/^\d{1,10}(\.\d{1,2})?$/', $str)) {
            $errorMessage = 'must be a positive decimal value up to 9,999,999,999.99 with at most 2 decimal places';
            return false;
        }

        $parts = explode('.', $str);
        $intPart = ltrim($parts[0], '0');
        if ($intPart === '') {
            $intPart = '0';
        }
        $fracPart = isset($parts[1]) ? str_pad($parts[1], 2, '0', STR_PAD_RIGHT) : '00';

        return $intPart . '.' . $fracPart;
    }
}

// Decimal-safe string comparison: returns -1 if a < b, 0 if a == b, 1 if a > b
if (!function_exists('compareDecimalStrings')) {
    function compareDecimalStrings($a, $b) {
        if (function_exists('bccomp')) {
            return bccomp($a, $b, 2);
        }

        list($intA, $fracA) = explode('.', $a);
        list($intB, $fracB) = explode('.', $b);

        if (strlen($intA) !== strlen($intB)) {
            return strlen($intA) < strlen($intB) ? -1 : 1;
        }

        $cmpInt = strcmp($intA, $intB);
        if ($cmpInt !== 0) {
            return $cmpInt < 0 ? -1 : 1;
        }

        $cmpFrac = strcmp($fracA, $fracB);
        if ($cmpFrac !== 0) {
            return $cmpFrac < 0 ? -1 : 1;
        }

        return 0;
    }
}

// Helper to fetch full request details after status updates
if (!function_exists('fetchTeamRequestById')) {
    function fetchTeamRequestById($id, $db) {
        $stmt = $db->prepare("
            SELECT
                tmr.*,
                CONCAT(e.first_name, ' ', e.last_name) AS manager_name,
                e.employee_code AS manager_code,
                e.email AS manager_email,
                d.name AS department_name,
                des.title AS designation_title,
                u.name AS reviewer_name,
                jo.job_code,
                jo.title AS job_opening_title
            FROM team_member_requests tmr
            JOIN employees e ON tmr.manager_employee_id = e.id
            JOIN departments d ON tmr.department_id = d.id
            LEFT JOIN designations des ON tmr.designation_id = des.id
            LEFT JOIN users u ON tmr.reviewed_by = u.id
            LEFT JOIN job_openings jo ON tmr.job_opening_id = jo.id
            WHERE tmr.id = :id
            LIMIT 1
        ");
        $stmt->execute([':id' => (int)$id]);
        return $stmt->fetch(PDO::FETCH_ASSOC);
    }
}

// -------------------------------------------------------------
// POST /api/team-requests - Submit Team Member Request
// -------------------------------------------------------------
Router::post('/api/team-requests', function() {
    $userId = Auth::authenticate();
    $user = Auth::resolveUser($userId);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $userRoles = array_map('strtolower', $user['roles'] ?? []);
    $allowedRoles = ['admin', 'super admin', 'hr admin', 'manager'];
    $hasRole = false;
    foreach ($userRoles as $r) {
        if (in_array($r, $allowedRoles, true)) {
            $hasRole = true;
            break;
        }
    }

    if (!$hasRole) {
        http_response_code(403);
        echo json_encode(['message' => 'Forbidden: Only managers and administrators can submit team requests']);
        exit;
    }

    $isHrOrAdmin = false;
    foreach ($userRoles as $r) {
        if (in_array($r, ['admin', 'super admin', 'hr admin'], true)) {
            $isHrOrAdmin = true;
            break;
        }
    }

    $db = Database::getConnection();

    $managerEmpId = $user['employee_id'] ?? getLoggedInEmployeeId($user['user_id'], $db);
    if (!$managerEmpId) {
        http_response_code(404);
        echo json_encode(['message' => 'Active employee profile not found for current user']);
        exit;
    }

    $empStmt = $db->prepare("SELECT id, department_id, employment_status FROM employees WHERE id = :id AND deleted_at IS NULL LIMIT 1");
    $empStmt->execute([':id' => $managerEmpId]);
    $emp = $empStmt->fetch(PDO::FETCH_ASSOC);

    if (!$emp || strtolower($emp['employment_status'] ?? '') !== 'active') {
        http_response_code(403);
        echo json_encode(['message' => 'Forbidden: Requester profile is inactive or suspended']);
        exit;
    }

    $inputJSON = file_get_contents('php://input');
    $input = json_decode($inputJSON, true) ?: [];

    $errors = [];

    if (!$isHrOrAdmin) {
        if (!empty($input['department_id']) && (int)$input['department_id'] !== (int)$emp['department_id']) {
            http_response_code(403);
            echo json_encode(['message' => 'Managers can only submit requests for their own department']);
            exit;
        }
        $departmentId = (int)$emp['department_id'];
    } else {
        $departmentId = !empty($input['department_id']) ? (int)$input['department_id'] : (int)$emp['department_id'];
    }

    if (empty($departmentId)) {
        $errors['department_id'] = 'Department is required';
    } else {
        $deptCheck = $db->prepare("SELECT id FROM departments WHERE id = :id LIMIT 1");
        $deptCheck->execute([':id' => $departmentId]);
        if (!$deptCheck->fetch()) {
            $errors['department_id'] = 'Selected department does not exist';
        }
    }

    $designationId = !empty($input['designation_id']) ? (int)$input['designation_id'] : null;
    if ($designationId !== null) {
        $desCheck = $db->prepare("SELECT id FROM designations WHERE id = :id LIMIT 1");
        $desCheck->execute([':id' => $designationId]);
        if (!$desCheck->fetch()) {
            $errors['designation_id'] = 'Selected designation does not exist';
        }
    }

    $openingsCount = isset($input['openings_count']) ? (int)$input['openings_count'] : 1;
    if ($openingsCount < 1 || $openingsCount > 50) {
        $errors['openings_count'] = 'Openings count must be between 1 and 50';
    }

    $allowedEmploymentTypes = ['Full-time', 'Part-time', 'Contract', 'Internship'];
    $employmentType = !empty($input['employment_type']) ? trim($input['employment_type']) : 'Full-time';
    if (!in_array($employmentType, $allowedEmploymentTypes, true)) {
        $errors['employment_type'] = 'Employment type must be one of: ' . implode(', ', $allowedEmploymentTypes);
    }

    $experienceLevel = !empty($input['experience_level']) ? trim($input['experience_level']) : null;
    if ($experienceLevel !== null && strlen($experienceLevel) > 50) {
        $errors['experience_level'] = 'Experience level cannot exceed 50 characters';
    }

    $skillsRequired = !empty($input['skills_required']) ? trim($input['skills_required']) : null;

    $salaryMin = null;
    $salaryMax = null;

    if (array_key_exists('salary_min', $input)) {
        $errMin = '';
        $normMin = validateAndNormalizeDecimal12_2($input['salary_min'], $errMin);
        if ($normMin === false) {
            $errors['salary_min'] = 'salary_min ' . $errMin;
        } else {
            $salaryMin = $normMin;
        }
    }

    if (array_key_exists('salary_max', $input)) {
        $errMax = '';
        $normMax = validateAndNormalizeDecimal12_2($input['salary_max'], $errMax);
        if ($normMax === false) {
            $errors['salary_max'] = 'salary_max ' . $errMax;
        } else {
            $salaryMax = $normMax;
        }
    }

    if ($salaryMin !== null && $salaryMax !== null && !isset($errors['salary_min']) && !isset($errors['salary_max'])) {
        if (compareDecimalStrings($salaryMin, $salaryMax) > 0) {
            $errors['salary_max'] = 'salary_max must be greater than or equal to salary_min';
        }
    }

    $justification = !empty($input['business_justification']) ? trim($input['business_justification']) : '';
    if ($justification === '') {
        $errors['business_justification'] = 'Business justification is required';
    }

    $allowedUrgency = ['Low', 'Medium', 'High', 'Critical'];
    $urgency = !empty($input['urgency']) ? trim($input['urgency']) : 'Medium';
    if (!in_array($urgency, $allowedUrgency, true)) {
        $errors['urgency'] = 'Urgency must be one of: ' . implode(', ', $allowedUrgency);
    }

    if (!empty($errors)) {
        http_response_code(422);
        echo json_encode(['errors' => $errors]);
        exit;
    }

    $maxAttempts = 3;
    $insertedId = null;

    for ($attempt = 0; $attempt < $maxAttempts; $attempt++) {
        $requestCode = 'TMR-' . date('Ymd') . '-' . strtoupper(substr(bin2hex(random_bytes(3)), 0, 4));

        try {
            $db->beginTransaction();

            $insertSql = "INSERT INTO team_member_requests (
                request_code,
                manager_employee_id,
                department_id,
                designation_id,
                openings_count,
                employment_type,
                experience_level,
                skills_required,
                salary_min,
                salary_max,
                business_justification,
                urgency,
                status
            ) VALUES (
                :request_code,
                :manager_emp_id,
                :department_id,
                :designation_id,
                :openings_count,
                :employment_type,
                :experience_level,
                :skills_required,
                :salary_min,
                :salary_max,
                :justification,
                :urgency,
                'Pending'
            )";

            $stmt = $db->prepare($insertSql);
            $stmt->execute([
                ':request_code'     => $requestCode,
                ':manager_emp_id'   => $managerEmpId,
                ':department_id'    => $departmentId,
                ':designation_id'   => $designationId,
                ':openings_count'   => $openingsCount,
                ':employment_type'  => $employmentType,
                ':experience_level' => $experienceLevel,
                ':skills_required'  => $skillsRequired,
                ':salary_min'       => $salaryMin,
                ':salary_max'       => $salaryMax,
                ':justification'    => $justification,
                ':urgency'          => $urgency
            ]);

            $insertedId = (int)$db->lastInsertId();
            $db->commit();
            break;
        } catch (PDOException $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }

            if ($e->getCode() == 23000 && strpos($e->getMessage(), 'uniq_tmr_request_code') !== false) {
                if ($attempt < $maxAttempts - 1) {
                    continue;
                }
            }

            http_response_code(500);
            echo json_encode(['message' => 'Unable to submit team member request']);
            exit;
        }
    }

    if (!$insertedId) {
        http_response_code(500);
        echo json_encode(['message' => 'Unable to generate unique request code. Please try again.']);
        exit;
    }

    $newRecord = fetchTeamRequestById($insertedId, $db);

    http_response_code(201);
    echo json_encode([
        'message' => 'Team member request submitted successfully',
        'data'    => $newRecord
    ]);
    exit;
});

// -------------------------------------------------------------
// PUT /api/team-requests/{id}/request-info - HR Requests Clarification
// Allowed: Super Admin, HR Admin, HR Executive
// -------------------------------------------------------------
Router::put('/api/team-requests/{id}/request-info', function($id) {
    $userId = Auth::authenticate();
    $user = Auth::resolveUser($userId);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $userRoles = array_map('strtolower', $user['roles'] ?? []);
    $allowedRoles = ['admin', 'super admin', 'hr admin', 'hr executive'];
    $authorized = false;
    foreach ($userRoles as $r) {
        if (in_array($r, $allowedRoles, true)) {
            $authorized = true;
            break;
        }
    }

    if (!$authorized) {
        http_response_code(403);
        echo json_encode(['message' => 'Forbidden: Only HR personnel can request information']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $message = trim($input['clarification_notes'] ?? $input['message'] ?? $input['remarks'] ?? '');

    if ($message === '') {
        http_response_code(422);
        echo json_encode(['errors' => ['clarification_notes' => 'Clarification message is required']]);
        exit;
    }

    if (strlen($message) > 2000) {
        http_response_code(422);
        echo json_encode(['errors' => ['clarification_notes' => 'Clarification message cannot exceed 2000 characters']]);
        exit;
    }

    $db = Database::getConnection();
    $id = (int)$id;

    $existing = $db->prepare("SELECT id, status, clarification_notes FROM team_member_requests WHERE id = :id");
    $existing->execute([':id' => $id]);
    $rec = $existing->fetch(PDO::FETCH_ASSOC);

    if (!$rec) {
        http_response_code(404);
        echo json_encode(['message' => 'Team member request not found']);
        exit;
    }

    if ($rec['status'] !== 'Pending') {
        http_response_code(409);
        echo json_encode(['message' => "Request cannot be transitioned to 'Needs Information' from status '{$rec['status']}'"]);
        exit;
    }

    $timestamp = date('Y-m-d H:i:s');
    $formattedNotes = ($rec['clarification_notes'] ? $rec['clarification_notes'] . "\n\n" : "") .
                      "[$timestamp HR Query]: " . $message;

    $stmt = $db->prepare("
        UPDATE team_member_requests
        SET status = 'Needs Information',
            clarification_notes = :notes,
            reviewed_by = :reviewer_id,
            reviewed_at = NOW(),
            reviewer_remarks = :remarks
        WHERE id = :id AND status = 'Pending'
    ");

    $stmt->execute([
        ':notes'       => $formattedNotes,
        ':reviewer_id' => $user['user_id'],
        ':remarks'     => $message,
        ':id'          => $id
    ]);

    if ($stmt->rowCount() === 0) {
        http_response_code(409);
        echo json_encode(['message' => 'Request was modified by another process or is no longer in Pending status']);
        exit;
    }

    $updated = fetchTeamRequestById($id, $db);
    echo json_encode([
        'message' => 'Clarification requested successfully',
        'data'    => $updated
    ]);
    exit;
});

// -------------------------------------------------------------
// PUT /api/team-requests/{id}/approve - HR Approves Requisition
// Allowed: Super Admin, HR Admin only
// -------------------------------------------------------------
Router::put('/api/team-requests/{id}/approve', function($id) {
    $userId = Auth::authenticate();
    $user = Auth::resolveUser($userId);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $userRoles = array_map('strtolower', $user['roles'] ?? []);
    $allowedRoles = ['admin', 'super admin', 'hr admin'];
    $authorized = false;
    foreach ($userRoles as $r) {
        if (in_array($r, $allowedRoles, true)) {
            $authorized = true;
            break;
        }
    }

    if (!$authorized) {
        http_response_code(403);
        echo json_encode(['message' => 'Forbidden: Only HR Administrators can approve requests']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $remarks = isset($input['reviewer_remarks']) ? trim($input['reviewer_remarks']) : null;

    if ($remarks !== null && strlen($remarks) > 2000) {
        http_response_code(422);
        echo json_encode(['errors' => ['reviewer_remarks' => 'Reviewer remarks cannot exceed 2000 characters']]);
        exit;
    }

    $db = Database::getConnection();
    $id = (int)$id;

    $existing = $db->prepare("SELECT id, status FROM team_member_requests WHERE id = :id");
    $existing->execute([':id' => $id]);
    $rec = $existing->fetch(PDO::FETCH_ASSOC);

    if (!$rec) {
        http_response_code(404);
        echo json_encode(['message' => 'Team member request not found']);
        exit;
    }

    if (!in_array($rec['status'], ['Pending', 'Needs Information'], true)) {
        http_response_code(409);
        echo json_encode(['message' => "Request cannot be approved from status '{$rec['status']}'"]);
        exit;
    }

    $stmt = $db->prepare("
        UPDATE team_member_requests
        SET status = 'Approved',
            reviewed_by = :reviewer_id,
            reviewed_at = NOW(),
            reviewer_remarks = :remarks
        WHERE id = :id AND status IN ('Pending', 'Needs Information')
    ");

    $stmt->execute([
        ':reviewer_id' => $user['user_id'],
        ':remarks'     => $remarks,
        ':id'          => $id
    ]);

    if ($stmt->rowCount() === 0) {
        http_response_code(409);
        echo json_encode(['message' => 'Request was modified by another process. Please refresh and try again.']);
        exit;
    }

    $updated = fetchTeamRequestById($id, $db);
    echo json_encode([
        'message' => 'Team member request approved successfully',
        'data'    => $updated
    ]);
    exit;
});

// -------------------------------------------------------------
// PUT /api/team-requests/{id}/reject - HR Rejects Requisition
// Allowed: Super Admin, HR Admin only
// -------------------------------------------------------------
Router::put('/api/team-requests/{id}/reject', function($id) {
    $userId = Auth::authenticate();
    $user = Auth::resolveUser($userId);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $userRoles = array_map('strtolower', $user['roles'] ?? []);
    $allowedRoles = ['admin', 'super admin', 'hr admin'];
    $authorized = false;
    foreach ($userRoles as $r) {
        if (in_array($r, $allowedRoles, true)) {
            $authorized = true;
            break;
        }
    }

    if (!$authorized) {
        http_response_code(403);
        echo json_encode(['message' => 'Forbidden: Only HR Administrators can reject requests']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $remarks = trim($input['reviewer_remarks'] ?? $input['reason'] ?? '');

    if ($remarks === '') {
        http_response_code(422);
        echo json_encode(['errors' => ['reviewer_remarks' => 'Rejection reason is required']]);
        exit;
    }

    if (strlen($remarks) > 2000) {
        http_response_code(422);
        echo json_encode(['errors' => ['reviewer_remarks' => 'Rejection reason cannot exceed 2000 characters']]);
        exit;
    }

    $db = Database::getConnection();
    $id = (int)$id;

    $existing = $db->prepare("SELECT id, status FROM team_member_requests WHERE id = :id");
    $existing->execute([':id' => $id]);
    $rec = $existing->fetch(PDO::FETCH_ASSOC);

    if (!$rec) {
        http_response_code(404);
        echo json_encode(['message' => 'Team member request not found']);
        exit;
    }

    if (!in_array($rec['status'], ['Pending', 'Needs Information'], true)) {
        http_response_code(409);
        echo json_encode(['message' => "Request cannot be rejected from status '{$rec['status']}'"]);
        exit;
    }

    $stmt = $db->prepare("
        UPDATE team_member_requests
        SET status = 'Rejected',
            reviewed_by = :reviewer_id,
            reviewed_at = NOW(),
            reviewer_remarks = :remarks
        WHERE id = :id AND status IN ('Pending', 'Needs Information')
    ");

    $stmt->execute([
        ':reviewer_id' => $user['user_id'],
        ':remarks'     => $remarks,
        ':id'          => $id
    ]);

    if ($stmt->rowCount() === 0) {
        http_response_code(409);
        echo json_encode(['message' => 'Request was modified by another process. Please refresh and try again.']);
        exit;
    }

    $updated = fetchTeamRequestById($id, $db);
    echo json_encode([
        'message' => 'Team member request rejected',
        'data'    => $updated
    ]);
    exit;
});

// -------------------------------------------------------------
// PUT /api/team-requests/{id}/resubmit - Manager Resubmits Clarification
// Allowed: Original Requesting Manager Only
// -------------------------------------------------------------
Router::put('/api/team-requests/{id}/resubmit', function($id) {
    $userId = Auth::authenticate();
    $user = Auth::resolveUser($userId);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $db = Database::getConnection();
    $managerEmpId = $user['employee_id'] ?? getLoggedInEmployeeId($user['user_id'], $db);

    if (!$managerEmpId) {
        http_response_code(404);
        echo json_encode(['message' => 'Active employee profile not found for current user']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $response = trim($input['clarification_response'] ?? $input['response'] ?? $input['clarification_notes'] ?? '');

    if ($response === '') {
        http_response_code(422);
        echo json_encode(['errors' => ['clarification_response' => 'Clarification response is required']]);
        exit;
    }

    if (strlen($response) > 2000) {
        http_response_code(422);
        echo json_encode(['errors' => ['clarification_response' => 'Clarification response cannot exceed 2000 characters']]);
        exit;
    }

    $id = (int)$id;

    $existing = $db->prepare("SELECT id, manager_employee_id, status, clarification_notes FROM team_member_requests WHERE id = :id");
    $existing->execute([':id' => $id]);
    $rec = $existing->fetch(PDO::FETCH_ASSOC);

    if (!$rec) {
        http_response_code(404);
        echo json_encode(['message' => 'Team member request not found']);
        exit;
    }

    if ((int)$rec['manager_employee_id'] !== (int)$managerEmpId) {
        http_response_code(403);
        echo json_encode(['message' => 'Forbidden: You can only resubmit clarification for your own request']);
        exit;
    }

    if ($rec['status'] !== 'Needs Information') {
        http_response_code(409);
        echo json_encode(['message' => "Request cannot be resubmitted from status '{$rec['status']}'. It must be in 'Needs Information' status."]);
        exit;
    }

    $timestamp = date('Y-m-d H:i:s');
    $updatedNotes = ($rec['clarification_notes'] ? $rec['clarification_notes'] . "\n\n" : "") .
                    "[$timestamp Manager Response]: " . $response;

    $stmt = $db->prepare("
        UPDATE team_member_requests
        SET status = 'Pending',
            clarification_notes = :notes
        WHERE id = :id AND manager_employee_id = :mgr_emp_id AND status = 'Needs Information'
    ");

    $stmt->execute([
        ':notes'      => $updatedNotes,
        ':id'         => $id,
        ':mgr_emp_id' => $managerEmpId
    ]);

    if ($stmt->rowCount() === 0) {
        http_response_code(409);
        echo json_encode(['message' => 'Request was modified by another process. Please refresh and try again.']);
        exit;
    }

    $updated = fetchTeamRequestById($id, $db);
    echo json_encode([
        'message' => 'Clarification resubmitted successfully. Request returned to Pending status.',
        'data'    => $updated
    ]);
    exit;
});

// -------------------------------------------------------------
// PUT /api/team-requests/{id}/cancel - Manager Cancels Requisition
// Allowed: Original Requesting Manager Only
// -------------------------------------------------------------
Router::put('/api/team-requests/{id}/cancel', function($id) {
    $userId = Auth::authenticate();
    $user = Auth::resolveUser($userId);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $db = Database::getConnection();
    $managerEmpId = $user['employee_id'] ?? getLoggedInEmployeeId($user['user_id'], $db);

    if (!$managerEmpId) {
        http_response_code(404);
        echo json_encode(['message' => 'Active employee profile not found for current user']);
        exit;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?: [];
    $reason = trim($input['reason'] ?? $input['cancellation_reason'] ?? $input['remarks'] ?? '');

    if ($reason === '') {
        http_response_code(422);
        echo json_encode(['errors' => ['reason' => 'Cancellation reason is required']]);
        exit;
    }

    if (strlen($reason) > 2000) {
        http_response_code(422);
        echo json_encode(['errors' => ['reason' => 'Cancellation reason cannot exceed 2000 characters']]);
        exit;
    }

    $id = (int)$id;

    $existing = $db->prepare("SELECT id, manager_employee_id, status, reviewer_remarks FROM team_member_requests WHERE id = :id");
    $existing->execute([':id' => $id]);
    $rec = $existing->fetch(PDO::FETCH_ASSOC);

    if (!$rec) {
        http_response_code(404);
        echo json_encode(['message' => 'Team member request not found']);
        exit;
    }

    if ((int)$rec['manager_employee_id'] !== (int)$managerEmpId) {
        http_response_code(403);
        echo json_encode(['message' => 'Forbidden: You can only cancel your own request']);
        exit;
    }

    if (!in_array($rec['status'], ['Pending', 'Needs Information'], true)) {
        http_response_code(409);
        echo json_encode(['message' => "Request cannot be cancelled from status '{$rec['status']}'"]);
        exit;
    }

    $cancellationEntry = "[Cancelled by Manager]: " . $reason;
    $formattedRemarks = !empty($rec['reviewer_remarks'])
        ? $rec['reviewer_remarks'] . "\n\n" . $cancellationEntry
        : $cancellationEntry;

    $stmt = $db->prepare("
        UPDATE team_member_requests
        SET status = 'Cancelled',
            reviewer_remarks = :remarks
        WHERE id = :id AND manager_employee_id = :mgr_emp_id AND status IN ('Pending', 'Needs Information')
    ");

    $stmt->execute([
        ':remarks'    => $formattedRemarks,
        ':id'         => $id,
        ':mgr_emp_id' => $managerEmpId
    ]);

    if ($stmt->rowCount() === 0) {
        http_response_code(409);
        echo json_encode(['message' => 'Request was modified by another process. Please refresh and try again.']);
        exit;
    }

    $updated = fetchTeamRequestById($id, $db);
    echo json_encode([
        'message' => 'Team member request cancelled successfully',
        'data'    => $updated
    ]);
    exit;
});

// -------------------------------------------------------------
// GET /api/team-requests - List Requests (Pagination & Filter)
// -------------------------------------------------------------
Router::get('/api/team-requests', function() {
    $userId = Auth::authenticate();
    $user = Auth::resolveUser($userId);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $userRoles = array_map('strtolower', $user['roles'] ?? []);
    $db = Database::getConnection();

    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $limit = isset($_GET['limit']) ? max(1, min(100, (int)$_GET['limit'])) : 10;
    $offset = ($page - 1) * $limit;

    $where = [];
    $params = [];

    $isHrOrAdmin = false;
    foreach ($userRoles as $r) {
        if (in_array($r, ['admin', 'super admin', 'hr admin'], true)) {
            $isHrOrAdmin = true;
            break;
        }
    }

    if (!$isHrOrAdmin) {
        $managerEmpId = $user['employee_id'] ?? getLoggedInEmployeeId($user['user_id'], $db);
        if (!$managerEmpId) {
            http_response_code(200);
            echo json_encode(['data' => [], 'meta' => ['total' => 0, 'page' => $page, 'limit' => $limit]]);
            exit;
        }
        $where[] = "tmr.manager_employee_id = :mgr_id";
        $params[':mgr_id'] = $managerEmpId;
    }

    if (!empty($_GET['status'])) {
        $where[] = "tmr.status = :status";
        $params[':status'] = trim($_GET['status']);
    }

    if (!empty($_GET['department_id'])) {
        $where[] = "tmr.department_id = :dept_id";
        $params[':dept_id'] = (int)$_GET['department_id'];
    }

    $whereSql = !empty($where) ? "WHERE " . implode(" AND ", $where) : "";

    $countSql = "SELECT COUNT(*) FROM team_member_requests tmr $whereSql";
    $countStmt = $db->prepare($countSql);
    $countStmt->execute($params);
    $total = (int)$countStmt->fetchColumn();

    $sql = "
        SELECT
            tmr.*,
            CONCAT(e.first_name, ' ', e.last_name) AS manager_name,
            e.employee_code AS manager_code,
            e.email AS manager_email,
            d.name AS department_name,
            des.title AS designation_title,
            u.name AS reviewer_name,
            jo.job_code,
            jo.title AS job_opening_title
        FROM team_member_requests tmr
        JOIN employees e ON tmr.manager_employee_id = e.id
        JOIN departments d ON tmr.department_id = d.id
        LEFT JOIN designations des ON tmr.designation_id = des.id
        LEFT JOIN users u ON tmr.reviewed_by = u.id
        LEFT JOIN job_openings jo ON tmr.job_opening_id = jo.id
        $whereSql
        ORDER BY tmr.id DESC
        LIMIT :limit OFFSET :offset
    ";

    $stmt = $db->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'data' => $records,
        'meta' => [
            'total'        => $total,
            'page'         => $page,
            'limit'        => $limit,
            'total_pages'  => ceil($total / $limit)
        ]
    ]);
    exit;
});

// -------------------------------------------------------------
// GET /api/team-requests/{id} - View Single Request
// -------------------------------------------------------------
Router::get('/api/team-requests/{id}', function($id) {
    $userId = Auth::authenticate();
    $user = Auth::resolveUser($userId);

    if (!$user) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthenticated']);
        exit;
    }

    $userRoles = array_map('strtolower', $user['roles'] ?? []);
    $db = Database::getConnection();

    $record = fetchTeamRequestById($id, $db);

    if (!$record) {
        http_response_code(404);
        echo json_encode(['message' => 'Team member request not found']);
        exit;
    }

    $isHrOrAdmin = false;
    foreach ($userRoles as $r) {
        if (in_array($r, ['admin', 'super admin', 'hr admin'], true)) {
            $isHrOrAdmin = true;
            break;
        }
    }

    if (!$isHrOrAdmin) {
        $managerEmpId = $user['employee_id'] ?? getLoggedInEmployeeId($user['user_id'], $db);
        if ((int)$record['manager_employee_id'] !== (int)$managerEmpId) {
            http_response_code(403);
            echo json_encode(['message' => 'Forbidden']);
            exit;
        }
    }

    echo json_encode(['data' => $record]);
    exit;
});
