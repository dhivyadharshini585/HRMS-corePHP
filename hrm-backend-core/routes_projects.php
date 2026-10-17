<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// PROJECTS CRUD
// ==========================================

Router::get('/api/projects', function() {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    $status = $_GET['status'] ?? null;
    $search = $_GET['search'] ?? null;
    
    $sql = "
        SELECT p.*, e.first_name as m_fn, e.last_name as m_ln
        FROM projects p
        LEFT JOIN employees e ON p.manager_id = e.id
        WHERE p.deleted_at IS NULL
    ";
    $params = [];
    
    // RBAC scoping: Managers can only see their projects unless they are Super/HR Admin
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $user['employee_id']) {
            $sql .= " AND p.manager_id = ?";
            $params[] = $user['employee_id'];
        }
    }
    
    if ($status) {
        $sql .= " AND p.status = ?";
        $params[] = $status;
    }
    
    if ($search) {
        $sql .= " AND p.name LIKE ?";
        $params[] = "%$search%";
    }
    
    $sql .= " ORDER BY p.created_at DESC";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formatted = [];
    foreach ($projects as $p) {
        $formatted[] = [
            'id' => $p['id'],
            'name' => $p['name'],
            'client' => $p['client'],
            'description' => $p['description'],
            'manager_id' => $p['manager_id'],
            'status' => $p['status'],
            'start_date' => $p['start_date'],
            'end_date' => $p['end_date'],
            'created_at' => $p['created_at'],
            'updated_at' => $p['updated_at'],
            'manager' => $p['manager_id'] ? [
                'id' => $p['manager_id'],
                'first_name' => $p['m_fn'],
                'last_name' => $p['m_ln']
            ] : null
        ];
    }
    
    // Simulating Laravel pagination response
    echo json_encode([
        'data' => $formatted,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($formatted)
    ]);
});

Router::post('/api/projects', function() {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (empty($data['name'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['name' => ['Name is required']]]);
        return;
    }
    
    $manager_id = !empty($data['manager_id']) ? $data['manager_id'] : null;
    
    // Manager default
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin' && $user['role'] === 'Manager' && $user['employee_id']) {
        $manager_id = $user['employee_id'];
    }
    
    $stmt = $db->prepare("
        INSERT INTO projects (name, client, description, manager_id, status, start_date, end_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ");
    
    $stmt->execute([
        $data['name'],
        $data['client'] ?? null,
        $data['description'] ?? null,
        $manager_id,
        $data['status'] ?? 'Active',
        $data['start_date'] ?? null,
        $data['end_date'] ?? null
    ]);
    
    $id = $db->lastInsertId();
    $newRecord = $db->query("SELECT * FROM projects WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode($newRecord);
});

Router::get('/api/projects/{id}', function($id) {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT p.*, e.first_name as m_fn, e.last_name as m_ln
        FROM projects p
        LEFT JOIN employees e ON p.manager_id = e.id
        WHERE p.id = ? AND p.deleted_at IS NULL
    ");
    $stmt->execute([$id]);
    $p = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$p) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }
    
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $p['manager_id'] != $user['employee_id']) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized project access.']);
            return;
        }
    }
    
    $formatted = [
        'id' => $p['id'],
        'name' => $p['name'],
        'client' => $p['client'],
        'description' => $p['description'],
        'manager_id' => $p['manager_id'],
        'status' => $p['status'],
        'start_date' => $p['start_date'],
        'end_date' => $p['end_date'],
        'created_at' => $p['created_at'],
        'updated_at' => $p['updated_at'],
        'manager' => $p['manager_id'] ? [
            'id' => $p['manager_id'],
            'first_name' => $p['m_fn'],
            'last_name' => $p['m_ln']
        ] : null,
        'tasks' => []
    ];
    
    $tasksStmt = $db->prepare("SELECT * FROM tasks WHERE project_id = ? AND deleted_at IS NULL ORDER BY created_at ASC");
    $tasksStmt->execute([$id]);
    $formatted['tasks'] = $tasksStmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode($formatted);
});

Router::put('/api/projects/{id}', function($id) {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    $data = json_decode(file_get_contents('php://input'), true);
    
    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }
    
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $existing['manager_id'] != $user['employee_id']) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized project access.']);
            return;
        }
    }
    
    $name = isset($data['name']) ? $data['name'] : $existing['name'];
    $client = array_key_exists('client', $data) ? $data['client'] : $existing['client'];
    $description = array_key_exists('description', $data) ? $data['description'] : $existing['description'];
    $manager_id = array_key_exists('manager_id', $data) ? $data['manager_id'] : $existing['manager_id'];
    $status = isset($data['status']) ? $data['status'] : $existing['status'];
    $start_date = array_key_exists('start_date', $data) ? $data['start_date'] : $existing['start_date'];
    $end_date = array_key_exists('end_date', $data) ? $data['end_date'] : $existing['end_date'];
    
    $updateStmt = $db->prepare("
        UPDATE projects 
        SET name = ?, client = ?, description = ?, manager_id = ?, status = ?, start_date = ?, end_date = ?, updated_at = NOW()
        WHERE id = ?
    ");
    
    $updateStmt->execute([
        $name, $client, $description, $manager_id, $status, $start_date, $end_date, $id
    ]);
    
    $stmt->execute([$id]);
    $updated = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode($updated);
});

