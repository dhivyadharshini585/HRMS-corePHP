<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// PROJECTS CRUD
// ==========================================

Router::get('/api/projects', function() {
    $user = Auth::user();
    $db = Database::getConnection();

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $user_employee_id = $user['employee_id'];
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin', 'HR Executive'], $user_roles));
    $is_manager = (in_array('Manager', $user_roles, true) && !empty($user_employee_id));

    $status = $_GET['status'] ?? null;
    $search = $_GET['search'] ?? null;

    $sql = "
        SELECT p.*, e.first_name as m_fn, e.last_name as m_ln
        FROM projects p
        LEFT JOIN employees e ON p.manager_id = e.id
        WHERE p.deleted_at IS NULL
    ";
    $params = [];

    if (!$is_admin) {
        if ($is_manager) {
            $sql .= " AND p.manager_id = ?";
            $params[] = (int)$user_employee_id;
        } else {
            if (!empty($user_employee_id)) {
                $sql .= " AND (
                    p.id IN (SELECT DISTINCT project_id FROM timesheets WHERE employee_id = ?)
                    OR p.status = 'Active'
                )";
                $params[] = (int)$user_employee_id;
            } else {
                echo json_encode([
                    'data' => [],
                    'current_page' => 1,
                    'last_page' => 1,
                    'total' => 0
                ]);
                return;
            }
        }
    }

    if (!empty($status)) {
        $sql .= " AND p.status = ?";
        $params[] = $status;
    }

    if (!empty($search)) {
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

    echo json_encode([
        'data' => $formatted,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($formatted)
    ]);
});

Router::post('/api/projects', function() {
    $user = Auth::user();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: json_decode(file_get_contents('php://input'), true) ?: [];

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $user_employee_id = $user['employee_id'];
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin'], $user_roles));
    $is_manager = (in_array('Manager', $user_roles, true) && !empty($user_employee_id));

    if (!$is_admin && !$is_manager) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized: Insufficient permissions to create projects.']);
        return;
    }

    if (empty($data['name']) || trim($data['name']) === '') {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['name' => ['Name is required']]]);
        return;
    }

    if ($is_admin) {
        $manager_id = !empty($data['manager_id']) && is_numeric($data['manager_id']) ? (int)$data['manager_id'] : null;
        if ($manager_id !== null) {
            $checkEmp = $db->prepare("SELECT id FROM employees WHERE id = ?");
            $checkEmp->execute([$manager_id]);
            if (!$checkEmp->fetch()) {
                http_response_code(422);
                echo json_encode(['message' => 'Validation error', 'errors' => ['manager_id' => ['Assigned manager employee not found']]]);
                return;
            }
        }
    } else {
        $manager_id = (int)$user_employee_id;
    }

    $allowed_statuses = ['Active', 'Completed', 'On Hold', 'Archived'];
    $status = !empty($data['status']) && in_array($data['status'], $allowed_statuses, true) ? $data['status'] : 'Active';

    $stmt = $db->prepare("
        INSERT INTO projects (name, client, description, manager_id, status, start_date, end_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    ");

    $stmt->execute([
        trim($data['name']),
        !empty($data['client']) ? trim($data['client']) : null,
        !empty($data['description']) ? trim($data['description']) : null,
        $manager_id,
        $status,
        !empty($data['start_date']) ? $data['start_date'] : null,
        !empty($data['end_date']) ? $data['end_date'] : null
    ]);

    $id = $db->lastInsertId();
    $newRecordStmt = $db->prepare("SELECT * FROM projects WHERE id = ?");
    $newRecordStmt->execute([$id]);
    $newRecord = $newRecordStmt->fetch(PDO::FETCH_ASSOC);

    http_response_code(201);
    echo json_encode($newRecord);
});

