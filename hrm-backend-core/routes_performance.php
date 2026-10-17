<?php

// ==========================================
// PERFORMANCE CYCLES
// ==========================================

Router::get('/api/performance-cycles', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->query("SELECT * FROM performance_cycles ORDER BY start_date DESC");
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
});

Router::post('/api/performance-cycles', function() {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $stmt = $db->prepare("INSERT INTO performance_cycles (name, start_date, end_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())");
    $stmt->execute([
        $input['name'] ?? '',
        $input['start_date'] ?? null,
        $input['end_date'] ?? null,
        $input['status'] ?? 'active'
    ]);
    
    echo json_encode(['id' => $db->lastInsertId(), 'message' => 'Performance cycle created successfully']);
});

Router::get('/api/performance-cycles/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT * FROM performance_cycles WHERE id = ?");
    $stmt->execute([$id]);
    $cycle = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$cycle) {
        http_response_code(404);
        echo json_encode(['message' => 'Not found']);
        return;
    }
    echo json_encode($cycle);
});

Router::put('/api/performance-cycles/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $stmt = $db->prepare("UPDATE performance_cycles SET name = ?, start_date = ?, end_date = ?, status = ?, updated_at = NOW() WHERE id = ?");
    $stmt->execute([
        $input['name'] ?? '',
        $input['start_date'] ?? null,
        $input['end_date'] ?? null,
        $input['status'] ?? 'active',
        $id
    ]);
    
    echo json_encode(['message' => 'Performance cycle updated']);
});

Router::delete('/api/performance-cycles/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("DELETE FROM performance_cycles WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['message' => 'Performance cycle deleted']);
});

// ==========================================
// PERFORMANCE GOALS
// ==========================================

Router::get('/api/performance-goals', function() {
    $userId = Auth::authenticate();
    $db = Database::getConnection();
    
    // For now returning all, or we could filter by employee if not admin
    $stmt = $db->query("
        SELECT g.*, 
               e.first_name, e.last_name, e.employee_code,
               c.name as cycle_name
        FROM performance_goals g
        JOIN employees e ON g.employee_id = e.id
        JOIN performance_cycles c ON g.cycle_id = c.id
        ORDER BY g.created_at DESC
    ");
    $goals = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Nest the relationships to match Laravel API
    foreach ($goals as &$g) {
        $g['employee'] = [
            'id' => $g['employee_id'],
            'first_name' => $g['first_name'],
            'last_name' => $g['last_name'],
            'employee_code' => $g['employee_code']
        ];
        $g['cycle'] = [
            'id' => $g['cycle_id'],
            'name' => $g['cycle_name']
        ];
    }
    
    echo json_encode($goals);
});

Router::post('/api/performance-goals', function() {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $stmt = $db->prepare("INSERT INTO performance_goals (employee_id, cycle_id, goal, target, deadline, progress, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())");
    $stmt->execute([
        $input['employee_id'],
        $input['cycle_id'],
        $input['goal'],
        $input['target'],
        $input['deadline'],
        $input['progress'] ?? 0,
        $input['status'] ?? 'pending'
    ]);
    
    echo json_encode(['id' => $db->lastInsertId(), 'message' => 'Goal created successfully']);
});

Router::get('/api/performance-goals/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("
        SELECT g.*, 
               e.first_name, e.last_name, e.employee_code,
               c.name as cycle_name
        FROM performance_goals g
        JOIN employees e ON g.employee_id = e.id
        JOIN performance_cycles c ON g.cycle_id = c.id
        WHERE g.id = ?
    ");
    $stmt->execute([$id]);
    $g = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$g) {
        http_response_code(404);
        echo json_encode(['message' => 'Not found']);
        return;
    }
    
    $g['employee'] = [
        'id' => $g['employee_id'],
        'first_name' => $g['first_name'],
        'last_name' => $g['last_name'],
        'employee_code' => $g['employee_code']
    ];
    $g['cycle'] = [
        'id' => $g['cycle_id'],
        'name' => $g['cycle_name']
    ];
    
    echo json_encode($g);
});

