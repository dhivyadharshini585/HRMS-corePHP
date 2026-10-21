<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// TIMESHEETS CRUD
// ==========================================

Router::get('/api/timesheets', function() {
    $user = Auth::user();
    $db = Database::getConnection();

    $user_role = $user['role'];
    $user_employee_id = $user['employee_id'];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true);
    $is_manager = ($user_role === 'Manager' && !empty($user_employee_id));

    $status = $_GET['status'] ?? null;
    $employee_id_filter = $_GET['employee_id'] ?? null;
    $from = $_GET['from'] ?? null;
    $to = $_GET['to'] ?? null;

    $sql = "
        SELECT t.*, 
               p.name as project_name,
               e.first_name, e.last_name, e.employee_code
        FROM timesheets t
        JOIN projects p ON t.project_id = p.id
        JOIN employees e ON t.employee_id = e.id
        WHERE 1=1
    ";
    $params = [];

    // RBAC Scoping
    if ($is_admin) {
        // Admins can see all, or filter by requested employee_id
        if (!empty($employee_id_filter) && is_numeric($employee_id_filter)) {
            $sql .= " AND t.employee_id = ?";
            $params[] = (int)$employee_id_filter;
        }
    } elseif ($is_manager) {
        // Managers see their own timesheets plus their direct reports' timesheets
        if (!empty($employee_id_filter) && is_numeric($employee_id_filter)) {
            $target_id = (int)$employee_id_filter;
            // Validate target is self or a direct report
            if ($target_id === (int)$user_employee_id) {
                $sql .= " AND t.employee_id = ?";
                $params[] = $target_id;
            } else {
                $sql .= " AND t.employee_id = ? AND t.employee_id IN (SELECT id FROM employees WHERE manager_id = ?)";
                $params[] = $target_id;
                $params[] = (int)$user_employee_id;
            }
        } else {
            $sql .= " AND (t.employee_id = ? OR t.employee_id IN (SELECT id FROM employees WHERE manager_id = ?))";
            $params[] = (int)$user_employee_id;
            $params[] = (int)$user_employee_id;
        }
    } else {
        // Ordinary employees must have a linked employee profile and can ONLY see their own
        if (empty($user_employee_id)) {
            echo json_encode([
                'data' => [],
                'current_page' => 1,
                'last_page' => 1,
                'total' => 0
            ]);
            return;
        }
        $sql .= " AND t.employee_id = ?";
        $params[] = (int)$user_employee_id;
    }

    if (!empty($status)) {
        $sql .= " AND t.status = ?";
        $params[] = $status;
    }
    if (!empty($from)) {
        $sql .= " AND t.date >= ?";
        $params[] = $from;
    }
    if (!empty($to)) {
        $sql .= " AND t.date <= ?";
        $params[] = $to;
    }

    $sql .= " ORDER BY t.date DESC, t.id DESC";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $timesheets = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $formatted = [];
    foreach ($timesheets as $t) {
        $formatted[] = [
            'id' => $t['id'],
            'employee_id' => $t['employee_id'],
            'project_id' => $t['project_id'],
            'date' => $t['date'],
            'hours' => $t['hours'],
            'billable_hours' => $t['billable_hours'],
            'non_billable_hours' => $t['non_billable_hours'],
            'task_id' => $t['task_id'],
            'client' => $t['client'],
            'status' => $t['status'],
            'created_at' => $t['created_at'],
            'updated_at' => $t['updated_at'],
            'project' => [
                'id' => $t['project_id'],
                'name' => $t['project_name']
            ],
            'employee' => [
                'id' => $t['employee_id'],
                'first_name' => $t['first_name'],
                'last_name' => $t['last_name'],
                'employee_code' => $t['employee_code']
            ]
        ];
    }

    echo json_encode([
        'data' => $formatted,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($formatted)
    ]);
});

