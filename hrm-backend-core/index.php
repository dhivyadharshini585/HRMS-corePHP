<?php
error_reporting(0); // Prevent PHP errors/warnings from breaking JSON output
file_put_contents(__DIR__ . '/global_req.log', date('Y-m-d H:i:s') . " - URI: " . $_SERVER['REQUEST_URI'] . " Method: " . $_SERVER['REQUEST_METHOD'] . "\n", FILE_APPEND);
date_default_timezone_set('Asia/Kolkata');
// CORS Headers
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json; charset=UTF-8");
header("Access-Control-Allow-Methods: OPTIONS,GET,POST,PUT,DELETE,PATCH");
header("Access-Control-Max-Age: 3600");
header("Access-Control-Allow-Headers: Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With");

// Handle preflight OPTIONS request
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Router.php';

// Parse the request URL
$requestUri = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
// Strip the base path if your local server includes the folder name
$scriptName = dirname($_SERVER['SCRIPT_NAME']);
if (strpos($requestUri, $scriptName) === 0 && $scriptName !== '/') {
    $requestUri = substr($requestUri, strlen($scriptName));
}

require_once __DIR__ . '/core/Auth.php';

// Parse JSON input
$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, TRUE) ?: [];

Router::post('/api/login', function() use ($input) {
    $email = $input['email'] ?? '';
    $password = $input['password'] ?? '';

    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT id, name, email, password FROM users WHERE email = :email");
    $stmt->execute(['email' => $email]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    // Laravel uses password_hash with bcrypt, which password_verify supports natively
    if ($user && password_verify($password, $user['password'])) {
        $token = Auth::generateToken($user['id']);

        // Fetch roles
        $roleStmt = $db->prepare("
            SELECT r.name
            FROM roles r
            JOIN model_has_roles mhr ON r.id = mhr.role_id
            WHERE mhr.model_id = :user_id AND mhr.model_type = 'App\\\\Models\\\\User'
        ");
        $roleStmt->execute(['user_id' => $user['id']]);
        $roles = $roleStmt->fetchAll(PDO::FETCH_COLUMN);

        // Fetch Permissions
        if (in_array('Super Admin', $roles)) {
            $permStmt = $db->query("SELECT name FROM permissions");
            $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
        } else {
            $permStmt = $db->prepare("
                SELECT p.name
                FROM permissions p
                JOIN role_has_permissions rhp ON p.id = rhp.permission_id
                WHERE rhp.role_id IN (
                    SELECT role_id FROM model_has_roles WHERE model_id = :user_id AND model_type = 'App\\\\Models\\\\User'
                )
            ");
            $permStmt->execute(['user_id' => $user['id']]);
            $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
        }

        // Standard Laravel response format expected by frontend AuthContext
        unset($user['password']); // don't send password
        $user['roles'] = $roles;
        $user['permissions'] = $permissions;

        echo json_encode([
            'access_token' => $token,
            'user' => $user
        ]);
    } else {
        http_response_code(401);
        echo json_encode(['message' => 'Invalid credentials']);
    }
});

Router::get('/api/user', function() {
    $user_id = Auth::authenticate(); // Protects route and gets ID

    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT id, name, email FROM users WHERE id = :id");
    $stmt->execute(['id' => $user_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user) {
        $roleStmt = $db->prepare("
            SELECT r.name
            FROM roles r
            JOIN model_has_roles mhr ON r.id = mhr.role_id
            WHERE mhr.model_id = :user_id AND mhr.model_type = 'App\\\\Models\\\\User'
        ");
        $roleStmt->execute(['user_id' => $user['id']]);
        $roles = $roleStmt->fetchAll(PDO::FETCH_COLUMN);
        $user['roles'] = $roles;

        // Fetch Permissions
        if (in_array('Super Admin', $roles)) {
            $permStmt = $db->query("SELECT name FROM permissions");
            $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
        } else {
            $permStmt = $db->prepare("
                SELECT p.name
                FROM permissions p
                JOIN role_has_permissions rhp ON p.id = rhp.permission_id
                WHERE rhp.role_id IN (
                    SELECT role_id FROM model_has_roles WHERE model_id = :user_id AND model_type = 'App\\\\Models\\\\User'
                )
            ");
            $permStmt->execute(['user_id' => $user['id']]);
            $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN);
        }
        $user['permissions'] = $permissions;

        echo json_encode($user);
    } else {
        http_response_code(404);
        echo json_encode(['message' => 'User not found']);
    }
});

Router::post('/api/logout', function() {
    Auth::authenticate();
    echo json_encode(['message' => 'Logged out successfully']);
});

// ==========================================
// DEPARTMENTS CRUD
// ==========================================
Router::get('/api/departments', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    $query = "
        SELECT d.id, d.name, d.description, COUNT(e.id) as employees_count
        FROM departments d
        LEFT JOIN employees e ON d.id = e.department_id AND e.deleted_at IS NULL
    ";

    $params = [];
    if (!empty($_GET['search'])) {
        $query .= " WHERE d.name LIKE :search";
        $params['search'] = '%' . $_GET['search'] . '%';
    }

    $query .= " GROUP BY d.id ORDER BY d.id DESC";

    $stmt = $db->prepare($query);
    $stmt->execute($params);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
});

Router::get('/api/departments/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT * FROM departments WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $dept = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($dept) echo json_encode($dept);
    else { http_response_code(404); echo json_encode(['message' => 'Not found']); }
});

Router::post('/api/departments', function() {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    try {
        $stmt = $db->prepare("INSERT INTO departments (name, description, created_at, updated_at) VALUES (:name, :description, NOW(), NOW())");
        $stmt->execute(['name' => $input['name'] ?? '', 'description' => $input['description'] ?? '']);
        echo json_encode(['message' => 'Department created', 'id' => $db->lastInsertId()]);
    } catch(Exception $e) { http_response_code(400); echo json_encode(['error' => $e->getMessage()]); }
});

Router::put('/api/departments/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    try {
        $stmt = $db->prepare("UPDATE departments SET name = :name, description = :description, updated_at = NOW() WHERE id = :id");
        $stmt->execute(['name' => $input['name'] ?? '', 'description' => $input['description'] ?? '', 'id' => $id]);
        echo json_encode(['message' => 'Department updated']);
    } catch(Exception $e) { http_response_code(400); echo json_encode(['error' => $e->getMessage()]); }
});

Router::delete('/api/departments/{id}', function($id) {
    try {
        Auth::authenticate();
        $db = Database::getConnection();
        // Check if employees depend on it
        $check = $db->prepare("SELECT COUNT(*) FROM employees WHERE department_id = :id AND deleted_at IS NULL");
        $check->execute(['id' => $id]);
        if ($check->fetchColumn() > 0) {
            http_response_code(422);
            echo json_encode(['message' => 'Cannot delete department as it has active employees.']);
            return;
        }
        $stmt = $db->prepare("DELETE FROM departments WHERE id = :id");
        $stmt->execute(['id' => $id]);
        echo json_encode(['message' => 'Department deleted']);
    } catch (\Throwable $e) {
        file_put_contents(__DIR__ . '/error_log.txt', date('Y-m-d H:i:s') . ' [DELETE Dept] ' . $e->getMessage() . PHP_EOL, FILE_APPEND);
        http_response_code(500);
        echo json_encode(['error' => $e->getMessage()]);
    }
});

// ==========================================
// DESIGNATIONS CRUD
// ==========================================
Router::get('/api/designations', function() {
    Auth::authenticate();
    $db = Database::getConnection();
    $query = "
        SELECT d.id, d.title, d.description, COUNT(e.id) as employees_count
        FROM designations d
        LEFT JOIN employees e ON d.id = e.designation_id AND e.deleted_at IS NULL
    ";

    $params = [];
    if (!empty($_GET['search'])) {
        $query .= " WHERE d.title LIKE :search";
        $params['search'] = '%' . $_GET['search'] . '%';
    }

    $query .= " GROUP BY d.id ORDER BY d.id DESC";

    $stmt = $db->prepare($query);
    $stmt->execute($params);
    echo json_encode($stmt->fetchAll(PDO::FETCH_ASSOC));
});

Router::get('/api/designations/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT * FROM designations WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $desig = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($desig) echo json_encode($desig);
    else { http_response_code(404); echo json_encode(['message' => 'Not found']); }
});

