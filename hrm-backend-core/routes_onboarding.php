<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// ONBOARDING MODULE
// ==========================================

Router::get('/api/onboarding', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Support filtering and pagination
    $page = isset($_GET['page']) ? (int)$_GET['page'] : 1;
    $limit = isset($_GET['per_page']) ? (int)$_GET['per_page'] : 15;
    $offset = ($page - 1) * $limit;
    
    $where = ["o.deleted_at IS NULL"];
    $params = [];
    
    if (!empty($_GET['status'])) {
        $where[] = "o.status = ?";
        $params[] = $_GET['status'];
    }
    if (!empty($_GET['search'])) {
        $where[] = "(c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)";
        $search = "%" . $_GET['search'] . "%";
        $params = array_merge($params, [$search, $search, $search]);
    }
    
    $whereClause = implode(' AND ', $where);
    
    $countStmt = $db->prepare("
        SELECT COUNT(*) FROM onboardings o
        JOIN candidates c ON o.candidate_id = c.id
        WHERE $whereClause
    ");
    $countStmt->execute($params);
    $total = $countStmt->fetchColumn();
    $last_page = ceil($total / $limit);
    
    $query = "
        SELECT 
            o.*,
            c.first_name, c.last_name, c.email, c.phone,
            job.title as job_title,
            d.name as department_name,
            e.employee_code
        FROM onboardings o
        JOIN candidates c ON o.candidate_id = c.id
        LEFT JOIN job_openings job ON c.job_opening_id = job.id
        LEFT JOIN departments d ON job.department_id = d.id
        LEFT JOIN employees e ON o.employee_id = e.id
        WHERE $whereClause
        ORDER BY o.created_at DESC
        LIMIT $limit OFFSET $offset
    ";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'data' => $results,
        'current_page' => $page,
        'last_page' => $last_page,
        'total' => $total
    ]);
});

Router::get('/api/onboarding/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT 
            o.*,
            c.first_name, c.last_name, c.email, c.phone,
            ol.offer_code,
            job.title as job_title,
            d.name as department_name,
            e.employee_code, e.id as emp_id
        FROM onboardings o
        JOIN candidates c ON o.candidate_id = c.id
        LEFT JOIN offer_letters ol ON o.offer_letter_id = ol.id
        LEFT JOIN job_openings job ON c.job_opening_id = job.id
        LEFT JOIN departments d ON job.department_id = d.id
        LEFT JOIN employees e ON o.employee_id = e.id
        WHERE o.id = ? AND o.deleted_at IS NULL
    ");
    $stmt->execute([$id]);
    $onboarding = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$onboarding) {
        http_response_code(404);
        echo json_encode(['message' => 'Onboarding record not found']);
        return;
    }
    
    // Fetch checklist items
    $clStmt = $db->prepare("
        SELECT ci.*, d.file_path as document_url, d.original_name as document_name, u.name as verifier_name
        FROM onboarding_checklist_items ci
        LEFT JOIN onboarding_documents d ON ci.document_id = d.id
        LEFT JOIN users u ON ci.verified_by = u.id
        WHERE ci.onboarding_id = ?
        ORDER BY ci.id ASC
    ");
    $clStmt->execute([$id]);
    $checklist_items = $clStmt->fetchAll(PDO::FETCH_ASSOC);
    
    $completedCount = 0;
    foreach ($checklist_items as $item) {
        if ($item['status'] === 'Verified' || $item['status'] === 'Not Applicable') {
            $completedCount++;
        }
    }
    $totalCount = count($checklist_items);
    
    // IT & Laptop tasks
    if ($onboarding['it_account_status'] === 'Completed' || $onboarding['it_account_status'] === 'Not Applicable') $completedCount++;
    if ($onboarding['laptop_allocation_status'] === 'Completed' || $onboarding['laptop_allocation_status'] === 'Not Applicable') $completedCount++;
    $totalCount += 2;
    
    $progress_percentage = $totalCount > 0 ? round(($completedCount / $totalCount) * 100) : 0;
    
    $formatted = [
        'id' => $onboarding['id'],
        'status' => $onboarding['status'],
        'joining_date' => $onboarding['joining_date'],
        'progress_percentage' => $progress_percentage,
        'it_account_status' => $onboarding['it_account_status'],
        'it_account_remarks' => $onboarding['it_account_remarks'],
        'laptop_allocation_status' => $onboarding['laptop_allocation_status'],
        'laptop_allocation_remarks' => $onboarding['laptop_allocation_remarks'],
        'employee_id' => $onboarding['employee_id'],
        'candidate' => [
            'full_name' => $onboarding['first_name'] . ' ' . $onboarding['last_name'],
            'email' => $onboarding['email'],
            'phone' => $onboarding['phone']
        ],
        'offer_letter' => [
            'offer_code' => $onboarding['offer_code'],
            'job_opening' => ['title' => $onboarding['job_title']]
        ],
        'employee' => [
            'employee_code' => $onboarding['employee_code'],
            'department' => ['name' => $onboarding['department_name']]
        ],
        'checklist_items' => $checklist_items
    ];
    
    echo json_encode(['data' => $formatted]);
});

