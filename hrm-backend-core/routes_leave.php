<?php
// routes_leave.php

// ==========================================
// LEAVE TYPES CRUD
// ==========================================
Router::get('/api/leave-types', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("SELECT * FROM leave_types ORDER BY id ASC");
    $types = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Convert boolean-like fields if needed
    foreach ($types as &$type) {
        $type['is_active'] = (bool)$type['is_active'];
        $type['is_unpaid'] = (bool)$type['is_unpaid'];
    }
    
    echo json_encode(['data' => $types]);
});

Router::post('/api/leave-types', function() {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    try {
        $stmt = $db->prepare("
            INSERT INTO leave_types (name, description, default_annual_allocation, is_active, is_unpaid, created_at, updated_at) 
            VALUES (:name, :description, :default_annual_allocation, :is_active, :is_unpaid, NOW(), NOW())
        ");
        $stmt->execute([
            'name' => $input['name'] ?? '',
            'description' => $input['description'] ?? '',
            'default_annual_allocation' => $input['default_annual_allocation'] ?? 0,
            'is_active' => isset($input['is_active']) ? (int)$input['is_active'] : 1,
            'is_unpaid' => isset($input['is_unpaid']) ? (int)$input['is_unpaid'] : 0,
        ]);
        $id = $db->lastInsertId();
        
        $newType = $db->query("SELECT * FROM leave_types WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['message' => 'Leave type created successfully', 'data' => $newType]);
    } catch (\PDOException $e) {
        http_response_code(400);
        echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
    }
});

Router::put('/api/leave-types/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    try {
        $stmt = $db->prepare("
            UPDATE leave_types 
            SET name = :name, description = :description, default_annual_allocation = :default_annual_allocation, 
                is_active = :is_active, is_unpaid = :is_unpaid, updated_at = NOW()
            WHERE id = :id
        ");
        $stmt->execute([
            'name' => $input['name'] ?? '',
            'description' => $input['description'] ?? '',
            'default_annual_allocation' => $input['default_annual_allocation'] ?? 0,
            'is_active' => isset($input['is_active']) ? (int)$input['is_active'] : 1,
            'is_unpaid' => isset($input['is_unpaid']) ? (int)$input['is_unpaid'] : 0,
            'id' => $id
        ]);
        
        $updatedType = $db->query("SELECT * FROM leave_types WHERE id = " . (int)$id)->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['message' => 'Leave type updated successfully', 'data' => $updatedType]);
    } catch (\PDOException $e) {
        http_response_code(400);
        echo json_encode(['message' => 'Error: ' . $e->getMessage()]);
    }
});

Router::delete('/api/leave-types/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    try {
        $stmt = $db->prepare("DELETE FROM leave_types WHERE id = :id");
        $stmt->execute(['id' => $id]);
        echo json_encode(['message' => 'Leave type deleted successfully']);
    } catch (\PDOException $e) {
        http_response_code(400);
        echo json_encode(['message' => 'Cannot delete this leave type because it is in use.']);
    }
});

