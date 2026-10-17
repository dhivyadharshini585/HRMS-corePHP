<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// HOLIDAYS CRUD
// ==========================================

Router::get('/api/holidays', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Support year filtering, otherwise current year
    $year = $_GET['year'] ?? date('Y');
    
    $stmt = $db->prepare("
        SELECT * FROM holidays 
        WHERE YEAR(holiday_date) = ?
        ORDER BY holiday_date ASC
    ");
    $stmt->execute([$year]);
    $holidays = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Convert is_active to boolean for JSON response
    foreach ($holidays as &$holiday) {
        $holiday['is_active'] = (bool)$holiday['is_active'];
    }
    
    echo json_encode(['data' => $holidays]);
});

Router::get('/api/holidays/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT * FROM holidays WHERE id = ?");
    $stmt->execute([$id]);
    $holiday = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$holiday) {
        http_response_code(404);
        echo json_encode(['message' => 'Holiday not found']);
        return;
    }
    
    $holiday['is_active'] = (bool)$holiday['is_active'];
    echo json_encode($holiday);
});

Router::post('/api/holidays', function() {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT roles.name as role FROM roles INNER JOIN model_has_roles ON roles.id = model_has_roles.role_id WHERE model_has_roles.model_id = ? LIMIT 1");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['role' => 'Employee'];
    
    // Only HR/Admins should create holidays
    if (!in_array($user['role'], ['Super Admin', 'HR Admin', 'HR Executive'])) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action']);
        return;
    }
    global $input;
    $data = $input ?: [];
    
    if (empty($data['name']) || empty($data['holiday_date']) || empty($data['holiday_type'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Name, Date, and Type are required']]]);
        return;
    }
    
    $is_active = isset($data['is_active']) ? (int)$data['is_active'] : 1;
    $description = $data['description'] ?? null;
    
    $stmt = $db->prepare("
        INSERT INTO holidays (name, holiday_date, holiday_type, description, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    ");
    
    try {
        $stmt->execute([
            $data['name'],
            $data['holiday_date'],
            $data['holiday_type'],
            $description,
            $is_active
        ]);
        
        $id = $db->lastInsertId();
        $newRecord = $db->query("SELECT * FROM holidays WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
        $newRecord['is_active'] = (bool)$newRecord['is_active'];
        
        echo json_encode($newRecord);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) { // Unique constraint violation (holiday_date is unique)
            http_response_code(422);
            echo json_encode(['message' => 'A holiday already exists on this date.']);
        } else {
            http_response_code(500);
            echo json_encode(['message' => 'Database error', 'error' => $e->getMessage()]);
        }
    }
});

Router::put('/api/holidays/{id}', function($id) {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT roles.name as role FROM roles INNER JOIN model_has_roles ON roles.id = model_has_roles.role_id WHERE model_has_roles.model_id = ? LIMIT 1");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['role' => 'Employee'];
    
    // Only HR/Admins should create/update holidays
    if (!in_array($user['role'], ['Super Admin', 'HR Admin', 'HR Executive'])) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action']);
        return;
    }
    global $input;
    $data = $input ?: [];
    
    if (empty($data['name']) || empty($data['holiday_date']) || empty($data['holiday_type'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Name, Date, and Type are required']]]);
        return;
    }
    
    $is_active = isset($data['is_active']) ? (int)$data['is_active'] : 1;
    $description = $data['description'] ?? null;
    
    $stmt = $db->prepare("
        UPDATE holidays 
        SET name = ?, holiday_date = ?, holiday_type = ?, description = ?, is_active = ?, updated_at = NOW()
        WHERE id = ?
    ");
    
    try {
        $stmt->execute([
            $data['name'],
            $data['holiday_date'],
            $data['holiday_type'],
            $description,
            $is_active,
            $id
        ]);
        
        $updated = $db->query("SELECT * FROM holidays WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
        if ($updated) {
            $updated['is_active'] = (bool)$updated['is_active'];
            echo json_encode($updated);
        } else {
            http_response_code(404);
            echo json_encode(['message' => 'Holiday not found']);
        }
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) { 
            http_response_code(422);
            echo json_encode(['message' => 'A holiday already exists on this date.']);
        } else {
            http_response_code(500);
            echo json_encode(['message' => 'Database error', 'error' => $e->getMessage()]);
        }
    }
});

Router::delete('/api/holidays/{id}', function($id) {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT roles.name as role FROM roles INNER JOIN model_has_roles ON roles.id = model_has_roles.role_id WHERE model_has_roles.model_id = ? LIMIT 1");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC) ?: ['role' => 'Employee'];
    
    if (!in_array($user['role'], ['Super Admin', 'HR Admin'])) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action']);
        return;
    }
    $stmt = $db->prepare("DELETE FROM holidays WHERE id = ?");
    $stmt->execute([$id]);
    
    echo json_encode(['message' => 'Holiday deleted successfully']);
});
