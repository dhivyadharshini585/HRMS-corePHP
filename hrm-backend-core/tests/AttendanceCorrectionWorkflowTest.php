<?php
/**
 * PORTABLE & ISOLATED ATTENDANCE CORRECTION WORKFLOW TEST SUITE
 * 
 * Safety & Isolation Policy:
 * 1. This test suite REQUIRES an explicitly designated test database via the environment
 *    variable `HRMS_TEST_DB_NAME` (e.g. `export HRMS_TEST_DB_NAME=hrms_backend_test`).
 * 2. It refuses to execute if `HRMS_TEST_DB_NAME` is missing or matches the development database.
 * 3. It injects the isolated connection into both parent and child subprocesses via Reflection,
 *    ensuring zero modifications to core/Database.php.
 * 4. All paths are resolved dynamically relative to __DIR__ and sys_get_temp_dir().
 * 5. Fixtures are resolved dynamically by role rather than fixed primary key IDs.
 * 6. Teardown strictly removes records created during the run in reverse order.
 */

declare(strict_types=1);

// -------------------------------------------------------------------------
// 1. Path Resolution & Environment Discovery
// -------------------------------------------------------------------------
$backendDir = dirname(__DIR__);
$repoDir = dirname($backendDir);

// Safety: Ensure required core files exist
$routerFile = "$backendDir/core/Router.php";
$dbFile = "$backendDir/core/Database.php";
$authFile = "$backendDir/core/Auth.php";
$orgRouteFile = "$backendDir/routes_organization.php";
$corrRouteFile = "$backendDir/routes_attendance_corrections.php";
$envFile = "$backendDir/.env";

foreach ([$routerFile, $dbFile, $authFile, $orgRouteFile, $corrRouteFile] as $file) {
    if (!file_exists($file)) {
        fwrite(STDERR, "FATAL: Required application file not found: $file\n");
        exit(1);
    }
}

// -------------------------------------------------------------------------
// 2. Strict Database Isolation Guard
// -------------------------------------------------------------------------
$testDbName = getenv('HRMS_TEST_DB_NAME');
if (!$testDbName || trim($testDbName) === '') {
    $testDbName = getenv('TEST_DB_DATABASE');
}

$devEnv = file_exists($envFile) ? @parse_ini_file($envFile) : [];
$devDbName = $devEnv['DB_DATABASE'] ?? 'hrms_backend';

if (!$testDbName || trim($testDbName) === '') {
    echo "====================================================================\n";
    echo "FATAL: ISOLATED TEST DATABASE NOT CONFIGURED\n";
    echo "====================================================================\n";
    echo "Refusing to execute tests against application default database.\n";
    echo "To run this suite safely, you must explicitly set the environment variable:\n";
    echo "  Windows PowerShell:  \$env:HRMS_TEST_DB_NAME = 'hrms_backend_test'\n";
    echo "  Linux/macOS Bash:    export HRMS_TEST_DB_NAME='hrms_backend_test'\n\n";
    echo "Execution halted to preserve development and production database safety.\n";
    exit(1);
}

if (strcasecmp($testDbName, $devDbName) === 0) {
    echo "====================================================================\n";
    echo "FATAL: DANGEROUS DATABASE CONFIGURATION DETECTED\n";
    echo "====================================================================\n";
    echo "The designated test database ('$testDbName') matches the active\n";
    echo "development/production database in .env ('$devDbName').\n";
    echo "Refusing to execute tests against active application database.\n";
    exit(1);
}

if (stripos($testDbName, 'test') === false) {
    echo "====================================================================\n";
    echo "FATAL: UNSAFE TEST DATABASE NAME\n";
    echo "====================================================================\n";
    echo "The designated test database ('$testDbName') must contain 'test' in its name.\n";
    exit(1);
}

// Connection parameters for test database
$dbHost = getenv('HRMS_TEST_DB_HOST') ?: ($devEnv['DB_HOST'] ?? '127.0.0.1');
$dbPort = getenv('HRMS_TEST_DB_PORT') ?: ($devEnv['DB_PORT'] ?? '3306');
$dbUser = getenv('HRMS_TEST_DB_USERNAME') ?: ($devEnv['DB_USERNAME'] ?? 'root');
$dbPass = getenv('HRMS_TEST_DB_PASSWORD') ?: ($devEnv['DB_PASSWORD'] ?? '');

$dsn = "mysql:host=$dbHost;port=$dbPort;dbname=$testDbName;charset=utf8mb4";

try {
    $db = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
    ]);
} catch (\PDOException $e) {
    echo "====================================================================\n";
    echo "FATAL: UNABLE TO CONNECT TO ISOLATED TEST DATABASE\n";
    echo "====================================================================\n";
    echo "Error: " . $e->getMessage() . "\n";
    echo "Please ensure the test database '$testDbName' is created and accessible.\n";
    exit(1);
}

// Verify active database on connection
$connectedDb = (string)$db->query("SELECT DATABASE()")->fetchColumn();
if (strcasecmp($connectedDb, $testDbName) !== 0) {
    fwrite(STDERR, "FATAL: Connected database ($connectedDb) does not match designated test database ($testDbName).\n");
    exit(1);
}

// Inject and strictly verify test connection via TestConnectionBridge
require_once __DIR__ . '/TestConnectionBridge.php';
TestConnectionBridge::injectAndVerify($db, $testDbName);

require_once $authFile;
require_once $orgRouteFile;

echo "====================================================================\n";
echo "=== ATTENDANCE CORRECTION WORKFLOW REGRESSION SUITE ===\n";
echo "=== Target Database: $testDbName (ISOLATED) ===\n";
echo "====================================================================\n\n";

$passCount = 0;
$failCount = 0;

function assertTest($condition, string $name, string $detail = ''): void {
    global $passCount, $failCount;
    if ($condition) {
        echo " [PASS] $name\n";
        $passCount++;
    } else {
        echo " [FAIL] $name" . ($detail ? " ($detail)" : "") . "\n";
        $failCount++;
    }
}

// -------------------------------------------------------------------------
// 3. Dynamic Test Fixture Discovery
// -------------------------------------------------------------------------
echo "--- 1. Discovering Test Identities Dynamically ---\n";

