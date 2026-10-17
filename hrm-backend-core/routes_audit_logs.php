<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// AUDIT LOGS MODULE
// ==========================================

Router::get('/api/audit-logs', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $limit = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 15;
    $offset = ($page - 1) * $limit;
    
    $where = [];
    $params = [];
    
    if (!empty($_GET['action'])) {
        $where[] = "a.action = ?";
        $params[] = $_GET['action'];
    }
    
    if (!empty($_GET['user_id'])) {
        $where[] = "a.user_id = ?";
        $params[] = $_GET['user_id'];
    }
    
    if (!empty($_GET['date_from'])) {
        $where[] = "DATE(a.created_at) >= ?";
        $params[] = $_GET['date_from'];
    }
    
    if (!empty($_GET['date_to'])) {
        $where[] = "DATE(a.created_at) <= ?";
        $params[] = $_GET['date_to'];
    }
    
    $whereClause = !empty($where) ? "WHERE " . implode(' AND ', $where) : "";
    
    // Total count
    $countStmt = $db->prepare("SELECT COUNT(*) FROM audit_logs a $whereClause");
    $countStmt->execute($params);
    $total = $countStmt->fetchColumn();
    $last_page = ceil($total / $limit);
    
    // Fetch records
    $query = "
        SELECT 
            a.*,
            u.name as user_name,
            u.email as user_email
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        $whereClause
        ORDER BY a.created_at DESC
        LIMIT $limit OFFSET $offset
    ";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formatted = [];
    foreach ($logs as $log) {
        $log['old_values'] = json_decode($log['old_values'], true);
        $log['new_values'] = json_decode($log['new_values'], true);
        
        $log['user'] = $log['user_id'] ? [
            'id' => $log['user_id'],
            'name' => $log['user_name'],
            'email' => $log['user_email']
        ] : null;
        
        unset($log['user_name'], $log['user_email']);
        $formatted[] = $log;
    }
    
    echo json_encode([
        'data' => $formatted,
        'current_page' => $page,
        'last_page' => $last_page,
        'total' => $total
    ]);
});

Router::get('/api/audit-logs/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT 
            a.*,
            u.name as user_name,
            u.email as user_email
        FROM audit_logs a
        LEFT JOIN users u ON a.user_id = u.id
        WHERE a.id = ?
    ");
    
    $stmt->execute([$id]);
    $log = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$log) {
        http_response_code(404);
        echo json_encode(['message' => 'Log not found']);
        return;
    }
    
    $log['old_values'] = json_decode($log['old_values'], true);
    $log['new_values'] = json_decode($log['new_values'], true);
    
    $log['user'] = $log['user_id'] ? [
        'id' => $log['user_id'],
        'name' => $log['user_name'],
        'email' => $log['user_email']
    ] : null;
    
    unset($log['user_name'], $log['user_email']);
    
    echo json_encode(['data' => $log]);
});
