<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// TRAININGS CRUD
// ==========================================

Router::get('/api/trainings', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("
        SELECT t.*, 
               e.first_name as trainer_fn, e.last_name as trainer_ln, e.employee_code as trainer_code
        FROM trainings t
        LEFT JOIN employees e ON t.trainer_employee_id = e.id
        ORDER BY t.start_date DESC
    ");
    
    $trainings = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Format response to match Eloquent 'with'
    $formatted = [];
    foreach ($trainings as $t) {
        $formatted[] = [
            'id' => $t['id'],
            'training_name' => $t['training_name'],
            'trainer_employee_id' => $t['trainer_employee_id'],
            'start_date' => $t['start_date'],
            'end_date' => $t['end_date'],
            'status' => $t['status'],
            'created_at' => $t['created_at'],
            'updated_at' => $t['updated_at'],
            'trainer' => $t['trainer_employee_id'] ? [
                'id' => $t['trainer_employee_id'],
                'first_name' => $t['trainer_fn'],
                'last_name' => $t['trainer_ln'],
                'employee_code' => $t['trainer_code']
            ] : null
        ];
    }
    
    echo json_encode($formatted);
});

Router::post('/api/trainings', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (empty($data['training_name']) || empty($data['start_date']) || empty($data['end_date']) || empty($data['status'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Required fields missing']]]);
        return;
    }
    
    $stmt = $db->prepare("
        INSERT INTO trainings (training_name, trainer_employee_id, start_date, end_date, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, NOW(), NOW())
    ");
    
    $trainerId = !empty($data['trainer_employee_id']) ? $data['trainer_employee_id'] : null;
    
    $stmt->execute([
        $data['training_name'],
        $trainerId,
        $data['start_date'],
        $data['end_date'],
        $data['status']
    ]);
    
    $id = $db->lastInsertId();
    $newRecord = $db->query("SELECT * FROM trainings WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'message' => 'Training created successfully',
        'data' => $newRecord
    ]);
});

Router::get('/api/trainings/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT * FROM trainings WHERE id = ?");
    $stmt->execute([$id]);
    $training = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$training) {
        http_response_code(404);
        echo json_encode(['message' => 'Training not found']);
        return;
    }
    
    if ($training['trainer_employee_id']) {
        $stmt2 = $db->prepare("SELECT id, first_name, last_name, employee_code FROM employees WHERE id = ?");
        $stmt2->execute([$training['trainer_employee_id']]);
        $training['trainer'] = $stmt2->fetch(PDO::FETCH_ASSOC);
    } else {
        $training['trainer'] = null;
    }
    
    $stmt3 = $db->prepare("
        SELECT ta.*, e.first_name, e.last_name, e.employee_code 
        FROM training_attendees ta
        JOIN employees e ON ta.employee_id = e.id
        WHERE ta.training_id = ?
    ");
    $stmt3->execute([$id]);
    $attendees = $stmt3->fetchAll(PDO::FETCH_ASSOC);
    
    $training['attendees'] = [];
    foreach ($attendees as $a) {
        $training['attendees'][] = [
            'id' => $a['id'],
            'training_id' => $a['training_id'],
            'employee_id' => $a['employee_id'],
            'completion_status' => $a['completion_status'],
            'employee' => [
                'id' => $a['employee_id'],
                'first_name' => $a['first_name'],
                'last_name' => $a['last_name'],
                'employee_code' => $a['employee_code']
            ]
        ];
    }
    
    echo json_encode($training);
});

Router::put('/api/trainings/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $data = json_decode(file_get_contents('php://input'), true);
    
    $stmt = $db->prepare("SELECT * FROM trainings WHERE id = ?");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Training not found']);
        return;
    }
    
    $training_name = isset($data['training_name']) ? $data['training_name'] : $existing['training_name'];
    $trainer_employee_id = array_key_exists('trainer_employee_id', $data) ? $data['trainer_employee_id'] : $existing['trainer_employee_id'];
    $start_date = isset($data['start_date']) ? $data['start_date'] : $existing['start_date'];
    $end_date = isset($data['end_date']) ? $data['end_date'] : $existing['end_date'];
    $status = isset($data['status']) ? $data['status'] : $existing['status'];
    
    $updateStmt = $db->prepare("
        UPDATE trainings 
        SET training_name = ?, trainer_employee_id = ?, start_date = ?, end_date = ?, status = ?, updated_at = NOW()
        WHERE id = ?
    ");
    
    $updateStmt->execute([
        $training_name,
        $trainer_employee_id ?: null,
        $start_date,
        $end_date,
        $status,
        $id
    ]);
    
    $stmt->execute([$id]);
    $updated = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'message' => 'Training updated successfully',
        'data' => $updated
    ]);
});

Router::delete('/api/trainings/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("DELETE FROM trainings WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['message' => 'Training deleted successfully']);
});

// ==========================================
// TRAINING ATTENDEES CRUD
// ==========================================

