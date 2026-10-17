<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// HELPDESK CRUD (Support Tickets)
// ==========================================

Router::get('/api/support-tickets', function() {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    // For normal employees, only show their own tickets. Managers can see their reports' tickets. Admins see all.
    $sql = "
        SELECT st.*, 
               e.first_name as emp_fn, e.last_name as emp_ln, e.employee_code,
               a.first_name as asg_fn, a.last_name as asg_ln
        FROM support_tickets st
        LEFT JOIN employees e ON st.employee_id = e.id
        LEFT JOIN employees a ON st.assigned_to = a.id
        WHERE 1=1
    ";
    
    $params = [];
    
    // RBAC scoping
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $user['employee_id']) {
            $sql .= " AND (st.employee_id = ? OR e.manager_id = ?)";
            $params[] = $user['employee_id'];
            $params[] = $user['employee_id'];
        } else if ($user['employee_id']) {
            $sql .= " AND st.employee_id = ?";
            $params[] = $user['employee_id'];
        }
    }
    
    $sql .= " ORDER BY st.id DESC";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $tickets = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formatted = [];
    foreach ($tickets as $t) {
        $formatted[] = [
            'id' => $t['id'],
            'ticket_number' => $t['ticket_number'],
            'problem' => $t['problem'],
            'category' => $t['category'],
            'priority' => $t['priority'],
            'status' => $t['status'],
            'resolution_notes' => $t['resolution_notes'],
            'created_at' => $t['created_at'],
            'updated_at' => $t['updated_at'],
            'employee' => [
                'id' => $t['employee_id'],
                'first_name' => $t['emp_fn'],
                'last_name' => $t['emp_ln'],
                'employee_code' => $t['employee_code']
            ],
            'assigned_agent' => $t['assigned_to'] ? [
                'id' => $t['assigned_to'],
                'first_name' => $t['asg_fn'],
                'last_name' => $t['asg_ln']
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

Router::post('/api/support-tickets', function() {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    if (empty($data['problem']) || empty($data['category']) || empty($data['priority'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Required fields missing']]]);
        return;
    }
    
    $employee_id = $data['employee_id'] ?? $user['employee_id'];
    
    if (!$employee_id) {
        $stmt_fb = $db->query("SELECT id FROM employees LIMIT 1");
        $fallback = $stmt_fb->fetch(PDO::FETCH_ASSOC);
        $employee_id = $fallback ? $fallback['id'] : null;
    }
    
    if (!$employee_id) {
        http_response_code(400);
        echo json_encode(['message' => 'No employee record associated with this user.']);
        return;
    }
    
    // Generate ticket number e.g. TKT-20261008-0001
    $ticket_number = 'TKT-' . date('Ymd') . '-' . rand(1000, 9999);
    
    $stmt = $db->prepare("
        INSERT INTO support_tickets (ticket_number, employee_id, problem, category, priority, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'Open', NOW(), NOW())
    ");
    
    try {
        $stmt->execute([
            $ticket_number,
            $employee_id,
            $data['problem'],
            $data['category'],
            $data['priority']
        ]);
        
        $id = $db->lastInsertId();
        $newRecord = $db->query("SELECT * FROM support_tickets WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
        echo json_encode($newRecord);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['message' => 'Database error', 'error' => $e->getMessage()]);
    }
});

Router::patch('/api/support-tickets/{id}/status', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    if (empty($data['status'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['status' => ['Status is required']]]);
        return;
    }
    
    $stmt = $db->prepare("UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE id = ?");
    $stmt->execute([$data['status'], $id]);
    
    echo json_encode(['message' => 'Ticket status updated successfully']);
});

Router::get('/api/support-tickets-status-counts', function() {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    $sql = "
        SELECT status, COUNT(*) as count 
        FROM support_tickets 
        WHERE 1=1
    ";
    
    $params = [];
    
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $user['employee_id']) {
            $sql .= " AND (employee_id = ? OR employee_id IN (SELECT id FROM employees WHERE manager_id = ?))";
            $params[] = $user['employee_id'];
            $params[] = $user['employee_id'];
        } else if ($user['employee_id']) {
            $sql .= " AND employee_id = ?";
            $params[] = $user['employee_id'];
        }
    }
    
    $sql .= " GROUP BY status";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $counts = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);
    
    // Ensure all standard statuses are present
    $standard_statuses = ['Open', 'Assigned', 'In Progress', 'Waiting', 'Resolved', 'Closed'];
    $result = [];
    $total = 0;
    
    foreach ($standard_statuses as $status) {
        $count = (int)($counts[$status] ?? 0);
        $result[$status] = $count;
        $total += $count;
    }
    
    $result['Total'] = $total;
    
    echo json_encode($result);
});
