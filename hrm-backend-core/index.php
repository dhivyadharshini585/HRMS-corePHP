<?php
error_reporting(0); // Prevent PHP errors/warnings from breaking JSON output

// Safe environment loading
$envPath = __DIR__ . '/.env';
$appEnv = [];
if (file_exists($envPath)) {
    $appEnv = @parse_ini_file($envPath) ?: [];
}

// Request logging (strictly gated behind explicit APP_DEBUG=true)
$appDebug = filter_var($appEnv['APP_DEBUG'] ?? getenv('APP_DEBUG') ?? false, FILTER_VALIDATE_BOOLEAN);
if ($appDebug) {
    file_put_contents(__DIR__ . '/global_req.log', date('Y-m-d H:i:s') . " - URI: " . $_SERVER['REQUEST_URI'] . " Method: " . $_SERVER['REQUEST_METHOD'] . "\n", FILE_APPEND);
}

date_default_timezone_set('Asia/Kolkata');


// CORS Hardening: Explicit matching against configured allowed origins
$rawConfiguredOrigin = trim($appEnv['CORS_ALLOWED_ORIGIN'] ?? getenv('CORS_ALLOWED_ORIGIN') ?: 'http://localhost:5174,http://localhost:5173');
$allowedOrigins = array_filter(array_map('trim', explode(',', $rawConfiguredOrigin)));
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($requestOrigin && in_array($requestOrigin, $allowedOrigins, true)) {
    header("Access-Control-Allow-Origin: $requestOrigin");
}
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
        if ($token === false) {
            http_response_code(500);
            echo json_encode(['error' => 'Authentication service configuration error']);
            exit();
        }

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