Router::put('/api/performance-goals/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    // Fetch existing
    $stmt = $db->prepare("SELECT * FROM performance_goals WHERE id = ?");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Not found']);
        return;
    }
    
    // Merge
    $emp_id = isset($input['employee_id']) ? $input['employee_id'] : $existing['employee_id'];
    $cycle_id = isset($input['cycle_id']) ? $input['cycle_id'] : $existing['cycle_id'];
    $goal = isset($input['goal']) ? $input['goal'] : $existing['goal'];
    $target = isset($input['target']) ? $input['target'] : $existing['target'];
    $deadline = isset($input['deadline']) ? $input['deadline'] : $existing['deadline'];
    $progress = isset($input['progress']) ? $input['progress'] : $existing['progress'];
    $status = isset($input['status']) ? $input['status'] : $existing['status'];
    
    $update = $db->prepare("UPDATE performance_goals SET employee_id = ?, cycle_id = ?, goal = ?, target = ?, deadline = ?, progress = ?, status = ?, updated_at = NOW() WHERE id = ?");
    $update->execute([
        $emp_id,
        $cycle_id,
        $goal,
        $target,
        $deadline,
        $progress,
        $status,
        $id
    ]);
    
    echo json_encode(['message' => 'Goal updated successfully']);
});

Router::delete('/api/performance-goals/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("DELETE FROM performance_goals WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['message' => 'Goal deleted']);
});

// ==========================================
// PERFORMANCE REVIEWS
// ==========================================

Router::get('/api/performance-reviews', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("
        SELECT r.*, 
               e.first_name, e.last_name, e.employee_code,
               rev.first_name as reviewer_first_name, rev.last_name as reviewer_last_name,
               c.name as cycle_name
        FROM performance_reviews r
        JOIN employees e ON r.employee_id = e.id
        JOIN employees rev ON r.reviewer_id = rev.id
        JOIN performance_cycles c ON r.cycle_id = c.id
        ORDER BY r.created_at DESC
    ");
    $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($reviews as &$r) {
        $r['employee'] = [
            'id' => $r['employee_id'],
            'first_name' => $r['first_name'],
            'last_name' => $r['last_name'],
            'employee_code' => $r['employee_code']
        ];
        $r['reviewer'] = [
            'id' => $r['reviewer_id'],
            'first_name' => $r['reviewer_first_name'],
            'last_name' => $r['reviewer_last_name']
        ];
        $r['cycle'] = [
            'id' => $r['cycle_id'],
            'name' => $r['cycle_name']
        ];
    }
    
    echo json_encode($reviews);
});

Router::post('/api/performance-reviews', function() {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        INSERT INTO performance_reviews (
            cycle_id, employee_id, reviewer_id,
            rating_technical_skills, rating_communication, rating_teamwork,
            rating_leadership, rating_productivity, rating_problem_solving,
            rating_attendance, rating_goal_achievement, comments, status,
            created_at, updated_at
        ) VALUES (
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?,
            ?, ?, ?, ?,
            NOW(), NOW()
        )
    ");
    $stmt->execute([
        $input['cycle_id'],
        $input['employee_id'],
        $input['reviewer_id'],
        $input['rating_technical_skills'] ?? 0,
        $input['rating_communication'] ?? 0,
        $input['rating_teamwork'] ?? 0,
        $input['rating_leadership'] ?? 0,
        $input['rating_productivity'] ?? 0,
        $input['rating_problem_solving'] ?? 0,
        $input['rating_attendance'] ?? 0,
        $input['rating_goal_achievement'] ?? 0,
        $input['comments'] ?? null,
        $input['status'] ?? 'draft'
    ]);
    
    echo json_encode(['id' => $db->lastInsertId(), 'message' => 'Review created successfully']);
});

Router::get('/api/performance-reviews/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->prepare("
        SELECT r.*, 
               e.first_name, e.last_name, e.employee_code,
               rev.first_name as reviewer_first_name, rev.last_name as reviewer_last_name,
               c.name as cycle_name
        FROM performance_reviews r
        JOIN employees e ON r.employee_id = e.id
        JOIN employees rev ON r.reviewer_id = rev.id
        JOIN performance_cycles c ON r.cycle_id = c.id
        WHERE r.id = ?
    ");
    $stmt->execute([$id]);
    $r = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$r) {
        http_response_code(404);
        echo json_encode(['message' => 'Not found']);
        return;
    }
    
    $r['employee'] = [
        'id' => $r['employee_id'],
        'first_name' => $r['first_name'],
        'last_name' => $r['last_name'],
        'employee_code' => $r['employee_code']
    ];
    $r['reviewer'] = [
        'id' => $r['reviewer_id'],
        'first_name' => $r['reviewer_first_name'],
        'last_name' => $r['reviewer_last_name']
    ];
    $r['cycle'] = [
        'id' => $r['cycle_id'],
        'name' => $r['cycle_name']
    ];
    
    echo json_encode($r);
});