Router::get('/api/projects/{id}', function($id) {
    $user = Auth::user();
    $db = Database::getConnection();

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $user_employee_id = $user['employee_id'];
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin', 'HR Executive'], $user_roles));
    $is_manager = (in_array('Manager', $user_roles, true) && !empty($user_employee_id));

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

    if (!$is_admin) {
        if ($is_manager && (int)$p['manager_id'] !== (int)$user_employee_id) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized project access.']);
            return;
        } elseif (!$is_manager) {
            if (empty($user_employee_id)) {
                http_response_code(403);
                echo json_encode(['message' => 'Unauthorized project access.']);
                return;
            }
            if ($p['status'] !== 'Active') {
                $checkTs = $db->prepare("SELECT 1 FROM timesheets WHERE project_id = ? AND employee_id = ? LIMIT 1");
                $checkTs->execute([$id, (int)$user_employee_id]);
                if (!$checkTs->fetch()) {
                    http_response_code(403);
                    echo json_encode(['message' => 'Unauthorized project access.']);
                    return;
                }
            }
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
    $user = Auth::user();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: json_decode(file_get_contents('php://input'), true) ?: [];

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $user_employee_id = $user['employee_id'];
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin'], $user_roles));
    $is_manager = (in_array('Manager', $user_roles, true) && !empty($user_employee_id));

    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }

    if (!$is_admin && !($is_manager && (int)$existing['manager_id'] === (int)$user_employee_id)) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized project access.']);
        return;
    }

    $name = isset($data['name']) && trim($data['name']) !== '' ? trim($data['name']) : $existing['name'];
    $client = array_key_exists('client', $data) ? $data['client'] : $existing['client'];
    $description = array_key_exists('description', $data) ? $data['description'] : $existing['description'];

    if ($is_admin && array_key_exists('manager_id', $data)) {
        $target_mgr = !empty($data['manager_id']) && is_numeric($data['manager_id']) ? (int)$data['manager_id'] : null;
        if ($target_mgr !== null) {
            $checkEmp = $db->prepare("SELECT id FROM employees WHERE id = ?");
            $checkEmp->execute([$target_mgr]);
            if (!$checkEmp->fetch()) {
                http_response_code(422);
                echo json_encode(['message' => 'Validation error', 'errors' => ['manager_id' => ['Assigned manager employee not found']]]);
                return;
            }
        }
        $manager_id = $target_mgr;
    } else {
        $manager_id = $existing['manager_id'];
    }

    $allowed_statuses = ['Active', 'Completed', 'On Hold', 'Archived'];
    $status = isset($data['status']) && in_array($data['status'], $allowed_statuses, true) ? $data['status'] : $existing['status'];
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

    $fetchStmt = $db->prepare("SELECT * FROM projects WHERE id = ?");
    $fetchStmt->execute([$id]);
    $updated = $fetchStmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode($updated);
});

Router::delete('/api/projects/{id}', function($id) {
    $user = Auth::user();
    $db = Database::getConnection();

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin'], $user_roles));

    if (!$is_admin) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized: Only Super Admin or HR Admin can delete projects.']);
        return;
    }

    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }

    $db->prepare("UPDATE projects SET deleted_at = NOW() WHERE id = ?")->execute([$id]);

    http_response_code(204);
});

// ==========================================
// TASKS CRUD
// ==========================================

Router::post('/api/projects/{id}/tasks', function($id) {
    $user = Auth::user();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: json_decode(file_get_contents('php://input'), true) ?: [];

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $user_employee_id = $user['employee_id'];
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin'], $user_roles));
    $is_manager = (in_array('Manager', $user_roles, true) && !empty($user_employee_id));

    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }

    if (!$is_admin && !($is_manager && (int)$existing['manager_id'] === (int)$user_employee_id)) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized project access.']);
        return;
    }

    if (empty($data['name']) || trim($data['name']) === '') {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['name' => ['Name is required']]]);
        return;
    }

    $allowed_statuses = ['To Do', 'In Progress', 'Done', 'Blocked'];
    $status = !empty($data['status']) && in_array($data['status'], $allowed_statuses, true) ? $data['status'] : 'To Do';

    $insertStmt = $db->prepare("
        INSERT INTO tasks (project_id, name, description, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, NOW(), NOW())
    ");

    $insertStmt->execute([
        $id,
        trim($data['name']),
        !empty($data['description']) ? trim($data['description']) : null,
        $status
    ]);

    $taskId = $db->lastInsertId();
    $taskStmt = $db->prepare("SELECT * FROM tasks WHERE id = ?");
    $taskStmt->execute([$taskId]);
    $task = $taskStmt->fetch(PDO::FETCH_ASSOC);

    http_response_code(201);
    echo json_encode($task);
});