Router::get('/api/training-attendees', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Simplification for migration: return all if admin, else return for logged in user.
    // We'll just return all attendees matching query params for now to get frontend working.
    
    $training_id = $_GET['training_id'] ?? null;
    $employee_id = $_GET['employee_id'] ?? null;
    
    $sql = "
        SELECT ta.*, 
               t.training_name, t.start_date, t.end_date, t.status as training_status,
               e.first_name, e.last_name, e.employee_code, e.department_id,
               d.name as department_name, des.title as designation_name
        FROM training_attendees ta
        JOIN trainings t ON ta.training_id = t.id
        JOIN employees e ON ta.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        WHERE 1=1
    ";
    
    $params = [];
    if ($training_id) {
        $sql .= " AND ta.training_id = ?";
        $params[] = $training_id;
    }
    if ($employee_id) {
        $sql .= " AND ta.employee_id = ?";
        $params[] = $employee_id;
    }
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $attendees = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formatted = [];
    foreach ($attendees as $a) {
        $formatted[] = [
            'id' => $a['id'],
            'training_id' => $a['training_id'],
            'employee_id' => $a['employee_id'],
            'completion_status' => $a['completion_status'],
            'created_at' => $a['created_at'],
            'updated_at' => $a['updated_at'],
            'training' => [
                'id' => $a['training_id'],
                'training_name' => $a['training_name'],
                'start_date' => $a['start_date'],
                'end_date' => $a['end_date'],
                'status' => $a['training_status']
            ],
            'employee' => [
                'id' => $a['employee_id'],
                'first_name' => $a['first_name'],
                'last_name' => $a['last_name'],
                'employee_code' => $a['employee_code'],
                'department_id' => $a['department_id'],
                'department_name' => $a['department_name'],
                'designation_name' => $a['designation_name']
            ]
        ];
    }
    
    echo json_encode($formatted);
});

Router::post('/api/training-attendees', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    $data = json_decode(file_get_contents('php://input'), true);
    
    if (empty($data['training_id']) || empty($data['employee_id'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['Required fields missing']]]);
        return;
    }
    
    // Check if already enrolled
    $check = $db->prepare("SELECT id FROM training_attendees WHERE training_id = ? AND employee_id = ?");
    $check->execute([$data['training_id'], $data['employee_id']]);
    if ($check->fetch()) {
        http_response_code(422);
        echo json_encode(['message' => 'Employee is already enrolled in this training']);
        return;
    }
    
    $status = !empty($data['completion_status']) ? $data['completion_status'] : 'enrolled';
    
    $stmt = $db->prepare("
        INSERT INTO training_attendees (training_id, employee_id, completion_status, created_at, updated_at)
        VALUES (?, ?, ?, NOW(), NOW())
    ");
    
    $stmt->execute([
        $data['training_id'],
        $data['employee_id'],
        $status
    ]);
    
    $id = $db->lastInsertId();
    $newRecord = $db->query("SELECT * FROM training_attendees WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'message' => 'Enrolled successfully',
        'data' => $newRecord
    ]);
});

Router::get('/api/training-attendees/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT * FROM training_attendees WHERE id = ?");
    $stmt->execute([$id]);
    $record = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$record) {
        http_response_code(404);
        echo json_encode(['message' => 'Not found']);
        return;
    }
    
    echo json_encode($record);
});

Router::put('/api/training-attendees/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $data = json_decode(file_get_contents('php://input'), true);
    
    $stmt = $db->prepare("SELECT * FROM training_attendees WHERE id = ?");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Not found']);
        return;
    }
    
    $status = isset($data['completion_status']) ? $data['completion_status'] : $existing['completion_status'];
    
    $updateStmt = $db->prepare("
        UPDATE training_attendees 
        SET completion_status = ?, updated_at = NOW()
        WHERE id = ?
    ");
    
    $updateStmt->execute([$status, $id]);
    
    // Simulate certificate generation stub if completed (simplified)
    if ($status === 'completed' && $existing['completion_status'] !== 'completed') {
        // Disabled for now since employee_documents table may not exist
        /*
        $db->prepare("
            INSERT INTO employee_documents (employee_id, document_category, document_name, file_path, upload_date)
            SELECT ?, 'Certificate', CONCAT(t.training_name, ' Certificate'), 'certificates/stub.pdf', CURDATE()
            FROM trainings t WHERE t.id = ?
            AND NOT EXISTS (
                SELECT 1 FROM employee_documents ed 
                WHERE ed.employee_id = ? AND ed.document_category = 'Certificate' 
                AND ed.document_name = CONCAT(t.training_name, ' Certificate')
            )
        ")->execute([$existing['employee_id'], $existing['training_id'], $existing['employee_id']]);
        */
    }
    
    $stmt->execute([$id]);
    $updated = $stmt->fetch(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'message' => 'Updated successfully',
        'data' => $updated
    ]);
});

Router::delete('/api/training-attendees/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("DELETE FROM training_attendees WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['message' => 'Deleted successfully']);
});
