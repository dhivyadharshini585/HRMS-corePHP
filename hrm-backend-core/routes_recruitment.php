<?php
// routes_recruitment.php

// ==========================================
// JOB OPENINGS
// ==========================================

Router::get('/api/job-openings', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $status = $_GET['status'] ?? null;
    $departmentId = $_GET['department_id'] ?? null;
    $employmentType = $_GET['employment_type'] ?? null;
    
    $query = "
        SELECT j.*, d.name as department_name, des.title as designation_name
        FROM job_openings j
        LEFT JOIN departments d ON j.department_id = d.id
        LEFT JOIN designations des ON j.designation_id = des.id
        WHERE j.deleted_at IS NULL
    ";
    
    $params = [];
    if ($status) { $query .= " AND j.status = :status"; $params['status'] = $status; }
    if ($departmentId) { $query .= " AND j.department_id = :dept_id"; $params['dept_id'] = $departmentId; }
    if ($employmentType) { $query .= " AND j.employment_type = :emp_type"; $params['emp_type'] = $employmentType; }
    
    $query .= " ORDER BY j.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Structure data
    $data = array_map(function($row) {
        $row['department'] = $row['department_name'] ? ['id' => $row['department_id'], 'name' => $row['department_name']] : null;
        $row['designation'] = $row['designation_name'] ? ['id' => $row['designation_id'], 'name' => $row['designation_name']] : null;
        return $row;
    }, $records);
    
    echo json_encode([
        'data' => $data,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($data)
    ]);
});

Router::get('/api/job-openings/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT j.*, d.name as department_name, des.title as designation_name
        FROM job_openings j
        LEFT JOIN departments d ON j.department_id = d.id
        LEFT JOIN designations des ON j.designation_id = des.id
        WHERE j.id = :id AND j.deleted_at IS NULL
    ");
    $stmt->execute(['id' => $id]);
    $job = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$job) {
        http_response_code(404);
        echo json_encode(['message' => 'Job opening not found']);
        return;
    }
    
    $job['department'] = $job['department_name'] ? ['id' => $job['department_id'], 'name' => $job['department_name']] : null;
    $job['designation'] = $job['designation_name'] ? ['id' => $job['designation_id'], 'name' => $job['designation_name']] : null;
    
    echo json_encode(['data' => $job]);
});

Router::post('/api/job-openings', function() {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    // Required fields: title, department_id, employment_type, location, description
    if (empty($input['title']) || empty($input['department_id']) || empty($input['employment_type']) || empty($input['location']) || empty($input['description'])) {
        http_response_code(400);
        echo json_encode(['message' => 'Missing required fields']);
        return;
    }
    
    // Generate a unique job_code
    $jobCode = 'JOB-' . strtoupper(substr(uniqid(), -6));
    
    $stmt = $db->prepare("
        INSERT INTO job_openings (
            job_code, title, department_id, designation_id, employment_type,
            location, openings_count, description, requirements, responsibilities,
            experience_min, experience_max, salary_min, salary_max, application_deadline,
            status, created_by, created_at, updated_at
        ) VALUES (
            :job_code, :title, :department_id, :designation_id, :employment_type,
            :location, :openings_count, :description, :requirements, :responsibilities,
            :experience_min, :experience_max, :salary_min, :salary_max, :application_deadline,
            :status, :created_by, NOW(), NOW()
        )
    ");
    
    $stmt->execute([
        'job_code' => $jobCode,
        'title' => $input['title'],
        'department_id' => $input['department_id'],
        'designation_id' => $input['designation_id'] ?? null,
        'employment_type' => $input['employment_type'],
        'location' => $input['location'],
        'openings_count' => $input['openings_count'] ?? 1,
        'description' => $input['description'],
        'requirements' => $input['requirements'] ?? null,
        'responsibilities' => $input['responsibilities'] ?? null,
        'experience_min' => $input['experience_min'] ?? 0,
        'experience_max' => $input['experience_max'] ?? null,
        'salary_min' => $input['salary_min'] ?? null,
        'salary_max' => $input['salary_max'] ?? null,
        'application_deadline' => !empty($input['application_deadline']) ? $input['application_deadline'] : null,
        'status' => $input['status'] ?? 'Draft',
        'created_by' => $userId
    ]);
    
    $id = $db->lastInsertId();
    echo json_encode(['message' => 'Job opening created successfully', 'id' => $id]);
});

Router::put('/api/job-openings/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $updates = [];
    $params = ['id' => $id];
    
    $fields = ['title', 'department_id', 'designation_id', 'employment_type', 'location', 'openings_count', 'description', 'requirements', 'responsibilities', 'experience_min', 'experience_max', 'salary_min', 'salary_max', 'application_deadline', 'status'];
    
    foreach ($fields as $field) {
        if (array_key_exists($field, $input)) {
            $updates[] = "$field = :$field";
            // Handle empty dates string correctly by setting to null
            $params[$field] = ($field === 'application_deadline' && empty($input[$field])) ? null : $input[$field];
        }
    }
    
    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['message' => 'No data provided to update']);
        return;
    }
    
    $updates[] = "updated_at = NOW()";
    
    $sql = "UPDATE job_openings SET " . implode(', ', $updates) . " WHERE id = :id";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    echo json_encode(['message' => 'Job opening updated successfully']);
});

Router::delete('/api/job-openings/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Soft delete
    $stmt = $db->prepare("UPDATE job_openings SET deleted_at = NOW() WHERE id = :id");
    $stmt->execute(['id' => $id]);
    
    echo json_encode(['message' => 'Job opening deleted successfully']);
});

// ==========================================
// CANDIDATES
// ==========================================

