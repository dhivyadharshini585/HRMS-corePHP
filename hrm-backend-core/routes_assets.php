<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// ASSETS CRUD
// ==========================================

Router::get('/api/assets', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("
        SELECT a.*, 
               aa.employee_id, e.first_name, e.last_name, e.employee_code
        FROM assets a
        LEFT JOIN asset_assignments aa ON a.id = aa.asset_id AND aa.status = 'Active'
        LEFT JOIN employees e ON aa.employee_id = e.id
        WHERE a.deleted_at IS NULL
        ORDER BY a.id DESC
    ");
    $assets = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formatted = [];
    foreach ($assets as $a) {
        $formatted[] = [
            'id' => $a['id'],
            'asset_id' => $a['asset_id'],
            'type' => $a['type'],
            'name' => $a['name'],
            'serial_number' => $a['serial_number'],
            'purchase_date' => $a['purchase_date'],
            'condition' => $a['condition'],
            'status' => $a['status'],
            'created_at' => $a['created_at'],
            'updated_at' => $a['updated_at'],
            'current_assignee' => $a['employee_id'] ? [
                'id' => $a['employee_id'],
                'first_name' => $a['first_name'],
                'last_name' => $a['last_name'],
                'employee_code' => $a['employee_code']
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

Router::post('/api/assets', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    if (empty($data['name']) || empty($data['asset_id']) || empty($data['type'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Required fields missing']]]);
        return;
    }
    
    $stmt = $db->prepare("
        INSERT INTO assets (asset_id, type, name, serial_number, purchase_date, `condition`, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Unassigned', NOW(), NOW())
    ");
    
    try {
        $stmt->execute([
            $data['asset_id'],
            $data['type'],
            $data['name'],
            $data['serial_number'] ?? null,
            $data['purchase_date'] ?? null,
            $data['condition'] ?? 'New'
        ]);
        
        $id = $db->lastInsertId();
        $newRecord = $db->query("SELECT * FROM assets WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
        echo json_encode($newRecord);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['message' => 'Database error', 'error' => $e->getMessage()]);
    }
});

Router::put('/api/assets/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    $stmt = $db->prepare("
        UPDATE assets 
        SET type = ?, name = ?, serial_number = ?, purchase_date = ?, `condition` = ?, updated_at = NOW()
        WHERE id = ?
    ");
    $stmt->execute([
        $data['type'] ?? '',
        $data['name'] ?? '',
        $data['serial_number'] ?? null,
        $data['purchase_date'] ?? null,
        $data['condition'] ?? 'Good',
        $id
    ]);
    
    echo json_encode(['message' => 'Asset updated successfully']);
});

Router::delete('/api/assets/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $db->prepare("UPDATE assets SET deleted_at = NOW() WHERE id = ?")->execute([$id]);
    http_response_code(204);
});

Router::post('/api/assets/{id}/assign', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    if (empty($data['employee_id']) || empty($data['assigned_date'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Required fields missing']]]);
        return;
    }
    
    $db->beginTransaction();
    try {
        // Insert assignment
        $stmt = $db->prepare("
            INSERT INTO asset_assignments (asset_id, employee_id, assigned_date, condition_at_assignment, status, notes, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'Active', ?, NOW(), NOW())
        ");
        $stmt->execute([
            $id,
            $data['employee_id'],
            $data['assigned_date'],
            $data['condition_at_assignment'] ?? 'Good',
            $data['notes'] ?? null
        ]);
        
        // Update asset status
        $db->prepare("UPDATE assets SET status = 'Assigned', updated_at = NOW() WHERE id = ?")->execute([$id]);
        
        $db->commit();
        echo json_encode(['message' => 'Asset assigned successfully']);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['message' => 'Failed to assign asset', 'error' => $e->getMessage()]);
    }
});

Router::post('/api/assets/{id}/return', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    if (empty($data['returned_date'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['returned_date' => ['Return date is required']]]);
        return;
    }
    
    $db->beginTransaction();
    try {
        // Update assignment
        $stmt = $db->prepare("
            UPDATE asset_assignments 
            SET returned_date = ?, condition_at_return = ?, status = 'Returned', notes = CONCAT_WS('\n', notes, ?), updated_at = NOW()
            WHERE asset_id = ? AND status = 'Active'
        ");
        $stmt->execute([
            $data['returned_date'],
            $data['condition_at_return'] ?? 'Good',
            $data['notes'] ?? null,
            $id
        ]);
        
        // Update asset status and condition
        $db->prepare("UPDATE assets SET status = 'Unassigned', `condition` = ?, updated_at = NOW() WHERE id = ?")->execute([
            $data['condition_at_return'] ?? 'Good',
            $id
        ]);
        
        $db->commit();
        echo json_encode(['message' => 'Asset returned successfully']);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['message' => 'Failed to return asset', 'error' => $e->getMessage()]);
    }
});

Router::get('/api/asset-assignments', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("
        SELECT aa.*, 
               a.name as asset_name, a.asset_id as asset_code, a.type as asset_type,
               e.first_name, e.last_name, e.employee_code
        FROM asset_assignments aa
        JOIN assets a ON aa.asset_id = a.id
        JOIN employees e ON aa.employee_id = e.id
        ORDER BY aa.id DESC
    ");
    $assignments = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formatted = [];
    foreach ($assignments as $aa) {
        $formatted[] = [
            'id' => $aa['id'],
            'asset_id' => $aa['asset_id'],
            'employee_id' => $aa['employee_id'],
            'assigned_date' => $aa['assigned_date'],
            'returned_date' => $aa['returned_date'],
            'condition_at_assignment' => $aa['condition_at_assignment'],
            'condition_at_return' => $aa['condition_at_return'],
            'status' => $aa['status'],
            'notes' => $aa['notes'],
            'created_at' => $aa['created_at'],
            'updated_at' => $aa['updated_at'],
            'asset' => [
                'id' => $aa['asset_id'],
                'name' => $aa['asset_name'],
                'asset_id' => $aa['asset_code'],
                'type' => $aa['asset_type']
            ],
            'employee' => [
                'id' => $aa['employee_id'],
                'first_name' => $aa['first_name'],
                'last_name' => $aa['last_name'],
                'employee_code' => $aa['employee_code']
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
