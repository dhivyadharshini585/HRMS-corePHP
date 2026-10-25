<?php
// routes_reports.php

Router::get('/api/reports/attendance', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Filters
    $dateFrom = $_GET['date_from'] ?? null;
    $dateTo = $_GET['date_to'] ?? null;
    $status = $_GET['status'] ?? null;
    $departmentId = $_GET['department_id'] ?? null;
    $employeeId = $_GET['employee_id'] ?? null;
    
    $query = "
        SELECT a.*, 
               e.first_name, e.last_name, e.employee_code, e.department_id,
               d.name as department_name,
               COALESCE(a.working_minutes, 0) as working_minutes
        FROM attendances a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE 1=1
    ";
    
    $params = [];
    
    if ($dateFrom) {
        $query .= " AND a.attendance_date >= :date_from";
        $params['date_from'] = $dateFrom;
    }
    if ($dateTo) {
        $query .= " AND a.attendance_date <= :date_to";
        $params['date_to'] = $dateTo;
    }
    if ($status) {
        $query .= " AND a.status = :status";
        $params['status'] = $status;
    }
    if ($departmentId) {
        $query .= " AND e.department_id = :dept_id";
        $params['dept_id'] = $departmentId;
    }
    if ($employeeId) {
        $query .= " AND a.employee_id = :emp_id";
        $params['emp_id'] = $employeeId;
    }
    
    $query .= " ORDER BY a.attendance_date DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Structure data for frontend
    $data = [];
    $totalWorkingMinutes = 0;
    $lateCount = 0;
    $overtimeCount = 0;
    $unresolvedCount = 0;
    $completedRecordsCount = 0;
    
    foreach ($records as $row) {
        $overtime = isset($row['overtime_minutes']) ? $row['overtime_minutes'] : 0;
        $isUnresolved = empty($row['check_out']);
        if ($isUnresolved) {
            $unresolvedCount++;
            $effectiveWorkingMinutes = 0; // Exclude unverified duration
        } else {
            $effectiveWorkingMinutes = (int)$row['working_minutes'];
            $totalWorkingMinutes += $effectiveWorkingMinutes;
            $completedRecordsCount++;
        }
        
        $data[] = [
            'id' => $row['id'],
            'attendance_date' => $row['attendance_date'],
            'employee' => [
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'employee_code' => $row['employee_code'],
                'department' => $row['department_name'] ? ['name' => $row['department_name']] : null
            ],
            'check_in' => $row['check_in'],
            'check_out' => $row['check_out'],
            'working_minutes' => $effectiveWorkingMinutes,
            'overtime_minutes' => $overtime,
            'status' => $row['status'],
            'remarks' => $row['remarks'],
            'is_unresolved' => $isUnresolved
        ];
        
        if ($row['status'] === 'Late') $lateCount++;
        if ($overtime > 0) $overtimeCount++;
    }
    
    $totalRecords = count($data);
    $avgWorkingMinutes = $completedRecordsCount > 0 ? round($totalWorkingMinutes / $completedRecordsCount) : 0;
    
    $summary = [
        'total_records' => $totalRecords,
        'completed_records' => $completedRecordsCount,
        'unresolved_records' => $unresolvedCount,
        'total_working_hours' => round($totalWorkingMinutes / 60, 1),
        'avg_working_hours' => round($avgWorkingMinutes / 60, 1),
        'late_count' => $lateCount,
        'overtime_count' => $overtimeCount
    ];
    
    echo json_encode([
        'data' => $data,
        'summary' => $summary,
        'current_page' => 1,
        'last_page' => 1,
        'total' => $totalRecords
    ]);
});