Router::get('/api/candidates', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $status = $_GET['status'] ?? null;
    $jobOpeningId = $_GET['job_opening_id'] ?? null;
    $search = $_GET['search'] ?? null;
    
    $query = "
        SELECT c.*, j.title as job_title, j.job_code
        FROM candidates c
        LEFT JOIN job_openings j ON c.job_opening_id = j.id
        WHERE c.deleted_at IS NULL
    ";
    
    $params = [];
    if ($status) { $query .= " AND c.status = :status"; $params['status'] = $status; }
    if ($jobOpeningId) { $query .= " AND c.job_opening_id = :job_id"; $params['job_id'] = $jobOpeningId; }
    if ($search) {
        $query .= " AND (c.first_name LIKE :search OR c.last_name LIKE :search OR c.email LIKE :search OR c.candidate_code LIKE :search)";
        $params['search'] = "%$search%";
    }
    
    $query .= " ORDER BY c.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $data = array_map(function($row) {
        $row['job_opening'] = $row['job_title'] ? ['id' => $row['job_opening_id'], 'title' => $row['job_title'], 'job_code' => $row['job_code']] : null;
        $row['resume'] = $row['resume_path'] ? [
            'exists' => true,
            'original_name' => $row['resume_original_name'],
            'mime_type' => $row['resume_mime_type'],
            'size' => $row['resume_size'],
            'uploaded_at' => $row['resume_uploaded_at']
        ] : null;
        return $row;
    }, $records);
    
    echo json_encode([
        'data' => $data,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($data)
    ]);
});

Router::get('/api/candidates/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT c.*, j.title as job_title, j.job_code
        FROM candidates c
        LEFT JOIN job_openings j ON c.job_opening_id = j.id
        WHERE c.id = :id AND c.deleted_at IS NULL
    ");
    $stmt->execute(['id' => $id]);
    $candidate = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$candidate) {
        http_response_code(404);
        echo json_encode(['message' => 'Candidate not found']);
        return;
    }
    
    $candidate['job_opening'] = $candidate['job_title'] ? ['id' => $candidate['job_opening_id'], 'title' => $candidate['job_title'], 'job_code' => $candidate['job_code']] : null;
    $candidate['resume'] = $candidate['resume_path'] ? [
        'exists' => true,
        'original_name' => $candidate['resume_original_name'],
        'mime_type' => $candidate['resume_mime_type'],
        'size' => $candidate['resume_size'],
        'uploaded_at' => $candidate['resume_uploaded_at']
    ] : null;
    
    echo json_encode(['data' => $candidate]);
});

Router::post('/api/candidates', function() {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    if (empty($input['first_name']) || empty($input['last_name']) || empty($input['email']) || empty($input['job_opening_id'])) {
        http_response_code(400);
        echo json_encode(['message' => 'Missing required fields']);
        return;
    }
    
    $candidateCode = 'CAN-' . strtoupper(substr(uniqid(), -6));
    
    $stmt = $db->prepare("
        INSERT INTO candidates (
            candidate_code, first_name, last_name, email, phone, alternate_phone,
            date_of_birth, gender, current_location, address, highest_qualification,
            total_experience_years, current_company, current_designation, expected_salary,
            notice_period_days, source, job_opening_id, status, notes, created_by, created_at, updated_at
        ) VALUES (
            :code, :first_name, :last_name, :email, :phone, :alternate_phone,
            :dob, :gender, :loc, :addr, :qual,
            :exp, :comp, :desig, :sal,
            :np, :source, :job_id, :status, :notes, :created_by, NOW(), NOW()
        )
    ");
    
    $stmt->execute([
        'code' => $candidateCode,
        'first_name' => $input['first_name'],
        'last_name' => $input['last_name'],
        'email' => $input['email'],
        'phone' => $input['phone'] ?? null,
        'alternate_phone' => $input['alternate_phone'] ?? null,
        'dob' => !empty($input['date_of_birth']) ? $input['date_of_birth'] : null,
        'gender' => $input['gender'] ?? null,
        'loc' => $input['current_location'] ?? null,
        'addr' => $input['address'] ?? null,
        'qual' => $input['highest_qualification'] ?? null,
        'exp' => $input['total_experience_years'] ?? 0,
        'comp' => $input['current_company'] ?? null,
        'desig' => $input['current_designation'] ?? null,
        'sal' => $input['expected_salary'] ?? null,
        'np' => $input['notice_period_days'] ?? null,
        'source' => $input['source'] ?? null,
        'job_id' => $input['job_opening_id'],
        'status' => $input['status'] ?? 'New',
        'notes' => $input['notes'] ?? null,
        'created_by' => $userId
    ]);
    
    $id = $db->lastInsertId();
    echo json_encode(['message' => 'Candidate created successfully', 'id' => $id]);
});

Router::put('/api/candidates/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $updates = [];
    $params = ['id' => $id];
    
    $fields = ['first_name', 'last_name', 'email', 'phone', 'alternate_phone', 'date_of_birth', 'gender', 'current_location', 'address', 'highest_qualification', 'total_experience_years', 'current_company', 'current_designation', 'expected_salary', 'notice_period_days', 'source', 'job_opening_id', 'status', 'notes'];
    
    foreach ($fields as $field) {
        if (array_key_exists($field, $input)) {
            $updates[] = "$field = :$field";
            $params[$field] = ($field === 'date_of_birth' && empty($input[$field])) ? null : $input[$field];
        }
    }
    
    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['message' => 'No data provided to update']);
        return;
    }
    
    $updates[] = "updated_at = NOW()";
    $sql = "UPDATE candidates SET " . implode(', ', $updates) . " WHERE id = :id";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    echo json_encode(['message' => 'Candidate updated successfully']);
});

Router::delete('/api/candidates/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE candidates SET deleted_at = NOW() WHERE id = :id");
    $stmt->execute(['id' => $id]);
    
    echo json_encode(['message' => 'Candidate deleted successfully']);
});