Router::post('/api/designations', function() {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    try {
        $stmt = $db->prepare("INSERT INTO designations (title, description, created_at, updated_at) VALUES (:title, :description, NOW(), NOW())");
        $stmt->execute(['title' => $input['title'] ?? '', 'description' => $input['description'] ?? '']);
        echo json_encode(['message' => 'Designation created', 'id' => $db->lastInsertId()]);
    } catch(Exception $e) { http_response_code(400); echo json_encode(['error' => $e->getMessage()]); }
});

Router::put('/api/designations/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    try {
        $stmt = $db->prepare("UPDATE designations SET title = :title, description = :description, updated_at = NOW() WHERE id = :id");
        $stmt->execute(['title' => $input['title'] ?? '', 'description' => $input['description'] ?? '', 'id' => $id]);
        echo json_encode(['message' => 'Designation updated']);
    } catch(Exception $e) { http_response_code(400); echo json_encode(['error' => $e->getMessage()]); }
});

Router::delete('/api/designations/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    // Check if employees depend on it
    $check = $db->prepare("SELECT COUNT(*) FROM employees WHERE designation_id = :id AND deleted_at IS NULL");
    $check->execute(['id' => $id]);
    if ($check->fetchColumn() > 0) {
        http_response_code(422);
        echo json_encode(['message' => 'Cannot delete designation as it has active employees.']);
        return;
    }
    $stmt = $db->prepare("DELETE FROM designations WHERE id = :id");
    $stmt->execute(['id' => $id]);
    echo json_encode(['message' => 'Designation deleted']);
});