Router::put('/api/performance-reviews/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    
    // Fetch existing
    $stmt = $db->prepare("SELECT * FROM performance_reviews WHERE id = ?");
    $stmt->execute([$id]);
    $existing = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$existing) {
        http_response_code(404);
        echo json_encode(['message' => 'Not found']);
        return;
    }
    
    $c_id = isset($input['cycle_id']) ? $input['cycle_id'] : $existing['cycle_id'];
    $e_id = isset($input['employee_id']) ? $input['employee_id'] : $existing['employee_id'];
    $r_id = isset($input['reviewer_id']) ? $input['reviewer_id'] : $existing['reviewer_id'];
    
    $update = $db->prepare("
        UPDATE performance_reviews SET 
            cycle_id = ?, employee_id = ?, reviewer_id = ?,
            rating_technical_skills = ?, rating_communication = ?, rating_teamwork = ?,
            rating_leadership = ?, rating_productivity = ?, rating_problem_solving = ?,
            rating_attendance = ?, rating_goal_achievement = ?, comments = ?, status = ?,
            updated_at = NOW()
        WHERE id = ?
    ");
    $update->execute([
        $c_id,
        $e_id,
        $r_id,
        isset($input['rating_technical_skills']) ? $input['rating_technical_skills'] : $existing['rating_technical_skills'],
        isset($input['rating_communication']) ? $input['rating_communication'] : $existing['rating_communication'],
        isset($input['rating_teamwork']) ? $input['rating_teamwork'] : $existing['rating_teamwork'],
        isset($input['rating_leadership']) ? $input['rating_leadership'] : $existing['rating_leadership'],
        isset($input['rating_productivity']) ? $input['rating_productivity'] : $existing['rating_productivity'],
        isset($input['rating_problem_solving']) ? $input['rating_problem_solving'] : $existing['rating_problem_solving'],
        isset($input['rating_attendance']) ? $input['rating_attendance'] : $existing['rating_attendance'],
        isset($input['rating_goal_achievement']) ? $input['rating_goal_achievement'] : $existing['rating_goal_achievement'],
        isset($input['comments']) ? $input['comments'] : $existing['comments'],
        isset($input['status']) ? $input['status'] : $existing['status'],
        $id
    ]);
    
    echo json_encode(['message' => 'Review updated successfully']);
});

Router::delete('/api/performance-reviews/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("DELETE FROM performance_reviews WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['message' => 'Review deleted']);
});

// ==========================================
// PERFORMANCE REPORTS
// ==========================================