// RESUME ACTIONS
Router::post('/api/candidates/{id}/resume', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();

    if (!isset($_FILES['resume']) || $_FILES['resume']['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['message' => 'Valid resume file is required']);
        return;
    }

    $file = $_FILES['resume'];
    $ext = pathinfo($file['name'], PATHINFO_EXTENSION);
    $allowed = ['pdf', 'doc', 'docx'];
    if (!in_array(strtolower($ext), $allowed)) {
        http_response_code(400);
        echo json_encode(['message' => 'Invalid file format']);
        return;
    }

    $uploadDir = __DIR__ . '/uploads/resumes/';
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0777, true);
    }

    $filename = 'resume_' . $id . '_' . time() . '.' . $ext;
    $targetPath = $uploadDir . $filename;

    if (!move_uploaded_file($file['tmp_name'], $targetPath)) {
        http_response_code(500);
        echo json_encode(['message' => 'Failed to save file']);
        return;
    }

    $stmt = $db->prepare("
        UPDATE candidates SET 
            resume_path = :path,
            resume_original_name = :name,
            resume_mime_type = :mime,
            resume_size = :size,
            resume_uploaded_at = NOW()
        WHERE id = :id
    ");

    $stmt->execute([
        'path' => 'uploads/resumes/' . $filename,
        'name' => $file['name'],
        'mime' => $file['type'],
        'size' => $file['size'],
        'id' => $id
    ]);

    // Fetch updated candidate
    $cStmt = $db->prepare("SELECT * FROM candidates WHERE id = :id");
    $cStmt->execute(['id' => $id]);
    $candidate = $cStmt->fetch(PDO::FETCH_ASSOC);

    $candidate['resume'] = $candidate['resume_path'] ? [
        'exists' => true,
        'original_name' => $candidate['resume_original_name'],
        'mime_type' => $candidate['resume_mime_type'],
        'size' => $candidate['resume_size'],
        'uploaded_at' => $candidate['resume_uploaded_at']
    ] : null;

    // Provide pseudo-extraction response
    echo json_encode([
        'message' => 'Resume uploaded successfully',
        'data' => $candidate,
        'extraction' => [
            'status' => 'completed',
            'fields' => []
        ]
    ]);
});

Router::get('/api/candidates/{id}/resume', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();

    $stmt = $db->prepare("SELECT resume_path, resume_original_name, resume_mime_type FROM candidates WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $cand = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$cand || empty($cand['resume_path'])) {
        http_response_code(404);
        echo json_encode(['message' => 'Resume not found']);
        return;
    }

    $filePath = __DIR__ . '/' . $cand['resume_path'];
    if (!file_exists($filePath)) {
        http_response_code(404);
        echo json_encode(['message' => 'File missing from server']);
        return;
    }

    header('Content-Type: ' . ($cand['resume_mime_type'] ?: 'application/octet-stream'));
    header('Content-Disposition: attachment; filename="' . $cand['resume_original_name'] . '"');
    header('Content-Length: ' . filesize($filePath));
    readfile($filePath);
});

Router::delete('/api/candidates/{id}/resume', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();

    $stmt = $db->prepare("UPDATE candidates SET resume_path = NULL, resume_original_name = NULL, resume_mime_type = NULL, resume_size = NULL, resume_uploaded_at = NULL WHERE id = :id");
    $stmt->execute(['id' => $id]);

    $cStmt = $db->prepare("SELECT * FROM candidates WHERE id = :id");
    $cStmt->execute(['id' => $id]);
    $candidate = $cStmt->fetch(PDO::FETCH_ASSOC);
    $candidate['resume'] = null; // Since it was just deleted
    
    echo json_encode(['message' => 'Resume deleted successfully', 'data' => $candidate]);
});

// STATUS UPDATE (PATCH)
Router::patch('/api/candidates/{id}/status', function($id) {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $toStatus = $input['status'] ?? null;
    $remarks = $input['remarks'] ?? null;
    
    if (!$toStatus) {
        http_response_code(400);
        echo json_encode(['message' => 'Status is required']);
        return;
    }
    
    // Get current status
    $stmt = $db->prepare("SELECT status FROM candidates WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $current = $stmt->fetchColumn();
    
    if (!$current) {
        http_response_code(404);
        echo json_encode(['message' => 'Candidate not found']);
        return;
    }
    
    // Update status
    $stmt = $db->prepare("UPDATE candidates SET status = :status, updated_at = NOW() WHERE id = :id");
    $stmt->execute(['status' => $toStatus, 'id' => $id]);
    
    // Log history
    $stmt = $db->prepare("
        INSERT INTO candidate_status_histories (candidate_id, from_status, to_status, changed_by, remarks, changed_at, created_at, updated_at)
        VALUES (:id, :from, :to, :by, :rem, NOW(), NOW(), NOW())
    ");
    $stmt->execute([
        'id' => $id,
        'from' => $current,
        'to' => $toStatus,
        'by' => $userId,
        'rem' => $remarks
    ]);
    
    echo json_encode(['message' => 'Candidate status updated successfully']);
});

// STATUS HISTORY
Router::get('/api/candidates/{id}/status-history', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT h.*, u.name as changed_by_name
        FROM candidate_status_histories h
        LEFT JOIN users u ON h.changed_by = u.id
        WHERE h.candidate_id = :id
        ORDER BY h.changed_at DESC
    ");
    $stmt->execute(['id' => $id]);
    
    echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
});

// ==========================================
// INTERVIEWS
// ==========================================

Router::get('/api/interviews', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $status = $_GET['status'] ?? null;
    $candidateId = $_GET['candidate_id'] ?? null;
    $jobOpeningId = $_GET['job_opening_id'] ?? null;
    $interviewerId = $_GET['interviewer_employee_id'] ?? null;
    
    $query = "
        SELECT i.*, 
               c.first_name as candidate_first_name, c.last_name as candidate_last_name,
               j.title as job_title, j.job_code,
               e.first_name as interviewer_first_name, e.last_name as interviewer_last_name
        FROM interviews i
        LEFT JOIN candidates c ON i.candidate_id = c.id
        LEFT JOIN job_openings j ON i.job_opening_id = j.id
        LEFT JOIN employees e ON i.interviewer_employee_id = e.id
        WHERE i.deleted_at IS NULL
    ";
    
    $params = [];
    if ($status) { $query .= " AND i.status = :status"; $params['status'] = $status; }
    if ($candidateId) { $query .= " AND i.candidate_id = :can_id"; $params['can_id'] = $candidateId; }
    if ($jobOpeningId) { $query .= " AND i.job_opening_id = :job_id"; $params['job_id'] = $jobOpeningId; }
    if ($interviewerId) { $query .= " AND i.interviewer_employee_id = :int_id"; $params['int_id'] = $interviewerId; }
    
    $query .= " ORDER BY i.scheduled_at ASC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $data = array_map(function($row) {
        $row['candidate'] = $row['candidate_first_name'] ? ['id' => $row['candidate_id'], 'first_name' => $row['candidate_first_name'], 'last_name' => $row['candidate_last_name']] : null;
        $row['job_opening'] = $row['job_title'] ? ['id' => $row['job_opening_id'], 'title' => $row['job_title'], 'job_code' => $row['job_code']] : null;
        $row['interviewer'] = $row['interviewer_first_name'] ? ['id' => $row['interviewer_employee_id'], 'first_name' => $row['interviewer_first_name'], 'last_name' => $row['interviewer_last_name']] : null;
        return $row;
    }, $records);
    
    echo json_encode([
        'data' => $data,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($data)
    ]);
});

