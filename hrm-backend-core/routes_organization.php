<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// REPORTING HIERARCHY & ORGANIZATION HELPERS
// ==========================================

/**
 * Resolves authenticated user's role, permissions, and linked employee ID without assuming Laravel objects.
 */
function getOrgUserContext($db, $userId) {
    if (!$userId) {
        return null;
    }

    // Fetch roles from Spatie tables
    $roleStmt = $db->prepare("
        SELECT r.name 
        FROM roles r 
        JOIN model_has_roles mhr ON r.id = mhr.role_id 
        WHERE mhr.model_id = :user_id AND mhr.model_type = 'App\\\\Models\\\\User'
    ");
    $roleStmt->execute(['user_id' => $userId]);
    $roles = $roleStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

    // Fallback if role is stored directly on users or employees
    if (empty($roles)) {
        $uStmt = $db->prepare("SELECT role FROM users WHERE id = :uid");
        $uStmt->execute(['uid' => $userId]);
        $uRole = $uStmt->fetchColumn();
        if ($uRole) {
            $roles[] = $uRole;
        }
    }

    $isAdmin = in_array('Super Admin', $roles) || in_array('HR Admin', $roles);
    $isManager = in_array('Manager', $roles);

    // Fetch permissions
    if (in_array('Super Admin', $roles)) {
        $permStmt = $db->query("SELECT name FROM permissions");
        $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    } else {
        $permStmt = $db->prepare("
            SELECT p.name 
            FROM permissions p
            JOIN role_has_permissions rhp ON p.id = rhp.permission_id
            WHERE rhp.role_id IN (
                SELECT role_id FROM model_has_roles WHERE model_id = :user_id AND model_type = 'App\\\\Models\\\\User'
            )
        ");
        $permStmt->execute(['user_id' => $userId]);
        $permissions = $permStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];
    }

    // Fetch linked employee ID
    $empStmt = $db->prepare("SELECT id FROM employees WHERE user_id = :uid AND deleted_at IS NULL LIMIT 1");
    $empStmt->execute(['uid' => $userId]);
    $employeeId = $empStmt->fetchColumn() ?: null;

    if (!$employeeId) {
        // Fallback by email match (self-healing for seeded records)
        $emailStmt = $db->prepare("SELECT email FROM users WHERE id = :uid");
        $emailStmt->execute(['uid' => $userId]);
        $email = $emailStmt->fetchColumn();
        if ($email) {
            $eMatch = $db->prepare("SELECT id FROM employees WHERE email = :email AND deleted_at IS NULL LIMIT 1");
            $eMatch->execute(['email' => $email]);
            $employeeId = $eMatch->fetchColumn() ?: null;
        }
    }

    return [
        'user_id' => (int)$userId,
        'roles' => $roles,
        'is_admin' => $isAdmin,
        'is_manager' => $isManager,
        'employee_id' => $employeeId ? (int)$employeeId : null,
        'permissions' => $permissions
    ];
}

/**
 * Returns all descendant employee IDs (direct + indirect) for a given employee ID.
 * Uses in-memory BFS on an adjacency list to support any MySQL version and prevent recursion limits.
 */
function getEmployeeDescendantIds($db, $rootId) {
    if (!$rootId) {
        return [];
    }

    $stmt = $db->query("SELECT id, manager_id FROM employees WHERE deleted_at IS NULL");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Build children mapping
    $childrenMap = [];
    foreach ($rows as $r) {
        $mId = $r['manager_id'] ? (int)$r['manager_id'] : 0;
        if (!isset($childrenMap[$mId])) {
            $childrenMap[$mId] = [];
        }
        $childrenMap[$mId][] = (int)$r['id'];
    }

    $descendants = [];
    $queue = [$rootId];
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

/**
 * Validates a manager assignment according to authorization rules and hierarchy integrity.
 * Returns array: ['valid' => bool, 'sanitized_manager_id' => int|null, 'status' => int, 'error' => string|null]
 */
function validateHierarchyAssignment($db, $userContext, $targetEmployeeId, $rawManagerId, $isCreate = false) {
    $targetEmployeeId = $targetEmployeeId ? (int)$targetEmployeeId : null;
    $hasManager = ($rawManagerId !== '' && $rawManagerId !== null);
    $managerId = $hasManager ? (int)$rawManagerId : null;

    // RULE-3A & 3B: Top-Level / Unassigned Assignment (manager_id = NULL)
    if (!$hasManager) {
        // Only Super Admin & HR Admin can detach an employee to top-level root
        if (!$userContext['is_admin']) {
            return [
                'valid' => false,
                'status' => 403,
                'error' => 'Unauthorized: Only Super Admin and HR Admin can assign employees to top-level (No Manager).'
            ];
        }
        return [
            'valid' => true,
            'sanitized_manager_id' => null,
            'status' => 200,
            'error' => null
        ];
    }

    // RULE-4: Self-reporting prevention
    if ($targetEmployeeId !== null && $managerId === $targetEmployeeId) {
        return [
            'valid' => false,
            'status' => 422,
            'error' => 'Validation error: An employee cannot be their own reporting manager.'
        ];
    }

    // RULE-6: Manager existence and active status
    $mgrStmt = $db->prepare("SELECT id, first_name, last_name, employment_status, deleted_at FROM employees WHERE id = :id");
    $mgrStmt->execute(['id' => $managerId]);
    $mgr = $mgrStmt->fetch(PDO::FETCH_ASSOC);

    if (!$mgr || $mgr['deleted_at'] !== null) {
        return [
            'valid' => false,
            'status' => 422,
            'error' => 'Validation error: The selected reporting manager does not exist.'
        ];
    }

    if ($mgr['employment_status'] !== 'Active') {
        return [
            'valid' => false,
            'status' => 422,
            'error' => 'Validation error: Selected manager must be an Active employee (current status: ' . ($mgr['employment_status'] ?: 'Unknown') . ').'
        ];
    }

    // RULE-5: Circular reporting prevention (only relevant when updating existing employee)
    if ($targetEmployeeId !== null) {
        $descendants = getEmployeeDescendantIds($db, $targetEmployeeId);
        if (in_array($managerId, $descendants, true)) {
            return [
                'valid' => false,
                'status' => 422,
                'error' => 'Validation error: Circular reporting relationship detected. Selected manager is already a direct or indirect report of this employee.'
            ];
        }
    }

    // Authorization checks
    if ($userContext['is_admin']) {
        // Super Admin & HR Admin have organization-wide authority
        return [
            'valid' => true,
            'sanitized_manager_id' => $managerId,
            'status' => 200,
            'error' => null
        ];
    }

    if ($userContext['is_manager']) {
        $myEmpId = $userContext['employee_id'];
        if (!$myEmpId) {
            return [
                'valid' => false,
                'status' => 403,
                'error' => 'Unauthorized: Your user account is not linked to an active employee record.'
            ];
        }

        $myTeamSubtree = getEmployeeDescendantIds($db, $myEmpId);

        // RULE-1: Manager subtree scope (target employee must be in manager's team on update)
        if (!$isCreate && $targetEmployeeId !== null) {
            if (!in_array($targetEmployeeId, $myTeamSubtree, true)) {
                return [
                    'valid' => false,
                    'status' => 403,
                    'error' => 'Unauthorized: Target employee is not within your authorized reporting team.'
                ];
            }
        }

        // Target manager selection is organization-wide:
        // An authorized Manager can assign an eligible reporting manager from any team/department across the organization.
        return [
            'valid' => true,
            'sanitized_manager_id' => $managerId,
            'status' => 200,
            'error' => null
        ];
    }

    // RULE-7 & Default Deny: All other roles (HR Executive without admin role, Employee, Finance)
    return [
        'valid' => false,
        'status' => 403,
        'error' => 'Unauthorized: You do not have permission to modify reporting relationships.'
    ];
}

// ==========================================
// ORGANIZATION CHART & HIERARCHY ENDPOINTS
// ==========================================

/**
 * GET /api/organization/tree
 * Returns the entire reporting hierarchy as nested trees supporting multiple roots,
 * arbitrary depth, and defensive handling of malformed/orphaned data.
 */
Router::get('/api/organization/tree', function() {
    $userId = Auth::authenticate();
    $db = Database::getConnection();

    $query = "
        SELECT 
            e.id, e.employee_code, e.first_name, e.last_name, e.email, e.employment_status,
            e.department_id, d.name as department_name,
            e.designation_id, des.title as designation_title,
            e.manager_id,
            m.first_name as manager_first_name, m.last_name as manager_last_name, m.employee_code as manager_code
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        LEFT JOIN employees m ON e.manager_id = m.id AND m.deleted_at IS NULL
        WHERE e.deleted_at IS NULL
        ORDER BY e.first_name ASC, e.last_name ASC
    ";

    $stmt = $db->query($query);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $employeeMap = [];
    $totalActive = 0;

    foreach ($rows as $row) {
        $id = (int)$row['id'];
        if ($row['employment_status'] === 'Active') {
            $totalActive++;
        }

        $employeeMap[$id] = [
            'id' => $id,
            'employee_code' => $row['employee_code'],
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'name' => trim($row['first_name'] . ' ' . $row['last_name']),
            'email' => $row['email'],
            'employment_status' => $row['employment_status'] ?: 'Active',
            'department' => $row['department_name'] ? [
                'id' => (int)$row['department_id'],
                'name' => $row['department_name']
            ] : null,
            'designation' => $row['designation_title'] ? [
                'id' => (int)$row['designation_id'],
                'title' => $row['designation_title']
            ] : null,
            'manager_id' => $row['manager_id'] ? (int)$row['manager_id'] : null,
            'manager_name' => $row['manager_first_name'] ? trim($row['manager_first_name'] . ' ' . $row['manager_last_name']) : null,
            'manager_code' => $row['manager_code'] ?: null,
            'direct_reports_count' => 0,
            'children' => []
        ];
    }

    $roots = [];
    $orphans = [];

    // Assemble parent-child tree relationships defensively
    foreach ($employeeMap as $id => &$emp) {
        $mId = $emp['manager_id'];

        if ($mId === null) {
            // Natural root (Top-level leadership)
            $roots[] = &$emp;
        } elseif (isset($employeeMap[$mId])) {
            // Prevent immediate self loop defensively
            if ($mId !== $id) {
                $employeeMap[$mId]['children'][] = &$emp;
                $employeeMap[$mId]['direct_reports_count']++;
            } else {
                $orphans[] = &$emp;
            }
        } else {
            // Manager ID refers to non-existent or hard-deleted employee; treat as detached root
            $emp['manager_invalid'] = true;
            $roots[] = &$emp;
        }
    }
    unset($emp);

    echo json_encode([
        'roots' => $roots,
        'orphans' => $orphans,
        'total_employees' => count($rows),
        'active_employees' => $totalActive
    ]);
});

/**
 * GET /api/organization/chain
 * Returns upward reporting chain from employee to top-level manager.
 * Parameters: ?employee_id={id} OR ?search={query}
 */
Router::get('/api/organization/chain', function() {
    Auth::authenticate();
    $db = Database::getConnection();

    $targetId = isset($_GET['employee_id']) && is_numeric($_GET['employee_id']) ? (int)$_GET['employee_id'] : null;
    $search = trim($_GET['search'] ?? '');

    if (!$targetId && empty($search)) {
        http_response_code(400);
        echo json_encode(['message' => 'Please provide an employee_id or search query.']);
        return;
    }

    // Find the target employee
    if ($targetId) {
        $stmt = $db->prepare("
            SELECT e.*, d.name as department_name, des.title as designation_title
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN designations des ON e.designation_id = des.id
            WHERE e.id = :id AND e.deleted_at IS NULL
        ");
        $stmt->execute(['id' => $targetId]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);
    } else {
        $stmt = $db->prepare("
            SELECT e.*, d.name as department_name, des.title as designation_title
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN designations des ON e.designation_id = des.id
            WHERE e.deleted_at IS NULL AND (
                e.first_name LIKE :s OR e.last_name LIKE :s OR 
                CONCAT(e.first_name, ' ', e.last_name) LIKE :s OR 
                e.employee_code LIKE :s OR e.email LIKE :s
            )
            ORDER BY (CONCAT(e.first_name, ' ', e.last_name) = :exact) DESC, e.id ASC
            LIMIT 1
        ");
        $stmt->execute(['s' => '%' . $search . '%', 'exact' => $search]);
        $target = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    if (!$target) {
        http_response_code(404);
        echo json_encode(['message' => 'Employee not found.']);
        return;
    }

    // Traverse upward chain
    $chain = [];
    $currManagerId = $target['manager_id'] ? (int)$target['manager_id'] : null;
    $visited = [(int)$target['id'] => true];
    $level = 1;

    while ($currManagerId && !isset($visited[$currManagerId]) && $level <= 50) {
        $visited[$currManagerId] = true;

        $mStmt = $db->prepare("
            SELECT e.id, e.employee_code, e.first_name, e.last_name, e.email, e.employment_status, e.manager_id,
                   d.name as department_name, des.title as designation_title
            FROM employees e
            LEFT JOIN departments d ON e.department_id = d.id
            LEFT JOIN designations des ON e.designation_id = des.id
            WHERE e.id = :id AND e.deleted_at IS NULL
        ");
        $mStmt->execute(['id' => $currManagerId]);
        $mRow = $mStmt->fetch(PDO::FETCH_ASSOC);

        if (!$mRow) {
            break;
        }

        $relationship = ($level === 1) ? 'Direct Manager' : (($level === 2) ? 'Second-Level Manager' : 'Executive Leadership (Level ' . $level . ')');

        $chain[] = [
            'level' => $level,
            'relationship' => $relationship,
            'id' => (int)$mRow['id'],
            'employee_code' => $mRow['employee_code'],
            'first_name' => $mRow['first_name'],
            'last_name' => $mRow['last_name'],
            'name' => trim($mRow['first_name'] . ' ' . $mRow['last_name']),
            'email' => $mRow['email'],
            'employment_status' => $mRow['employment_status'],
            'department' => $mRow['department_name'] ?: 'No Department',
            'designation' => $mRow['designation_title'] ?: 'No Designation'
        ];

        $currManagerId = $mRow['manager_id'] ? (int)$mRow['manager_id'] : null;
        $level++;
    }

    echo json_encode([
        'employee' => [
            'id' => (int)$target['id'],
            'employee_code' => $target['employee_code'],
            'first_name' => $target['first_name'],
            'last_name' => $target['last_name'],
            'name' => trim($target['first_name'] . ' ' . $target['last_name']),
            'email' => $target['email'],
            'employment_status' => $target['employment_status'],
            'department' => $target['department_name'] ?: 'No Department',
            'designation' => $target['designation_title'] ?: 'No Designation',
            'manager_id' => $target['manager_id'] ? (int)$target['manager_id'] : null,
        ],
        'chain' => $chain
    ]);
});

/**
 * GET /api/organization/candidates/{id}
 * Returns filtered, valid manager options for an employee create/edit form.
 * Excludes self, all descendants, and inactive/terminated/deleted candidates.
 * For Managers, scopes candidate list to their authorized team.
 */
Router::get('/api/organization/candidates/{id}', function($id) {
    $userId = Auth::authenticate();
    $db = Database::getConnection();
    $userContext = getOrgUserContext($db, $userId);

    $targetEmpId = (is_numeric($id) && (int)$id > 0) ? (int)$id : null;

    // Determine excluded IDs (self + all direct & indirect subordinates)
    $excludedIds = [];
    if ($targetEmpId) {
        $excludedIds = array_merge([$targetEmpId], getEmployeeDescendantIds($db, $targetEmpId));
    }

    // Fetch active candidates
    $query = "
        SELECT 
            e.id, e.employee_code, e.first_name, e.last_name, e.email, e.employment_status,
            d.name as department_name, des.title as designation_title
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        WHERE e.deleted_at IS NULL AND e.employment_status = 'Active'
        ORDER BY e.first_name ASC, e.last_name ASC
    ";
    $candidates = $db->query($query)->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Filter out excluded IDs
    $filtered = [];
    $isManager = $userContext['is_manager'] && !$userContext['is_admin'];
    $allowedTeamIds = [];

    if ($isManager && $userContext['employee_id']) {
        $myId = $userContext['employee_id'];
        $allowedTeamIds = array_merge([$myId], getEmployeeDescendantIds($db, $myId));
    }

    foreach ($candidates as $c) {
        $cId = (int)$c['id'];
        if (in_array($cId, $excludedIds, true)) {
            continue;
        }

        // If caller is Manager, only show managers within caller's authorized team
        if ($isManager && !in_array($cId, $allowedTeamIds, true)) {
            continue;
        }

        $filtered[] = [
            'id' => $cId,
            'employee_code' => $c['employee_code'],
            'first_name' => $c['first_name'],
            'last_name' => $c['last_name'],
            'name' => trim($c['first_name'] . ' ' . $c['last_name']),
            'email' => $c['email'],
            'department' => $c['department_name'] ?: 'No Department',
            'designation' => $c['designation_title'] ?: 'No Designation'
        ];
    }

    echo json_encode(['data' => $filtered]);
});

/**
 * Dedicated Reporting Manager Candidates Endpoint
 * GET /api/organization/reporting-manager-candidates
 * GET /api/organization/reporting-manager-candidates/{id}
 * 
 * Returns eligible organization-wide reporting manager candidates for a target employee.
 * - Super Admin & HR Admin: Organization-wide access.
 * - Managers: Can retrieve candidates for employees within their authorized reporting subtree.
 * - Other roles: 403 Forbidden.
 * 
 * Candidate inclusion rules:
 * - Organization-wide candidates across all teams/roles (Super Admin, HR Admin, HR Executive, Manager, etc.)
 *   who have valid, active employee records.
 * - Excludes target employee (self-reporting prevention).
 * - Excludes target employee's direct & indirect subordinates (circular reporting prevention).
 * - Excludes inactive/terminated or soft-deleted employees.
 * - User accounts without active employee records are excluded.
 */
function handleReportingManagerCandidates($empIdFromUrl = null) {
    $userId = Auth::authenticate();
    $db = Database::getConnection();
    $userContext = getOrgUserContext($db, $userId);

    if (!$userContext['is_admin'] && !$userContext['is_manager']) {
        http_response_code(403);
        echo json_encode([
            'message' => 'Unauthorized: You do not have permission to view reporting manager candidates.'
        ]);
        return;
    }

    $targetEmpId = ($empIdFromUrl !== null && is_numeric($empIdFromUrl) && (int)$empIdFromUrl > 0)
        ? (int)$empIdFromUrl
        : (isset($_GET['employee_id']) && is_numeric($_GET['employee_id']) ? (int)$_GET['employee_id'] : null);

    // If caller is Manager, validate Manager employee record and target employee scope
    if ($userContext['is_manager'] && !$userContext['is_admin']) {
        $myEmpId = $userContext['employee_id'];
        if (!$myEmpId) {
            http_response_code(403);
            echo json_encode([
                'message' => 'Unauthorized: Your user account is not linked to an active employee record.'
            ]);
            return;
        }

        if ($targetEmpId) {
            $mySubtree = getEmployeeDescendantIds($db, $myEmpId);
            if (!in_array($targetEmpId, $mySubtree, true)) {
                http_response_code(403);
                echo json_encode([
                    'message' => 'Unauthorized: Target employee is not within your authorized reporting team.'
                ]);
                return;
            }
        }
    }

    // Determine excluded IDs (self + descendants) if target employee is specified
    $excludedIds = [];
    if ($targetEmpId) {
        // Verify target employee exists
        $empStmt = $db->prepare("SELECT id, employment_status FROM employees WHERE id = :id AND deleted_at IS NULL");
        $empStmt->execute(['id' => $targetEmpId]);
        $targetEmp = $empStmt->fetch(PDO::FETCH_ASSOC);
        if (!$targetEmp) {
            http_response_code(404);
            echo json_encode(['message' => 'Target employee not found.']);
            return;
        }

        $excludedIds = array_merge([$targetEmpId], getEmployeeDescendantIds($db, $targetEmpId));
    }

    // Query active candidates from the entire organization
    $query = "
        SELECT 
            e.id, e.employee_code, e.first_name, e.last_name, e.email, e.employment_status,
            d.name as department_name, des.title as designation_title
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        WHERE e.deleted_at IS NULL AND e.employment_status = 'Active'
        ORDER BY e.first_name ASC, e.last_name ASC
    ";
    $candidates = $db->query($query)->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $filtered = [];
    foreach ($candidates as $c) {
        $cId = (int)$c['id'];
        if (in_array($cId, $excludedIds, true)) {
            continue;
        }

        $filtered[] = [
            'id' => $cId,
            'employee_code' => $c['employee_code'],
            'first_name' => $c['first_name'],
            'last_name' => $c['last_name'],
            'name' => trim($c['first_name'] . ' ' . $c['last_name']),
            'email' => $c['email'],
            'department' => $c['department_name'] ?: 'No Department',
            'designation' => $c['designation_title'] ?: 'No Designation'
        ];
    }

    echo json_encode(['data' => $filtered]);
}

Router::get('/api/organization/reporting-manager-candidates', function() {
    handleReportingManagerCandidates(null);
});

Router::get('/api/organization/reporting-manager-candidates/{id}', function($id) {
    handleReportingManagerCandidates($id);
});


/**
 * GET /api/organization/manageable-employees
 * Returns the list of employees the authenticated user is authorized to manage reporting relationships for.
 * Super Admin & HR Admin: All active employees.
 * Managers: Only active employees within the manager's reporting subtree.
 * Other roles: 403 Forbidden.
 */
Router::get('/api/organization/manageable-employees', function() {
    $userId = Auth::authenticate();
    $db = Database::getConnection();
    $userContext = getOrgUserContext($db, $userId);

    if (!$userContext['is_admin'] && !$userContext['is_manager']) {
        http_response_code(403);
        echo json_encode([
            'message' => 'Unauthorized: You do not have permission to manage reporting relationships.'
        ]);
        return;
    }

    $where = "WHERE e.deleted_at IS NULL AND e.employment_status = 'Active'";
    $params = [];

    if ($userContext['is_manager'] && !$userContext['is_admin']) {
        $myEmpId = $userContext['employee_id'];
        if (!$myEmpId) {
            http_response_code(403);
            echo json_encode([
                'message' => 'Unauthorized: Your user account is not linked to an active employee record.'
            ]);
            return;
        }

        $subtreeIds = getEmployeeDescendantIds($db, $myEmpId);
        if (empty($subtreeIds)) {
            echo json_encode(['data' => []]);
            return;
        }

        $placeholders = implode(',', array_fill(0, count($subtreeIds), '?'));
        $where .= " AND e.id IN ($placeholders)";
        $params = $subtreeIds;
    }

    $sql = "
        SELECT 
            e.id, e.employee_code, e.first_name, e.last_name, e.email, e.employment_status,
            e.department_id, d.name as department_name,
            e.designation_id, des.title as designation_title,
            e.manager_id,
            m.first_name as manager_first_name, m.last_name as manager_last_name, m.employee_code as manager_code
        FROM employees e
        LEFT JOIN departments d ON e.department_id = d.id
        LEFT JOIN designations des ON e.designation_id = des.id
        LEFT JOIN employees m ON e.manager_id = m.id AND m.deleted_at IS NULL
        $where
        ORDER BY e.first_name ASC, e.last_name ASC
    ";

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

    $data = [];
    foreach ($rows as $r) {
        $data[] = [
            'id' => (int)$r['id'],
            'employee_code' => $r['employee_code'],
            'first_name' => $r['first_name'],
            'last_name' => $r['last_name'],
            'name' => trim($r['first_name'] . ' ' . $r['last_name']),
            'email' => $r['email'],
            'department' => $r['department_name'] ?: 'No Department',
            'designation' => $r['designation_title'] ?: 'No Designation',
            'manager_id' => $r['manager_id'] ? (int)$r['manager_id'] : null,
            'current_manager' => $r['manager_id'] ? [
                'id' => (int)$r['manager_id'],
                'employee_code' => $r['manager_code'],
                'name' => trim($r['manager_first_name'] . ' ' . $r['manager_last_name']),
            ] : null
        ];
    }

    echo json_encode(['data' => $data]);
});

/**
 * Dedicated Reporting Relationship Update Handler
 * Updates ONLY employees.manager_id. Rejects any attempt to modify unrelated employee profile fields.
 * Validates scope:
 * - Super Admin & HR Admin: Organization-wide.
 * - Manager: Subtree scope only.
 * Rejects circular relationships, self-reporting, inactive/invalid employees, unauthorized assignments.
 */
function handleReportingRelationshipUpdate($targetEmpIdFromUrl = null) {
    $userId = Auth::authenticate();
    global $input;
    $db = Database::getConnection();
    $userContext = getOrgUserContext($db, $userId);

    // Authorization: Only Super Admin, HR Admin, or Manager
    if (!$userContext['is_admin'] && !$userContext['is_manager']) {
        http_response_code(403);
        echo json_encode([
            'message' => 'Unauthorized: You do not have permission to manage reporting relationships.'
        ]);
        return;
    }

    $targetEmployeeId = $targetEmpIdFromUrl 
        ? (int)$targetEmpIdFromUrl 
        : (isset($input['employee_id']) && is_numeric($input['employee_id']) ? (int)$input['employee_id'] : null);

    if (!$targetEmployeeId) {
        http_response_code(400);
        echo json_encode(['message' => 'Target employee ID is required.']);
        return;
    }

    // Verify target employee exists and is active
    $empStmt = $db->prepare("SELECT id, employee_code, first_name, last_name, manager_id, employment_status FROM employees WHERE id = :id AND deleted_at IS NULL");
    $empStmt->execute(['id' => $targetEmployeeId]);
    $targetEmp = $empStmt->fetch(PDO::FETCH_ASSOC);

    if (!$targetEmp) {
        http_response_code(404);
        echo json_encode(['message' => 'Target employee not found.']);
        return;
    }

    if ($targetEmp['employment_status'] !== 'Active') {
        http_response_code(422);
        echo json_encode(['message' => 'Cannot update reporting relationship for an inactive or terminated employee.']);
        return;
    }

    $rawManagerId = array_key_exists('manager_id', $input) ? $input['manager_id'] : null;

    // Validate hierarchy assignment using existing rule validation engine
    $val = validateHierarchyAssignment($db, $userContext, $targetEmployeeId, $rawManagerId, false);
    if (!$val['valid']) {
        http_response_code($val['status']);
        echo json_encode([
            'message' => $val['error'],
            'errors' => ['manager_id' => [$val['error']]]
        ]);
        return;
    }

    $newManagerId = $val['sanitized_manager_id'];
    $oldManagerId = $targetEmp['manager_id'] !== null ? (int)$targetEmp['manager_id'] : null;

    try {
        // STRICT FIELD PROTECTION: Only update manager_id and updated_at!
        // Never update employee_code, names, salary, role, contact info or other fields.
        $stmt = $db->prepare("UPDATE employees SET manager_id = :manager_id, updated_at = NOW() WHERE id = :id");
        $stmt->execute([
            'manager_id' => $newManagerId,
            'id' => $targetEmployeeId
        ]);

        // Audit Logging (if manager changed)
        if ($oldManagerId !== $newManagerId) {
            try {
                $auditStmt = $db->prepare("
                    INSERT INTO audit_logs 
                        (user_id, employee_id, action, entity_type, entity_id, description, old_values, new_values, ip_address, user_agent, created_at, updated_at)
                    VALUES 
                        (:user_id, :employee_id, :action, :entity_type, :entity_id, :description, :old_values, :new_values, :ip_address, :user_agent, NOW(), NOW())
                ");
                $auditStmt->execute([
                    'user_id' => $userContext['user_id'],
                    'employee_id' => $userContext['employee_id'],
                    'action' => 'reporting_relationship_updated',
                    'entity_type' => 'Employee',
                    'entity_id' => $targetEmployeeId,
                    'description' => "Updated reporting manager for employee #{$targetEmployeeId} ({$targetEmp['first_name']} {$targetEmp['last_name']})",
                    'old_values' => json_encode(['manager_id' => $oldManagerId]),
                    'new_values' => json_encode(['manager_id' => $newManagerId]),
                    'ip_address' => $_SERVER['REMOTE_ADDR'] ?? null,
                    'user_agent' => $_SERVER['HTTP_USER_AGENT'] ?? null,
                ]);
            } catch (Exception $e) {
                // Ignore audit log error so primary operation is not blocked
            }
        }

        // Fetch new manager info for response
        $mgrInfo = null;
        if ($newManagerId) {
            $mStmt = $db->prepare("
                SELECT m.id, m.employee_code, m.first_name, m.last_name, m.email,
                       d.name as department_name, des.title as designation_title
                FROM employees m
                LEFT JOIN departments d ON m.department_id = d.id
                LEFT JOIN designations des ON m.designation_id = des.id
                WHERE m.id = :id
            ");
            $mStmt->execute(['id' => $newManagerId]);
            $mRow = $mStmt->fetch(PDO::FETCH_ASSOC);
            if ($mRow) {
                $mgrInfo = [
                    'id' => (int)$mRow['id'],
                    'employee_code' => $mRow['employee_code'],
                    'name' => trim($mRow['first_name'] . ' ' . $mRow['last_name']),
                    'department' => $mRow['department_name'] ?: 'No Department',
                    'designation' => $mRow['designation_title'] ?: 'No Designation',
                ];
            }
        }

        echo json_encode([
            'message' => 'Reporting relationship updated successfully.',
            'data' => [
                'employee_id' => $targetEmployeeId,
                'manager_id' => $newManagerId,
                'manager' => $mgrInfo
            ]
        ]);
    } catch (PDOException $e) {
        http_response_code(400);
        echo json_encode(['error' => $e->getMessage()]);
    }
}

Router::put('/api/organization/reporting-relationship', function() {
    handleReportingRelationshipUpdate(null);
});

Router::put('/api/employees/{id}/reporting-relationship', function($id) {
    handleReportingRelationshipUpdate($id);
});