Router::post('/api/timesheets', function() {
    $user = Auth::user();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];

    $user_role = $user['role'];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true);

    // Resolve employee_id strictly
    if ($is_admin && !empty($data['employee_id']) && is_numeric($data['employee_id'])) {
        // Validate that requested target employee actually exists
        $checkStmt = $db->prepare("SELECT id FROM employees WHERE id = ?");
        $checkStmt->execute([(int)$data['employee_id']]);
        if (!$checkStmt->fetch()) {
            http_response_code(422);
            echo json_encode(['message' => 'Validation error', 'errors' => ['employee_id' => ['Target employee not found']]]);
            return;
        }
        $employee_id = (int)$data['employee_id'];
    } else {
        // Regular employees and managers always record timesheets for themselves
        if (empty($user['employee_id'])) {
            http_response_code(403);
            echo json_encode(['message' => 'No employee profile linked to authenticated user.']);
            return;
        }
        $employee_id = (int)$user['employee_id'];
    }

    if (empty($data['project_id']) || empty($data['date']) || empty($data['hours'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Required fields missing']]]);
        return;
    }

    // Fix 1: Force initial status to Draft for non-administrators
    // Administrators may specify an explicit status, validated against an allowlist
    $allowed_statuses = ['Draft', 'Submitted', 'Approved', 'Rejected'];
    $status = 'Draft';
    if ($is_admin && !empty($data['status']) && in_array($data['status'], $allowed_statuses, true)) {
        $status = $data['status'];
    }

    $stmt = $db->prepare("
        INSERT INTO timesheets (employee_id, project_id, date, hours, billable_hours, non_billable_hours, task_id, client, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ");

    $stmt->execute([
        $employee_id,
        $data['project_id'],
        $data['date'],
        $data['hours'],
        $data['billable_hours'] ?? 0,
        $data['non_billable_hours'] ?? 0,
        $data['task_id'] ?? null,
        $data['client'] ?? null,
        $status
    ]);

    $id = $db->lastInsertId();
    $newRecord = $db->query("SELECT * FROM timesheets WHERE id = $id")->fetch(PDO::FETCH_ASSOC);

    echo json_encode($newRecord);
});

Router::post('/api/timesheets/weekly', function() {
    $user = Auth::user();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];

    $entries = $data['entries'] ?? [];
    if (empty($entries) || !is_array($entries)) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['entries' => ['Entries are required']]]);
        return;
    }

    $user_role = $user['role'];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true);

    // Resolve employee_id strictly
    if ($is_admin && !empty($data['employee_id']) && is_numeric($data['employee_id'])) {
        $checkStmt = $db->prepare("SELECT id FROM employees WHERE id = ?");
        $checkStmt->execute([(int)$data['employee_id']]);
        if (!$checkStmt->fetch()) {
            http_response_code(422);
            echo json_encode(['message' => 'Validation error', 'errors' => ['employee_id' => ['Target employee not found']]]);
            return;
        }
        $employee_id = (int)$data['employee_id'];
    } else {
        if (empty($user['employee_id'])) {
            http_response_code(403);
            echo json_encode(['message' => 'No employee profile linked to authenticated user.']);
            return;
        }
        $employee_id = (int)$user['employee_id'];
    }

    $db->beginTransaction();
    try {
        $stmt = $db->prepare("
            INSERT INTO timesheets (employee_id, project_id, date, hours, billable_hours, non_billable_hours, task_id, client, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', NOW(), NOW())
        ");

        foreach ($entries as $e) {
            if (empty($e['project_id']) || empty($e['date']) || !isset($e['hours'])) {
                continue;
            }
            $stmt->execute([
                $employee_id,
                $e['project_id'],
                $e['date'],
                $e['hours'],
                $e['billable_hours'] ?? $e['hours'],
                $e['non_billable_hours'] ?? 0,
                $e['task_id'] ?? null,
                $e['client'] ?? null
            ]);
        }

        $db->commit();
        echo json_encode(['message' => 'Timesheets saved successfully']);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        error_log('[Timesheets] Weekly submit failed: ' . $e->getMessage());
        http_response_code(500);
        echo json_encode(['message' => 'Failed to save timesheets']);
    }
});

Router::post('/api/timesheets/{id}/submit', function($id) {
    $user = Auth::user();
    $db = Database::getConnection();

    $stmt = $db->prepare("SELECT * FROM timesheets WHERE id = ?");
    $stmt->execute([$id]);
    $timesheet = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$timesheet) {
        http_response_code(404);
        echo json_encode(['message' => 'Timesheet not found']);
        return;
    }

    $user_role = $user['role'];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true);
    $is_owner = (!empty($user['employee_id']) && (int)$timesheet['employee_id'] === (int)$user['employee_id']);

    if (!$is_admin && !$is_owner) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action']);
        return;
    }

    if ($timesheet['status'] !== 'Draft') {
        http_response_code(422);
        echo json_encode(['message' => 'Only Draft timesheets can be submitted']);
        return;
    }

    $db->prepare("UPDATE timesheets SET status = 'Submitted', updated_at = NOW() WHERE id = ? AND status = 'Draft'")->execute([$id]);
    echo json_encode(['message' => 'Submitted successfully']);
});