Router::get('/api/interviews/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT i.*, 
               c.first_name as candidate_first_name, c.last_name as candidate_last_name,
               j.title as job_title, j.job_code,
               e.first_name as interviewer_first_name, e.last_name as interviewer_last_name
        FROM interviews i
        LEFT JOIN candidates c ON i.candidate_id = c.id
        LEFT JOIN job_openings j ON i.job_opening_id = j.id
        LEFT JOIN employees e ON i.interviewer_employee_id = e.id
        WHERE i.id = :id AND i.deleted_at IS NULL
    ");
    $stmt->execute(['id' => $id]);
    $interview = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$interview) {
        http_response_code(404);
        echo json_encode(['message' => 'Interview not found']);
        return;
    }
    
    $interview['candidate'] = $interview['candidate_first_name'] ? ['id' => $interview['candidate_id'], 'first_name' => $interview['candidate_first_name'], 'last_name' => $interview['candidate_last_name']] : null;
    $interview['job_opening'] = $interview['job_title'] ? ['id' => $interview['job_opening_id'], 'title' => $interview['job_title'], 'job_code' => $interview['job_code']] : null;
    $interview['interviewer'] = $interview['interviewer_first_name'] ? ['id' => $interview['interviewer_employee_id'], 'first_name' => $interview['interviewer_first_name'], 'last_name' => $interview['interviewer_last_name']] : null;
    
    echo json_encode(['data' => $interview]);
});

Router::post('/api/interviews', function() {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    if (empty($input['candidate_id']) || empty($input['job_opening_id']) || empty($input['interviewer_employee_id']) || empty($input['scheduled_at'])) {
        http_response_code(400);
        echo json_encode(['message' => 'Missing required fields']);
        return;
    }
    
    $stmt = $db->prepare("
        INSERT INTO interviews (
            candidate_id, job_opening_id, interviewer_employee_id, interview_type,
            interview_round, scheduled_at, duration_minutes, mode, location_or_link,
            status, remarks, created_by, created_at, updated_at
        ) VALUES (
            :can_id, :job_id, :int_id, :type,
            :round, :scheduled_at, :duration, :mode, :loc,
            :status, :remarks, :created_by, NOW(), NOW()
        )
    ");
    
    $stmt->execute([
        'can_id' => $input['candidate_id'],
        'job_id' => $input['job_opening_id'],
        'int_id' => $input['interviewer_employee_id'],
        'type' => $input['interview_type'] ?? 'Technical',
        'round' => $input['interview_round'] ?? 1,
        'scheduled_at' => $input['scheduled_at'],
        'duration' => $input['duration_minutes'] ?? 45,
        'mode' => $input['mode'] ?? 'Online',
        'loc' => $input['location_or_link'] ?? null,
        'status' => $input['status'] ?? 'Scheduled',
        'remarks' => $input['remarks'] ?? null,
        'created_by' => $userId
    ]);
    
    $id = $db->lastInsertId();
    echo json_encode(['message' => 'Interview scheduled successfully', 'id' => $id]);
});

Router::put('/api/interviews/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $updates = [];
    $params = ['id' => $id];
    
    $fields = ['candidate_id', 'job_opening_id', 'interviewer_employee_id', 'interview_type', 'interview_round', 'scheduled_at', 'duration_minutes', 'mode', 'location_or_link', 'status', 'remarks'];
    
    foreach ($fields as $field) {
        if (array_key_exists($field, $input)) {
            $updates[] = "$field = :$field";
            $params[$field] = $input[$field];
        }
    }
    
    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['message' => 'No data provided to update']);
        return;
    }
    
    $updates[] = "updated_at = NOW()";
    $sql = "UPDATE interviews SET " . implode(', ', $updates) . " WHERE id = :id";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    echo json_encode(['message' => 'Interview updated successfully']);
});

Router::delete('/api/interviews/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE interviews SET deleted_at = NOW() WHERE id = :id");
    $stmt->execute(['id' => $id]);
    
    echo json_encode(['message' => 'Interview deleted successfully']);
});

// ==========================================
// INTERVIEW FEEDBACK
// ==========================================