// Helper function to create user credentials and assign role to an employee
function createEmployeeUserCredentials($db, $employeeId, $password, $requestedRole, $caller) {
    $callerRoles = $caller['roles'] ?? [];
    $isSuperAdmin = in_array('Super Admin', $callerRoles, true);
    $isHrAdmin = in_array('HR Admin', $callerRoles, true);

    if (!$isSuperAdmin && !$isHrAdmin) {
        throw new Exception("Unauthorized: Only Super Admin or HR Admin can create login accounts.", 403);
    }

    if (strlen($password) < 8) {
        throw new Exception("Password must be at least 8 characters.", 400);
    }

    $requestedRole = trim($requestedRole ?: 'Employee');
    if ($requestedRole === '') {
        $requestedRole = 'Employee';
    }

    // Role validation from database
    $roleStmt = $db->prepare("SELECT id, name FROM roles WHERE name = :name LIMIT 1");
    $roleStmt->execute(['name' => $requestedRole]);
    $roleRow = $roleStmt->fetch(PDO::FETCH_ASSOC);

    if (!$roleRow) {
        throw new Exception("Invalid role specified: '{$requestedRole}'.", 400);
    }

    // Authorization check: Only Super Admin can grant Super Admin
    if ($requestedRole === 'Super Admin' && !$isSuperAdmin) {
        throw new Exception("Unauthorized: Only Super Admin can assign the Super Admin role.", 403);
    }

    $empStmt = $db->prepare("SELECT id, first_name, last_name, email, user_id FROM employees WHERE id = :id AND deleted_at IS NULL");
    $empStmt->execute(['id' => $employeeId]);
    $emp = $empStmt->fetch(PDO::FETCH_ASSOC);

    if (!$emp) {
        throw new Exception("Employee not found", 404);
    }

    if (!empty($emp['user_id'])) {
        throw new Exception("This employee already has a linked login account.", 400);
    }

    if (empty($emp['email'])) {
        throw new Exception("Employee must have an email address to create a login account.", 400);
    }

    // Check duplicate email in users
    $checkEmail = $db->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
    $checkEmail->execute(['email' => $emp['email']]);
    if ($checkEmail->fetch()) {
        throw new Exception("A user account with email '{$emp['email']}' already exists.", 400);
    }

    $hashed = password_hash($password, PASSWORD_BCRYPT);
    $userName = trim(($emp['first_name'] ?? '') . ' ' . ($emp['last_name'] ?? ''));
    if ($userName === '') {
        $userName = $requestedRole . ' User';
    }

    $userStmt = $db->prepare("INSERT INTO users (name, email, password, created_at, updated_at) VALUES (:name, :email, :password, NOW(), NOW())");
    $userStmt->execute([
        'name' => $userName,
        'email' => $emp['email'],
        'password' => $hashed
    ]);

    $userId = $db->lastInsertId();

    // Assign role in model_has_roles
    $assignStmt = $db->prepare("
        INSERT INTO model_has_roles (role_id, model_type, model_id)
        VALUES (:role_id, :model_type, :model_id)
    ");
    $assignStmt->execute([
        'role_id' => $roleRow['id'],
        'model_type' => 'App\Models\User',
        'model_id' => $userId
    ]);

    $updateEmp = $db->prepare("UPDATE employees SET user_id = :user_id, updated_at = NOW() WHERE id = :id");
    $updateEmp->execute(['user_id' => $userId, 'id' => $employeeId]);

    return [
        'user_id' => $userId,
        'email' => $emp['email'],
        'role' => $roleRow['name']
    ];
}

Router::post('/api/employees', function() {
    $caller = Auth::user();
    global $input;
    $db = Database::getConnection();

    $createCreds = !empty($input['create_credentials']);
    $password = $input['password'] ?? '';
    $requestedRole = $input['role'] ?? 'Employee';

    // Validate inputs
    $email = trim($input['email'] ?? '');
    if ($email === '') {
        http_response_code(400);
        echo json_encode(['message' => 'Email address is required.']);
        return;
    }

    try {
        $db->beginTransaction();

        // Check if employee with same email already exists (active)
        $checkEmp = $db->prepare("SELECT id FROM employees WHERE email = :email AND deleted_at IS NULL LIMIT 1");
        $checkEmp->execute(['email' => $email]);
        if ($checkEmp->fetch()) {
            throw new Exception("An employee with email '{$email}' already exists.", 400);
        }

        $stmt = $db->prepare("
            INSERT INTO employees (
                employee_code, first_name, last_name, email, phone, gender,
                date_of_birth, date_of_joining, department_id, designation_id,
                job_level, manager_id, employment_type, employment_status,
                work_location, work_shift, address, city, state, country,
                postal_code, emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
                created_at, updated_at
            ) VALUES (
                :employee_code, :first_name, :last_name, :email, :phone, :gender,
                :date_of_birth, :date_of_joining, :department_id, :designation_id,
                :job_level, :manager_id, :employment_type, :employment_status,
                :work_location, :work_shift, :address, :city, :state, :country,
                :postal_code, :emergency_contact_name, :emergency_contact_relationship, :emergency_contact_phone,
                NOW(), NOW()
            )
        ");

        $stmt->execute([
            'employee_code' => !empty($input['employee_code']) ? $input['employee_code'] : null,
            'first_name' => $input['first_name'] ?? null,
            'last_name' => $input['last_name'] ?? null,
            'email' => $email,
            'phone' => $input['phone'] ?? null,
            'gender' => $input['gender'] ?? null,
            'date_of_birth' => !empty($input['date_of_birth']) ? $input['date_of_birth'] : null,
            'date_of_joining' => !empty($input['date_of_joining']) ? $input['date_of_joining'] : date('Y-m-d'),
            'department_id' => !empty($input['department_id']) ? $input['department_id'] : null,
            'designation_id' => !empty($input['designation_id']) ? $input['designation_id'] : null,
            'job_level' => $input['job_level'] ?? 'Mid-Level',
            'manager_id' => !empty($input['manager_id']) ? $input['manager_id'] : null,
            'employment_type' => $input['employment_type'] ?? 'Full-time',
            'employment_status' => $input['employment_status'] ?? 'Active',
            'work_location' => $input['work_location'] ?? 'Headquarters',
            'work_shift' => $input['work_shift'] ?? 'Day Shift (9 AM - 5 PM)',
            'address' => $input['address'] ?? null,
            'city' => $input['city'] ?? null,
            'state' => $input['state'] ?? null,
            'country' => $input['country'] ?? null,
            'postal_code' => $input['postal_code'] ?? null,
            'emergency_contact_name' => $input['emergency_contact_name'] ?? null,
            'emergency_contact_relationship' => $input['emergency_contact_relationship'] ?? null,
            'emergency_contact_phone' => $input['emergency_contact_phone'] ?? null,
        ]);

        $employeeId = $db->lastInsertId();

        $credResult = null;
        if ($createCreds) {
            $credResult = createEmployeeUserCredentials($db, $employeeId, $password, $requestedRole, $caller);
        }

        $db->commit();

        $response = [
            'message' => 'Employee created successfully',
            'id' => $employeeId
        ];
        if ($credResult) {
            $response['user'] = $credResult;
        }

        echo json_encode($response);
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $code = $e->getCode();
        http_response_code(($code >= 400 && $code < 600) ? $code : 400);
        echo json_encode(['message' => $e->getMessage()]);
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
                designation_id = :designation_id, job_level = :job_level, manager_id = :manager_id,
                employment_type = :employment_type, employment_status = :employment_status,
                work_location = :work_location, work_shift = :work_shift, address = :address,
                city = :city, state = :state, country = :country, postal_code = :postal_code,
                emergency_contact_name = :emergency_contact_name,
                emergency_contact_relationship = :emergency_contact_relationship,
                emergency_contact_phone = :emergency_contact_phone,
                updated_at = NOW()
            WHERE id = :id
        ");
        $stmt->execute([
            'id' => $id,
            'employee_code' => !empty($input['employee_code']) ? $input['employee_code'] : null,
            'first_name' => $input['first_name'] ?? null,
            'last_name' => $input['last_name'] ?? null,
            'email' => $input['email'] ?? null,
            'phone' => $input['phone'] ?? null,
            'gender' => $input['gender'] ?? null,
            'date_of_birth' => !empty($input['date_of_birth']) ? $input['date_of_birth'] : null,
            'date_of_joining' => !empty($input['date_of_joining']) ? $input['date_of_joining'] : date('Y-m-d'),
            'department_id' => !empty($input['department_id']) ? $input['department_id'] : null,
            'designation_id' => !empty($input['designation_id']) ? $input['designation_id'] : null,
            'job_level' => $input['job_level'] ?? 'Mid-Level',
            'manager_id' => !empty($input['manager_id']) ? $input['manager_id'] : null,
            'employment_type' => $input['employment_type'] ?? 'Full-time',
            'employment_status' => $input['employment_status'] ?? 'Active',
            'work_location' => $input['work_location'] ?? 'Headquarters',
            'work_shift' => $input['work_shift'] ?? 'Day Shift (9 AM - 5 PM)',
            'address' => $input['address'] ?? null,
            'city' => $input['city'] ?? null,
            'state' => $input['state'] ?? null,
            'country' => $input['country'] ?? null,
            'postal_code' => $input['postal_code'] ?? null,
            'emergency_contact_name' => $input['emergency_contact_name'] ?? null,
            'emergency_contact_relationship' => $input['emergency_contact_relationship'] ?? null,
            'emergency_contact_phone' => $input['emergency_contact_phone'] ?? null,
        ]);
        echo json_encode(['message' => 'Employee updated successfully']);
    } catch (PDOException $e) {
        http_response_code(400);
        echo json_encode(['message' => $e->getMessage()]);
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
    $caller = Auth::user();
    global $input;
    $db = Database::getConnection();

    $password = $input['password'] ?? '';
    $requestedRole = $input['role'] ?? 'Employee';

    try {
        $db->beginTransaction();
        $credResult = createEmployeeUserCredentials($db, $id, $password, $requestedRole, $caller);
        $db->commit();

        echo json_encode([
            'message' => 'Credentials created successfully',
            'user_id' => $credResult['user_id'],
            'email' => $credResult['email'],
            'role' => $credResult['role']
        ]);
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $code = $e->getCode();
        http_response_code(($code >= 400 && $code < 600) ? $code : 400);
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

// Include Module Routes
require_once __DIR__ . '/routes_leave.php';
require_once __DIR__ . '/routes_payroll.php';
require_once __DIR__ . '/routes_reports.php';
require_once __DIR__ . '/routes_recruitment.php';
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
require_once __DIR__ . '/routes_notifications.php';
require_once __DIR__ . '/routes_attendance.php';
require_once __DIR__ . '/routes_organization.php';
require_once __DIR__ . '/routes_team_requests.php';

// Run the router
Router::run($_SERVER['REQUEST_METHOD'], $requestUri);