// ==========================================
// LEAVE BALANCES
// ==========================================
Router::get('/api/leave-balances', function() {
    $userId = Auth::authenticate();
    $db = Database::getConnection();
    
    // Check if user is fetching their own or if they are admin fetching all
    // Let's support ?employee_id=X for admin, or default to self
    $employeeId = $_GET['employee_id'] ?? getLoggedInEmployeeId($userId, $db);
    $year = $_GET['year'] ?? date('Y');
    
    if (!$employeeId) {
        http_response_code(400);
        echo json_encode(['message' => 'Employee ID required or profile not found']);
        return;
    }
    
    $stmt = $db->prepare("
        SELECT lb.*, lt.name as type_name, lt.is_unpaid
        FROM leave_balances lb
        JOIN leave_types lt ON lb.leave_type_id = lt.id
        WHERE lb.employee_id = :emp_id AND lb.year = :year
    ");
    $stmt->execute(['emp_id' => $employeeId, 'year' => $year]);
    
    echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
});

Router::post('/api/employees/{employeeId}/leave-balances/adjust', function($employeeId) {
    Auth::authenticate(); // Should check for Admin/HR role ideally
    global $input;
    $db = Database::getConnection();
    
    $leaveTypeId = $input['leave_type_id'] ?? null;
    $allocatedDays = isset($input['allocated_days']) ? (float)$input['allocated_days'] : null;
    $usedDays = isset($input['used_days']) ? (float)$input['used_days'] : null;
    $year = $input['year'] ?? date('Y');
    
    if (!$leaveTypeId || $allocatedDays === null || $usedDays === null) {
        http_response_code(400);
        echo json_encode(['message' => 'Missing required fields']);
        return;
    }
    
    $remainingDays = $allocatedDays - $usedDays;
    
    $stmt = $db->prepare("
        INSERT INTO leave_balances (employee_id, leave_type_id, year, allocated_days, used_days, remaining_days, created_at, updated_at)
        VALUES (:emp_id, :type_id, :year, :allocated, :used, :remaining, NOW(), NOW())
        ON DUPLICATE KEY UPDATE 
            allocated_days = VALUES(allocated_days),
            used_days = VALUES(used_days),
            remaining_days = VALUES(remaining_days),
            updated_at = NOW()
    ");
    $stmt->execute([
        'emp_id' => $employeeId,
        'type_id' => $leaveTypeId,
        'year' => $year,
        'allocated' => $allocatedDays,
        'used' => $usedDays,
        'remaining' => $remainingDays
    ]);
    
    echo json_encode(['message' => 'Leave balance adjusted successfully']);
});

// ==========================================
// LEAVE REQUESTS
// ==========================================
Router::get('/api/leave-requests', function() {
    $userId = Auth::authenticate();
    $db = Database::getConnection();
    
    $scope = $_GET['scope'] ?? 'all';
    $empId = getLoggedInEmployeeId($userId, $db);
    
    $query = "
        SELECT lr.*, 
               e.first_name, e.last_name, e.employee_code,
               lt.name as leave_type_name
        FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE 1=1
    ";
    
    $params = [];
    
    if ($scope === 'mine' && $empId) {
        $query .= " AND lr.employee_id = :emp_id";
        $params['emp_id'] = $empId;
    }
    
    if (!empty($_GET['status'])) {
        $query .= " AND lr.status = :status";
        $params['status'] = $_GET['status'];
    }
    
    $query .= " ORDER BY lr.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Add pagination wrapper for frontend table standard
    echo json_encode([
        'data' => $results,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($results)
    ]);
});

Router::get('/api/leave-requests/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT lr.*, 
               e.first_name, e.last_name, e.employee_code, e.department_id, e.designation_id,
               lt.name as leave_type_name
        FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE lr.id = :id
    ");
    $stmt->execute(['id' => $id]);
    $request = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$request) {
        http_response_code(404);
        echo json_encode(['message' => 'Request not found']);
        return;
    }
    
    echo json_encode(['data' => $request]);
});