Router::get('/api/reports/performance/employee-ratings', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("
        SELECT r.*, 
               e.first_name as e_fn, e.last_name as e_ln, e.employee_code, e.department_id,
               d.name as department_name, des.title as designation_name,
               rev.first_name as r_fn, rev.last_name as r_ln,
               c.name as cycle_name
        FROM performance_reviews r
        JOIN employees e ON r.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        JOIN employees rev ON r.reviewer_id = rev.id
        JOIN performance_cycles c ON r.cycle_id = c.id
        ORDER BY r.created_at DESC
    ");
    $reviews = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $formattedData = [];
    $totalOverall = 0;
    
    foreach ($reviews as $r) {
        $sum = (int)$r['rating_technical_skills']
             + (int)$r['rating_communication']
             + (int)$r['rating_teamwork']
             + (int)$r['rating_leadership']
             + (int)$r['rating_productivity']
             + (int)$r['rating_problem_solving']
             + (int)$r['rating_attendance']
             + (int)$r['rating_goal_achievement'];
        
        $overall = round($sum / 8, 2);
        $totalOverall += $overall;
        
        $formattedData[] = [
            'id' => $r['id'],
            'employee_id' => $r['employee_id'],
            'employee_name' => trim($r['e_fn'] . ' ' . $r['e_ln']),
            'employee_code' => $r['employee_code'],
            'department_id' => $r['department_id'],
            'department_name' => $r['department_name'] ?: 'N/A',
            'designation_name' => $r['designation_name'] ?: 'N/A',
            'cycle_id' => $r['cycle_id'],
            'cycle_name' => $r['cycle_name'],
            'reviewer_id' => $r['reviewer_id'],
            'reviewer_name' => trim($r['r_fn'] . ' ' . $r['r_ln']),
            'rating_technical_skills' => (int)$r['rating_technical_skills'],
            'rating_communication' => (int)$r['rating_communication'],
            'rating_teamwork' => (int)$r['rating_teamwork'],
            'rating_leadership' => (int)$r['rating_leadership'],
            'rating_productivity' => (int)$r['rating_productivity'],
            'rating_problem_solving' => (int)$r['rating_problem_solving'],
            'rating_attendance' => (int)$r['rating_attendance'],
            'rating_goal_achievement' => (int)$r['rating_goal_achievement'],
            'overall_rating' => $overall,
            'comments' => $r['comments'],
            'status' => ucfirst($r['status']),
            'created_at' => substr($r['created_at'], 0, 10)
        ];
    }
    
    $totalReviews = count($formattedData);
    $avgOverall = $totalReviews > 0 ? round($totalOverall / $totalReviews, 2) : 0;
    
    echo json_encode([
        'data' => $formattedData,
        'summary' => [
            'total_reviews' => $totalReviews,
            'average_overall_rating' => $avgOverall,
        ]
    ]);
});