Router::get('/api/interviews/{id}/feedback', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT f.*, e.first_name as interviewer_first_name, e.last_name as interviewer_last_name
        FROM interview_feedback f
        LEFT JOIN employees e ON f.interviewer_employee_id = e.id
        WHERE f.interview_id = :id AND f.deleted_at IS NULL
    ");
    $stmt->execute(['id' => $id]);
    $feedback = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$feedback) {
        http_response_code(404);
        echo json_encode(['message' => 'Feedback not found']);
        return;
    }
    
    $feedback['interviewer'] = $feedback['interviewer_first_name'] ? ['id' => $feedback['interviewer_employee_id'], 'first_name' => $feedback['interviewer_first_name'], 'last_name' => $feedback['interviewer_last_name']] : null;
    
    echo json_encode(['data' => $feedback]);
});

Router::post('/api/interviews/{id}/feedback', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    // Check if feedback already exists
    $stmt = $db->prepare("SELECT id FROM interview_feedback WHERE interview_id = :id AND deleted_at IS NULL");
    $stmt->execute(['id' => $id]);
    if ($stmt->fetchColumn()) {
        http_response_code(400);
        echo json_encode(['message' => 'Feedback already exists for this interview']);
        return;
    }
    
    // Get interviewer from interview
    $stmt = $db->prepare("SELECT interviewer_employee_id FROM interviews WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $interviewerId = $stmt->fetchColumn();
    
    if (!$interviewerId) {
        http_response_code(404);
        echo json_encode(['message' => 'Interview not found']);
        return;
    }
    
    if (empty($input['overall_rating']) || empty($input['recommendation'])) {
        http_response_code(400);
        echo json_encode(['message' => 'Overall rating and recommendation are required']);
        return;
    }
    
    $stmt = $db->prepare("
        INSERT INTO interview_feedback (
            interview_id, interviewer_employee_id, overall_rating, technical_rating,
            communication_rating, problem_solving_rating, cultural_fit_rating,
            strengths, weaknesses, comments, recommendation, submitted_at,
            created_at, updated_at
        ) VALUES (
            :id, :int_id, :overall, :tech,
            :comm, :prob, :cult,
            :str, :weak, :com, :rec, NOW(),
            NOW(), NOW()
        )
    ");
    
    $stmt->execute([
        'id' => $id,
        'int_id' => $interviewerId,
        'overall' => $input['overall_rating'],
        'tech' => $input['technical_rating'] ?? null,
        'comm' => $input['communication_rating'] ?? null,
        'prob' => $input['problem_solving_rating'] ?? null,
        'cult' => $input['cultural_fit_rating'] ?? null,
        'str' => $input['strengths'] ?? null,
        'weak' => $input['weaknesses'] ?? null,
        'com' => $input['comments'] ?? null,
        'rec' => $input['recommendation']
    ]);
    
    // Automatically update interview status to Completed
    $db->prepare("UPDATE interviews SET status = 'Completed', updated_at = NOW() WHERE id = :id")
       ->execute(['id' => $id]);
       
    echo json_encode(['message' => 'Feedback submitted successfully']);
});

Router::put('/api/interviews/{id}/feedback', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $updates = [];
    $params = ['id' => $id];
    
    $fields = ['overall_rating', 'technical_rating', 'communication_rating', 'problem_solving_rating', 'cultural_fit_rating', 'strengths', 'weaknesses', 'comments', 'recommendation'];
    
    foreach ($fields as $field) {
        if (array_key_exists($field, $input)) {
            $updates[] = "$field = :$field";
            $params[$field] = $input[$field];
        }
    }
    
    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['message' => 'No data provided to update']);
        return;
    }
    
    $updates[] = "updated_at = NOW()";
    $sql = "UPDATE interview_feedback SET " . implode(', ', $updates) . " WHERE interview_id = :id AND deleted_at IS NULL";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    echo json_encode(['message' => 'Feedback updated successfully']);
});

Router::delete('/api/interviews/{id}/feedback', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE interview_feedback SET deleted_at = NOW() WHERE interview_id = :id");
    $stmt->execute(['id' => $id]);
    
    echo json_encode(['message' => 'Feedback deleted successfully']);
});

// ==========================================
// OFFER LETTERS
// ==========================================

Router::get('/api/offer-letters', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $status = $_GET['offer_status'] ?? null;
    $candidateId = $_GET['candidate_id'] ?? null;
    
    $query = "
        SELECT o.*, 
               c.first_name as candidate_first_name, c.last_name as candidate_last_name,
               j.title as job_title, d.name as department_name
        FROM offer_letters o
        LEFT JOIN candidates c ON o.candidate_id = c.id
        LEFT JOIN job_openings j ON o.job_opening_id = j.id
        LEFT JOIN departments d ON o.department_id = d.id
        WHERE o.deleted_at IS NULL
    ";
    
    $params = [];
    if ($status) { $query .= " AND o.offer_status = :status"; $params['status'] = $status; }
    if ($candidateId) { $query .= " AND o.candidate_id = :can_id"; $params['can_id'] = $candidateId; }
    
    $query .= " ORDER BY o.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $data = array_map(function($row) {
        $row['candidate'] = $row['candidate_first_name'] ? ['id' => $row['candidate_id'], 'first_name' => $row['candidate_first_name'], 'last_name' => $row['candidate_last_name']] : null;
        $row['job_opening'] = $row['job_title'] ? ['id' => $row['job_opening_id'], 'title' => $row['job_title']] : null;
        $row['department'] = $row['department_name'] ? ['id' => $row['department_id'], 'name' => $row['department_name']] : null;
        return $row;
    }, $records);
    
    echo json_encode([
        'data' => $data,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($data)
    ]);
});