Router::post('/api/leave-requests', function() {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $empId = getLoggedInEmployeeId($userId, $db);
    if (!$empId) {
        http_response_code(404);
        echo json_encode(['message' => 'Employee profile not found']);
        return;
    }
    
    // Validate balance
    $leaveTypeId = $input['leave_type_id'] ?? null;
    $year = date('Y', strtotime($input['from_date']));
    
    // Calculate number of days if not provided
    $days = (float)($input['number_of_days'] ?? 0);
    if ($days <= 0 && !empty($input['from_date']) && !empty($input['to_date'])) {
        $from = new DateTime($input['from_date']);
        $to = new DateTime($input['to_date']);
        $diff = $from->diff($to);
        $days = (float)($diff->days + 1); // Inclusive
    }

    
    if (!$leaveTypeId || $days <= 0) {
        http_response_code(400);
        echo json_encode(['message' => 'Invalid leave type or duration']);
        return;
    }
    
    // Check balance if not unpaid
    $typeStmt = $db->prepare("SELECT is_unpaid FROM leave_types WHERE id = ?");
    $typeStmt->execute([$leaveTypeId]);
    $isUnpaid = $typeStmt->fetchColumn();
    
    if (!$isUnpaid) {
        $balStmt = $db->prepare("SELECT remaining_days FROM leave_balances WHERE employee_id = ? AND leave_type_id = ? AND year = ?");
        $balStmt->execute([$empId, $leaveTypeId, $year]);
        $remaining = (float)$balStmt->fetchColumn();
        
        if ($remaining < $days) {
            http_response_code(400);
            echo json_encode(['message' => 'Insufficient leave balance']);
            return;
        }
    }
    
    // Insert request
    $stmt = $db->prepare("
        INSERT INTO leave_requests (
            employee_id, leave_type_id, from_date, to_date, number_of_days, reason, status, created_at, updated_at
        ) VALUES (
            :emp_id, :type_id, :from, :to, :days, :reason, 'Pending', NOW(), NOW()
        )
    ");
    $stmt->execute([
        'emp_id' => $empId,
        'type_id' => $leaveTypeId,
        'from' => $input['from_date'],
        'to' => $input['to_date'],
        'days' => $days,
        'reason' => $input['reason'] ?? ''
    ]);
    
    echo json_encode(['message' => 'Leave request submitted successfully']);
});

Router::post('/api/leave-requests/{id}/manager-approve', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE leave_requests SET status = 'Manager Approved', manager_remarks = :remarks, updated_at = NOW() WHERE id = :id");
    $stmt->execute([
        'remarks' => $input['remarks'] ?? null,
        'id' => $id
    ]);
    
    echo json_encode(['message' => 'Request approved by Manager']);
});

Router::post('/api/leave-requests/{id}/hr-approve', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $db->beginTransaction();
    try {
        $reqStmt = $db->prepare("SELECT * FROM leave_requests WHERE id = ?");
        $reqStmt->execute([$id]);
        $request = $reqStmt->fetch(PDO::FETCH_ASSOC);
        
        if (!$request) throw new Exception("Request not found");
        
        // Check if unpaid
        $typeStmt = $db->prepare("SELECT is_unpaid FROM leave_types WHERE id = ?");
        $typeStmt->execute([$request['leave_type_id']]);
        $isUnpaid = $typeStmt->fetchColumn();
        
        // Deduct balance
        if (!$isUnpaid) {
            $year = date('Y', strtotime($request['from_date']));
            $balStmt = $db->prepare("
                UPDATE leave_balances 
                SET used_days = used_days + :days,
                    remaining_days = remaining_days - :days
                WHERE employee_id = :emp_id AND leave_type_id = :type_id AND year = :year
            ");
            $balStmt->execute([
                'days' => $request['number_of_days'],
                'emp_id' => $request['employee_id'],
                'type_id' => $request['leave_type_id'],
                'year' => $year
            ]);
        }
        
        $stmt = $db->prepare("UPDATE leave_requests SET status = 'Approved', hr_remarks = :remarks, updated_at = NOW() WHERE id = :id");
        $stmt->execute([
            'remarks' => $input['remarks'] ?? null,
            'id' => $id
        ]);
        
        $db->commit();
        echo json_encode(['message' => 'Request approved by HR']);
    } catch (\Exception $e) {
        $db->rollBack();
        http_response_code(400);
        echo json_encode(['message' => $e->getMessage()]);
    }
});

Router::post('/api/leave-requests/{id}/reject', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE leave_requests SET status = 'Rejected', hr_remarks = :remarks, manager_remarks = :remarks, updated_at = NOW() WHERE id = :id");
    $stmt->execute([
        'remarks' => $input['remarks'] ?? null,
        'id' => $id
    ]);
    
    echo json_encode(['message' => 'Request rejected']);
});

Router::post('/api/leave-requests/{id}/cancel', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE leave_requests SET status = 'Cancelled', updated_at = NOW() WHERE id = :id AND status = 'Pending'");
    $stmt->execute(['id' => $id]);
    
    echo json_encode(['message' => 'Request cancelled']);
});