Router::get('/api/reports/performance/department-performance', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Get all departments
    $depts = $db->query("SELECT id, name FROM departments ORDER BY name ASC")->fetchAll(PDO::FETCH_ASSOC);
    
    // Get employee counts per department
    $empCounts = $db->query("SELECT department_id, COUNT(*) as c FROM employees WHERE deleted_at IS NULL GROUP BY department_id")->fetchAll(PDO::FETCH_KEY_PAIR);
    
    // Get all reviews with overall rating calculations
    $reviews = $db->query("
        SELECT r.employee_id, r.status, e.department_id,
               (r.rating_technical_skills + r.rating_communication + r.rating_teamwork + r.rating_leadership + 
                r.rating_productivity + r.rating_problem_solving + r.rating_attendance + r.rating_goal_achievement) / 8 as overall
        FROM performance_reviews r
        JOIN employees e ON r.employee_id = e.id
    ")->fetchAll(PDO::FETCH_ASSOC);
    
    // Get all goals
    $goals = $db->query("
        SELECT g.employee_id, g.status, g.progress, e.department_id
        FROM performance_goals g
        JOIN employees e ON g.employee_id = e.id
    ")->fetchAll(PDO::FETCH_ASSOC);
    
    $reportData = [];
    foreach ($depts as $dept) {
        $did = $dept['id'];
        $empCount = $empCounts[$did] ?? 0;
        
        $deptReviews = array_filter($reviews, fn($r) => $r['department_id'] == $did);
        $completedReviews = 0;
        $overallSum = 0;
        $validReviews = 0;
        $empsWithReview = [];
        
        foreach ($deptReviews as $r) {
            if (in_array(strtolower($r['status']), ['submitted', 'acknowledged', 'completed'])) {
                $completedReviews++;
            }
            $overallSum += $r['overall'];
            $validReviews++;
            $empsWithReview[] = $r['employee_id'];
        }
        
        $empsWithReviewCount = count(array_unique($empsWithReview));
        $pendingReviews = $validReviews - $completedReviews + max(0, $empCount - $empsWithReviewCount);
        $avgOverall = $validReviews > 0 ? round($overallSum / $validReviews, 2) : 0;
        
        $deptGoals = array_filter($goals, fn($g) => $g['department_id'] == $did);
        $totalGoals = count($deptGoals);
        $completedGoals = 0;
        foreach ($deptGoals as $g) {
            if (strtolower($g['status']) === 'completed' || (int)$g['progress'] === 100) {
                $completedGoals++;
            }
        }
        
        $goalPerc = $totalGoals > 0 ? round(($completedGoals / $totalGoals) * 100, 2) : 0;
        
        $reportData[] = [
            'department_id' => $did,
            'department_name' => $dept['name'],
            'employee_count' => $empCount,
            'average_overall_rating' => $avgOverall,
            'goal_completion_percentage' => $goalPerc,
            'completed_reviews' => $completedReviews,
            'pending_reviews' => $pendingReviews
        ];
    }
    
    $totalDepts = count($reportData);
    $ratedDepts = array_filter($reportData, fn($d) => $d['average_overall_rating'] > 0);
    $overallCompanyAvg = count($ratedDepts) > 0 ? round(array_sum(array_column($ratedDepts, 'average_overall_rating')) / count($ratedDepts), 2) : 0;
    $overallGoalAvg = $totalDepts > 0 ? round(array_sum(array_column($reportData, 'goal_completion_percentage')) / $totalDepts, 2) : 0;
    
    echo json_encode([
        'data' => $reportData,
        'summary' => [
            'total_departments' => $totalDepts,
            'overall_company_avg_rating' => $overallCompanyAvg,
            'overall_goal_completion_percentage' => $overallGoalAvg
        ]
    ]);
});

Router::get('/api/reports/performance/goal-completion', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    $stmt = $db->query("
        SELECT g.*, 
               e.first_name as e_fn, e.last_name as e_ln, e.employee_code, e.department_id,
               d.name as department_name,
               c.name as cycle_name
        FROM performance_goals g
        JOIN employees e ON g.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
        JOIN performance_cycles c ON g.cycle_id = c.id
        ORDER BY g.deadline ASC
    ");
    $goals = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $today = date('Y-m-d');
    $completedCount = 0;
    $inProgressCount = 0;
    $pendingCount = 0;
    $cancelledCount = 0;
    $overdueCount = 0;
    $totalProgress = 0;
    
    $formattedGoals = [];
    
    foreach ($goals as $g) {
        $statusRaw = strtolower($g['status']);
        $progressVal = (int)$g['progress'];
        $totalProgress += $progressVal;
        
        $isCompleted = ($statusRaw === 'completed' || $progressVal === 100);
        $deadlineStr = substr($g['deadline'], 0, 10);
        
        $isOverdue = false;
        if ($deadlineStr && $deadlineStr < $today && !$isCompleted && $statusRaw !== 'cancelled') {
            $isOverdue = true;
            $overdueCount++;
        }
        
        if ($isCompleted) {
            $completedCount++;
        } elseif ($statusRaw === 'in_progress') {
            $inProgressCount++;
        } elseif ($statusRaw === 'cancelled') {
            $cancelledCount++;
        } else {
            $pendingCount++;
        }
        
        $formattedGoals[] = [
            'goal_id' => $g['id'],
            'employee_id' => $g['employee_id'],
            'employee_name' => trim($g['e_fn'] . ' ' . $g['e_ln']),
            'employee_code' => $g['employee_code'],
            'department_id' => $g['department_id'],
            'department_name' => $g['department_name'] ?: 'N/A',
            'cycle_id' => $g['cycle_id'],
            'cycle_name' => $g['cycle_name'],
            'goal' => $g['goal'],
            'target' => $g['target'],
            'deadline' => $deadlineStr,
            'progress' => $progressVal,
            'status' => ucfirst($g['status']),
            'overdue' => $isOverdue
        ];
    }
    
    $totalGoals = count($formattedGoals);
    $averageProgress = $totalGoals > 0 ? round($totalProgress / $totalGoals, 2) : 0;
    $goalCompletionPerc = $totalGoals > 0 ? round(($completedCount / $totalGoals) * 100, 2) : 0;
    
    echo json_encode([
        'data' => $formattedGoals,
        'summary' => [
            'total_goals' => $totalGoals,
            'completed_goals' => $completedCount,
            'in_progress_goals' => $inProgressCount,
            'pending_goals' => $pendingCount,
            'cancelled_goals' => $cancelledCount,
            'average_progress' => $averageProgress,
            'goal_completion_percentage' => $goalCompletionPerc,
            'overdue_goals' => $overdueCount
        ]
    ]);
});

Router::get('/api/reports/performance/training-completion', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Fetch all trainings with trainer info
    $trainingsStmt = $db->query("
        SELECT t.*, 
               e.first_name as trainer_fn, e.last_name as trainer_ln
        FROM trainings t
        LEFT JOIN employees e ON t.trainer_employee_id = e.id
        ORDER BY t.start_date DESC
    ");
    $trainings = $trainingsStmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Fetch all attendees with employee details
    $attendeesStmt = $db->query("
        SELECT ta.*, 
               e.first_name, e.last_name, e.employee_code, e.department_id,
               d.name as department_name,
               0 as has_cert
        FROM training_attendees ta
        JOIN employees e ON ta.employee_id = e.id
        LEFT JOIN departments d ON e.department_id = d.id
    ");
    $allAttendees = $attendeesStmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Group attendees by training_id
    $attendeesByTraining = [];
    foreach ($allAttendees as $a) {
        $attendeesByTraining[$a['training_id']][] = $a;
    }
    
    $totalTrainings = 0;
    $totalEnrollments = 0;
    $completedEnrollments = 0;
    $enrolledPendingEnrollments = 0;
    $failedEnrollments = 0;
    $droppedEnrollments = 0;
    $certificatesIssuedTotal = 0;
    
    $reportData = [];
    
    foreach ($trainings as $t) {
        $tid = $t['id'];
        $attendees = $attendeesByTraining[$tid] ?? [];
        
        $tEnrolled = count($attendees);
        $tCompleted = 0;
        $tPending = 0;
        $tFailed = 0;
        $tDropped = 0;
        $tCerts = 0;
        
        $formattedAttendees = [];
        
        foreach ($attendees as $att) {
            $st = strtolower($att['completion_status']);
            if ($st === 'completed') {
                $tCompleted++;
            } elseif ($st === 'failed') {
                $tFailed++;
            } elseif ($st === 'dropped') {
                $tDropped++;
            } else {
                $tPending++;
            }
            
            $hasCert = (int)$att['has_cert'] > 0;
            if ($hasCert) {
                $tCerts++;
            }
            
            $formattedAttendees[] = [
                'attendee_id' => $att['id'],
                'employee_id' => $att['employee_id'],
                'employee_name' => trim($att['first_name'] . ' ' . $att['last_name']),
                'employee_code' => $att['employee_code'],
                'department_name' => $att['department_name'] ?: 'N/A',
                'completion_status' => ucfirst($att['completion_status']),
                'certificate_available' => $hasCert,
            ];
        }
        
        $tRate = $tEnrolled > 0 ? round(($tCompleted / $tEnrolled) * 100, 2) : 0.00;
        
        $totalTrainings++;
        $totalEnrollments += $tEnrolled;
        $completedEnrollments += $tCompleted;
        $enrolledPendingEnrollments += $tPending;
        $failedEnrollments += $tFailed;
        $droppedEnrollments += $tDropped;
        $certificatesIssuedTotal += $tCerts;
        
        $reportData[] = [
            'training_id' => $t['id'],
            'training_name' => $t['training_name'],
            'trainer_name' => $t['trainer_employee_id'] ? trim($t['trainer_fn'] . ' ' . $t['trainer_ln']) : 'N/A',
            'start_date' => substr($t['start_date'], 0, 10),
            'end_date' => substr($t['end_date'], 0, 10),
            'training_status' => ucfirst($t['status']),
            'total_enrolled' => $tEnrolled,
            'completed_count' => $tCompleted,
            'enrolled_pending_count' => $tPending,
            'failed_count' => $tFailed,
            'dropped_count' => $tDropped,
            'completion_percentage' => $tRate,
            'certificates_issued' => $tCerts,
            'attendees' => $formattedAttendees,
        ];
    }
    
    $overallCompletionPercentage = $totalEnrollments > 0
        ? round(($completedEnrollments / $totalEnrollments) * 100, 2)
        : 0.00;
        
    echo json_encode([
        'data' => $reportData,
        'summary' => [
            'total_trainings' => $totalTrainings,
            'total_enrollments' => $totalEnrollments,
            'completed_enrollments' => $completedEnrollments,
            'enrolled_pending_enrollments' => $enrolledPendingEnrollments,
            'failed_enrollments' => $failedEnrollments,
            'dropped_enrollments' => $droppedEnrollments,
            'overall_completion_percentage' => $overallCompletionPercentage,
            'certificates_issued' => $certificatesIssuedTotal,
        ]
    ]);
});
