<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// TIMESHEETS CRUD
// ==========================================

Router::get('/api/timesheets', function() {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    
    // Get employee record
    $stmt = $db->prepare("SELECT id, role FROM employees WHERE user_id = ?");
    $stmt->execute([$user_id]);
    $employee = $stmt->fetch(PDO::FETCH_ASSOC);
    $user_role = $employee ? $employee['role'] : 'Employee';
    $user_employee_id = $employee ? $employee['id'] : null;
    
    // Fallback for Super Admin if not in employees table (mock)
    if ($user_id == 1 || $user_id == 8) { // basic fallback if needed, but wait
        $stmt_u = $db->prepare("SELECT role FROM users WHERE id = ?");
        $stmt_u->execute([$user_id]);
        $user_data = $stmt_u->fetch(PDO::FETCH_ASSOC);
        if ($user_data && ($user_data['role'] === 'Super Admin' || $user_data['role'] === 'HR Admin')) {
            $user_role = $user_data['role'];
        }
    }
    
    $status = $_GET['status'] ?? null;
    $employee_id = $_GET['employee_id'] ?? null;
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
    
    // RBAC
    if ($user_role !== 'Super Admin' && $user_role !== 'HR Admin') {
        if ($user_role === 'Manager' && $user_employee_id) {
            // Managers see their own + their direct reports
            $sql .= " AND (t.employee_id = ? OR t.employee_id IN (SELECT id FROM employees WHERE manager_id = ?))";
            $params[] = $user_employee_id;
            $params[] = $user_employee_id;
        } else if ($user_employee_id) {
            // Employees see only their own
            $sql .= " AND t.employee_id = ?";
            $params[] = $user_employee_id;
        }
    }
    
    if ($status) {
        $sql .= " AND t.status = ?";
        $params[] = $status;
    }
    if ($employee_id) {
        $sql .= " AND t.employee_id = ?";
        $params[] = $employee_id;
    }
    if ($from) {
        $sql .= " AND t.date >= ?";
        $params[] = $from;
    }
    if ($to) {
        $sql .= " AND t.date <= ?";
        $params[] = $to;
    }
    
    $sql .= " ORDER BY t.date DESC";
    
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
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    $stmt = $db->prepare("SELECT id FROM employees WHERE user_id = ?");
    $stmt->execute([$user_id]);
    $employee = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $employee_id = $data['employee_id'] ?? ($employee ? $employee['id'] : null);
    
    if (!$employee_id) {
        $stmt_fb = $db->query("SELECT id FROM employees LIMIT 1");
        $fallback = $stmt_fb->fetch(PDO::FETCH_ASSOC);
        if ($fallback) {
            $employee_id = $fallback['id'];
        } else {
            http_response_code(400);
            echo json_encode(['message' => 'No employee record associated with this user.']);
            return;
        }
    }
    
    if (empty($data['project_id']) || empty($data['date']) || empty($data['hours'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Required fields missing']]]);
        return;
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
        $data['status'] ?? 'Draft'
    ]);
    
    $id = $db->lastInsertId();
    $newRecord = $db->query("SELECT * FROM timesheets WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode($newRecord);
});

Router::post('/api/timesheets/weekly', function() {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    file_put_contents(__DIR__ . '/timesheet_req.log', date('Y-m-d H:i:s') . " - Payload: " . json_encode($data) . "\n", FILE_APPEND);
    
    // Get employee_id for the logged-in user
    $stmt = $db->prepare("SELECT id FROM employees WHERE user_id = ?");
    $stmt->execute([$user_id]);
    $employee = $stmt->fetch(PDO::FETCH_ASSOC);
    
    $entries = $data['entries'] ?? [];
    if (empty($entries)) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['entries' => ['Entries are required']]]);
        return;
    }
    
    $employee_id = $data['employee_id'] ?? ($employee ? $employee['id'] : null);
    
    if (!$employee_id) {
        $stmt_fb = $db->query("SELECT id FROM employees LIMIT 1");
        $fallback = $stmt_fb->fetch(PDO::FETCH_ASSOC);
        if ($fallback) {
            $employee_id = $fallback['id'];
        } else {
            http_response_code(400);
            echo json_encode(['message' => 'No employee record associated with this user.']);
            return;
        }
    }
    
    $db->beginTransaction();
    try {
        $stmt = $db->prepare("
            INSERT INTO timesheets (employee_id, project_id, date, hours, billable_hours, non_billable_hours, task_id, client, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Submitted', NOW(), NOW())
        ");
        
        foreach ($entries as $e) {
            $stmt->execute([
                $employee_id,
                $e['project_id'],
                $e['date'],
                $e['hours'],
                $e['billable_hours'] ?? $e['hours'],
                $e['non_billable_hours'] ?? 0,
                $e['task_id'] ?? null,
                $e['client'] ?? null // Client maps to task description in frontend
            ]);
        }
        
        $db->commit();
        echo json_encode(['message' => 'Timesheets saved successfully']);
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        file_put_contents(__DIR__ . '/timesheet_err.log', date('Y-m-d H:i:s') . " - Error: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine() . "\n", FILE_APPEND);
        http_response_code(500);
        echo json_encode(['message' => 'Failed to save timesheets', 'error' => $e->getMessage()]);
    }
});

Router::post('/api/timesheets/{id}/submit', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $db->prepare("UPDATE timesheets SET status = 'Submitted', updated_at = NOW() WHERE id = ? AND status = 'Draft'")->execute([$id]);
    echo json_encode(['message' => 'Submitted successfully']);
});

Router::post('/api/timesheets/{id}/approve', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $db->prepare("UPDATE timesheets SET status = 'Approved', updated_at = NOW() WHERE id = ?")->execute([$id]);
    echo json_encode(['message' => 'Approved successfully']);
});

Router::post('/api/timesheets/{id}/reject', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $db->prepare("UPDATE timesheets SET status = 'Rejected', updated_at = NOW() WHERE id = ?")->execute([$id]);
    echo json_encode(['message' => 'Rejected successfully']);
});

Router::delete('/api/timesheets/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $db->prepare("DELETE FROM timesheets WHERE id = ?")->execute([$id]);
    http_response_code(204);
});