Router::put('/api/projects/{projectId}/tasks/{taskId}', function($projectId, $taskId) {
    $user = Auth::user();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: json_decode(file_get_contents('php://input'), true) ?: [];

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $user_employee_id = $user['employee_id'];
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin'], $user_roles));
    $is_manager = (in_array('Manager', $user_roles, true) && !empty($user_employee_id));

    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$projectId]);
    $project = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$project) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }

    if (!$is_admin && !($is_manager && (int)$project['manager_id'] === (int)$user_employee_id)) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized project access.']);
        return;
    }

    $taskStmt = $db->prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ? AND deleted_at IS NULL");
    $taskStmt->execute([$taskId, $projectId]);
    $task = $taskStmt->fetch(PDO::FETCH_ASSOC);

    if (!$task) {
        http_response_code(404);
        echo json_encode(['message' => 'Task not found in the specified project']);
        return;
    }

    $name = isset($data['name']) && trim($data['name']) !== '' ? trim($data['name']) : $task['name'];
    $description = array_key_exists('description', $data) ? $data['description'] : $task['description'];

    $allowed_statuses = ['To Do', 'In Progress', 'Done', 'Blocked'];
    $status = isset($data['status']) && in_array($data['status'], $allowed_statuses, true) ? $data['status'] : $task['status'];

    $updateStmt = $db->prepare("
        UPDATE tasks 
        SET name = ?, description = ?, status = ?, updated_at = NOW()
        WHERE id = ? AND project_id = ?
    ");

    $updateStmt->execute([$name, $description, $status, $taskId, $projectId]);

    $fetchTaskStmt = $db->prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ?");
    $fetchTaskStmt->execute([$taskId, $projectId]);
    $updated = $fetchTaskStmt->fetch(PDO::FETCH_ASSOC);

    echo json_encode($updated);
});

Router::delete('/api/projects/{projectId}/tasks/{taskId}', function($projectId, $taskId) {
    $user = Auth::user();
    $db = Database::getConnection();

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $user_employee_id = $user['employee_id'];
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin'], $user_roles));
    $is_manager = (in_array('Manager', $user_roles, true) && !empty($user_employee_id));

    $stmt = $db->prepare("SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$projectId]);
    $project = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$project) {
        http_response_code(404);
        echo json_encode(['message' => 'Project not found']);
        return;
    }

    if (!$is_admin && !($is_manager && (int)$project['manager_id'] === (int)$user_employee_id)) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized project access.']);
        return;
    }

    $taskStmt = $db->prepare("SELECT * FROM tasks WHERE id = ? AND project_id = ? AND deleted_at IS NULL");
    $taskStmt->execute([$taskId, $projectId]);
    $task = $taskStmt->fetch(PDO::FETCH_ASSOC);

    if (!$task) {
        http_response_code(404);
        echo json_encode(['message' => 'Task not found in the specified project']);
        return;
    }

    $db->prepare("UPDATE tasks SET deleted_at = NOW() WHERE id = ? AND project_id = ?")->execute([$taskId, $projectId]);

    http_response_code(204);
});

// ==========================================
// PROJECTS UTILIZATION
// ==========================================

Router::get('/api/projects-utilization', function() {
    $user = Auth::user();
    $db = Database::getConnection();

    $user_roles = $user['roles'] ?? (!empty($user['role']) ? [$user['role']] : []);
    $user_employee_id = $user['employee_id'];
    $is_admin = !empty(array_intersect(['Super Admin', 'HR Admin', 'HR Executive'], $user_roles));
    $is_manager = (in_array('Manager', $user_roles, true) && !empty($user_employee_id));

    $timesheetsTableExists = $db->query("SHOW TABLES LIKE 'timesheets'")->rowCount() > 0;

    if (!$timesheetsTableExists) {
        echo json_encode([
            'billable' => 0,
            'non_billable' => 0,
            'projects' => []
        ]);
        return;
    }

    if (!$is_admin && !$is_manager && empty($user_employee_id)) {
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

    if (!$is_admin) {
        if ($is_manager) {
            $sql .= " AND p.manager_id = ?";
            $params[] = (int)$user_employee_id;
        } else {
            $sql .= " AND t.employee_id = ?";
            $params[] = (int)$user_employee_id;
        }
    }

    if (!empty($from)) {
        $sql .= " AND t.date >= ?";
        $params[] = $from;
    }
    if (!empty($to)) {
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