// 1. Dedicated HR User (HR Admin)
$hrAdminStmt = $db->query("
    SELECT u.id AS user_id, e.id AS employee_id 
    FROM users u
    JOIN model_has_roles mhr ON mhr.model_id = u.id AND mhr.model_type = 'App\\\\Models\\\\User'
    JOIN roles r ON mhr.role_id = r.id AND r.name = 'HR Admin'
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE e.deleted_at IS NULL
    LIMIT 1
");
$hrAdminFixture = $hrAdminStmt->fetch(PDO::FETCH_ASSOC);
if (!$hrAdminFixture || empty($hrAdminFixture['user_id'])) {
    fwrite(STDERR, "BLOCKED: No active user with 'HR Admin' role found in test database.\n");
    exit(1);
}
$hrAdminUserId = (int)$hrAdminFixture['user_id'];
$hrAdminEmpId = (int)$hrAdminFixture['employee_id'];

// 2. Super Admin
$superAdminStmt = $db->query("
    SELECT u.id AS user_id, e.id AS employee_id 
    FROM users u
    JOIN model_has_roles mhr ON mhr.model_id = u.id AND mhr.model_type = 'App\\\\Models\\\\User'
    JOIN roles r ON mhr.role_id = r.id AND r.name = 'Super Admin'
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE e.deleted_at IS NULL
    LIMIT 1
");
$superAdminFixture = $superAdminStmt->fetch(PDO::FETCH_ASSOC);
if (!$superAdminFixture || empty($superAdminFixture['user_id'])) {
    fwrite(STDERR, "BLOCKED: No active user with 'Super Admin' role found in test database.\n");
    exit(1);
}
$hrUserId = (int)$superAdminFixture['user_id'];

// 3. Manager (has Manager role, non-null manager_id, has reporting subordinates)
$mgrStmt = $db->query("
    SELECT e.id AS employee_id, e.user_id, e.manager_id 
    FROM employees e
    JOIN model_has_roles mhr ON mhr.model_id = e.user_id AND mhr.model_type = 'App\\\\Models\\\\User'
    JOIN roles r ON mhr.role_id = r.id AND r.name = 'Manager'
    WHERE e.manager_id IS NOT NULL 
      AND e.deleted_at IS NULL
      AND EXISTS (SELECT 1 FROM employees sub WHERE sub.manager_id = e.id AND sub.deleted_at IS NULL)
    LIMIT 1
");
$mgrFixture = $mgrStmt->fetch(PDO::FETCH_ASSOC);
if (!$mgrFixture || empty($mgrFixture['user_id'])) {
    fwrite(STDERR, "BLOCKED: No active Manager with non-null manager_id and subordinates found in test database.\n");
    exit(1);
}
$managerEmpId = (int)$mgrFixture['employee_id'];
$managerUserId = (int)$mgrFixture['user_id'];

// 4. Ordinary employee reporting to that manager
$ordEmpStmt = $db->prepare("
    SELECT e.id AS employee_id, e.user_id, e.manager_id 
    FROM employees e
    WHERE e.manager_id = :manager_emp_id
      AND e.deleted_at IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM model_has_roles mhr 
          JOIN roles r ON mhr.role_id = r.id 
          WHERE mhr.model_id = e.user_id AND r.name IN ('Manager', 'HR Admin', 'HR Executive', 'Super Admin')
      )
      AND NOT EXISTS (SELECT 1 FROM employees sub WHERE sub.manager_id = e.id AND sub.deleted_at IS NULL)
    LIMIT 1
");
$ordEmpStmt->execute(['manager_emp_id' => $managerEmpId]);
$ordEmpFixture = $ordEmpStmt->fetch(PDO::FETCH_ASSOC);
if (!$ordEmpFixture || empty($ordEmpFixture['user_id'])) {
    fwrite(STDERR, "BLOCKED: No ordinary employee reporting to Manager $managerEmpId found in test database.\n");
    exit(1);
}
$targetEmpId = (int)$ordEmpFixture['employee_id'];
$targetUserId = (int)$ordEmpFixture['user_id'];

// 5. Unrelated Peer (Finance/Payroll Admin)
$peerStmt = $db->query("
    SELECT u.id AS user_id, e.id AS employee_id 
    FROM users u
    JOIN model_has_roles mhr ON mhr.model_id = u.id AND mhr.model_type = 'App\\\\Models\\\\User'
    JOIN roles r ON mhr.role_id = r.id AND r.name = 'Finance/Payroll Admin'
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE e.deleted_at IS NULL
    LIMIT 1
");
$peerFixture = $peerStmt->fetch(PDO::FETCH_ASSOC);
if (!$peerFixture || empty($peerFixture['user_id'])) {
    fwrite(STDERR, "BLOCKED: No user with 'Finance/Payroll Admin' role found in test database.\n");
    exit(1);
}
$peerUserId = (int)$peerFixture['user_id'];
$peerEmpId = (int)$peerFixture['employee_id'];

echo " - Discovered HR Admin: User $hrAdminUserId, Emp $hrAdminEmpId\n";
echo " - Discovered Super Admin: User $hrUserId\n";
echo " - Discovered Manager: User $managerUserId, Emp $managerEmpId (reports to Emp {$mgrFixture['manager_id']})\n";
echo " - Discovered Ordinary Employee: User $targetUserId, Emp $targetEmpId (reports to Emp $managerEmpId)\n";
echo " - Discovered Peer/Payroll Admin: User $peerUserId, Emp $peerEmpId\n";

// Helper to simulate request via clean sub-process execution
function callEndpoint(string $method, string $uri, ?int $userId, array $payload = []): array {
    global $backendDir, $dbHost, $dbPort, $testDbName, $dbUser, $dbPass;

    $phpExe = defined('PHP_BINARY') && PHP_BINARY ? PHP_BINARY : 'php';
    $tmpDir = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'hrms_suite_runners';
    if (!is_dir($tmpDir)) {
        @mkdir($tmpDir, 0777, true);
    }
    $script = $tmpDir . DIRECTORY_SEPARATOR . 'run_' . uniqid('', true) . '.php';

    $token = $userId !== null ? Auth::generateToken($userId) : null;
    $authLine = $token !== null 
        ? '$_SERVER["HTTP_AUTHORIZATION"] = "Bearer ' . $token . '";' 
        : 'unset($_SERVER["HTTP_AUTHORIZATION"]);';

    $dbConfigExport = var_export([
        'dsn' => "mysql:host=$dbHost;port=$dbPort;dbname=$testDbName;charset=utf8mb4",
        'user' => $dbUser,
        'pass' => $dbPass,
        'expected_db' => $testDbName
    ], true);

    $payloadExport = var_export($payload, true);

    $code = '<?php
        $_SERVER["REQUEST_METHOD"] = ' . var_export($method, true) . ';
        $_SERVER["REQUEST_URI"] = ' . var_export($uri, true) . ';
        ' . $authLine . '
        $input = ' . $payloadExport . ';

        // 1. Enforce test database connection in subprocess
        $cfg = ' . $dbConfigExport . ';
        $subDb = new PDO($cfg["dsn"], $cfg["user"], $cfg["pass"], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
        ]);
        if (strcasecmp((string)$subDb->query("SELECT DATABASE()")->fetchColumn(), $cfg["expected_db"]) !== 0) {
            http_response_code(500);
            echo json_encode(["error" => "Subprocess connected to unauthorized database."]);
            exit;
        }

        require_once ' . var_export(__DIR__ . '/TestConnectionBridge.php', true) . ';
        TestConnectionBridge::injectAndVerify($subDb, $cfg["expected_db"]);

        require ' . var_export("$backendDir/core/Router.php", true) . ';

        require ' . var_export("$backendDir/core/Auth.php", true) . ';
        require ' . var_export("$backendDir/routes_organization.php", true) . ';
        require ' . var_export("$backendDir/routes_attendance.php", true) . ';
        require ' . var_export("$backendDir/routes_attendance_corrections.php", true) . ';

        $rawUri = ' . var_export($uri, true) . ';
        $parsedUri = parse_url($rawUri);
        $routePath = $parsedUri["path"] ?? $rawUri;
        if (!empty($parsedUri["query"])) {
            parse_str($parsedUri["query"], $_GET);
        }

        if ($routePath === "/api/login" || $routePath === "/api/user") {
            require ' . var_export("$backendDir/index.php", true) . ';
            exit;
        }

        Router::run(' . var_export($method, true) . ', $routePath);
    ';

    file_put_contents($script, $code);

    try {
        $cmd = escapeshellarg($phpExe) . ' ' . escapeshellarg($script);
        $output = shell_exec($cmd);
    } finally {
        if (file_exists($script)) {
            @unlink($script);
        }
    }

    $json = json_decode((string)$output, true);
    return is_array($json) ? $json : ['raw' => $output];
}

// -------------------------------------------------------------------------
// 4. Integration Tests with Cleanup Tracking
// -------------------------------------------------------------------------
$createdAttIds = [];
$createdCorrIds = [];
$createdUserIds = [];
$createdEmpIds = [];

try {
    // -------------------------------------------------------------------------
    // TEST A: Self-action prevention for Ordinary Employee
    // -------------------------------------------------------------------------
    echo "\n--- 2. Testing Strict Self-Action Prevention (Ordinary Employee) ---\n";
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($targetEmpId, '2026-10-15', '2026-10-15 10:00:00', '2026-10-15 17:00:00', 420, 'Present', NOW(), NOW())
    ");
    $att1 = (int)$db->lastInsertId();
    $createdAttIds[] = $att1;

    // Submitter creates correction
    $sub1 = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $att1,
        'requested_check_in' => '2026-10-15 09:00:00',
        'requested_check_out' => '2026-10-15 18:00:00',
        'reason' => 'Testing self-action prevention'
    ]);
    assertTest(isset($sub1['data']['id']), "Correction 1 created successfully by target employee");
    $corr1 = $sub1['data']['id'] ?? null;
    if ($corr1) $createdCorrIds[] = $corr1;

    // Submitter attempts self-approval
    $selfApp = callEndpoint('PUT', "/api/attendance/corrections/$corr1/approve", $targetUserId, [
        'remarks' => 'Self-approving my own request'
    ]);
    assertTest(isset($selfApp['error']) && strpos($selfApp['error'], 'cannot approve your own') !== false, 
        "Submitter self-approval is blocked with 403 Forbidden");

    // Submitter attempts self-rejection
    $selfRej = callEndpoint('PUT', "/api/attendance/corrections/$corr1/reject", $targetUserId, [
        'remarks' => 'Self-rejecting my own request'
    ]);
    assertTest(isset($selfRej['error']) && strpos($selfRej['error'], 'cannot reject your own') !== false, 
        "Submitter self-rejection is blocked with 403 Forbidden");

    // Submitter attempts self-escalation
    $selfEsc = callEndpoint('PUT', "/api/attendance/corrections/$corr1/escalate", $targetUserId, [
        'escalation_reason' => 'Self-escalating my own request'
    ]);
    assertTest(isset($selfEsc['error']) && strpos($selfEsc['error'], 'cannot escalate your own') !== false, 
        "Submitter self-escalation is blocked with 403 Forbidden");

    // -------------------------------------------------------------------------
    // TEST B: Unauthorized roles (Peer, Finance Admin, HR escalation)
    // -------------------------------------------------------------------------
    echo "\n--- 3. Testing Unauthorized Roles & Escalation Restrictions ---\n";
    // Peer attempts approval
    $peerApp = callEndpoint('PUT', "/api/attendance/corrections/$corr1/approve", $peerUserId, [
        'remarks' => 'Peer approving'
    ]);
    assertTest(isset($peerApp['error']) && strpos($peerApp['error'], 'Forbidden') !== false, 
        "Unrelated peer/Finance Admin cannot approve correction (403 Forbidden)");

    // Peer attempts escalation
    $peerEsc = callEndpoint('PUT', "/api/attendance/corrections/$corr1/escalate", $peerUserId, [
        'escalation_reason' => 'Peer escalating'
    ]);
    assertTest(isset($peerEsc['error']) && strpos($peerEsc['error'], 'Forbidden') !== false, 
        "Unrelated peer/Finance Admin cannot escalate correction (403 Forbidden)");

    // HR attempts escalation (HR cannot escalate, only manager can)
    $hrEsc = callEndpoint('PUT', "/api/attendance/corrections/$corr1/escalate", $hrUserId, [
        'escalation_reason' => 'HR attempting escalation'
    ]);
    assertTest(isset($hrEsc['error']) && strpos($hrEsc['error'], 'Only the employee\'s reporting manager') !== false, 
        "HR reviewer cannot escalate request (Only reporting manager can escalate)");

    // -------------------------------------------------------------------------
    // TEST C: Manager Escalation Workflow
    // -------------------------------------------------------------------------
    echo "\n--- 4. Testing Manager Escalation Workflow ---\n";
    // Escalation without reason fails 400
    $escFail = callEndpoint('PUT', "/api/attendance/corrections/$corr1/escalate", $managerUserId, [
        'escalation_reason' => 'bad'
    ]);
    assertTest(isset($escFail['error']) && strpos($escFail['error'], 'between 5 and 2000') !== false, 
        "Escalation fails when reason is under 5 characters (400 Bad Request)");

    // Reporting Manager escalates with valid reason
    $escSuccess = callEndpoint('PUT', "/api/attendance/corrections/$corr1/escalate", $managerUserId, [
        'escalation_reason' => 'Total shift duration exceeds standard bounds; policy exception required.'
    ]);
    assertTest(isset($escSuccess['data']['status']) && $escSuccess['data']['status'] === 'Escalated', 
        "Reporting manager escalates pending request to HR queue (200 OK)");

    // Verify history event created for escalation
    $escHist = $db->query("SELECT * FROM attendance_correction_history WHERE correction_id = $corr1 AND action = 'escalated'")->fetch(PDO::FETCH_ASSOC);
    assertTest(!empty($escHist) && $escHist['from_status'] === 'Pending' && $escHist['to_status'] === 'Escalated', 
        "Escalation history event written atomically with from_status='Pending' and to_status='Escalated'");

    // Live attendances table remains untouched on escalation
    $liveAtt1 = $db->query("SELECT * FROM attendances WHERE id = $att1")->fetch(PDO::FETCH_ASSOC);
    assertTest($liveAtt1['check_in'] === '2026-10-15 10:00:00' && (int)$liveAtt1['working_minutes'] === 420, 
        "Live attendances record remains completely unchanged during escalation");

    // Manager cannot act on already escalated request
    $mgrPostEsc = callEndpoint('PUT', "/api/attendance/corrections/$corr1/approve", $managerUserId, [
        'remarks' => 'Manager trying to approve escalated request'
    ]);
    assertTest(isset($mgrPostEsc['error']) && strpos($mgrPostEsc['error'], 'Only authorized HR reviewers') !== false, 
        "Manager cannot approve request once escalated to HR queue (403 Forbidden)");

    // Duplicate escalation fails 409
    $dupEsc = callEndpoint('PUT', "/api/attendance/corrections/$corr1/escalate", $managerUserId, [
        'escalation_reason' => 'Attempting duplicate escalation'
    ]);
    assertTest(isset($dupEsc['error']) && strpos($dupEsc['error'], 'already escalated') !== false, 
        "Duplicate escalation rejected with 409 Conflict");

    // -------------------------------------------------------------------------
    // TEST D: HR Approval of Escalated Request (Updates Attendances & Working Hours)
    // -------------------------------------------------------------------------
    echo "\n--- 5. Testing HR Approval of Escalated Request ---\n";
    // Attempt approval with invalid interval (effective check_out <= check_in) fails 400
    $invApp = callEndpoint('PUT', "/api/attendance/corrections/$corr1/approve", $hrUserId, [
        'approved_check_out' => '2026-10-15 08:30:00'
    ]);
    assertTest(isset($invApp['error']) && strpos($invApp['error'], 'chronologically after') !== false, 
        "Approval rejected with 400 Bad Request when effective timestamps form invalid interval");

    $hrApp = callEndpoint('PUT', "/api/attendance/corrections/$corr1/approve", $hrUserId, [
        'remarks' => 'HR policy exception granted after executive verification.'
    ]);
    assertTest(isset($hrApp['data']['status']) && $hrApp['data']['status'] === 'Approved', 
        "HR Reviewer successfully approves escalated correction (200 OK)");
    assertTest((float)$hrApp['data']['working_hours'] === 9.00 && $hrApp['data']['attendance_status'] === 'Present', 
        "Working hours recalculated accurately to 9.00 hours and status set to Present");

    // Verify attendances table was updated live
    $liveAtt1After = $db->query("SELECT * FROM attendances WHERE id = $att1")->fetch(PDO::FETCH_ASSOC);
    assertTest($liveAtt1After['check_in'] === '2026-10-15 09:00:00' && $liveAtt1After['check_out'] === '2026-10-15 18:00:00' && (int)$liveAtt1After['working_minutes'] === 540, 
        "Live attendances table updated atomically with approved check_in, check_out, and working_minutes (540 min = 9.00 hr)");

    // Verify history event created for approval
    $appHist = $db->query("SELECT * FROM attendance_correction_history WHERE correction_id = $corr1 AND action = 'approved'")->fetch(PDO::FETCH_ASSOC);
    assertTest(!empty($appHist) && $appHist['from_status'] === 'Escalated' && $appHist['to_status'] === 'Approved', 
        "Approval history event written atomically with from_status='Escalated' and to_status='Approved'");

    // -------------------------------------------------------------------------
    // TEST E: Finalized Approved Request is Immutable (Terminal State)
    // -------------------------------------------------------------------------
    echo "\n--- 6. Testing Terminal State Immutability ---\n";
    $postFinalRej = callEndpoint('PUT', "/api/attendance/corrections/$corr1/reject", $hrUserId, [
        'remarks' => 'Trying to reject already approved request'
    ]);
    assertTest(isset($postFinalRej['error']) && strpos($postFinalRej['error'], 'already been finalized') !== false, 
        "Approved request is immutable; cannot be rejected (409 Conflict)");

    $postFinalEsc = callEndpoint('PUT', "/api/attendance/corrections/$corr1/escalate", $managerUserId, [
        'escalation_reason' => 'Trying to escalate finalized request'
    ]);
    assertTest(isset($postFinalEsc['error']) && strpos($postFinalEsc['error'], 'already been finalized') !== false, 
        "Approved request is immutable; cannot be escalated (409 Conflict)");

    // -------------------------------------------------------------------------
    // TEST F: Manager Direct Approval of Pending Request (with adjusted check-out)
    // -------------------------------------------------------------------------
    echo "\n--- 7. Testing Manager Direct Approval of Pending Request ---\n";
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($targetEmpId, '2026-10-16', '2026-10-16 09:30:00', '2026-10-16 16:30:00', 420, 'Present', NOW(), NOW())
    ");
    $att2 = (int)$db->lastInsertId();
    $createdAttIds[] = $att2;

    $sub2 = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $att2,
        'requested_check_in' => '2026-10-16 09:00:00',
        'requested_check_out' => '2026-10-16 18:00:00',
        'reason' => 'Testing manager direct approval with adjusted departure'
    ]);
    $corr2 = $sub2['data']['id'] ?? null;
    if ($corr2) $createdCorrIds[] = $corr2;

    // Manager approves with adjusted approved_check_out (17:00:00 instead of requested 18:00:00 -> 8.00 hours)
    $mgrApp = callEndpoint('PUT', "/api/attendance/corrections/$corr2/approve", $managerUserId, [
        'remarks' => 'Approved departure capped at official scheduled shift end.',
        'approved_check_out' => '2026-10-16 17:00:00'
    ]);
    assertTest(isset($mgrApp['data']['status']) && $mgrApp['data']['status'] === 'Approved', 
        "Reporting manager directly approves Pending request (200 OK)");
    assertTest((float)$mgrApp['data']['working_hours'] === 8.00, 
        "Working hours calculated to 8.00 hours based on reviewer-adjusted approved_check_out");

    // -------------------------------------------------------------------------
    // TEST G: Manager Rejection Workflow (Requires Remarks & Leaves Attendance Unchanged)
    // -------------------------------------------------------------------------
    echo "\n--- 8. Testing Rejection Workflow & Resubmission Release ---\n";
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($targetEmpId, '2026-10-17', '2026-10-17 10:00:00', '2026-10-17 16:00:00', 360, 'Present', NOW(), NOW())
    ");
    $att3 = (int)$db->lastInsertId();
    $createdAttIds[] = $att3;

    $sub3 = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $att3,
        'requested_check_in' => '2026-10-17 08:30:00',
        'reason' => 'Testing rejection and resubmission'
    ]);
    $corr3 = $sub3['data']['id'] ?? null;
    if ($corr3) $createdCorrIds[] = $corr3;

    // Rejection without remarks fails 400
    $rejFail = callEndpoint('PUT', "/api/attendance/corrections/$corr3/reject", $managerUserId, [
        'remarks' => ''
    ]);
    assertTest(isset($rejFail['error']) && strpos($rejFail['error'], 'remarks are required') !== false, 
        "Rejection without remarks fails with 400 Bad Request");

    // Manager rejects with valid remarks
    $rejSuccess = callEndpoint('PUT', "/api/attendance/corrections/$corr3/reject", $managerUserId, [
        'remarks' => 'Card logs do not substantiate early arrival; rejected.'
    ]);
    assertTest(isset($rejSuccess['data']['status']) && $rejSuccess['data']['status'] === 'Rejected', 
        "Manager rejects correction request with valid remarks (200 OK)");

    // Live attendance remains untouched
    $liveAtt3 = $db->query("SELECT * FROM attendances WHERE id = $att3")->fetch(PDO::FETCH_ASSOC);
    assertTest($liveAtt3['check_in'] === '2026-10-17 10:00:00' && (int)$liveAtt3['working_minutes'] === 360, 
        "Live attendances record remains untouched after rejection");

    // Rejected request releases unique constraint: employee can resubmit fresh request!
    $resub = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $att3,
        'requested_check_in' => '2026-10-17 09:00:00',
        'requested_check_out' => '2026-10-17 17:00:00',
        'reason' => 'Resubmitted with client sign-off proof'
    ]);
    assertTest(isset($resub['data']['id']), 
        "Rejection releases active unique constraint; employee successfully resubmits fresh request (201 Created)");
    $corr4 = $resub['data']['id'] ?? null;
    if ($corr4) $createdCorrIds[] = $corr4;

    // Verify both original rejected request and new resubmitted request appear in /my timeline
    $myList = callEndpoint('GET', '/api/attendance/corrections/my', $targetUserId);
    $foundCorr3 = false;
    $foundCorr4 = false;
    foreach ($myList['data'] ?? [] as $item) {
        if ((int)$item['id'] === (int)$corr3 && $item['status'] === 'Rejected') $foundCorr3 = true;
        if ((int)$item['id'] === (int)$corr4 && $item['status'] === 'Pending') $foundCorr4 = true;
    }
    assertTest($foundCorr3 && $foundCorr4, 
        "Complete historical audit preserved: both rejected request and new active request coexist in /my");

    // -------------------------------------------------------------------------
    // TEST H: HR Rejection of Escalated Request
    // -------------------------------------------------------------------------
    echo "\n--- 9. Testing HR Rejection of Escalated Request ---\n";
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($targetEmpId, '2026-10-18', '2026-10-18 10:00:00', '2026-10-18 17:00:00', 420, 'Present', NOW(), NOW())
    ");
    $att4 = (int)$db->lastInsertId();
    $createdAttIds[] = $att4;

    $sub4 = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $att4,
        'requested_check_in' => '2026-10-18 09:00:00',
        'requested_check_out' => '2026-10-18 18:00:00',
        'reason' => 'Testing HR rejection of escalated request'
    ]);
    $corr5 = $sub4['data']['id'] ?? null;
    if ($corr5) $createdCorrIds[] = $corr5;

    // Manager escalates to HR
    $mgrEsc2 = callEndpoint('PUT', "/api/attendance/corrections/$corr5/escalate", $managerUserId, [
        'escalation_reason' => 'Escalating to HR for policy review and possible rejection.'
    ]);
    assertTest(isset($mgrEsc2['data']['status']) && $mgrEsc2['data']['status'] === 'Escalated', 
        "Manager successfully escalates correction to HR queue (200 OK)");

    // HR rejects escalated request
    $hrRej = callEndpoint('PUT', "/api/attendance/corrections/$corr5/reject", $hrUserId, [
        'remarks' => 'HR review determined that system audit logs do not justify adjustment.'
    ]);
    assertTest(isset($hrRej['data']['status']) && $hrRej['data']['status'] === 'Rejected', 
        "HR reviewer successfully rejects escalated correction request (200 OK)");

    // Verify history event for HR rejection
    $hrRejHist = $db->query("SELECT * FROM attendance_correction_history WHERE correction_id = $corr5 AND action = 'rejected'")->fetch(PDO::FETCH_ASSOC);
    assertTest(!empty($hrRejHist) && $hrRejHist['from_status'] === 'Escalated' && $hrRejHist['to_status'] === 'Rejected', 
        "HR rejection history event recorded with from_status='Escalated' and to_status='Rejected'");

    // Live attendances table remains untouched after HR rejection
    $liveAtt4 = $db->query("SELECT * FROM attendances WHERE id = $att4")->fetch(PDO::FETCH_ASSOC);
    assertTest($liveAtt4['check_in'] === '2026-10-18 10:00:00' && (int)$liveAtt4['working_minutes'] === 420, 
        "Live attendances record remains untouched after HR rejection of escalated request");

    // -------------------------------------------------------------------------
    // TEST E.2: Terminal State Immutability for Rejected Request (Rejected cannot be Approved)
    // -------------------------------------------------------------------------
    echo "\n  [Terminal State] Testing Rejected Request Cannot Subsequently Be Approved\n";
    $postRejApp = callEndpoint('PUT', "/api/attendance/corrections/$corr5/approve", $hrUserId, [
        'remarks' => 'Attempting to approve an already rejected request'
    ]);
    assertTest(isset($postRejApp['error']) && strpos($postRejApp['error'], 'already been finalized') !== false, 
        "Rejected request is immutable; cannot subsequently be approved (409 Conflict)");

    // Verify correction record in database strictly remains 'Rejected'
    $corr5DbCheck = $db->query("SELECT status, reviewed_by, reviewed_at FROM attendance_corrections WHERE id = $corr5")->fetch(PDO::FETCH_ASSOC);
    assertTest($corr5DbCheck['status'] === 'Rejected', 
        "Correction record status strictly remains 'Rejected' in database after attempted approval");

    // Verify live attendances record remains untouched
    $liveAtt4After = $db->query("SELECT check_in, check_out, working_minutes FROM attendances WHERE id = $att4")->fetch(PDO::FETCH_ASSOC);
    assertTest($liveAtt4After['check_in'] === '2026-10-18 10:00:00' && (int)$liveAtt4After['working_minutes'] === 420, 
        "Live attendances record remains unmodified after rejected request approval attempt");

    // =========================================================================
    // TASK 1.7.5: MANAGER'S OWN ATTENDANCE CORRECTION ROUTING TESTS
    // =========================================================================
    echo "\n--- 10. TASK 1.7.5: Manager's Own Attendance Correction Routing ---\n";

    // -------------------------------------------------------------------------
    // 10.1: Manager Self-Action Prevention (Manager with non-null manager_id)
    // -------------------------------------------------------------------------
    echo "\n  [10.1] Manager Self-Action Prevention (User $managerUserId, Emp $managerEmpId)\n";
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($managerEmpId, '2026-10-19', '2026-10-19 10:00:00', '2026-10-19 18:00:00', 480, 'Present', NOW(), NOW())
    ");
    $attMgr1 = (int)$db->lastInsertId();
    $createdAttIds[] = $attMgr1;

    $subMgr1 = callEndpoint('POST', '/api/attendance/corrections', $managerUserId, [
        'attendance_id' => $attMgr1,
        'requested_check_in' => '2026-10-19 09:00:00',
        'requested_check_out' => '2026-10-19 18:00:00',
        'reason' => 'Manager requesting morning check-in adjustment'
    ]);
    assertTest(isset($subMgr1['data']['id']), "Manager submits attendance correction request successfully (201 Created)");
    $corrMgr1 = $subMgr1['data']['id'] ?? null;
    if ($corrMgr1) $createdCorrIds[] = $corrMgr1;

    // Manager attempts self-approval
    $mgrSelfApp = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/approve", $managerUserId, [
        'remarks' => 'Manager trying to self-approve'
    ]);
    assertTest(isset($mgrSelfApp['error']) && strpos($mgrSelfApp['error'], 'cannot approve your own') !== false, 
        "Manager with non-null manager_id cannot approve own correction (403 Forbidden)");

    // Manager attempts self-rejection
    $mgrSelfRej = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/reject", $managerUserId, [
        'remarks' => 'Manager trying to self-reject'
    ]);
    assertTest(isset($mgrSelfRej['error']) && strpos($mgrSelfRej['error'], 'cannot reject your own') !== false, 
        "Manager with non-null manager_id cannot reject own correction (403 Forbidden)");

    // Manager attempts self-escalation
    $mgrSelfEsc = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/escalate", $managerUserId, [
        'escalation_reason' => 'Manager trying to self-escalate'
    ]);
    assertTest(isset($mgrSelfEsc['error']) && strpos($mgrSelfEsc['error'], 'cannot escalate your own') !== false, 
        "Manager with non-null manager_id cannot escalate own correction (403 Forbidden)");

    // -------------------------------------------------------------------------
    // 10.2: Unauthorized Peers and Finance Admin Denied on Manager Request
    // -------------------------------------------------------------------------
    echo "\n  [10.2] Unauthorized Peers and Finance Admin Denied on Manager Request\n";
    $peerAppMgr = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/approve", $peerUserId, [
        'remarks' => 'Finance peer attempting approval'
    ]);
    assertTest(isset($peerAppMgr['error']) && strpos($peerAppMgr['error'], 'Forbidden') !== false, 
        "Finance/Payroll Admin cannot approve manager's correction (403 Forbidden)");

    $peerRejMgr = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/reject", $peerUserId, [
        'remarks' => 'Finance peer attempting rejection'
    ]);
    assertTest(isset($peerRejMgr['error']) && strpos($peerRejMgr['error'], 'Forbidden') !== false, 
        "Finance/Payroll Admin cannot reject manager's correction (403 Forbidden)");

    $peerEscMgr = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/escalate", $peerUserId, [
        'escalation_reason' => 'Finance peer attempting escalation'
    ]);
    assertTest(isset($peerEscMgr['error']) && strpos($peerEscMgr['error'], 'Forbidden') !== false, 
        "Finance/Payroll Admin cannot escalate manager's correction (403 Forbidden)");

    // Escalation of manager request is forbidden for all callers
    $escMgrBlocked = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/escalate", $hrUserId, [
        'escalation_reason' => 'Attempting to escalate a manager request'
    ]);
    assertTest(isset($escMgrBlocked['error']) && strpos($escMgrBlocked['error'], 'cannot be escalated') !== false, 
        "A manager's correction request cannot be escalated by anyone (403 Forbidden)");

    // -------------------------------------------------------------------------
    // 10.3: Authorized HR Directly Approves Manager's Own Pending Correction
    // -------------------------------------------------------------------------
    echo "\n  [10.3] Authorized HR Directly Approves Manager's Own Pending Correction\n";
    $hrAppMgr = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/approve", $hrAdminUserId, [
        'remarks' => 'HR Admin approved manager attendance correction directly per policy.'
    ]);
    assertTest(isset($hrAppMgr['data']['status']) && $hrAppMgr['data']['status'] === 'Approved', 
        "Authorized HR reviewer directly approves Manager's Pending correction (200 OK)");
    assertTest((float)$hrAppMgr['data']['working_hours'] === 9.00 && $hrAppMgr['data']['attendance_status'] === 'Present', 
        "Manager's working hours recalculated accurately to 9.00 hours and status set to Present");

    // Verify attendances table updated live
    $liveAttMgr1 = $db->query("SELECT * FROM attendances WHERE id = $attMgr1")->fetch(PDO::FETCH_ASSOC);
    assertTest($liveAttMgr1['check_in'] === '2026-10-19 09:00:00' && $liveAttMgr1['check_out'] === '2026-10-19 18:00:00' && (int)$liveAttMgr1['working_minutes'] === 540, 
        "Live attendances updated atomically with approved check-in (09:00:00) and working minutes (540 min)");

    // Verify history event created for HR direct approval
    $mgrAppHist = $db->query("SELECT * FROM attendance_correction_history WHERE correction_id = $corrMgr1 AND action = 'approved'")->fetch(PDO::FETCH_ASSOC);
    assertTest(!empty($mgrAppHist) && $mgrAppHist['from_status'] === 'Pending' && $mgrAppHist['to_status'] === 'Approved' && (int)$mgrAppHist['actor_user_id'] === $hrAdminUserId, 
        "Approval history event written atomically with from_status='Pending', to_status='Approved', actor=HR Admin");

    // Terminal state check on manager approved correction
    $postMgrAppRej = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr1/reject", $hrAdminUserId, [
        'remarks' => 'Attempting to reject already approved manager correction'
    ]);
    assertTest(isset($postMgrAppRej['error']) && strpos($postMgrAppRej['error'], 'already been finalized') !== false, 
        "Manager approved request is immutable; cannot be rejected (409 Conflict)");

    // -------------------------------------------------------------------------
    // 10.4: Authorized HR Directly Rejects Manager's Own Pending Correction
    // -------------------------------------------------------------------------
    echo "\n  [10.4] Authorized HR Directly Rejects Manager's Own Pending Correction\n";
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($managerEmpId, '2026-10-20', '2026-10-20 10:00:00', '2026-10-20 17:00:00', 420, 'Present', NOW(), NOW())
    ");
    $attMgr2 = (int)$db->lastInsertId();
    $createdAttIds[] = $attMgr2;

    $subMgr2 = callEndpoint('POST', '/api/attendance/corrections', $managerUserId, [
        'attendance_id' => $attMgr2,
        'requested_check_in' => '2026-10-20 08:00:00',
        'requested_check_out' => '2026-10-20 17:00:00',
        'reason' => 'Manager requesting morning check-in adjustment'
    ]);
    $corrMgr2 = $subMgr2['data']['id'] ?? null;
    if ($corrMgr2) $createdCorrIds[] = $corrMgr2;

    // HR direct rejection without remarks fails 400
    $hrRejMgrFail = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr2/reject", $hrAdminUserId, [
        'remarks' => ''
    ]);
    assertTest(isset($hrRejMgrFail['error']) && strpos($hrRejMgrFail['error'], 'remarks are required') !== false, 
        "HR rejection of manager correction without remarks fails with 400 Bad Request");

    // HR direct rejection with valid remarks succeeds 200
    $hrRejMgrSuccess = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr2/reject", $hrAdminUserId, [
        'remarks' => 'Access control telemetry indicates badge scan occurred at standard shift time.'
    ]);
    assertTest(isset($hrRejMgrSuccess['data']['status']) && $hrRejMgrSuccess['data']['status'] === 'Rejected', 
        "Authorized HR reviewer directly rejects Manager's Pending correction with remarks (200 OK)");

    // Verify live attendance remains untouched after HR rejection
    $liveAttMgr2 = $db->query("SELECT * FROM attendances WHERE id = $attMgr2")->fetch(PDO::FETCH_ASSOC);
    assertTest($liveAttMgr2['check_in'] === '2026-10-20 10:00:00' && (int)$liveAttMgr2['working_minutes'] === 420, 
        "Live attendances record for manager remains untouched after rejection");

    // Verify history event created for HR rejection
    $mgrRejHist = $db->query("SELECT * FROM attendance_correction_history WHERE correction_id = $corrMgr2 AND action = 'rejected'")->fetch(PDO::FETCH_ASSOC);
    assertTest(!empty($mgrRejHist) && $mgrRejHist['from_status'] === 'Pending' && $mgrRejHist['to_status'] === 'Rejected' && (int)$mgrRejHist['actor_user_id'] === $hrAdminUserId, 
        "Rejection history event written atomically with from_status='Pending', to_status='Rejected', actor=HR Admin");

    // Terminal state check on manager rejected correction
    $postMgrRejApp = callEndpoint('PUT', "/api/attendance/corrections/$corrMgr2/approve", $hrAdminUserId, [
        'remarks' => 'Attempting to approve already rejected manager correction'
    ]);
    assertTest(isset($postMgrRejApp['error']) && strpos($postMgrRejApp['error'], 'already been finalized') !== false, 
        "Manager rejected request is immutable; cannot be approved (409 Conflict)");

    $corrMgr2DbCheck = $db->query("SELECT status, reviewed_by FROM attendance_corrections WHERE id = $corrMgr2")->fetch(PDO::FETCH_ASSOC);
    assertTest($corrMgr2DbCheck['status'] === 'Rejected', 
        "Manager correction record status strictly remains 'Rejected' in database after attempted approval");

    // -------------------------------------------------------------------------
    // 10.5: Deny Manager's Reporting Manager Under Ordinary Workflow
    // Fixture: Subordinate Manager who reports to $managerEmpId (pure Manager role).
    // -------------------------------------------------------------------------
    echo "\n  [10.5] Deny Manager's Reporting Manager Under Ordinary Workflow\n";
    $testSubMgrCode = 'TEST_MGR_' . time() . '_' . mt_rand(100, 999);
    $testSubMgrEmail = 'test_sub_mgr_' . time() . '_' . mt_rand(100, 999) . '@hrms.local';

    $db->prepare("
        INSERT INTO users (name, email, password, created_at, updated_at)
        VALUES ('Test Sub Manager', :email, 'dummy_hash', NOW(), NOW())
    ")->execute(['email' => $testSubMgrEmail]);
    $subMgrUserId = (int)$db->lastInsertId();
    $createdUserIds[] = $subMgrUserId;

    // Discover or get Manager role ID
    $roleMgrId = (int)$db->query("SELECT id FROM roles WHERE name = 'Manager' LIMIT 1")->fetchColumn();
    $db->exec("INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES ($roleMgrId, 'App\\\\Models\\\\User', $subMgrUserId)");

    // Insert employee record reporting to Manager
    $db->prepare("
        INSERT INTO employees (user_id, employee_code, first_name, last_name, email, date_of_joining, manager_id, employment_type, employment_status, created_at, updated_at)
        VALUES (:user_id, :code, 'Sub', 'Manager', :email, '2026-01-01', $managerEmpId, 'Full-time', 'Active', NOW(), NOW())
    ")->execute(['user_id' => $subMgrUserId, 'code' => $testSubMgrCode, 'email' => $testSubMgrEmail]);
    $subMgrEmpId = (int)$db->lastInsertId();
    $createdEmpIds[] = $subMgrEmpId;

    // Subordinate manager creates attendance session & correction
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($subMgrEmpId, '2026-10-21', '2026-10-21 10:00:00', '2026-10-21 17:00:00', 420, 'Present', NOW(), NOW())
    ");
    $attSubMgr = (int)$db->lastInsertId();
    $createdAttIds[] = $attSubMgr;

    $subSubMgr = callEndpoint('POST', '/api/attendance/corrections', $subMgrUserId, [
        'attendance_id' => $attSubMgr,
        'requested_check_in' => '2026-10-21 09:00:00',
        'requested_check_out' => '2026-10-21 18:00:00',
        'reason' => 'Subordinate manager requesting adjustment'
    ]);
    assertTest(isset($subSubMgr['data']['id']), "Subordinate manager creates correction request successfully");
    $corrSubMgr = $subSubMgr['data']['id'] ?? null;
    if ($corrSubMgr) $createdCorrIds[] = $corrSubMgr;

    // Reporting manager (pure manager, no HR role) attempts approval under ordinary workflow
    $mgrOrdApp = callEndpoint('PUT', "/api/attendance/corrections/$corrSubMgr/approve", $managerUserId, [
        'remarks' => 'Manager attempting to approve subordinate manager correction'
    ]);
    assertTest(isset($mgrOrdApp['error']) && strpos($mgrOrdApp['error'], 'reviewed directly by authorized HR reviewers') !== false, 
        "Reporting manager under ordinary workflow cannot approve manager correction (403 Forbidden)");

    // Reporting manager attempts rejection under ordinary workflow
    $mgrOrdRej = callEndpoint('PUT', "/api/attendance/corrections/$corrSubMgr/reject", $managerUserId, [
        'remarks' => 'Manager attempting to reject subordinate manager correction'
    ]);
    assertTest(isset($mgrOrdRej['error']) && strpos($mgrOrdRej['error'], 'reviewed directly by authorized HR reviewers') !== false, 
        "Reporting manager under ordinary workflow cannot reject manager correction (403 Forbidden)");

    // Reporting manager attempts escalation
    $mgrOrdEsc = callEndpoint('PUT', "/api/attendance/corrections/$corrSubMgr/escalate", $managerUserId, [
        'escalation_reason' => 'Manager attempting to escalate subordinate manager correction'
    ]);
    assertTest(isset($mgrOrdEsc['error']) && strpos($mgrOrdEsc['error'], 'cannot be escalated') !== false, 
        "Reporting manager cannot escalate manager correction (403 Forbidden)");

    // Subordinate manager attempts self-approval
    $subMgrSelfApp = callEndpoint('PUT', "/api/attendance/corrections/$corrSubMgr/approve", $subMgrUserId, [
        'remarks' => 'Subordinate manager trying to self-approve'
    ]);
    assertTest(isset($subMgrSelfApp['error']) && strpos($subMgrSelfApp['error'], 'cannot approve your own') !== false, 
        "Subordinate manager cannot approve own correction (403 Forbidden)");

    // Authorized HR reviewer directly approves subordinate manager request
    $hrAppSubMgr = callEndpoint('PUT', "/api/attendance/corrections/$corrSubMgr/approve", $hrAdminUserId, [
        'remarks' => 'HR Admin approved subordinate manager request directly.'
    ]);
    assertTest(isset($hrAppSubMgr['data']['status']) && $hrAppSubMgr['data']['status'] === 'Approved', 
        "Authorized HR reviewer directly approves subordinate manager request (200 OK)");

    // -------------------------------------------------------------------------
    // 10.6: Ordinary Employee Protection: HR Cannot Bypass Reporting Manager
    // -------------------------------------------------------------------------
    echo "\n  [10.6] HR Cannot Bypass Reporting Manager for Ordinary Employee\n";
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($targetEmpId, '2026-10-22', '2026-10-22 10:00:00', '2026-10-22 17:00:00', 420, 'Present', NOW(), NOW())
    ");
    $attOrdBypass = (int)$db->lastInsertId();
    $createdAttIds[] = $attOrdBypass;

    $subOrdBypass = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $attOrdBypass,
        'requested_check_in' => '2026-10-22 09:00:00',
        'requested_check_out' => '2026-10-22 18:00:00',
        'reason' => 'Testing HR bypass protection on ordinary employee'
    ]);
    $corrOrdBypass = $subOrdBypass['data']['id'] ?? null;
    if ($corrOrdBypass) $createdCorrIds[] = $corrOrdBypass;

    // HR reviewer attempts to approve ordinary employee's pending request directly (bypass attempt)
    $hrBypassApp = callEndpoint('PUT', "/api/attendance/corrections/$corrOrdBypass/approve", $hrAdminUserId, [
        'remarks' => 'HR attempting to bypass reporting manager on ordinary employee'
    ]);
    assertTest(isset($hrBypassApp['error']) && strpos($hrBypassApp['error'], 'not authorized to approve this pending correction') !== false, 
        "HR reviewer cannot bypass reporting manager for ordinary employee's Pending correction (403 Forbidden)");

    // HR reviewer attempts to reject ordinary employee's pending request directly (bypass attempt)
    $hrBypassRej = callEndpoint('PUT', "/api/attendance/corrections/$corrOrdBypass/reject", $hrAdminUserId, [
        'remarks' => 'HR attempting to bypass reporting manager on ordinary employee rejection'
    ]);
    assertTest(isset($hrBypassRej['error']) && strpos($hrBypassRej['error'], 'not authorized to reject this pending correction') !== false, 
        "HR reviewer cannot bypass reporting manager for ordinary employee's Pending rejection (403 Forbidden)");

    // Reporting manager can approve ordinary employee request directly
    $mgrAppOrdSuccess = callEndpoint('PUT', "/api/attendance/corrections/$corrOrdBypass/approve", $managerUserId, [
        'remarks' => 'Direct reporting manager approving ordinary employee request'
    ]);
    assertTest(isset($mgrAppOrdSuccess['data']['status']) && $mgrAppOrdSuccess['data']['status'] === 'Approved', 
        "Reporting manager directly approves ordinary employee's Pending correction (200 OK)");

    // -------------------------------------------------------------------------
    // 10.7: Failed Actions Leave No Partial Updates or Audit-History Records
    // -------------------------------------------------------------------------
    echo "\n  [10.7] Verifying Failed Actions Leave No Partial Updates or Audit Records\n";
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($managerEmpId, '2026-10-23', '2026-10-23 10:00:00', '2026-10-23 17:00:00', 420, 'Present', NOW(), NOW())
    ");
    $attAtomic = (int)$db->lastInsertId();
    $createdAttIds[] = $attAtomic;

    $subAtomic = callEndpoint('POST', '/api/attendance/corrections', $managerUserId, [
        'attendance_id' => $attAtomic,
        'requested_check_in' => '2026-10-23 09:00:00',
        'requested_check_out' => '2026-10-23 18:00:00',
        'reason' => 'Testing atomic rollback on failed authorization'
    ]);
    $corrAtomic = $subAtomic['data']['id'] ?? null;
    if ($corrAtomic) $createdCorrIds[] = $corrAtomic;

    // Submitter attempts forbidden self-actions
    callEndpoint('PUT', "/api/attendance/corrections/$corrAtomic/approve", $managerUserId, ['remarks' => 'Self']);
    callEndpoint('PUT', "/api/attendance/corrections/$corrAtomic/reject", $managerUserId, ['remarks' => 'Self reject remarks']);
    callEndpoint('PUT', "/api/attendance/corrections/$corrAtomic/escalate", $managerUserId, ['escalation_reason' => 'Self escalate reason']);
    // Peer attempts forbidden action
    callEndpoint('PUT', "/api/attendance/corrections/$corrAtomic/approve", $peerUserId, ['remarks' => 'Peer approval']);

    // Verify correction request is still Pending
    $corrAtomicCheck = $db->query("SELECT status, reviewed_by, reviewed_at FROM attendance_corrections WHERE id = $corrAtomic")->fetch(PDO::FETCH_ASSOC);
    assertTest($corrAtomicCheck['status'] === 'Pending' && $corrAtomicCheck['reviewed_by'] === null, 
        "Correction status remains 'Pending' and reviewed_by remains null after failed attempts");

    // Verify live attendances record is completely untouched
    $attAtomicCheck = $db->query("SELECT check_in, check_out, working_minutes FROM attendances WHERE id = $attAtomic")->fetch(PDO::FETCH_ASSOC);
    assertTest($attAtomicCheck['check_in'] === '2026-10-23 10:00:00' && (int)$attAtomicCheck['working_minutes'] === 420, 
        "Live attendances record remains completely unmodified after failed action attempts");

    // Verify zero history events were created for failed reviewer attempts (only initial 'submitted' event exists)
    $reviewerHistCount = (int)$db->query("SELECT COUNT(*) FROM attendance_correction_history WHERE correction_id = $corrAtomic AND action != 'submitted'")->fetchColumn();
    assertTest($reviewerHistCount === 0, 
        "Zero audit history rows created during denied action attempts (Strict atomicity verified)");

    // -------------------------------------------------------------------------
    // TEST K: Ordinary Employee Without Manager (manager_id IS NULL)
    // HR is authorized to directly approve and reject when employee has no manager!
    // -------------------------------------------------------------------------
    echo "\n--- 11. Testing Ordinary Employee Without Reporting Manager (manager_id IS NULL) ---\n";
    $testNoMgrCode = 'TEST_NOMGR_' . time() . '_' . mt_rand(100, 999);
    $testNoMgrEmail = 'test_nomgr_' . time() . '_' . mt_rand(100, 999) . '@hrms.local';

    $db->prepare("
        INSERT INTO users (name, email, password, created_at, updated_at)
        VALUES ('Test No-Manager Employee', :email, 'dummy_hash', NOW(), NOW())
    ")->execute(['email' => $testNoMgrEmail]);
    $noMgrUserId = (int)$db->lastInsertId();
    $createdUserIds[] = $noMgrUserId;

    // Discover Employee role ID
    $roleEmpId = (int)$db->query("SELECT id FROM roles WHERE name = 'Employee' LIMIT 1")->fetchColumn();
    $db->exec("INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES ($roleEmpId, 'App\\\\Models\\\\User', $noMgrUserId)");

    // Insert employee record with manager_id = NULL
    $db->prepare("
        INSERT INTO employees (user_id, employee_code, first_name, last_name, email, date_of_joining, manager_id, employment_type, employment_status, created_at, updated_at)
        VALUES (:user_id, :code, 'NoMgr', 'Employee', :email, '2026-01-01', NULL, 'Full-time', 'Active', NOW(), NOW())
    ")->execute(['user_id' => $noMgrUserId, 'code' => $testNoMgrCode, 'email' => $testNoMgrEmail]);
    $noMgrEmpId = (int)$db->lastInsertId();
    $createdEmpIds[] = $noMgrEmpId;

    // K.1: Direct HR Approval for employee with no manager
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($noMgrEmpId, '2026-10-24', '2026-10-24 10:00:00', '2026-10-24 17:00:00', 420, 'Present', NOW(), NOW())
    ");
    $attNoMgr1 = (int)$db->lastInsertId();
    $createdAttIds[] = $attNoMgr1;

    $subNoMgr1 = callEndpoint('POST', '/api/attendance/corrections', $noMgrUserId, [
        'attendance_id' => $attNoMgr1,
        'requested_check_in' => '2026-10-24 09:00:00',
        'requested_check_out' => '2026-10-24 18:00:00',
        'reason' => 'Testing HR review when employee has no manager'
    ]);
    assertTest(isset($subNoMgr1['data']['id']), "Employee without manager creates correction request successfully");
    $corrNoMgr1 = $subNoMgr1['data']['id'] ?? null;
    if ($corrNoMgr1) $createdCorrIds[] = $corrNoMgr1;

    // Authorized HR directly approves request for employee without manager
    $hrAppNoMgr = callEndpoint('PUT', "/api/attendance/corrections/$corrNoMgr1/approve", $hrAdminUserId, [
        'remarks' => 'HR direct approval granted because employee has no reporting manager.'
    ]);
    assertTest(isset($hrAppNoMgr['data']['status']) && $hrAppNoMgr['data']['status'] === 'Approved', 
        "Authorized HR directly approves Pending correction for employee without manager (200 OK)");
    assertTest((float)$hrAppNoMgr['data']['working_hours'] === 9.00, 
        "Working hours recalculated accurately to 9.00 hours on HR direct approval");

    // K.2: Direct HR Rejection for employee with no manager
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($noMgrEmpId, '2026-10-25', '2026-10-25 10:00:00', '2026-10-25 17:00:00', 420, 'Present', NOW(), NOW())
    ");
    $attNoMgr2 = (int)$db->lastInsertId();
    $createdAttIds[] = $attNoMgr2;

    $subNoMgr2 = callEndpoint('POST', '/api/attendance/corrections', $noMgrUserId, [
        'attendance_id' => $attNoMgr2,
        'requested_check_in' => '2026-10-25 08:30:00',
        'requested_check_out' => '2026-10-25 17:30:00',
        'reason' => 'Testing HR direct rejection when employee has no manager'
    ]);
    $corrNoMgr2 = $subNoMgr2['data']['id'] ?? null;
    if ($corrNoMgr2) $createdCorrIds[] = $corrNoMgr2;

    $hrRejNoMgr = callEndpoint('PUT', "/api/attendance/corrections/$corrNoMgr2/reject", $hrAdminUserId, [
        'remarks' => 'Badge telemetry does not confirm early check-in; rejected by HR.'
    ]);
    assertTest(isset($hrRejNoMgr['data']['status']) && $hrRejNoMgr['data']['status'] === 'Rejected', 
        "Authorized HR directly rejects Pending correction for employee without manager (200 OK)");

    // Live attendances remains untouched after HR rejection
    $liveAttNoMgr2 = $db->query("SELECT * FROM attendances WHERE id = $attNoMgr2")->fetch(PDO::FETCH_ASSOC);
    assertTest($liveAttNoMgr2['check_in'] === '2026-10-25 10:00:00' && (int)$liveAttNoMgr2['working_minutes'] === 420, 
        "Live attendances record remains untouched after HR rejection");

    // -------------------------------------------------------------------------
    // 12. TASK 1.9A: Reviewer Queue Verification (GET /api/attendance/corrections/pending)
    // -------------------------------------------------------------------------
    echo "\n--- 12. TASK 1.9A: Reviewer Queue Verification (GET /api/attendance/corrections/pending) ---\n";

    // L.1: Literal route matching check (Must not be matched by /{id} which returns 400 'Invalid correction ID.')
    $pendingAsPeer = callEndpoint('GET', '/api/attendance/corrections/pending', $peerUserId);
    assertTest(isset($pendingAsPeer['error']) && strpos($pendingAsPeer['error'], 'Invalid correction ID') === false,
        "Literal route /pending is NOT matched as /{id} route");

    // L.2: Unauthorized role check: Finance/Payroll Admin receives 403 Forbidden
    assertTest(isset($pendingAsPeer['error']) && strpos($pendingAsPeer['error'], 'Forbidden') !== false,
        "Finance/Payroll Admin cannot access reviewer queue (403 Forbidden)");

    // L.3: Unauthorized role check: Ordinary Employee receives 403 Forbidden
    $pendingAsEmp = callEndpoint('GET', '/api/attendance/corrections/pending', $targetUserId);
    assertTest(isset($pendingAsEmp['error']) && strpos($pendingAsEmp['error'], 'Forbidden') !== false,
        "Ordinary employee cannot access reviewer queue (403 Forbidden)");

    // Create fresh test fixtures for queue scoping:
    // 1. Pending request for Ordinary Employee (reports to Manager)
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($targetEmpId, '2026-10-26', '2026-10-26 09:30:00', '2026-10-26 17:30:00', 480, 'Present', NOW(), NOW())
    ");
    $attQueueEmp = (int)$db->lastInsertId();
    $createdAttIds[] = $attQueueEmp;

    $subQueueEmp = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $attQueueEmp,
        'requested_check_in' => '2026-10-26 09:00:00',
        'requested_check_out' => '2026-10-26 18:00:00',
        'reason' => 'Queue test: Employee pending correction'
    ]);
    $corrQueueEmp = $subQueueEmp['data']['id'] ?? null;
    if ($corrQueueEmp) $createdCorrIds[] = $corrQueueEmp;
    assertTest($corrQueueEmp !== null, "Ordinary employee pending request created for queue tests");

    // 2. Pending request for Manager (Manager's own request)
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($managerEmpId, '2026-10-26', '2026-10-26 10:00:00', '2026-10-26 18:00:00', 480, 'Present', NOW(), NOW())
    ");
    $attQueueMgr = (int)$db->lastInsertId();
    $createdAttIds[] = $attQueueMgr;

    $subQueueMgr = callEndpoint('POST', '/api/attendance/corrections', $managerUserId, [
        'attendance_id' => $attQueueMgr,
        'requested_check_in' => '2026-10-26 09:00:00',
        'requested_check_out' => '2026-10-26 18:00:00',
        'reason' => 'Queue test: Manager own pending correction'
    ]);
    $corrQueueMgr = $subQueueMgr['data']['id'] ?? null;
    if ($corrQueueMgr) $createdCorrIds[] = $corrQueueMgr;
    assertTest($corrQueueMgr !== null, "Manager pending request created for queue tests");

    // 3. Escalated request (ordinary employee request escalated by manager)
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($targetEmpId, '2026-10-27', '2026-10-27 10:00:00', '2026-10-27 18:00:00', 480, 'Present', NOW(), NOW())
    ");
    $attQueueEsc = (int)$db->lastInsertId();
    $createdAttIds[] = $attQueueEsc;

    $subQueueEsc = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $attQueueEsc,
        'requested_check_in' => '2026-10-27 09:00:00',
        'requested_check_out' => '2026-10-27 18:00:00',
        'reason' => 'Queue test: To be escalated to HR'
    ]);
    $corrQueueEsc = $subQueueEsc['data']['id'] ?? null;
    if ($corrQueueEsc) $createdCorrIds[] = $corrQueueEsc;

    $escRes = callEndpoint('PUT', "/api/attendance/corrections/$corrQueueEsc/escalate", $managerUserId, [
        'escalation_reason' => 'Queue test: Escalated to HR review queue'
    ]);
    assertTest(isset($escRes['data']['status']) && $escRes['data']['status'] === 'Escalated',
        "Escalated request created for shared HR review queue tests");

    // L.4: Manager queue scoping:
    // Manager sees User 904's pending request, but NOT their own request, and NOT the escalated request
    $mgrQueue = callEndpoint('GET', '/api/attendance/corrections/pending', $managerUserId);
    $mgrQueueIds = isset($mgrQueue['data']) ? array_column($mgrQueue['data'], 'id') : [];
    assertTest(in_array($corrQueueEmp, $mgrQueueIds),
        "Manager sees ordinary employee's pending request within reporting hierarchy");
    assertTest(!in_array($corrQueueMgr, $mgrQueueIds),
        "Strict self-action exclusion: Manager's own pending request is excluded from Manager's queue");
    assertTest(!in_array($corrQueueEsc, $mgrQueueIds),
        "Manager cannot view escalated requests in pending queue");

    // L.5: Shared HR Review Queue scoping:
    // HR Admin sees:
    // - Escalated request
    // - Manager's own pending request (since managers are reviewed directly by HR)
    // - Does NOT see ordinary employee's pending request (manager-first review preserved)
    $hrQueue = callEndpoint('GET', '/api/attendance/corrections/pending', $hrAdminUserId);
    $hrQueueIds = isset($hrQueue['data']) ? array_column($hrQueue['data'], 'id') : [];
    assertTest(in_array($corrQueueEsc, $hrQueueIds),
        "Authorized HR reviewer sees escalated request in shared HR review queue");
    assertTest(in_array($corrQueueMgr, $hrQueueIds),
        "Authorized HR reviewer sees manager's own pending request for direct HR review");
    assertTest(!in_array($corrQueueEmp, $hrQueueIds),
        "Manager-first review preserved: HR reviewer does not see ordinary employee's unescalated request");

    // L.6: Status filtering verification:
    // Manager with ?status=Pending sees pending request
    $mgrPendingFilter = callEndpoint('GET', '/api/attendance/corrections/pending?status=Pending', $managerUserId);
    $mgrPendingFilterIds = isset($mgrPendingFilter['data']) ? array_column($mgrPendingFilter['data'], 'id') : [];
    assertTest(in_array($corrQueueEmp, $mgrPendingFilterIds),
        "Manager pending queue filter ?status=Pending returns pending requests");

    // Manager with ?status=Escalated returns empty list (managers cannot view escalated requests)
    $mgrEscFilter = callEndpoint('GET', '/api/attendance/corrections/pending?status=Escalated', $managerUserId);
    assertTest(isset($mgrEscFilter['data']) && empty($mgrEscFilter['data']),
        "Manager filter ?status=Escalated returns empty array");

    // HR with ?status=Escalated returns only escalated requests
    $hrEscFilter = callEndpoint('GET', '/api/attendance/corrections/pending?status=Escalated', $hrAdminUserId);
    $hrEscFilterIds = isset($hrEscFilter['data']) ? array_column($hrEscFilter['data'], 'id') : [];
    assertTest(in_array($corrQueueEsc, $hrEscFilterIds) && !in_array($corrQueueMgr, $hrEscFilterIds),
        "HR reviewer filter ?status=Escalated returns only escalated requests");

    // Reviewer with ?status=Approved returns empty list (terminal statuses excluded from pending queue)
    $hrAppFilter = callEndpoint('GET', '/api/attendance/corrections/pending?status=Approved', $hrAdminUserId);
    assertTest(isset($hrAppFilter['data']) && empty($hrAppFilter['data']),
        "Filter for terminal status ?status=Approved returns empty array on pending queue");

    // -------------------------------------------------------------------------
    // TEST M: TASK 1.10 - Submission Validation & Duplicate Conflict Scenarios
    // -------------------------------------------------------------------------
    echo "\n--- 13. TASK 1.10: Submission Validation & Duplicate Conflict Verification ---\n";

    // Create a dedicated attendance session for target employee
    $db->exec("
        INSERT INTO attendances (employee_id, attendance_date, check_in, check_out, working_minutes, status, created_at, updated_at)
        VALUES ($targetEmpId, '2026-10-21', '2026-10-21 10:00:00', '2026-10-21 18:00:00', 480, 'Present', NOW(), NOW())
    ");
    $attVal = (int)$db->lastInsertId();
    $createdAttIds[] = $attVal;

    // 13.1 Missing requested timestamps
    $subMissingTimes = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $attVal,
        'reason' => 'Submitting without any requested timestamps'
    ]);
    assertTest(isset($subMissingTimes['errors']['requested_times']),
        "Submission without requested timestamps fails with 400 Bad Request");

    // 13.2 Short reason (< 5 characters)
    $subShortReason = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $attVal,
        'requested_check_in' => '2026-10-21 09:00:00',
        'reason' => 'Bad'
    ]);
    assertTest(isset($subShortReason['errors']['reason']),
        "Submission with reason under 5 characters fails with 400 Bad Request");

    // 13.3 Inverted order (check_out <= check_in)
    $subInvOrder = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $attVal,
        'requested_check_in' => '2026-10-21 18:00:00',
        'requested_check_out' => '2026-10-21 09:00:00',
        'reason' => 'Invalid chronological ordering test'
    ]);
    assertTest(isset($subInvOrder['errors']['requested_order']),
        "Submission with requested check-out before check-in fails with 400 Bad Request");

    // 13.4 Non-existent attendance record
    $subNonExistent = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => 99999999,
        'requested_check_in' => '2026-10-21 09:00:00',
        'reason' => 'Valid reason for non-existent session'
    ]);
    assertTest(isset($subNonExistent['error']) && strpos($subNonExistent['error'], 'not found') !== false,
        "Submission for non-existent attendance session fails with 404 Not Found");

    // 13.5 Attempting to submit correction for another employee's attendance record
    $subOtherEmp = callEndpoint('POST', '/api/attendance/corrections', $managerUserId, [
        'attendance_id' => $attVal, // owned by targetEmpId
        'requested_check_in' => '2026-10-21 09:00:00',
        'reason' => 'Manager trying to create correction on employee record directly'
    ]);
    assertTest(isset($subOtherEmp['error']) && strpos($subOtherEmp['error'], 'do not own') !== false,
        "Submission for another employee's attendance session fails with 403 Forbidden");

    // 13.6 Valid submission succeeds and appears in /my with 'Pending' status
    $subValid = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $attVal,
        'requested_check_in' => '2026-10-21 09:00:00',
        'requested_check_out' => '2026-10-21 18:00:00',
        'reason' => 'Valid correction submission with client meeting verification'
    ]);
    assertTest(isset($subValid['data']['id']) && $subValid['data']['status'] === 'Pending',
        "Valid correction submission succeeds with 201 Created and Pending status");
    $corrVal = $subValid['data']['id'] ?? null;
    if ($corrVal) $createdCorrIds[] = $corrVal;

    $myHistory = callEndpoint('GET', '/api/attendance/corrections/my', $targetUserId);
    $foundMyCorr = false;
    $initialEventAction = null;
    foreach ($myHistory['data'] ?? [] as $mItem) {
        if ((int)$mItem['id'] === (int)$corrVal) {
            $foundMyCorr = true;
            if (!empty($mItem['history']) && is_array($mItem['history'])) {
                $initialEventAction = $mItem['history'][0]['action'] ?? null;
            }
            break;
        }
    }
    assertTest($foundMyCorr && $initialEventAction === 'submitted',
        "Submitted correction appears in personal history with Pending status and initial audit record");

    // 13.7 Duplicate active request check: 409 Conflict
    $subDuplicate = callEndpoint('POST', '/api/attendance/corrections', $targetUserId, [
        'attendance_id' => $attVal,
        'requested_check_in' => '2026-10-21 08:30:00',
        'reason' => 'Duplicate correction attempt on same active session'
    ]);
    assertTest(isset($subDuplicate['error']) && strpos($subDuplicate['error'], 'Conflict') !== false,
        "Duplicate active request produces clear 409 Conflict message without false success");

    // -------------------------------------------------------------------------
    // TEST N: TASK 1.10 - Regression Verification of Standard Attendance Routes
    // -------------------------------------------------------------------------
    echo "\n--- 14. TASK 1.10: Regression Verification of Existing Attendance Endpoints ---\n";

    // 14.1 GET /api/attendance/today
    $todayRes = callEndpoint('GET', '/api/attendance/today', $targetUserId);
    assertTest(is_array($todayRes) && (array_key_exists('today_attendance', $todayRes) || isset($todayRes['attendance']) || isset($todayRes['total_employees'])),
        "Existing GET /api/attendance/today returns valid attendance structure (200 OK)");

    // 14.2 GET /api/attendance (personal scope=mine)
    $mineHistory = callEndpoint('GET', '/api/attendance?scope=mine', $targetUserId);
    assertTest(isset($mineHistory['data']) && is_array($mineHistory['data']),
        "Existing GET /api/attendance?scope=mine returns paginated personal records (200 OK)");

    // 14.3 GET /api/attendance with date range filtering
    $dateFilterRes = callEndpoint('GET', '/api/attendance?scope=mine&date_from=2026-10-01&date_to=2026-10-31', $targetUserId);
    assertTest(isset($dateFilterRes['data']) && is_array($dateFilterRes['data']),
        "Existing GET /api/attendance date range filtering executes successfully (200 OK)");

    // 14.4 GET /api/attendance (scope=all for HR / Manager)
    $allHistoryHR = callEndpoint('GET', '/api/attendance?scope=all', $hrAdminUserId);
    assertTest(isset($allHistoryHR['data']) && is_array($allHistoryHR['data']),
        "Existing GET /api/attendance?scope=all returns organization records for authorized HR (200 OK)");

    // =========================================================================
    // 15. TASK 1.13: Authenticated Identity Response Contract Verification
    // =========================================================================
    echo "\n--- 15. TASK 1.13: Authenticated Identity Response Contract Verification ---\n";

    // 15.1 Authenticated User With Linked Employee Profile (/api/user)
    $userRes = callEndpoint('GET', '/api/user', $targetUserId);
    assertTest(isset($userRes['id']) && (int)$userRes['id'] === $targetUserId,
        "GET /api/user preserves user account id (200 OK)");
    assertTest(isset($userRes['name']) && isset($userRes['email']),
        "GET /api/user preserves name and email fields");
    assertTest(isset($userRes['roles']) && is_array($userRes['roles']),
        "GET /api/user preserves assigned roles array");
    assertTest(isset($userRes['permissions']) && is_array($userRes['permissions']),
        "GET /api/user preserves permissions array");
    assertTest(isset($userRes['employee_id']) && (int)$userRes['employee_id'] === $targetEmpId,
        "GET /api/user exposes reliable employee_id matching linked employee ($targetEmpId)");
    assertTest(isset($userRes['employee']) && is_array($userRes['employee']) && (int)$userRes['employee']['id'] === $targetEmpId,
        "GET /api/user exposes linked employee profile object");

    // 15.2 Authenticated User With Linked Employee Profile (/api/login)
    $loginPass = 'EmpPassword123!';
    $db->prepare("UPDATE users SET password = :password WHERE id = :id")
       ->execute(['password' => password_hash($loginPass, PASSWORD_BCRYPT), 'id' => $targetUserId]);
    $targetUserEmail = (string)$db->query("SELECT email FROM users WHERE id = $targetUserId")->fetchColumn();

    $loginRes = callEndpoint('POST', '/api/login', null, ['email' => $targetUserEmail, 'password' => $loginPass]);
    assertTest(isset($loginRes['access_token']) && !empty($loginRes['access_token']),
        "POST /api/login returns valid access_token (200 OK)");
    assertTest(isset($loginRes['user']['id']) && (int)$loginRes['user']['id'] === $targetUserId,
        "POST /api/login preserves user account id");
    assertTest(isset($loginRes['user']['employee_id']) && (int)$loginRes['user']['employee_id'] === $targetEmpId,
        "POST /api/login exposes reliable user.employee_id matching linked employee ($targetEmpId)");
    assertTest(isset($loginRes['user']['employee']) && (int)$loginRes['user']['employee']['id'] === $targetEmpId,
        "POST /api/login exposes user.employee profile object");

    // 15.3 Authenticated User WITHOUT Linked Employee Profile (/api/user)
    $standaloneEmail = 'standalone_user_' . uniqid() . '@test.local';
    $standalonePass = 'StandalonePass123!';
    $db->prepare("INSERT INTO users (name, email, password, created_at, updated_at) VALUES ('Standalone User', :email, :password, NOW(), NOW())")
       ->execute(['email' => $standaloneEmail, 'password' => password_hash($standalonePass, PASSWORD_BCRYPT)]);
    $standaloneUserId = (int)$db->lastInsertId();
    $createdUserIds[] = $standaloneUserId;

    $hrRoleId = (int)$db->query("SELECT id FROM roles WHERE name = 'HR Admin' LIMIT 1")->fetchColumn();
    if ($hrRoleId > 0) {
        $db->prepare("INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (:role_id, 'App\\Models\\User', :user_id)")
           ->execute(['role_id' => $hrRoleId, 'user_id' => $standaloneUserId]);
    }

    $noEmpUserRes = callEndpoint('GET', '/api/user', $standaloneUserId);
    assertTest(isset($noEmpUserRes['id']) && (int)$noEmpUserRes['id'] === $standaloneUserId,
        "GET /api/user for standalone user preserves account id (200 OK)");
    assertTest(array_key_exists('employee_id', $noEmpUserRes) && $noEmpUserRes['employee_id'] === null,
        "GET /api/user returns safe null employee_id for user without employee profile");
    assertTest(array_key_exists('employee', $noEmpUserRes) && $noEmpUserRes['employee'] === null,
        "GET /api/user returns safe null employee object for user without employee profile");

    // 15.4 Authenticated User WITHOUT Linked Employee Profile (/api/login)
    $noEmpLoginRes = callEndpoint('POST', '/api/login', null, ['email' => $standaloneEmail, 'password' => $standalonePass]);
    assertTest(isset($noEmpLoginRes['access_token']) && !empty($noEmpLoginRes['access_token']),
        "POST /api/login succeeds for standalone user (200 OK)");
    assertTest(array_key_exists('employee_id', $noEmpLoginRes['user']) && $noEmpLoginRes['user']['employee_id'] === null,
        "POST /api/login returns safe null user.employee_id for user without employee profile");
    assertTest(array_key_exists('employee', $noEmpLoginRes['user']) && $noEmpLoginRes['user']['employee'] === null,
        "POST /api/login returns safe null user.employee object for user without employee profile");

    // 15.5 Security: Standalone User Denied on Employee-Only Actions
    $checkInRes = callEndpoint('POST', '/api/attendance/check-in', $standaloneUserId, ['remarks' => 'Unauthorized punch']);
    assertTest(isset($checkInRes['message']) && stripos($checkInRes['message'], 'No employee profile') !== false,
        "Standalone user without employee profile denied on attendance check-in (403 Forbidden)");

    $corrSubmissionRes = callEndpoint('POST', '/api/attendance/corrections', $standaloneUserId, [
        'attendance_id' => 999999,
        'requested_check_in' => '2026-10-27 09:00:00',
        'requested_check_out' => '2026-10-27 18:00:00',
        'reason' => 'Unauthorized correction request attempt'
    ]);
    assertTest(isset($corrSubmissionRes['error']) && stripos($corrSubmissionRes['error'], 'No employee profile') !== false,
        "Standalone user without employee profile denied on correction submission (403 Forbidden)");

    $myCorrRes = callEndpoint('GET', '/api/attendance/corrections/my', $standaloneUserId);
    assertTest(isset($myCorrRes['error']) && stripos($myCorrRes['error'], 'No employee profile') !== false,
        "Standalone user without employee profile denied on /api/attendance/corrections/my (403 Forbidden)");

} finally {
    // -------------------------------------------------------------------------
    // 5. Strict Teardown & Safety Guard
    // -------------------------------------------------------------------------
    $currentDb = (string)$db->query("SELECT DATABASE()")->fetchColumn();
    if (strcasecmp($currentDb, $testDbName) !== 0 || strcasecmp($currentDb, $devDbName) === 0) {
        fwrite(STDERR, "FATAL SAFETY VIOLATION: Cleanup aborted. Connected database ($currentDb) is not the designated test database.\n");
    } else {
        if (!empty($createdCorrIds)) {
            $cList = implode(',', $createdCorrIds);
            $db->exec("DELETE FROM attendance_correction_history WHERE correction_id IN ($cList)");
            $db->exec("DELETE FROM attendance_corrections WHERE id IN ($cList)");
        }
        if (!empty($createdAttIds)) {
            $aList = implode(',', $createdAttIds);
            $db->exec("DELETE FROM attendances WHERE id IN ($aList)");
        }
        if (!empty($createdUserIds)) {
            $uList = implode(',', $createdUserIds);
            $db->exec("DELETE FROM model_has_roles WHERE model_id IN ($uList) AND model_type = 'App\\\\Models\\\\User'");
            $db->exec("DELETE FROM employees WHERE user_id IN ($uList)");
            $db->exec("DELETE FROM users WHERE id IN ($uList)");
        }
        if (!empty($createdEmpIds)) {
            $eList = implode(',', $createdEmpIds);
            $db->exec("DELETE FROM employees WHERE id IN ($eList)");
        }
        echo "\n>>> Cleanup Complete: All isolated test records removed cleanly from '$testDbName'. <<<\n";
    }
}

// -------------------------------------------------------------------------
// Summary
// -------------------------------------------------------------------------
echo "\n====================================================================\n";
echo "=== TEST SUMMARY: $passCount PASSED, $failCount FAILED ===\n";
echo "====================================================================\n";
if ($failCount > 0) {
    exit(1);
}