Router::get('/api/employees', function() {
    Auth::authenticate();
    $db = Database::getConnection();

    $query = "
        SELECT
            e.id, e.employee_code, e.first_name, e.last_name, e.email, e.employment_status,
            d.id as dept_id, d.name as dept_name,
            des.id as desig_id, des.title as desig_title
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        WHERE e.deleted_at IS NULL
    ";

    $params = [];

    if (!empty($_GET['search'])) {
        $query .= " AND (e.first_name LIKE :search OR e.last_name LIKE :search OR e.email LIKE :search OR e.employee_code LIKE :search)";
        $params['search'] = '%' . $_GET['search'] . '%';
    }
    if (!empty($_GET['department_id'])) {
        $query .= " AND e.department_id = :dept";
        $params['dept'] = $_GET['department_id'];
    }
    if (!empty($_GET['designation_id'])) {
        $query .= " AND e.designation_id = :desig";
        $params['desig'] = $_GET['designation_id'];
    }
    if (!empty($_GET['employment_status'])) {
        $query .= " AND e.employment_status = :status";
        $params['status'] = $_GET['employment_status'];
    }

    $query .= " ORDER BY e.id DESC";

    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $employees = [];
    foreach ($rows as $row) {
        $emp = [
            'id' => $row['id'],
            'employee_code' => $row['employee_code'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'email' => $row['email'],
            'employment_status' => $row['employment_status']
        ];
        if ($row['dept_id']) {
            $emp['department'] = ['id' => $row['dept_id'], 'name' => $row['dept_name']];
        }
        if ($row['desig_id']) {
            $emp['designation'] = ['id' => $row['desig_id'], 'title' => $row['desig_title']];
        }
        $employees[] = $emp;
    }

    echo json_encode(['data' => $employees]);
});

Router::get('/api/employees/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();

    $stmt = $db->prepare("
        SELECT
            e.*,
            d.id as dept_id, d.name as dept_name,
            des.id as desig_id, des.title as desig_title
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        WHERE e.id = :id AND e.deleted_at IS NULL
    ");
    $stmt->execute(['id' => $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($row) {
        if ($row['dept_id']) {
            $row['department'] = ['id' => $row['dept_id'], 'name' => $row['dept_name']];
        }
        if ($row['desig_id']) {
            $row['designation'] = ['id' => $row['desig_id'], 'title' => $row['desig_title']];
        }

        // Fetch User Info if user_id exists
        if ($row['user_id']) {
            $userStmt = $db->prepare("SELECT email FROM users WHERE id = :user_id");
            $userStmt->execute(['user_id' => $row['user_id']]);
            $userRow = $userStmt->fetch(PDO::FETCH_ASSOC);
            if ($userRow) {
                $row['user'] = ['email' => $userRow['email']];
            }
        }

        // Fetch Manager Info if manager_id exists
        if ($row['manager_id']) {
            $mgrStmt = $db->prepare("SELECT first_name, last_name, designation_id FROM employees WHERE id = :manager_id");
            $mgrStmt->execute(['manager_id' => $row['manager_id']]);
            $mgrRow = $mgrStmt->fetch(PDO::FETCH_ASSOC);
            if ($mgrRow) {
                $row['manager'] = [
                    'first_name' => $mgrRow['first_name'],
                    'last_name' => $mgrRow['last_name']
                ];
            }
        }

        // Fetch Employment Histories
        $histStmt = $db->prepare("SELECT * FROM employment_histories WHERE employee_id = :employee_id ORDER BY start_date DESC");
        $histStmt->execute(['employee_id' => $id]);
        $row['employment_histories'] = $histStmt->fetchAll(PDO::FETCH_ASSOC);

        echo json_encode($row);
    } else {
        http_response_code(404);
        echo json_encode(['message' => 'Employee not found']);
    }
});

Router::post('/api/employees', function() {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();

    try {
        $stmt = $db->prepare("
            INSERT INTO employees (employee_code, first_name, last_name, email, phone, gender, date_of_birth, date_of_joining, department_id, designation_id, employment_type, employment_status, created_at, updated_at)
            VALUES (:employee_code, :first_name, :last_name, :email, :phone, :gender, :date_of_birth, :date_of_joining, :department_id, :designation_id, :employment_type, :employment_status, NOW(), NOW())
        ");
        $stmt->execute([
            'employee_code' => $input['employee_code'] ?? null,
            'first_name' => $input['first_name'] ?? null,
            'last_name' => $input['last_name'] ?? null,
            'email' => $input['email'] ?? null,
            'phone' => $input['phone'] ?? null,
            'gender' => $input['gender'] ?? null,
            'date_of_birth' => $input['date_of_birth'] ?? null,
            'date_of_joining' => $input['date_of_joining'] ?? date('Y-m-d'),
            'department_id' => $input['department_id'] ?? null,
            'designation_id' => $input['designation_id'] ?? null,
            'employment_type' => $input['employment_type'] ?? 'Full-time',
            'employment_status' => $input['employment_status'] ?? 'Active',
        ]);
        echo json_encode(['message' => 'Employee created successfully', 'id' => $db->lastInsertId()]);
    } catch (PDOException $e) {
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
    }
});

Router::put('/api/employees/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();

    try {
        $stmt = $db->prepare("
            UPDATE employees SET
                employee_code = :employee_code, first_name = :first_name, last_name = :last_name,
                email = :email, phone = :phone, gender = :gender, date_of_birth = :date_of_birth,
                date_of_joining = :date_of_joining, department_id = :department_id,
                designation_id = :designation_id, employment_type = :employment_type,
                employment_status = :employment_status, updated_at = NOW()
            WHERE id = :id
        ");
        $stmt->execute([
            'id' => $id,
            'employee_code' => $input['employee_code'] ?? null,
            'first_name' => $input['first_name'] ?? null,
            'last_name' => $input['last_name'] ?? null,
            'email' => $input['email'] ?? null,
            'phone' => $input['phone'] ?? null,
            'gender' => $input['gender'] ?? null,
            'date_of_birth' => $input['date_of_birth'] ?? null,
            'date_of_joining' => $input['date_of_joining'] ?? date('Y-m-d'),
            'department_id' => $input['department_id'] ?? null,
            'designation_id' => $input['designation_id'] ?? null,
            'employment_type' => $input['employment_type'] ?? 'Full-time',
            'employment_status' => $input['employment_status'] ?? 'Active',
        ]);
        echo json_encode(['message' => 'Employee updated successfully']);
    } catch (PDOException $e) {
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
    }
});

Router::delete('/api/employees/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("UPDATE employees SET deleted_at = NOW() WHERE id = :id");
    $stmt->execute(['id' => $id]);
    echo json_encode(['message' => 'Employee deleted successfully']);
});

Router::post('/api/employees/{id}/credentials', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();

    $password = $input['password'] ?? '';
    if (strlen($password) < 8) {
        http_response_code(400);
        echo json_encode(['message' => 'Password must be at least 8 characters.']);
        return;
    }

    try {
        $db->beginTransaction();

        $empStmt = $db->prepare("SELECT email FROM employees WHERE id = :id");
        $empStmt->execute(['id' => $id]);
        $emp = $empStmt->fetch(PDO::FETCH_ASSOC);

        if (!$emp) throw new Exception("Employee not found");

        $hashed = password_hash($password, PASSWORD_BCRYPT);
        $userStmt = $db->prepare("INSERT INTO users (name, email, password, created_at, updated_at) VALUES (:name, :email, :password, NOW(), NOW())");
        $userStmt->execute([
            'name' => 'Employee User', // Could use first/last name
            'email' => $emp['email'],
            'password' => $hashed
        ]);

        $userId = $db->lastInsertId();

        $updateEmp = $db->prepare("UPDATE employees SET user_id = :user_id WHERE id = :id");
        $updateEmp->execute(['user_id' => $userId, 'id' => $id]);

        $db->commit();
        echo json_encode(['message' => 'Credentials created successfully']);
    } catch (Exception $e) {
        $db->rollBack();
        http_response_code(400);
        echo json_encode(['message' => $e->getMessage()]);
    }
});

Router::post('/api/employees/{id}/password', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();

    $password = $input['password'] ?? '';
    if (strlen($password) < 8) {
        http_response_code(400);
        echo json_encode(['message' => 'Password must be at least 8 characters.']);
        return;
    }

    try {
        $empStmt = $db->prepare("SELECT user_id FROM employees WHERE id = :id");
        $empStmt->execute(['id' => $id]);
        $emp = $empStmt->fetch(PDO::FETCH_ASSOC);

        if (!$emp || !$emp['user_id']) throw new Exception("User account not found");

        $hashed = password_hash($password, PASSWORD_BCRYPT);
        $updateStmt = $db->prepare("UPDATE users SET password = :password, updated_at = NOW() WHERE id = :user_id");
        $updateStmt->execute(['password' => $hashed, 'user_id' => $emp['user_id']]);

        echo json_encode(['message' => 'Password changed successfully']);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['message' => $e->getMessage()]);
    }
});