Router::post('/api/onboarding', function() {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];

    if (empty($data['offer_letter_id'])) {
        http_response_code(400);
        echo json_encode(['message' => 'offer_letter_id is required']);
        return;
    }

    $olStmt = $db->prepare("SELECT candidate_id FROM offer_letters WHERE id = ?");
    $olStmt->execute([$data['offer_letter_id']]);
    $offerLetter = $olStmt->fetch(PDO::FETCH_ASSOC);

    if (!$offerLetter) {
        http_response_code(404);
        echo json_encode(['message' => 'Offer letter not found']);
        return;
    }

    // Duplicate Onboarding Protection: check for active existing onboarding record
    $dupStmt = $db->prepare("
        SELECT id FROM onboardings
        WHERE offer_letter_id = ? AND deleted_at IS NULL
        LIMIT 1
    ");
    $dupStmt->execute([$data['offer_letter_id']]);
    if ($dupStmt->fetch()) {
        http_response_code(400);
        echo json_encode(['message' => 'Onboarding has already been started for this offer letter.']);
        return;
    }

    $db->beginTransaction();
    try {
        $stmt = $db->prepare("
            INSERT INTO onboardings (candidate_id, offer_letter_id, joining_date, status, created_by, created_at)
            VALUES (?, ?, CURRENT_DATE, 'Not Started', ?, NOW())
        ");
        $stmt->execute([$offerLetter['candidate_id'], $data['offer_letter_id'], $user_id]);
        $onboarding_id = $db->lastInsertId();

        // Seed default checklist items
        $items = ['Offer Letter','ID Proof','Address Proof','PAN','Bank Details','Educational Certificates','Photograph','Company Policy Acceptance'];
        $insertItems = $db->prepare("INSERT INTO onboarding_checklist_items (onboarding_id, item_type, status) VALUES (?, ?, 'Pending')");
        foreach ($items as $item) {
            $insertItems->execute([$onboarding_id, $item]);
        }

        $db->commit();
        echo json_encode(['message' => 'Onboarding started successfully', 'id' => $onboarding_id]);
    } catch (PDOException $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        // Integrity check: catch duplicate entry error (MySQL 1062 / SQLSTATE 23000)
        if ($e->getCode() === '23000' || strpos($e->getMessage(), '1062') !== false || strpos($e->getMessage(), 'Duplicate entry') !== false) {
            http_response_code(400);
            echo json_encode(['message' => 'Onboarding has already been started for this offer letter.']);
            return;
        }
        http_response_code(500);
        echo json_encode(['message' => 'Failed to start onboarding: Database error occurred.']);
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        http_response_code(500);
        echo json_encode(['message' => 'Failed to start onboarding: ' . $e->getMessage()]);
    }
});

Router::put('/api/onboarding/{id}/cancel', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("UPDATE onboardings SET status = 'Cancelled' WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['message' => 'Onboarding cancelled']);
});

Router::post('/api/onboarding/{id}/checklist/{itemId}/submit', function($id, $itemId) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    if (!isset($_FILES['document'])) {
        http_response_code(400);
        echo json_encode(['message' => 'Document file is required']);
        return;
    }
    
    $file = $_FILES['document'];
    $uploadDir = __DIR__ . '/../storage/onboarding/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }
    
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid('doc_') . '.' . $ext;
    $dest = $uploadDir . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $dest)) {
        $db->beginTransaction();
        try {
            $relPath = 'storage/onboarding/' . $filename;
            $docStmt = $db->prepare("
                INSERT INTO onboarding_documents (onboarding_id, checklist_item_id, original_name, file_path, mime_type, file_size)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $docStmt->execute([$id, $itemId, $file['name'], $relPath, $file['type'], $file['size']]);
            $docId = $db->lastInsertId();
            
            $itemStmt = $db->prepare("
                UPDATE onboarding_checklist_items 
                SET status = 'Submitted', document_id = ?
                WHERE id = ? AND onboarding_id = ?
            ");
            $itemStmt->execute([$docId, $itemId, $id]);
            
            $db->commit();
            echo json_encode(['message' => 'Document submitted successfully']);
        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(['message' => 'DB error: ' . $e->getMessage()]);
        }
    } else {
        http_response_code(500);
        echo json_encode(['message' => 'File upload failed']);
    }
});