Router::get('/api/reports/leave', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Filters
    $fromDate = $_GET['from_date'] ?? null;
    $toDate = $_GET['to_date'] ?? null;
    $status = $_GET['status'] ?? null;
    $departmentId = $_GET['department_id'] ?? null;
    $employeeId = $_GET['employee_id'] ?? null;
    $leaveTypeId = $_GET['leave_type_id'] ?? null;
    
    $query = "
        SELECT lr.*, 
               e.first_name, e.last_name, e.employee_code,
               d.name as department_name,
               lt.name as leave_type_name
        FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE 1=1
    ";
    
    $params = [];
    
    if ($fromDate) {
        $query .= " AND lr.from_date >= :from_date";
        $params['from_date'] = $fromDate;
    }
    if ($toDate) {
        $query .= " AND lr.to_date <= :to_date";
        $params['to_date'] = $toDate;
    }
    if ($status) {
        $query .= " AND lr.status = :status";
        $params['status'] = $status;
    }
    if ($departmentId) {
        $query .= " AND e.department_id = :dept_id";
        $params['dept_id'] = $departmentId;
    }
    if ($employeeId) {
        $query .= " AND lr.employee_id = :emp_id";
        $params['emp_id'] = $employeeId;
    }
    if ($leaveTypeId) {
        $query .= " AND lr.leave_type_id = :lt_id";
        $params['lt_id'] = $leaveTypeId;
    }
    
    $query .= " ORDER BY lr.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $data = [];
    $totalRequests = count($records);
    $approvedDays = 0;
    $pendingRequests = 0;
    $rejectedRequests = 0;
    
    foreach ($records as $row) {
        $data[] = [
            'id' => $row['id'],
            'employee' => [
                'first_name' => $row['first_name'],
                'last_name' => $row['last_name'],
                'employee_code' => $row['employee_code'],
                'department' => $row['department_name'] ? ['name' => $row['department_name']] : null
            ],
            'leave_type' => ['name' => $row['leave_type_name']],
            'from_date' => $row['from_date'],
            'to_date' => $row['to_date'],
            'number_of_days' => $row['number_of_days'],
            'status' => $row['status'],
            'manager_remarks' => $row['manager_remarks'],
            'hr_remarks' => $row['hr_remarks'],
            'reason' => $row['reason']
        ];
        
        if ($row['status'] === 'Approved') {
            $approvedDays += $row['number_of_days'];
        } elseif ($row['status'] === 'Pending') {
            $pendingRequests++;
        } elseif ($row['status'] === 'Rejected') {
            $rejectedRequests++;
        }
    }
    
    $summary = [
        'total_requests' => $totalRequests,
        'approved_days' => $approvedDays,
        'pending_requests' => $pendingRequests,
        'rejected_requests' => $rejectedRequests
    ];
    
    echo json_encode([
        'data' => $data,
        'summary' => $summary,
        'current_page' => 1,
        'last_page' => 1,
        'total' => $totalRequests
    ]);
});

// EXPORT ATTENDANCE REPORT
Router::get('/api/reports/attendance/export', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Filters (Same as above)
    $dateFrom = $_GET['date_from'] ?? null;
    $dateTo = $_GET['date_to'] ?? null;
    $status = $_GET['status'] ?? null;
    $departmentId = $_GET['department_id'] ?? null;
    $employeeId = $_GET['employee_id'] ?? null;
    
    $query = "
        SELECT a.*, 
               e.first_name, e.last_name, e.employee_code,
               d.name as department_name,
               COALESCE(a.working_minutes, 0) as working_minutes
        FROM attendances a
        JOIN employees e ON a.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE 1=1
    ";
    
    $params = [];
    if ($dateFrom) { $query .= " AND a.attendance_date >= :date_from"; $params['date_from'] = $dateFrom; }
    if ($dateTo) { $query .= " AND a.attendance_date <= :date_to"; $params['date_to'] = $dateTo; }
    if ($status) { $query .= " AND a.status = :status"; $params['status'] = $status; }
    if ($departmentId) { $query .= " AND e.department_id = :dept_id"; $params['dept_id'] = $departmentId; }
    if ($employeeId) { $query .= " AND a.employee_id = :emp_id"; $params['emp_id'] = $employeeId; }
    
    $query .= " ORDER BY a.attendance_date DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="attendance_report.csv"');
    
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Date', 'Employee ID', 'Employee Name', 'Department', 'Check In', 'Check Out', 'Working Minutes', 'Overtime Minutes', 'Status', 'Remarks']);
    
    foreach ($records as $row) {
        $overtime = isset($row['overtime_minutes']) ? $row['overtime_minutes'] : 0;
        fputcsv($output, [
            $row['attendance_date'],
            $row['employee_code'],
            $row['first_name'] . ' ' . $row['last_name'],
            $row['department_name'],
            $row['check_in'],
            $row['check_out'],
            $row['working_minutes'],
            $overtime,
            $row['status'],
            $row['remarks']
        ]);
    }
    fclose($output);
});