Router::get('/api/me/profile', function() {
    $userId = Auth::authenticate();
    $db = Database::getConnection();

    $stmt = $db->prepare("SELECT id FROM employees WHERE user_id = :user_id AND deleted_at IS NULL");
    $stmt->execute(['user_id' => $userId]);
    $emp = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($emp) {
        // Mocking a redirect by changing URI and re-running the GET logic
        // For simplicity, returning just ID to let frontend fetch it, or doing internal redirect
        $_SERVER['REQUEST_METHOD'] = 'GET';
        Router::run('GET', '/api/employees/' . $emp['id']);
        exit;
    } else {
        http_response_code(404);
        echo json_encode(['message' => 'Employee profile not found for current user']);
    }
});

// ==========================================
// ATTENDANCE API
// ==========================================

function getLoggedInEmployeeId($userId, $db) {
    $stmt = $db->prepare("SELECT id FROM employees WHERE user_id = :uid AND deleted_at IS NULL");
    $stmt->execute(['uid' => $userId]);
    $id = $stmt->fetchColumn();
    if ($id) return $id;

    // Auto-link by email if missing (self-healing for seeded data)
    $userStmt = $db->prepare("SELECT email FROM users WHERE id = :uid");
    $userStmt->execute(['uid' => $userId]);
    $email = $userStmt->fetchColumn();

    if ($email) {
        $empStmt = $db->prepare("SELECT id FROM employees WHERE email = :email AND deleted_at IS NULL");
        $empStmt->execute(['email' => $email]);
        $empId = $empStmt->fetchColumn();
        if ($empId) {
            $update = $db->prepare("UPDATE employees SET user_id = :uid WHERE id = :eid");
            $update->execute(['uid' => $userId, 'eid' => $empId]);
            return $empId;
        }
    }

    return false;
}