Router::get('/api/offer-letters/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT o.*, 
               c.first_name as candidate_first_name, c.last_name as candidate_last_name,
               j.title as job_title, d.name as department_name
        FROM offer_letters o
        LEFT JOIN candidates c ON o.candidate_id = c.id
        LEFT JOIN job_openings j ON o.job_opening_id = j.id
        LEFT JOIN departments d ON o.department_id = d.id
        WHERE o.id = :id AND o.deleted_at IS NULL
    ");
    $stmt->execute(['id' => $id]);
    $offer = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$offer) {
        http_response_code(404);
        echo json_encode(['message' => 'Offer letter not found']);
        return;
    }
    
    $offer['candidate'] = $offer['candidate_first_name'] ? ['id' => $offer['candidate_id'], 'first_name' => $offer['candidate_first_name'], 'last_name' => $offer['candidate_last_name']] : null;
    $offer['job_opening'] = $offer['job_title'] ? ['id' => $offer['job_opening_id'], 'title' => $offer['job_title']] : null;
    $offer['department'] = $offer['department_name'] ? ['id' => $offer['department_id'], 'name' => $offer['department_name']] : null;
    
    echo json_encode(['data' => $offer]);
});

Router::post('/api/offer-letters', function() {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    if (empty($input['candidate_id']) || empty($input['job_opening_id']) || empty($input['offer_date']) || empty($input['joining_date']) || empty($input['salary_amount']) || empty($input['designation'])) {
        http_response_code(400);
        echo json_encode(['message' => 'Missing required fields']);
        return;
    }
    
    $offerCode = 'OFF-' . strtoupper(substr(uniqid(), -6));
    
    $stmt = $db->prepare("
        INSERT INTO offer_letters (
            offer_code, candidate_id, job_opening_id, department_id, offer_date, joining_date, expiry_date,
            designation, employment_type, work_location, salary_amount, salary_currency, salary_frequency,
            probation_period_months, notice_period_days, benefits, terms_and_conditions, offer_status,
            created_by, created_at, updated_at
        ) VALUES (
            :code, :can_id, :job_id, :dept_id, :od, :jd, :ed,
            :des, :type, :loc, :sal, :cur, :freq,
            :prob, :notice, :ben, :terms, :status,
            :created_by, NOW(), NOW()
        )
    ");
    
    $stmt->execute([
        'code' => $offerCode,
        'can_id' => $input['candidate_id'],
        'job_id' => $input['job_opening_id'],
        'dept_id' => $input['department_id'] ?? null,
        'od' => $input['offer_date'],
        'jd' => $input['joining_date'],
        'ed' => !empty($input['expiry_date']) ? $input['expiry_date'] : null,
        'des' => $input['designation'],
        'type' => $input['employment_type'] ?? 'Full-time',
        'loc' => $input['work_location'] ?? null,
        'sal' => $input['salary_amount'],
        'cur' => $input['salary_currency'] ?? 'USD',
        'freq' => $input['salary_frequency'] ?? 'Annual',
        'prob' => $input['probation_period_months'] ?? null,
        'notice' => $input['notice_period_days'] ?? null,
        'ben' => $input['benefits'] ?? null,
        'terms' => $input['terms_and_conditions'] ?? null,
        'status' => $input['offer_status'] ?? 'Draft',
        'created_by' => $userId
    ]);
    
    $id = $db->lastInsertId();
    echo json_encode(['message' => 'Offer letter created successfully', 'id' => $id]);
});

Router::put('/api/offer-letters/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $updates = [];
    $params = ['id' => $id];
    
    $fields = ['candidate_id', 'job_opening_id', 'department_id', 'offer_date', 'joining_date', 'expiry_date', 'designation', 'employment_type', 'work_location', 'salary_amount', 'salary_currency', 'salary_frequency', 'probation_period_months', 'notice_period_days', 'benefits', 'terms_and_conditions', 'offer_status'];
    
    foreach ($fields as $field) {
        if (array_key_exists($field, $input)) {
            $updates[] = "$field = :$field";
            $params[$field] = ($field === 'expiry_date' && empty($input[$field])) ? null : $input[$field];
        }
    }
    
    if (empty($updates)) {
        http_response_code(400);
        echo json_encode(['message' => 'No data provided to update']);
        return;
    }
    
    $updates[] = "updated_at = NOW()";
    $sql = "UPDATE offer_letters SET " . implode(', ', $updates) . " WHERE id = :id";
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    
    echo json_encode(['message' => 'Offer letter updated successfully']);
});

Router::delete('/api/offer-letters/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE offer_letters SET deleted_at = NOW() WHERE id = :id");
    $stmt->execute(['id' => $id]);
    
    echo json_encode(['message' => 'Offer letter deleted successfully']);
});

// STATUS ACTIONS
function updateOfferStatus($id, $status, $input, $setSentAt = false, $setRespondedAt = false) {
    $db = Database::getConnection();
    $remarks = $input['response_remarks'] ?? null;
    
    $sql = "UPDATE offer_letters SET offer_status = :status, updated_at = NOW()";
    $params = ['status' => $status, 'id' => $id];
    
    if ($setSentAt) {
        $sql .= ", sent_at = NOW()";
    }
    if ($setRespondedAt) {
        $sql .= ", responded_at = NOW()";
        if ($remarks !== null) {
            $sql .= ", response_remarks = :remarks";
            $params['remarks'] = $remarks;
        }
    }
    
    $sql .= " WHERE id = :id AND deleted_at IS NULL";
    
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return true;
}

Router::patch('/api/offer-letters/{id}/send', function($id) {
    Auth::authenticate();
    global $input;
    updateOfferStatus($id, 'Sent', $input, true, false);
    echo json_encode(['message' => 'Offer letter marked as sent']);
});

Router::patch('/api/offer-letters/{id}/accept', function($id) {
    Auth::authenticate();
    global $input;
    updateOfferStatus($id, 'Accepted', $input, false, true);
    
    // Also update candidate status to Hired
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT candidate_id FROM offer_letters WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $candidateId = $stmt->fetchColumn();
    
    if ($candidateId) {
        $db->prepare("UPDATE candidates SET status = 'Hired' WHERE id = :cid")->execute(['cid' => $candidateId]);
    }
    
    echo json_encode(['message' => 'Offer letter accepted']);
});

