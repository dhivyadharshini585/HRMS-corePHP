<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// DOCUMENTS CRUD
// ==========================================

Router::get('/api/documents', function() {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    $employee_id = $_GET['employee_id'] ?? null;
    $category = $_GET['category'] ?? null;
    
    $sql = "
        SELECT d.*, 
               e.first_name, e.last_name, e.employee_code,
               u.first_name as uploader_fn, u.last_name as uploader_ln
        FROM documents d
        LEFT JOIN employees e ON d.employee_id = e.id
        LEFT JOIN employees u ON d.uploaded_by = u.id
        WHERE d.deleted_at IS NULL
    ";
    
    $params = [];
    
    // Scoping
    if ($user['role'] !== 'Super Admin' && $user['role'] !== 'HR Admin') {
        if ($user['role'] === 'Manager' && $user['employee_id']) {
            $sql .= " AND (d.employee_id = ? OR e.manager_id = ? OR d.uploaded_by = ?)";
            $params[] = $user['employee_id'];
            $params[] = $user['employee_id'];
            $params[] = $user['employee_id'];
        } else if ($user['employee_id']) {
            $sql .= " AND (d.employee_id = ? OR d.uploaded_by = ?)";
            $params[] = $user['employee_id'];
            $params[] = $user['employee_id'];
        }
    }
    
    if ($employee_id) {
        $sql .= " AND d.employee_id = ?";
        $params[] = $employee_id;
    }
    
    if ($category) {
        $sql .= " AND d.document_category = ?";
        $params[] = $category;
    }
    
    $sql .= " ORDER BY d.id DESC";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $documents = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formatted = [];
    foreach ($documents as $d) {
        $formatted[] = [
            'id' => $d['id'],
            'employee_id' => $d['employee_id'],
            'document_name' => $d['document_name'],
            'document_category' => $d['document_category'],
            'document_type' => $d['document_type'],
            'file_size' => $d['file_size'],
            'created_at' => $d['created_at'],
            'employee' => $d['employee_id'] ? [
                'id' => $d['employee_id'],
                'first_name' => $d['first_name'],
                'last_name' => $d['last_name'],
                'employee_code' => $d['employee_code']
            ] : null,
            'uploader' => $d['uploaded_by'] ? [
                'id' => $d['uploaded_by'],
                'first_name' => $d['uploader_fn'],
                'last_name' => $d['uploader_ln']
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

Router::post('/api/documents', function() {
    $user = Auth::authenticate();
    $db = Database::getConnection();
    
    if (empty($_FILES['file']) || empty($_POST['document_name']) || empty($_POST['document_category'])) {
        http_response_code(422);
        echo json_encode(['message' => 'Validation error', 'errors' => ['fields' => ['File, Name, and Category are required']]]);
        return;
    }
    
    $file = $_FILES['file'];
    $document_name = $_POST['document_name'];
    $document_category = $_POST['document_category'];
    $employee_id = !empty($_POST['employee_id']) ? $_POST['employee_id'] : $user['employee_id'];
    
    if (!$employee_id) {
        $stmt_fb = $db->query("SELECT id FROM employees LIMIT 1");
        $fallback = $stmt_fb->fetch(PDO::FETCH_ASSOC);
        $employee_id = $fallback ? $fallback['id'] : null;
    }
    
    $uploaded_by = $user['employee_id'] ?: $employee_id;
    
    $upload_dir = __DIR__ . '/uploads/documents';
    if (!is_dir($upload_dir)) {
        mkdir($upload_dir, 0755, true);
    }
    
    // Check for upload errors
    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['message' => 'File upload error', 'error_code' => $file['error']]);
        return;
    }
    
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $filename = uniqid('doc_') . '.' . $ext;
    $filepath = $upload_dir . '/' . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $filepath)) {
        $stmt = $db->prepare("
            INSERT INTO documents (employee_id, document_name, document_category, document_type, file_path, mime_type, file_size, uploaded_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        ");
        
        try {
            $stmt->execute([
                $employee_id,
                $document_name,
                $document_category,
                $ext,
                'uploads/documents/' . $filename,
                $file['type'],
                $file['size'],
                $uploaded_by
            ]);
            
            $id = $db->lastInsertId();
            $newRecord = $db->query("SELECT * FROM documents WHERE id = $id")->fetch(PDO::FETCH_ASSOC);
            echo json_encode(['message' => 'Document uploaded successfully', 'data' => $newRecord]);
        } catch (PDOException $e) {
            unlink($filepath); // Remove file if db insert fails
            http_response_code(500);
            echo json_encode(['message' => 'Database error', 'error' => $e->getMessage()]);
        }
    } else {
        http_response_code(500);
        echo json_encode(['message' => 'Failed to save file']);
    }
});

Router::get('/api/documents/{id}/download', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL");
    $stmt->execute([$id]);
    $document = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$document) {
        http_response_code(404);
        echo json_encode(['message' => 'Document not found']);
        return;
    }
    
    $filepath = __DIR__ . '/' . $document['file_path'];
    if (!file_exists($filepath)) {
        http_response_code(404);
        echo json_encode(['message' => 'File not found on server']);
        return;
    }
    
    $filename = $document['document_name'] . '.' . $document['document_type'];
    
    header('Content-Type: ' . $document['mime_type']);
    header('Content-Disposition: attachment; filename="' . $filename . '"');
    header('Content-Length: ' . filesize($filepath));
    
    readfile($filepath);
});

Router::delete('/api/documents/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE documents SET deleted_at = NOW() WHERE id = ?");
    $stmt->execute([$id]);
    
    http_response_code(204);
});