Router::get('/api/attendance/today', function() {
    $userId = Auth::authenticate();
    $db = Database::getConnection();

    $empId = getLoggedInEmployeeId($userId, $db);
    if (!$empId) {
        http_response_code(404);
        echo json_encode(['message' => 'Employee profile not found']);
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

    if ($attendance) {
        $corrStmt = $db->prepare("
            SELECT ac.*, u.name as reviewer_name, u.email as reviewer_email
            FROM attendance_corrections ac
            LEFT JOIN users u ON ac.reviewed_by = u.id
            WHERE ac.attendance_id = :att_id
            ORDER BY ac.id DESC LIMIT 1
        ");
        $corrStmt->execute(['att_id' => $attendance['id']]);
        $correction = $corrStmt->fetch(PDO::FETCH_ASSOC);
        $attendance['correction_request'] = $correction ?: null;

        $todayStr = date('Y-m-d');
        $isPastSession = ($attendance['attendance_date'] < $todayStr && (!empty($attendance['check_in']) && date('Y-m-d', strtotime($attendance['check_in'])) < $todayStr));
        $attendance['requires_resolution'] = ($attendance['check_out'] === null && ($isPastSession || !empty($attendance['correction_request'])));
    }

    // Calculate organization-wide attendance stats for today
    $today = date('Y-m-d');

    // Total active employees
    $totalEmployees = (int)$db->query("SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL")->fetchColumn();

    // Distinct employees present today (either attendance_date = today, checked in today, or currently active session)
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

Router::post('/api/attendance/check-in', function() {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();

    $empId = getLoggedInEmployeeId($userId, $db);
    if (!$empId) {
        http_response_code(404);
        echo json_encode(['message' => 'Employee profile not found']);
        return;
    }

    // Prevent a second check-in while ANY earlier attendance session remains open
    $activeStmt = $db->prepare("
        SELECT * FROM attendances
        WHERE employee_id = :emp_id AND check_out IS NULL
        ORDER BY check_in DESC LIMIT 1
    ");
    $activeStmt->execute(['emp_id' => $empId]);
    $unresolvedSession = $activeStmt->fetch(PDO::FETCH_ASSOC);

    if ($unresolvedSession) {
        $corrStmt = $db->prepare("
            SELECT ac.*, u.name as reviewer_name, u.email as reviewer_email
            FROM attendance_corrections ac
            LEFT JOIN users u ON ac.reviewed_by = u.id
            WHERE ac.attendance_id = :att_id
            ORDER BY ac.id DESC LIMIT 1
        ");
        $corrStmt->execute(['att_id' => $unresolvedSession['id']]);
        $correction = $corrStmt->fetch(PDO::FETCH_ASSOC) ?: null;

        http_response_code(400);
        echo json_encode([
            'requires_resolution' => true,
            'message' => 'Previous attendance session requires checkout correction resolution before checking in again.',
            'unresolved_attendance' => $unresolvedSession,
            'correction_request' => $correction
        ]);
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
        $attendance = $db->query("SELECT * FROM attendances WHERE id = " . $lastId)->fetch(PDO::FETCH_ASSOC);
        echo json_encode(['message' => 'Checked in successfully', 'attendance' => $attendance]);
    } catch (\Throwable $e) {
        http_response_code(500);
        echo json_encode(['message' => 'DB Error: ' . $e->getMessage()]);
    }
});

Router::post('/api/attendance/check-out', function() {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();

    $empId = getLoggedInEmployeeId($userId, $db);
    if (!$empId) {
        http_response_code(404);
        echo json_encode(['message' => 'Employee profile not found']);
        return;
    }

    // Find active attendance record (any open session regardless of date or age)
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

    // Atomic update to calculate working_minutes and prevent concurrent check-out corruption
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

    $updatedAttendance = $db->query("SELECT * FROM attendances WHERE id = " . $attendance['id'])->fetch(PDO::FETCH_ASSOC);
    echo json_encode(['message' => 'Checked out successfully', 'attendance' => $updatedAttendance]);
});

$handleGetAttendanceList = function($forceMine = false) {
    $user = Auth::user();
    $db = Database::getConnection();

    $user_role = $user['role'] ?? '';
    $user_employee_id = !empty($user['employee_id']) ? (int)$user['employee_id'] : null;
    $userRoles = $user['roles'] ?? [];
    $is_admin = in_array($user_role, ['Super Admin', 'HR Admin', 'HR Executive'], true)
        || in_array('Super Admin', $userRoles, true)
        || in_array('HR Admin', $userRoles, true)
        || in_array('HR Executive', $userRoles, true);
    $is_payroll = $user_role === 'Finance/Payroll Admin' || in_array('Finance/Payroll Admin', $userRoles, true);
    $is_manager = (($user_role === 'Manager' || in_array('Manager', $userRoles, true)) && !empty($user_employee_id));

    $scope = $forceMine ? 'mine' : ($_GET['scope'] ?? null);
    $employee_id_filter = $_GET['employee_id'] ?? null;
    $start_date = $_GET['start_date'] ?? $_GET['date_from'] ?? null;
    $end_date = $_GET['end_date'] ?? $_GET['date_to'] ?? null;
    $status_filter = $_GET['status'] ?? null;

    $query = "
        SELECT a.*, e.first_name, e.last_name, e.employee_code
        FROM attendances a
        JOIN employees e ON a.employee_id = e.id
        WHERE 1=1
    ";
    $params = [];

    // RBAC & Scope Handling
    if ($scope === 'mine') {
        // "My Attendance History" for ALL roles: strictly current logged-in employee only
        if (empty($user_employee_id)) {
            echo json_encode(['data' => [], 'current_page' => 1, 'last_page' => 1, 'total' => 0]);
            return;
        }
        $query .= " AND a.employee_id = ?";
        $params[] = $user_employee_id;
    } else {
        // "All Attendance Directory" (or unscoped queries)
        if ($is_admin || $is_payroll) {
            if (!empty($employee_id_filter) && is_numeric($employee_id_filter)) {
                $query .= " AND a.employee_id = ?";
                $params[] = (int)$employee_id_filter;
            }
        } elseif ($is_manager) {
            $subordinateIds = function_exists('getEmployeeDescendantIds') 
                ? getEmployeeDescendantIds($db, $user_employee_id) 
                : (function_exists('getAttendanceSubtreeIds') ? getAttendanceSubtreeIds($db, $user_employee_id) : []);
            $allowedIds = array_merge([$user_employee_id], array_map('intval', $subordinateIds));

            if (!empty($employee_id_filter) && is_numeric($employee_id_filter)) {
                $target_id = (int)$employee_id_filter;
                if (in_array($target_id, $allowedIds, true)) {
                    $query .= " AND a.employee_id = ?";
                    $params[] = $target_id;
                } else {
                    http_response_code(403);
                    echo json_encode(['message' => 'Unauthorized access to requested employee attendance records.']);
                    return;
                }
            } else {
                $inList = implode(',', $allowedIds);
                $query .= " AND a.employee_id IN ($inList)";
            }
        } else {
            // Regular Employee has no organization-wide directory access; restricted to self only
            if (empty($user_employee_id)) {
                echo json_encode(['data' => [], 'current_page' => 1, 'last_page' => 1, 'total' => 0]);
                return;
            }
            if (!empty($employee_id_filter) && is_numeric($employee_id_filter) && (int)$employee_id_filter !== $user_employee_id) {
                http_response_code(403);
                echo json_encode(['message' => 'Unauthorized access to other employees attendance records.']);
                return;
            }
            $query .= " AND a.employee_id = ?";
            $params[] = $user_employee_id;
        }
    }

    if (!empty($start_date)) {
        $query .= " AND a.attendance_date >= ?";
        $params[] = $start_date;
    }

    if (!empty($end_date)) {
        $query .= " AND a.attendance_date <= ?";
        $params[] = $end_date;
    }

    if (!empty($status_filter)) {
        $query .= " AND a.status = ?";
        $params[] = $status_filter;
    }

    $query .= " ORDER BY a.attendance_date DESC, a.check_in DESC";

    $stmt = $db->prepare($query);
    $stmt->execute($params);
    $records = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Fetch latest correction requests for returned attendances
    $attIds = array_column($records, 'id');
    $correctionsMap = [];
    if (!empty($attIds)) {
        $inClause = implode(',', array_map('intval', $attIds));
        $cStmt = $db->query("
            SELECT ac.*, u.name as reviewer_name
            FROM attendance_corrections ac
            LEFT JOIN users u ON ac.reviewed_by = u.id
            WHERE ac.attendance_id IN ($inClause)
            ORDER BY ac.id ASC
        ");
        $allCorrections = $cStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($allCorrections as $cRow) {
            $correctionsMap[$cRow['attendance_id']] = $cRow;
        }
    }

    $data = [];
    foreach ($records as $row) {
        $row['employee'] = [
            'id' => $row['employee_id'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'employee_code' => $row['employee_code']
        ];
        $row['correction_request'] = $correctionsMap[$row['id']] ?? null;
        $row['correction_status'] = isset($correctionsMap[$row['id']]) ? $correctionsMap[$row['id']]['status'] : null;
        $data[] = $row;
    }

    echo json_encode([
        'data' => $data,
        'current_page' => 1,
        'last_page' => 1,
        'total' => count($data)
    ]);
};

Router::get('/api/attendance/mine', function() use ($handleGetAttendanceList) {
    $handleGetAttendanceList(true);
});

Router::get('/api/attendance', function() use ($handleGetAttendanceList) {
    $handleGetAttendanceList(false);
});

// ==========================================
// SHIFTS API
// ==========================================

Router::get('/api/shifts', function() {
    Auth::authenticate();
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
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("SELECT * FROM shifts WHERE id = :id");
    $stmt->execute(['id' => $id]);
    $shift = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($shift) echo json_encode($shift);
    else { http_response_code(404); echo json_encode(['message' => 'Not found']); }
});

Router::post('/api/shifts', function() {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    try {
        $stmt = $db->prepare("INSERT INTO shifts (name, start_time, end_time, is_active, description, created_at, updated_at) VALUES (:n, :st, :et, :ia, :d, NOW(), NOW())");
        $stmt->execute([
            'n' => $input['name'], 'st' => $input['start_time'], 'et' => $input['end_time'],
            'ia' => $input['is_active'] ?? 1, 'd' => $input['description'] ?? ''
        ]);
        echo json_encode(['message' => 'Shift created']);
    } catch(Exception $e) { http_response_code(400); echo json_encode(['message' => $e->getMessage()]); }
});

Router::put('/api/shifts/{id}', function($id) {
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    try {
        $stmt = $db->prepare("UPDATE shifts SET name = :n, start_time = :st, end_time = :et, is_active = :ia, description = :d, updated_at = NOW() WHERE id = :id");
        $stmt->execute([
            'n' => $input['name'], 'st' => $input['start_time'], 'et' => $input['end_time'],
            'ia' => $input['is_active'] ?? 1, 'd' => $input['description'] ?? '', 'id' => $id
        ]);
        echo json_encode(['message' => 'Shift updated']);
    } catch(Exception $e) { http_response_code(400); echo json_encode(['message' => $e->getMessage()]); }
});

Router::delete('/api/shifts/{id}', function($id) {
    Auth::authenticate();
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
    Auth::authenticate();
    global $input;
    $db = Database::getConnection();

    $shift_id = $input['shift_id'] ?? null;
    $stmt = $db->prepare("UPDATE employees SET shift_id = :sid WHERE id = :id");
    $stmt->execute(['sid' => $shift_id, 'id' => $id]);
    echo json_encode(['message' => 'Shift assigned successfully']);
});

Router::get('/api/employees/{id}/shift-rotations', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
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
    Auth::authenticate();
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

        // Also update the employee's current shift directly so check-in works instantly
        $updateEmp = $db->prepare("UPDATE employees SET shift_id = :sid WHERE id = :id");
        $updateEmp->execute(['sid' => $input['shift_id'], 'id' => $id]);

        echo json_encode(['message' => 'Rotation created and shift assigned']);
    } catch(Exception $e) {
        http_response_code(400);
        echo json_encode(['message' => $e->getMessage()]);
    }
});

Router::delete('/api/shift-rotations/{id}', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    $stmt = $db->prepare("DELETE FROM employee_shift_rotations WHERE id = :id");
    $stmt->execute(['id' => $id]);
    echo json_encode(['message' => 'Rotation deleted']);
});

// Include Leave Module Routes
require_once __DIR__ . '/routes_leave.php';

// Include Payroll Module Routes
require_once __DIR__ . '/routes_payroll.php';

// Include Reports Routes
require_once __DIR__ . '/routes_reports.php';

// Include Recruitment Routes
require_once __DIR__ . '/routes_recruitment.php';

// Include Performance Routes
require_once __DIR__ . '/routes_performance.php';
require_once __DIR__ . '/routes_training.php';
require_once __DIR__ . '/routes_projects.php';
require_once __DIR__ . '/routes_timesheets.php';
require_once __DIR__ . '/routes_assets.php';
require_once __DIR__ . '/routes_helpdesk.php';
require_once __DIR__ . '/routes_documents.php';
require_once __DIR__ . '/routes_holidays.php';
require_once __DIR__ . '/routes_audit_logs.php';
require_once __DIR__ . '/routes_security.php';
require_once __DIR__ . '/routes_onboarding.php';
require_once __DIR__ . '/routes_candidates_ai.php';
require_once __DIR__ . '/routes_attendance_corrections.php';
// Run the router
Router::run($_SERVER['REQUEST_METHOD'], $requestUri);