Router::post('/api/offer-letters/{id}/reject', function($id) {
    Auth::authenticate();
    global $input;
    updateOfferStatus($id, 'Rejected', $input, false, true);
    echo json_encode(['message' => 'Offer letter rejected']);
});

Router::post('/api/offer-letters/{id}/withdraw', function($id) {
    Auth::authenticate();
    global $input;
    updateOfferStatus($id, 'Withdrawn', $input, false, true);
    echo json_encode(['message' => 'Offer letter withdrawn']);
});

Router::post('/api/offer-letters/{id}/expire', function($id) {
    Auth::authenticate();
    global $input;
    updateOfferStatus($id, 'Expired', $input, false, true);
    echo json_encode(['message' => 'Offer letter expired']);
});

Router::get('/api/offer-letters/{id}/download', function($id) {
    Auth::authenticate();
    // Simulate a PDF download
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="offer_letter_' . $id . '.pdf"');
    echo "%PDF-1.4\n% Dummy PDF for offer letter $id\n";
});

// ==========================================
// ONBOARDING
// ==========================================

Router::get('/api/onboarding', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $status = $_GET['status'] ?? null;
    
    $query = "
        SELECT o.*, 
               c.first_name as candidate_first_name, c.last_name as candidate_last_name,
               ol.offer_code, j.title as job_title,
               e.first_name as employee_first_name, e.last_name as employee_last_name
        FROM onboardings o
        LEFT JOIN candidates c ON o.candidate_id = c.id
        LEFT JOIN offer_letters ol ON o.offer_letter_id = ol.id
        LEFT JOIN job_openings j ON ol.job_opening_id = j.id
        LEFT JOIN employees e ON o.employee_id = e.id
        WHERE o.deleted_at IS NULL
    ";
    
    $params = [];
    if ($status) { $query .= " AND o.status = :status"; $params['status'] = $status; }
    
    $query .= " ORDER BY o.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $data = array_map(function($row) {
        $row['candidate'] = $row['candidate_first_name'] ? ['id' => $row['candidate_id'], 'first_name' => $row['candidate_first_name'], 'last_name' => $row['candidate_last_name']] : null;
        $row['offer_letter'] = $row['offer_code'] ? ['id' => $row['offer_letter_id'], 'offer_code' => $row['offer_code'], 'job_opening' => ['title' => $row['job_title']]] : null;
        $row['employee'] = $row['employee_first_name'] ? ['id' => $row['employee_id'], 'first_name' => $row['employee_first_name'], 'last_name' => $row['employee_last_name']] : null;
        return $row;
    }, $records);
    
    echo json_encode([
        'data' => $data,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($data)
    ]);
});

Router::get('/api/onboarding/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT o.*, 
               c.first_name as candidate_first_name, c.last_name as candidate_last_name, c.email as candidate_email, c.phone as candidate_phone,
               ol.offer_code, ol.offer_date, j.title as job_title, j.job_code, d.name as department_name,
               e.first_name as employee_first_name, e.last_name as employee_last_name
        FROM onboardings o
        LEFT JOIN candidates c ON o.candidate_id = c.id
        LEFT JOIN offer_letters ol ON o.offer_letter_id = ol.id
        LEFT JOIN job_openings j ON ol.job_opening_id = j.id
        LEFT JOIN departments d ON ol.department_id = d.id
        LEFT JOIN employees e ON o.employee_id = e.id
        WHERE o.id = :id AND o.deleted_at IS NULL
    ");
    $stmt->execute(['id' => $id]);
    $onboarding = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$onboarding) {
        http_response_code(404);
        echo json_encode(['message' => 'Onboarding record not found']);
        return;
    }
    
    // Fetch checklist items
    $stmt = $db->prepare("SELECT * FROM onboarding_checklist_items WHERE onboarding_id = :id");
    $stmt->execute(['id' => $id]);
    $onboarding['checklist'] = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $onboarding['candidate'] = $onboarding['candidate_first_name'] ? ['id' => $onboarding['candidate_id'], 'first_name' => $onboarding['candidate_first_name'], 'last_name' => $onboarding['candidate_last_name'], 'email' => $onboarding['candidate_email'], 'phone' => $onboarding['candidate_phone']] : null;
    $onboarding['offer_letter'] = $onboarding['offer_code'] ? ['id' => $onboarding['offer_letter_id'], 'offer_code' => $onboarding['offer_code'], 'offer_date' => $onboarding['offer_date'], 'job_opening' => ['title' => $onboarding['job_title'], 'job_code' => $onboarding['job_code']], 'department' => ['name' => $onboarding['department_name']]] : null;
    $onboarding['employee'] = $onboarding['employee_first_name'] ? ['id' => $onboarding['employee_id'], 'first_name' => $onboarding['employee_first_name'], 'last_name' => $onboarding['employee_last_name']] : null;
    
    echo json_encode(['data' => $onboarding]);
});