Router::delete('/api/projects/{id}', function($id) {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }
    
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $existing['manager_id'] != $user['employee_id']) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized project access.']);
            return;
        }
    }
    
    $db->prepare("UPDATE projects SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
    
    http_response_code(204);
});

// ==========================================
// TASKS CRUD
// ==========================================

Router::post('/api/projects/{id}/tasks', function($id) {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    $data = json_decode(file_get_contents('php://input'), true);
    
    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }
    
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $existing['manager_id'] != $user['employee_id']) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized project access.']);
            return;
        }
    }
    
    if (empty($data['name'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['name' => ['Name is required']]]);
        return;
    }
    
    $insertStmt = $db->prepare("
        INSERT INTO tasks (project_id, name, description, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
    ");
    
    $insertStmt->execute([
        $id,
        $data['name'],
        $data['description'] ?? null,
        $data['status'] ?? 'To Do'
    ]);
    
    $taskId = $db->lastInsertId();
    $task = $db->query("SELECT * FROM tasks WHERE id = $taskId")->fetch(PDO::FETCH_ASSOC);
    
    http_response_code(201);
    echo json_encode($task);
});

Router::put('/api/projects/{projectId}/tasks/{taskId}', function($projectId, $taskId) {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    $data = json_decode(file_get_contents('php://input'), true);
    
    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$projectId]);
    $project = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$project) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }
    
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $project['manager_id'] != $user['employee_id']) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized project access.']);
            return;
        }
    }
    
    $taskStmt = $db->prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ? AND deleted_at IS NULL");
    $taskStmt->execute([$taskId, $projectId]);
    $task = $taskStmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$task) {
        http_response_code(404);
        echo json_encode(['message' => 'Task not found']);
        return;
    }
    
    $name = isset($data['name']) ? $data['name'] : $task['name'];
    $description = array_key_exists('description', $data) ? $data['description'] : $task['description'];
    $status = isset($data['status']) ? $data['status'] : $task['status'];
    
    $updateStmt = $db->prepare("
        UPDATE tasks 
        SET name = ?, description = ?, status = ?, updated_at = NOW()
        WHERE id = ?
    ");
    
    $updateStmt->execute([$name, $description, $status, $taskId]);
    
    $taskStmt->execute([$taskId, $projectId]);
    $updated = $taskStmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode($updated);
});

Router::delete('/api/projects/{projectId}/tasks/{taskId}', function($projectId, $taskId) {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$projectId]);
    $project = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$project) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }
    
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $project['manager_id'] != $user['employee_id']) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized project access.']);
            return;
        }
    }
    
    $taskStmt = $db->prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ? AND deleted_at IS NULL");
    $taskStmt->execute([$taskId, $projectId]);
    $task = $taskStmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$task) {
        http_response_code(404);
        echo json_encode(['message' => 'Task not found']);
        return;
    }
    
    $db->prepare("UPDATE tasks SET deleted_at = NOW() WHERE id = ?")->execute([$taskId]);
    
    http_response_code(204);
});

// ==========================================
// PROJECTS UTILIZATION
// ==========================================

Router::get('/api/projects-utilization', function() {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    // Fallback/Mock since Timesheets module isn't completely tested yet, 
    // we'll try to query timesheets if it exists, otherwise return 0s.
    $timesheetsTableExists = $db->query("SHOW TABLES LIKE 'timesheets'")->rowCount() > 0;
    
    if (!$timesheetsTableExists) {
        echo json_encode([
            'billable' => 0,
            'non_billable' => 0,
            'projects' => []
        ]);
        return;
    }
    
    $from = $_GET['from'] ?? null;
    $to = $_GET['to'] ?? null;
    
    $sql = "
        SELECT p.id as project_id, p.name, 
               COALESCE(SUM(t.hours), 0) as hours, 
               COALESCE(SUM(t.billable_hours), 0) as billable_hours, 
               COALESCE(SUM(t.non_billable_hours), 0) as non_billable_hours
        FROM projects p
        JOIN timesheets t ON p.id = t.project_id
        WHERE p.deleted_at IS NULL
    ";
    
    $params = [];
    
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $user['employee_id']) {
            $sql .= " AND p.manager_id = ?";
            $params[] = $user['employee_id'];
        }
    }
    
    if ($from) {
        $sql .= " AND t.date >= ?";
        $params[] = $from;
    }
    if ($to) {
        $sql .= " AND t.date <= ?";
        $params[] = $to;
    }
    
    $sql .= " GROUP BY p.id, p.name";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $projects = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $totalBillable = 0;
    $totalNonBillable = 0;
    
    foreach ($projects as $p) {
        $totalBillable += $p['billable_hours'];
        $totalNonBillable += $p['non_billable_hours'];
    }
    
    echo json_encode([
        'billable' => $totalBillable,
        'non_billable' => $totalNonBillable,
        'projects' => $projects
    ]);
});