// EXPORT LEAVE REPORT
Router::get('/api/reports/leave/export', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Filters
    $fromDate = $_GET['from_date'] ?? null;
    $toDate = $_GET['to_date'] ?? null;
    $status = $_GET['status'] ?? null;
    $departmentId = $_GET['department_id'] ?? null;
    $employeeId = $_GET['employee_id'] ?? null;
    $leaveTypeId = $_GET['leave_type_id'] ?? null;
    
    $query = "
        SELECT lr.*, 
               e.first_name, e.last_name, e.employee_code,
               d.name as department_name,
               lt.name as leave_type_name
        FROM leave_requests lr
        JOIN employees e ON lr.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        JOIN leave_types lt ON lr.leave_type_id = lt.id
        WHERE 1=1
    ";
    
    $params = [];
    if ($fromDate) { $query .= " AND lr.from_date >= :from_date"; $params['from_date'] = $fromDate; }
    if ($toDate) { $query .= " AND lr.to_date <= :to_date"; $params['to_date'] = $toDate; }
    if ($status) { $query .= " AND lr.status = :status"; $params['status'] = $status; }
    if ($departmentId) { $query .= " AND e.department_id = :dept_id"; $params['dept_id'] = $departmentId; }
    if ($employeeId) { $query .= " AND lr.employee_id = :emp_id"; $params['emp_id'] = $employeeId; }
    if ($leaveTypeId) { $query .= " AND lr.leave_type_id = :lt_id"; $params['lt_id'] = $leaveTypeId; }
    
    $query .= " ORDER BY lr.created_at DESC";
    
    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    header('Content-Type: text/csv');
    header('Content-Disposition: attachment; filename="leave_report.csv"');
    
    $output = fopen('php://output', 'w');
    fputcsv($output, ['Request ID', 'Employee ID', 'Employee Name', 'Department', 'Leave Type', 'From Date', 'To Date', 'Days', 'Status', 'Reason']);
    
    foreach ($records as $row) {
        fputcsv($output, [
            $row['id'],
            $row['employee_code'],
            $row['first_name'] . ' ' . $row['last_name'],
            $row['department_name'],
            $row['leave_type_name'],
            $row['from_date'],
            $row['to_date'],
            $row['number_of_days'],
            $row['status'],
            $row['reason']
        ]);
    }
    fclose($output);
});

// ==========================================
// RECRUITMENT REPORTS
// ==========================================

Router::get('/api/reports/recruitment/applications', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Total applicants per job
    $stmt = $db->query("
        SELECT j.title as label, COUNT(c.id) as value
        FROM job_openings j
        LEFT JOIN candidates c ON j.id = c.job_opening_id
        WHERE j.deleted_at IS NULL
        GROUP BY j.id
    ");
    echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
});

Router::get('/api/reports/recruitment/shortlisted', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Shortlisted per job
    $stmt = $db->query("
        SELECT j.title as label, COUNT(c.id) as value
        FROM job_openings j
        LEFT JOIN candidates c ON j.id = c.job_opening_id AND c.status = 'Shortlisted'
        WHERE j.deleted_at IS NULL
        GROUP BY j.id
    ");
    echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
});

Router::get('/api/reports/recruitment/interviews', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("
        SELECT j.title as label, COUNT(i.id) as value
        FROM job_openings j
        LEFT JOIN candidates c ON j.id = c.job_opening_id
        LEFT JOIN interviews i ON c.id = i.candidate_id
        WHERE j.deleted_at IS NULL
        GROUP BY j.id
    ");
    echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
});

Router::get('/api/reports/recruitment/selected', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("
        SELECT j.title as label, COUNT(c.id) as value
        FROM job_openings j
        LEFT JOIN candidates c ON j.id = c.job_opening_id AND c.status = 'Selected'
        WHERE j.deleted_at IS NULL
        GROUP BY j.id
    ");
    echo json_encode(['data' => $stmt->fetchAll(PDO::FETCH_ASSOC)]);
});

Router::get('/api/reports/recruitment/time-to-hire', function() {
    Auth::authenticate();
    echo json_encode(['data' => [
        ['label' => 'Software Engineer', 'value' => 25],
        ['label' => 'Marketing Manager', 'value' => 15],
    ]]);
});

Router::get('/api/reports/recruitment/hiring-cost', function() {
    Auth::authenticate();
    echo json_encode(['data' => [
        ['label' => 'Software Engineer', 'value' => 2500],
        ['label' => 'Marketing Manager', 'value' => 1500],
    ]]);
});

// ==========================================
// PERFORMANCE REPORTS
// ==========================================

Router::get('/api/reports/performance/employee-ratings', function() {
    Auth::authenticate();
    echo json_encode(['data' => []]);
});

Router::get('/api/reports/performance/department-performance', function() {
    Auth::authenticate();
    echo json_encode(['data' => []]);
});

Router::get('/api/reports/performance/goal-completion', function() {
    Auth::authenticate();
    echo json_encode(['data' => []]);
});

Router::get('/api/reports/performance/training-completion', function() {
    Auth::authenticate();
    echo json_encode(['data' => []]);
});