Router::post('/api/onboarding', function() {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $offerLetterId = $input['offer_letter_id'] ?? null;
    if (!$offerLetterId) {
        http_response_code(400);
        echo json_encode(['message' => 'Offer letter ID is required']);
        return;
    }
    
    // Get offer letter details
    $stmt = $db->prepare("SELECT candidate_id, joining_date FROM offer_letters WHERE id = :id");
    $stmt->execute(['id' => $offerLetterId]);
    $offer = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$offer) {
        http_response_code(404);
        echo json_encode(['message' => 'Offer letter not found']);
        return;
    }
    
    // Check if onboarding already exists
    $stmt = $db->prepare("SELECT id FROM onboardings WHERE offer_letter_id = :id AND deleted_at IS NULL");
    $stmt->execute(['id' => $offerLetterId]);
    if ($stmt->fetchColumn()) {
        http_response_code(400);
        echo json_encode(['message' => 'Onboarding process already started for this offer']);
        return;
    }
    
    $stmt = $db->prepare("
        INSERT INTO onboardings (
            candidate_id, offer_letter_id, joining_date, status,
            it_account_status, laptop_allocation_status, started_at, created_by, created_at, updated_at
        ) VALUES (
            :can_id, :offer_id, :jd, 'In Progress',
            'Pending', 'Pending', NOW(), :created_by, NOW(), NOW()
        )
    ");
    $stmt->execute([
        'can_id' => $offer['candidate_id'],
        'offer_id' => $offerLetterId,
        'jd' => $offer['joining_date'],
        'created_by' => $userId
    ]);
    
    $onboardingId = $db->lastInsertId();
    
    // Create default checklist items
    $items = [
        'Offer Letter', 'ID Proof', 'Address Proof', 'PAN', 'Bank Details',
        'Educational Certificates', 'Previous Experience Documents', 'Photograph',
        'NDA', 'Company Policy Acceptance'
    ];
    
    $stmt = $db->prepare("INSERT INTO onboarding_checklist_items (onboarding_id, item_type, status, created_at, updated_at) VALUES (:oid, :type, 'Pending', NOW(), NOW())");
    foreach ($items as $item) {
        $stmt->execute(['oid' => $onboardingId, 'type' => $item]);
    }
    
    echo json_encode(['message' => 'Onboarding started successfully', 'id' => $onboardingId]);
});

Router::put('/api/onboarding/{id}/cancel', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $db->prepare("UPDATE onboardings SET status = 'Cancelled', updated_at = NOW() WHERE id = :id")->execute(['id' => $id]);
    echo json_encode(['message' => 'Onboarding cancelled']);
});

Router::put('/api/onboarding/{id}/complete', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $db->prepare("UPDATE onboardings SET status = 'Completed', completed_at = NOW(), updated_at = NOW() WHERE id = :id")->execute(['id' => $id]);
    echo json_encode(['message' => 'Onboarding marked as completed']);
});

Router::post('/api/onboarding/{id}/create-employee', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("SELECT * FROM onboardings WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $onboarding = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$onboarding) {
        http_response_code(404);
        echo json_encode(['message' => 'Onboarding not found']);
        return;
    }
    
    if ($onboarding['employee_id']) {
        http_response_code(400);
        echo json_encode(['message' => 'Employee record already exists']);
        return;
    }
    
    // In a real system we'd copy data from candidate & offer_letter. Let's just create a dummy employee.
    $stmt = $db->prepare("
        INSERT INTO employees (
            employee_code, first_name, last_name, email,
            gender, status, employment_type, created_at, updated_at
        ) VALUES (
            :code, 'Dummy', 'Employee', :email,
            'Male', 'Active', 'Full-time', NOW(), NOW()
        )
    ");
    $email = 'dummy' . time() . '@hrms.local';
    $code = 'EMP-' . strtoupper(substr(uniqid(), -4));
    
    $stmt->execute(['code' => $code, 'email' => $email]);
    $empId = $db->lastInsertId();
    
    $db->prepare("UPDATE onboardings SET employee_id = :eid, updated_at = NOW() WHERE id = :oid")->execute(['eid' => $empId, 'oid' => $id]);
    
    echo json_encode(['message' => 'Employee created successfully']);
});

Router::put('/api/onboarding/{id}/checklist/{itemId}/verify', function($id, $itemId) {
    $userId = Auth::authenticate();
    $db = Database::getConnection();
    
    $db->prepare("UPDATE onboarding_checklist_items SET status = 'Verified', verified_by = :uid, verified_at = NOW(), updated_at = NOW() WHERE id = :item_id AND onboarding_id = :oid")
       ->execute(['uid' => $userId, 'item_id' => $itemId, 'oid' => $id]);
       
    echo json_encode(['message' => 'Document verified']);
});

Router::put('/api/onboarding/{id}/checklist/{itemId}/reject', function($id, $itemId) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $remarks = $input['remarks'] ?? null;
    $db->prepare("UPDATE onboarding_checklist_items SET status = 'Rejected', remarks = :rem, updated_at = NOW() WHERE id = :item_id AND onboarding_id = :oid")
       ->execute(['rem' => $remarks, 'item_id' => $itemId, 'oid' => $id]);
       
    echo json_encode(['message' => 'Document rejected']);
});

Router::post('/api/onboarding/{id}/checklist/{itemId}/submit', function($id, $itemId) {
    Auth::authenticate();
    // Simulate file upload logic
    $db = Database::getConnection();
    
    $db->prepare("UPDATE onboarding_checklist_items SET status = 'Submitted', updated_at = NOW() WHERE id = :item_id AND onboarding_id = :oid")
       ->execute(['item_id' => $itemId, 'oid' => $id]);
       
    echo json_encode(['message' => 'Document submitted']);
});

Router::get('/api/onboarding/{id}/checklist/{itemId}/download', function($id, $itemId) {
    Auth::authenticate();
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="document_' . $itemId . '.pdf"');
    echo "%PDF-1.4\n% Dummy PDF for checklist document $itemId\n";
});

Router::put('/api/onboarding/{id}/it-account', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $db->prepare("UPDATE onboardings SET it_account_status = :status, it_account_remarks = :remarks, updated_at = NOW() WHERE id = :id")
       ->execute(['status' => $input['status'] ?? 'Pending', 'remarks' => $input['remarks'] ?? null, 'id' => $id]);
       
    echo json_encode(['message' => 'IT account tracking updated']);
});

Router::put('/api/onboarding/{id}/laptop-allocation', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $db->prepare("UPDATE onboardings SET laptop_allocation_status = :status, laptop_allocation_remarks = :remarks, updated_at = NOW() WHERE id = :id")
       ->execute(['status' => $input['status'] ?? 'Pending', 'remarks' => $input['remarks'] ?? null, 'id' => $id]);
       
    echo json_encode(['message' => 'Laptop allocation tracking updated']);
});