Router::post('/api/timesheets/{id}/approve', function($id) {
    $user = Auth::user();
    $db = Database::getConnection();

    $stmt = $db->prepare("
        SELECT t.*, e.manager_id
        FROM timesheets t
        JOIN employees e ON t.employee_id = e.id
        WHERE t.id = ?
    ");
    $stmt->execute([$id]);
    $timesheet = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$timesheet) {
        http_response_code(404);
        echo json_encode(['message' => 'Timesheet not found']);
        return;
    }

    // Fix 2: Allow approval only when current status is Submitted
    if ($timesheet['status'] !== 'Submitted') {
        http_response_code(422);
        echo json_encode(['message' => 'Only Submitted timesheets can be approved']);
        return;
    }

    $user_role = $user['role'];
    $user_employee_id = $user['employee_id'];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true);
    $is_direct_manager = ($user_role === 'Manager' && !empty($user_employee_id) && (int)$timesheet['manager_id'] === (int)$user_employee_id);

    // Prevent employees from approving their own or other timesheets unless authorized manager/admin
    if (!$is_admin && !$is_direct_manager) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action: Only direct managers or administrators can approve timesheets']);
        return;
    }

    // Prohibit self-approval even if a manager
    if (!$is_admin && (int)$timesheet['employee_id'] === (int)$user_employee_id) {
        http_response_code(403);
        echo json_encode(['message' => 'Self-approval of timesheets is prohibited']);
        return;
    }

    // Atomic conditional update prevents race conditions between checking status and updating it
    $updateStmt = $db->prepare("UPDATE timesheets SET status = 'Approved', updated_at = NOW() WHERE id = ? AND status = 'Submitted'");
    $updateStmt->execute([$id]);

    if ($updateStmt->rowCount() === 0) {
        http_response_code(422);
        echo json_encode(['message' => 'Timesheet status was modified concurrently']);
        return;
    }

    echo json_encode(['message' => 'Approved successfully']);
});

Router::post('/api/timesheets/{id}/reject', function($id) {
    $user = Auth::user();
    $db = Database::getConnection();

    $stmt = $db->prepare("
        SELECT t.*, e.manager_id
        FROM timesheets t
        JOIN employees e ON t.employee_id = e.id
        WHERE t.id = ?
    ");
    $stmt->execute([$id]);
    $timesheet = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$timesheet) {
        http_response_code(404);
        echo json_encode(['message' => 'Timesheet not found']);
        return;
    }

    // Fix 2: Allow rejection only when current status is Submitted
    if ($timesheet['status'] !== 'Submitted') {
        http_response_code(422);
        echo json_encode(['message' => 'Only Submitted timesheets can be rejected']);
        return;
    }

    $user_role = $user['role'];
    $user_employee_id = $user['employee_id'];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true);
    $is_direct_manager = ($user_role === 'Manager' && !empty($user_employee_id) && (int)$timesheet['manager_id'] === (int)$user_employee_id);

    if (!$is_admin && !$is_direct_manager) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action: Only direct managers or administrators can reject timesheets']);
        return;
    }

    // Fix 3: Explicitly prohibit self-rejection
    if (!$is_admin && (int)$timesheet['employee_id'] === (int)$user_employee_id) {
        http_response_code(403);
        echo json_encode(['message' => 'Self-rejection of timesheets is prohibited']);
        return;
    }

    // Atomic conditional update prevents race conditions
    $updateStmt = $db->prepare("UPDATE timesheets SET status = 'Rejected', updated_at = NOW() WHERE id = ? AND status = 'Submitted'");
    $updateStmt->execute([$id]);

    if ($updateStmt->rowCount() === 0) {
        http_response_code(422);
        echo json_encode(['message' => 'Timesheet status was modified concurrently']);
        return;
    }

    echo json_encode(['message' => 'Rejected successfully']);
});

Router::delete('/api/timesheets/{id}', function($id) {
    $user = Auth::user();
    $db = Database::getConnection();

    $stmt = $db->prepare("SELECT * FROM timesheets WHERE id = ?");
    $stmt->execute([$id]);
    $timesheet = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$timesheet) {
        http_response_code(404);
        echo json_encode(['message' => 'Timesheet not found']);
        return;
    }

    $user_role = $user['role'];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true);
    $is_owner = (!empty($user['employee_id']) && (int)$timesheet['employee_id'] === (int)$user['employee_id']);

    if (!$is_admin && !$is_owner) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action']);
        return;
    }

    // Only Draft or Rejected timesheets can be deleted by regular employees
    if (!$is_admin && !in_array($timesheet['status'], ['Draft', 'Rejected'], true)) {
        http_response_code(422);
        echo json_encode(['message' => 'Cannot delete a timesheet that is Submitted or Approved']);
        return;
    }

    $db->prepare("DELETE FROM timesheets WHERE id = ?")->execute([$id]);
    http_response_code(204);
});
