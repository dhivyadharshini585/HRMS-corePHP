<?php

require_once __DIR__ . '/core/Router.php';

require_once __DIR__ . '/core/Database.php';

require_once __DIR__ . '/core/Auth.php';



// ==========================================

// ATTENDANCE & SHIFTS MODULE

// ==========================================



/**

 * GET /api/attendance/today

 * Returns current authenticated employee's active or latest attendance session for today,

 * along with organization-wide attendance statistics.

 */

Router::get('/api/attendance/today', function() {

    $user = Auth::user();

    $db = Database::getConnection();



    $empId = $user['employee_id'];

    if (empty($empId)) {

        http_response_code(403);

        echo json_encode(['message' => 'No employee profile linked to authenticated user.']);

        return;

    }



    // Check if the employee has any active open session (check_out IS NULL regardless of age or date)

    $stmt = $db->prepare("

        SELECT * FROM attendances

        WHERE employee_id = :emp_id AND check_out IS NULL

        ORDER BY check_in DESC LIMIT 1

    ");

    $stmt->execute(['emp_id' => $empId]);

    $attendance = $stmt->fetch(PDO::FETCH_ASSOC);



    // If no active session, look for the most recent attendance record for today

    if (!$attendance) {

        $today = date('Y-m-d');

        $stmt = $db->prepare("

            SELECT * FROM attendances

            WHERE employee_id = :emp_id AND (attendance_date = :date OR DATE(check_out) = :date)

            ORDER BY id DESC LIMIT 1

        ");

        $stmt->execute(['emp_id' => $empId, 'date' => $today]);

        $attendance = $stmt->fetch(PDO::FETCH_ASSOC);

    }



    // Calculate organization-wide attendance stats for today

    $today = date('Y-m-d');



    // Total active employees

    $totalEmployees = (int)$db->query("SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL")->fetchColumn();



    // Distinct employees present today

    $stmtPresent = $db->prepare("

        SELECT COUNT(DISTINCT employee_id)

        FROM attendances

        WHERE (attendance_date = :today OR DATE(check_in) = :today OR (check_out IS NULL AND check_in IS NOT NULL))

          AND status = 'Present'

    ");

    $stmtPresent->execute(['today' => $today]);

    $presentCount = (int)$stmtPresent->fetchColumn();



    // Approved leaves for today

    $stmtLeave = $db->prepare("

        SELECT COUNT(DISTINCT employee_id)

        FROM leave_requests

        WHERE status = 'Approved'

          AND :today BETWEEN from_date AND to_date

    ");

    $stmtLeave->execute(['today' => $today]);

    $leaveCount = (int)$stmtLeave->fetchColumn();



    // Remote employees present today

    $stmtRemote = $db->prepare("

        SELECT COUNT(DISTINCT e.id)

        FROM employees e

        JOIN attendances a ON e.id = a.employee_id

        WHERE (a.attendance_date = :today OR DATE(a.check_in) = :today OR (a.check_out IS NULL AND a.check_in IS NOT NULL))

          AND a.status = 'Present'

          AND (e.work_location LIKE '%Remote%' OR e.work_shift LIKE '%Remote%')

    ");

    $stmtRemote->execute(['today' => $today]);

    $remoteCount = (int)$stmtRemote->fetchColumn();



    // Absent employees

    $absentCount = max(0, $totalEmployees - $presentCount - $leaveCount);



    echo json_encode([

        'today_attendance' => $attendance ?: null,

        'stats' => [

            'present' => $presentCount,

            'leave' => $leaveCount,

            'absent' => $absentCount,

            'remote' => $remoteCount,

            'total' => $totalEmployees

        ]

    ]);

});



/**

 * POST /api/attendance/check-in

 * Starts an attendance session for the authenticated employee.

 * Multiple sessions per day are permitted as long as the previous session is closed.

 */

Router::post('/api/attendance/check-in', function() {

    $user = Auth::user();

    global $input;

    $db = Database::getConnection();



    $empId = $user['employee_id'];

    if (empty($empId)) {

        http_response_code(403);

        echo json_encode(['message' => 'No employee profile linked to authenticated user.']);

        return;

    }



    // Prevent a second check-in while ANY earlier attendance session remains open

    $activeStmt = $db->prepare("

        SELECT id FROM attendances

        WHERE employee_id = :emp_id AND check_out IS NULL

        ORDER BY check_in DESC LIMIT 1

    ");

    $activeStmt->execute(['emp_id' => $empId]);

    if ($activeStmt->fetch()) {

        http_response_code(400);

        echo json_encode(['message' => 'Already checked in (active session in progress)']);

        return;

    }



    $today = date('Y-m-d');



    try {

        $insert = $db->prepare("

            INSERT INTO attendances (

                employee_id, attendance_date, check_in, status,

                remarks, check_in_latitude, check_in_longitude, check_in_device, created_at, updated_at

            ) VALUES (

                :emp_id, :date, NOW(), 'Present',

                :remarks, :lat, :lng, :device, NOW(), NOW()

            )

        ");



        $insert->execute([

            'emp_id' => $empId,

            'date' => $today,

            'remarks' => !empty($input['remarks']) ? $input['remarks'] : null,

            'lat' => $input['latitude'] ?? null,

            'lng' => $input['longitude'] ?? null,

            'device' => $input['device'] ?? null,

        ]);



        $lastId = $db->lastInsertId();

        $attendance = $db->query("SELECT * FROM attendances WHERE id = " . (int)$lastId)->fetch(PDO::FETCH_ASSOC);

        echo json_encode(['message' => 'Checked in successfully', 'attendance' => $attendance]);

    } catch (\Throwable $e) {

        http_response_code(500);

        echo json_encode(['message' => 'DB Error: ' . $e->getMessage()]);

    }

});



/**

 * POST /api/attendance/check-out

 * Closes the active attendance session for the authenticated employee.

 */

Router::post('/api/attendance/check-out', function() {

    $user = Auth::user();

    global $input;

    $db = Database::getConnection();



    $empId = $user['employee_id'];

    if (empty($empId)) {

        http_response_code(403);

        echo json_encode(['message' => 'No employee profile linked to authenticated user.']);

        return;

    }



    // Find active attendance record (any open session regardless of date)

    $stmt = $db->prepare("

        SELECT * FROM attendances

        WHERE employee_id = :emp_id AND check_out IS NULL

        ORDER BY check_in DESC LIMIT 1

    ");

    $stmt->execute(['emp_id' => $empId]);

    $attendance = $stmt->fetch(PDO::FETCH_ASSOC);



    if (!$attendance) {

        http_response_code(400);

        echo json_encode(['message' => 'No active check-in record found']);

        return;

    }



    $remarks = !empty($input['remarks']) ? $input['remarks'] : null;



    // Atomic update to calculate working_minutes and prevent concurrent check-out race conditions

    $update = $db->prepare("

        UPDATE attendances SET

            check_out = NOW(),

            working_minutes = TIMESTAMPDIFF(MINUTE, check_in, NOW()),

            check_out_latitude = :lat,

            check_out_longitude = :lng,

            check_out_device = :device,

            remarks = COALESCE(:remarks, remarks),

            updated_at = NOW()

        WHERE id = :id AND check_out IS NULL

    ");



    $update->execute([

        'id' => $attendance['id'],

        'lat' => $input['latitude'] ?? null,

        'lng' => $input['longitude'] ?? null,

        'device' => $input['device'] ?? null,

        'remarks' => $remarks

    ]);



    if ($update->rowCount() === 0) {

        http_response_code(400);

        echo json_encode(['message' => 'Already checked out']);

        return;

    }



    $updatedAttendance = $db->query("SELECT * FROM attendances WHERE id = " . (int)$attendance['id'])->fetch(PDO::FETCH_ASSOC);

    echo json_encode(['message' => 'Checked out successfully', 'attendance' => $updatedAttendance]);

});



/**

 * GET /api/attendance

 * List attendance records with role-based scoping:

 * - Admin: view all, or filter by requested employee_id

 * - Manager: view self + direct reports

 * - Employee: view self only

 */

Router::get('/api/attendance', function() {

    $user = Auth::user();

    $db = Database::getConnection();



    $user_role = $user['role'];

    $user_employee_id = $user['employee_id'];

    $userRoles = $user['roles'] ?? [];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);

    $is_manager = (($user_role === 'Manager' || in_array('Manager', $userRoles, true)) && !empty($user_employee_id));



    $employee_id_filter = $_GET['employee_id'] ?? null;

    $start_date = $_GET['start_date'] ?? null;

    $end_date = $_GET['end_date'] ?? null;



    $query = "

        SELECT a.*, e.first_name, e.last_name, e.employee_code

        FROM attendances a

        JOIN employees e ON a.employee_id = e.id

        WHERE 1=1

    ";

    $params = [];



    // RBAC Scoping

    if ($is_admin) {

        if (!empty($employee_id_filter) && is_numeric($employee_id_filter)) {

            $query .= " AND a.employee_id = ?";

            $params[] = (int)$employee_id_filter;

        }

    } elseif ($is_manager) {

        if (!empty($employee_id_filter) && is_numeric($employee_id_filter)) {

            $target_id = (int)$employee_id_filter;

            if ($target_id === (int)$user_employee_id) {

                $query .= " AND a.employee_id = ?";

                $params[] = $target_id;

            } else {

                $query .= " AND a.employee_id = ? AND a.employee_id IN (SELECT id FROM employees WHERE manager_id = ?)";

                $params[] = $target_id;

                $params[] = (int)$user_employee_id;

            }

        } else {

            $query .= " AND (a.employee_id = ? OR a.employee_id IN (SELECT id FROM employees WHERE manager_id = ?))";

            $params[] = (int)$user_employee_id;

            $params[] = (int)$user_employee_id;

        }

    } else {

        if (empty($user_employee_id)) {

            echo json_encode(['data' => []]);

            return;

        }

        $query .= " AND a.employee_id = ?";

        $params[] = (int)$user_employee_id;

    }



    if (!empty($start_date)) {

        $query .= " AND a.attendance_date >= ?";

        $params[] = $start_date;

    }

    if (!empty($end_date)) {

        $query .= " AND a.attendance_date <= ?";

        $params[] = $end_date;

    }



    $query .= " ORDER BY a.attendance_date DESC, a.check_in DESC";



    $stmt = $db->prepare($query);

    $stmt->execute($params);

    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);



    $data = [];

    foreach ($records as $row) {

        $row['employee'] = [

            'id' => $row['employee_id'],

            'first_name' => $row['first_name'],

            'last_name' => $row['last_name'],

            'employee_code' => $row['employee_code']

        ];

        $data[] = $row;

    }



    echo json_encode(['data' => $data]);

});



// ==========================================

// SHIFTS API (Administrative & Scoped)

// ==========================================



Router::get('/api/shifts', function() {

    Auth::user();

    $db = Database::getConnection();

    $stmt = $db->query("

        SELECT s.*, COUNT(e.id) as employees_count

        FROM shifts s

        LEFT JOIN employees e ON s.id = e.shift_id AND e.deleted_at IS NULL

        GROUP BY s.id

        ORDER BY s.id DESC

    ");



    $data = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['data' => $data]);

});



Router::get('/api/shifts/{id}', function($id) {

    Auth::user();

    $db = Database::getConnection();

    $stmt = $db->prepare("SELECT * FROM shifts WHERE id = :id");

    $stmt->execute(['id' => $id]);

    $shift = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($shift) {

        echo json_encode($shift);

    } else {

        http_response_code(404);

        echo json_encode(['message' => 'Not found']);

    }

});



Router::post('/api/shifts', function() {

    $user = Auth::user();

    $userRoles = $user['roles'] ?? [];
    $isAuthorizedAdmin = in_array($user['role'] ?? '', ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);
    if (!$isAuthorizedAdmin) {

        http_response_code(403);

        echo json_encode(['message' => 'Unauthorized action']);

        return;

    }

    global $input;

    $db = Database::getConnection();

    try {

        $stmt = $db->prepare("

            INSERT INTO shifts (name, start_time, end_time, is_active, description, created_at, updated_at)

            VALUES (:n, :st, :et, :ia, :d, NOW(), NOW())

        ");

        $stmt->execute([

            'n' => $input['name'],

            'st' => $input['start_time'],

            'et' => $input['end_time'],

            'ia' => $input['is_active'] ?? 1,

            'd' => $input['description'] ?? ''

        ]);

        echo json_encode(['message' => 'Shift created', 'id' => $db->lastInsertId()]);

    } catch(Exception $e) {

        http_response_code(400);

        echo json_encode(['message' => $e->getMessage()]);

    }

});



Router::put('/api/shifts/{id}', function($id) {

    $user = Auth::user();

    $userRoles = $user['roles'] ?? [];
    $isAuthorizedAdmin = in_array($user['role'] ?? '', ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);
    if (!$isAuthorizedAdmin) {

        http_response_code(403);

        echo json_encode(['message' => 'Unauthorized action']);

        return;

    }

    global $input;

    $db = Database::getConnection();

    try {

        $stmt = $db->prepare("

            UPDATE shifts

            SET name = :n, start_time = :st, end_time = :et, is_active = :ia, description = :d, updated_at = NOW()

            WHERE id = :id

        ");

        $stmt->execute([

            'n' => $input['name'],

            'st' => $input['start_time'],

            'et' => $input['end_time'],

            'ia' => $input['is_active'] ?? 1,

            'd' => $input['description'] ?? '',

            'id' => $id

        ]);

        echo json_encode(['message' => 'Shift updated']);

    } catch(Exception $e) {

        http_response_code(400);

        echo json_encode(['message' => $e->getMessage()]);

    }

});



Router::delete('/api/shifts/{id}', function($id) {

    $user = Auth::user();

    $userRoles = $user['roles'] ?? [];
    $isAuthorizedAdmin = in_array($user['role'] ?? '', ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);
    if (!$isAuthorizedAdmin) {

        http_response_code(403);

        echo json_encode(['message' => 'Unauthorized action']);

        return;

    }

    $db = Database::getConnection();



    $check = $db->prepare("SELECT COUNT(*) FROM employees WHERE shift_id = :id AND deleted_at IS NULL");

    $check->execute(['id' => $id]);

    if ($check->fetchColumn() > 0) {

        http_response_code(422);

        echo json_encode(['message' => 'Cannot delete shift. Employees are currently assigned to it.']);

        return;

    }



    $stmt = $db->prepare("DELETE FROM shifts WHERE id = :id");

    $stmt->execute(['id' => $id]);

    echo json_encode(['message' => 'Shift deleted']);

});



Router::post('/api/employees/{id}/assign-shift', function($id) {

    $user = Auth::user();

    $userRoles = $user['roles'] ?? [];
    $isAuthorizedAdmin = in_array($user['role'] ?? '', ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);
    if (!$isAuthorizedAdmin) {

        http_response_code(403);

        echo json_encode(['message' => 'Unauthorized action']);

        return;

    }

    global $input;

    $db = Database::getConnection();



    $shift_id = $input['shift_id'] ?? null;

    $stmt = $db->prepare("UPDATE employees SET shift_id = :sid WHERE id = :id");

    $stmt->execute(['sid' => $shift_id, 'id' => $id]);

    echo json_encode(['message' => 'Shift assigned successfully']);

});



if (!function_exists('getAttendanceSubtreeIds')) {
    function getAttendanceSubtreeIds($db, $rootId) {
        if (!$rootId) return [];
        $stmt = $db->query("SELECT id, manager_id FROM employees WHERE deleted_at IS NULL");
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        $childrenMap = [];
        foreach ($rows as $r) {
            $mId = $r['manager_id'] ? (int)$r['manager_id'] : 0;
            if (!isset($childrenMap[$mId])) $childrenMap[$mId] = [];
            $childrenMap[$mId][] = (int)$r['id'];
        }
        $descendants = [];
        $queue = [(int)$rootId];
        $visited = [(int)$rootId => true];
        while (!empty($queue)) {
            $curr = array_shift($queue);
            if (isset($childrenMap[$curr])) {
                foreach ($childrenMap[$curr] as $childId) {
                    if (!isset($visited[$childId])) {
                        $visited[$childId] = true;
                        $descendants[] = $childId;
                        $queue[] = $childId;
                    }
                }
            }
        }
        return $descendants;
    }
}

Router::get('/api/employees/{id}/shift-rotations', function($id) {

    $user = Auth::user();

    $user_role = $user['role'];

    $user_emp_id = $user['employee_id'];

    $userRoles = $user['roles'] ?? [];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);

    $is_self = (!empty($user_emp_id) && (int)$id === (int)$user_emp_id);



    $db = Database::getConnection();



        if (!$is_admin && !$is_self) {
        // Manager can view shift rotations for all direct and indirect subordinates within their reporting subtree
        if (empty($user_emp_id)) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized action']);
            return;
        }
        $subordinateIds = function_exists('getEmployeeDescendantIds') 
            ? getEmployeeDescendantIds($db, $user_emp_id) 
            : getAttendanceSubtreeIds($db, $user_emp_id);
        if (!in_array((int)$id, $subordinateIds, true)) {
            http_response_code(403);
            echo json_encode(['message' => 'Unauthorized action']);
            return;
        }
    }



    $stmt = $db->prepare("

        SELECT r.*, s.name as shift_name, s.start_time, s.end_time

        FROM employee_shift_rotations r

        JOIN shifts s ON r.shift_id = s.id

        WHERE r.employee_id = :emp_id

        ORDER BY r.start_date DESC

    ");

    $stmt->execute(['emp_id' => $id]);

    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['data' => $records]);

});



Router::post('/api/employees/{id}/shift-rotations', function($id) {

    $user = Auth::user();

    $userRoles = $user['roles'] ?? [];
    $isAuthorizedAdmin = in_array($user['role'] ?? '', ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);
    if (!$isAuthorizedAdmin) {

        http_response_code(403);

        echo json_encode(['message' => 'Unauthorized action']);

        return;

    }

    global $input;

    $db = Database::getConnection();

    try {

        $stmt = $db->prepare("

            INSERT INTO employee_shift_rotations (employee_id, shift_id, start_date, end_date, status, created_at, updated_at)

            VALUES (:emp_id, :sid, :sd, :ed, 'Active', NOW(), NOW())

        ");

        $stmt->execute([

            'emp_id' => $id,

            'sid' => $input['shift_id'],

            'sd' => $input['start_date'],

            'ed' => $input['end_date']

        ]);



        $updateEmp = $db->prepare("UPDATE employees SET shift_id = :sid WHERE id = :id");

        $updateEmp->execute(['sid' => $input['shift_id'], 'id' => $id]);



        echo json_encode(['message' => 'Rotation created and shift assigned']);

    } catch(Exception $e) {

        http_response_code(400);

        echo json_encode(['message' => $e->getMessage()]);

    }

});



Router::delete('/api/shift-rotations/{id}', function($id) {

    $user = Auth::user();

    $userRoles = $user['roles'] ?? [];
    $isAuthorizedAdmin = in_array($user['role'] ?? '', ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);
    if (!$isAuthorizedAdmin) {

        http_response_code(403);

        echo json_encode(['message' => 'Unauthorized action']);

        return;

    }

    $db = Database::getConnection();

    $stmt = $db->prepare("DELETE FROM employee_shift_rotations WHERE id = :id");

    $stmt->execute(['id' => $id]);

    echo json_encode(['message' => 'Rotation deleted']);

});