Router::put('/api/onboarding/{id}/checklist/{itemId}/verify', function($id, $itemId) {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        UPDATE onboarding_checklist_items 
        SET status = 'Verified', verified_by = ?, verified_at = NOW(), completed_at = NOW()
        WHERE id = ? AND onboarding_id = ?
    ");
    $stmt->execute([$user_id, $itemId, $id]);
    echo json_encode(['message' => 'Item verified']);
});

Router::put('/api/onboarding/{id}/checklist/{itemId}/reject', function($id, $itemId) {
    Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    $stmt = $db->prepare("
        UPDATE onboarding_checklist_items 
        SET status = 'Rejected', remarks = ?
        WHERE id = ? AND onboarding_id = ?
    ");
    $stmt->execute([$data['remarks'] ?? '', $itemId, $id]);
    echo json_encode(['message' => 'Item rejected']);
});

Router::put('/api/onboarding/{id}/it-account', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    $stmt = $db->prepare("UPDATE onboardings SET it_account_status = ?, it_account_remarks = ? WHERE id = ?");
    $stmt->execute([$data['status'], $data['remarks'] ?? '', $id]);
    echo json_encode(['message' => 'IT Account tracking updated']);
});

Router::put('/api/onboarding/{id}/laptop-allocation', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    global $input;
    $data = $input ?: [];
    
    $stmt = $db->prepare("UPDATE onboardings SET laptop_allocation_status = ?, laptop_allocation_remarks = ? WHERE id = ?");
    $stmt->execute([$data['status'], $data['remarks'] ?? '', $id]);
    echo json_encode(['message' => 'Laptop Allocation tracking updated']);
});

Router::post('/api/onboarding/{id}/create-employee', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT c.* FROM onboardings o JOIN candidates c ON o.candidate_id = c.id WHERE o.id = ?");
    $stmt->execute([$id]);
    $candidate = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$candidate) {
        http_response_code(404);
        echo json_encode(['message' => 'Candidate not found']);
        return;
    }
    
    $db->beginTransaction();
    try {
        // Check if employee with this email already exists
        $checkStmt = $db->prepare("SELECT id FROM employees WHERE email = ?");
        $checkStmt->execute([$candidate['email']]);
        $existingEmp = $checkStmt->fetch(PDO::FETCH_ASSOC);
        
        if ($existingEmp) {
            $empId = $existingEmp['id'];
        } else {
            $empStmt = $db->prepare("
                INSERT INTO employees (first_name, last_name, email, phone, designation_id, department_id, employee_code, employment_status, date_of_joining, created_at)
                VALUES (?, ?, ?, ?, (SELECT designation_id FROM job_openings WHERE id = ?), (SELECT department_id FROM job_openings WHERE id = ?), ?, 'Active', CURRENT_DATE, NOW())
            ");
            $empCode = 'EMP-' . str_pad(rand(1, 9999), 4, '0', STR_PAD_LEFT);
            $empStmt->execute([
                $candidate['first_name'], $candidate['last_name'], $candidate['email'], $candidate['phone'], 
                $candidate['job_opening_id'], $candidate['job_opening_id'], $empCode
            ]);
            $empId = $db->lastInsertId();
        }
        
        $updStmt = $db->prepare("UPDATE onboardings SET employee_id = ? WHERE id = ?");
        $updStmt->execute([$empId, $id]);
        
        $db->commit();
        echo json_encode(['message' => 'Employee record linked successfully', 'employee_id' => $empId]);
    } catch(Exception $e) {
        $db->rollBack();
        http_response_code(500);
        echo json_encode(['message' => 'Error creating employee: ' . $e->getMessage()]);
    }
});

Router::put('/api/onboarding/{id}/complete', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("UPDATE onboardings SET status = 'Completed', completed_at = NOW() WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['message' => 'Onboarding completed']);
});

Router::get('/api/onboarding/{id}/checklist/{itemId}/download', function($id, $itemId) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT d.file_path, d.original_name FROM onboarding_documents d JOIN onboarding_checklist_items ci ON d.id = ci.document_id WHERE ci.id = ? AND ci.onboarding_id = ?");
    $stmt->execute([$itemId, $id]);
    $doc = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$doc || !file_exists(__DIR__ . '/../' . $doc['file_path'])) {
        http_response_code(404);
        echo json_encode(['message' => 'Document not found']);
        return;
    }
    
    $filePath = __DIR__ . '/../' . $doc['file_path'];
    header('Content-Description: File Transfer');
    header('Content-Type: application/octet-stream');
    header('Content-Disposition: attachment; filename="'.basename($doc['original_name']).'"');
    header('Expires: 0');
    header('Cache-Control: must-revalidate');
    header('Pragma: public');
    header('Content-Length: ' . filesize($filePath));
    readfile($filePath);
    exit;
});
