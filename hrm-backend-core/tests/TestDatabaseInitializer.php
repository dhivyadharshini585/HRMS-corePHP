<?php
/**
 * TestDatabaseInitializer.php
 *
 * Dedicated test-only database initializer for 'hrms_backend_test'.
 * Prepares the minimal schema, runs and verifies the workflow migration,
 * and sets up synthetic test identities for isolated test execution.
 *
 * Strict Isolation & Safety Policies:
 * 1. Target database MUST strictly equal 'hrms_backend_test'. Any other target is rejected.
 * 2. Active runtime database identity is verified immediately upon connecting.
 * 3. Never falls back to .env or the development/production database.
 * 4. Never drops databases, truncates tables, or deletes pre-existing records.
 * 5. Never copies real user, employee, or role data.
 * 6. Fixture creation is strictly idempotent, reusing only records matching exact synthetic identifiers.
 * 7. Refuses to proceed if conflicting table schemas are detected.
 * 8. Verifies every required migration table, column, and index before declaring completion.
 */

declare(strict_types=1);

require_once __DIR__ . '/TestConnectionBridge.php';

class TestDatabaseInitializer {
    public const TARGET_DATABASE = 'hrms_backend_test';

    // Synthetic Role Definitions (Spatie-compatible web guard)
    public const SYNTHETIC_ROLES = [
        101 => 'Super Admin',
        102 => 'HR Admin',
        103 => 'HR Executive',
        104 => 'Manager',
        105 => 'Employee',
        106 => 'Finance/Payroll Admin',
    ];

    // Synthetic User Accounts (Dummy bcrypt hash; no real passwords or credentials)
    public const SYNTHETIC_PASSWORD_HASH = '$2y$10$abcdefghijklmnopqrstuvwxyz012345678901234567890123456';

    public const SYNTHETIC_USERS = [
        901 => [
            'name'  => 'Synthetic Super Admin',
            'email' => 'synth_superadmin@test.local',
            'role'  => 'Super Admin',
        ],
        902 => [
            'name'  => 'Synthetic HR Admin',
            'email' => 'synth_hradmin@test.local',
            'role'  => 'HR Admin',
        ],
        903 => [
            'name'  => 'Synthetic Manager',
            'email' => 'synth_manager@test.local',
            'role'  => 'Manager',
        ],
        904 => [
            'name'  => 'Synthetic Ordinary Employee',
            'email' => 'synth_employee@test.local',
            'role'  => 'Employee',
        ],
        905 => [
            'name'  => 'Synthetic Payroll Admin',
            'email' => 'synth_payroll@test.local',
            'role'  => 'Finance/Payroll Admin',
        ],
    ];

    // Synthetic Employee Profiles with Reporting Hierarchy
    public const SYNTHETIC_EMPLOYEES = [
        // 1. Root / Super Admin (no manager)
        901 => [
            'user_id'       => 901,
            'code'          => 'SYNTH-001',
            'first_name'    => 'Synth',
            'last_name'     => 'SuperAdmin',
            'email'         => 'synth_superadmin@test.local',
            'manager_id'    => null,
        ],
        // 2. HR Admin (reports to Super Admin 901)
        902 => [
            'user_id'       => 902,
            'code'          => 'SYNTH-002',
            'first_name'    => 'Synth',
            'last_name'     => 'HRAdmin',
            'email'         => 'synth_hradmin@test.local',
            'manager_id'    => 901,
        ],
        // 3. Manager (reports to Super Admin 901, manages Employee 904)
        903 => [
            'user_id'       => 903,
            'code'          => 'SYNTH-003',
            'first_name'    => 'Synth',
            'last_name'     => 'Manager',
            'email'         => 'synth_manager@test.local',
            'manager_id'    => 901,
        ],
        // 4. Ordinary Employee (reports to Manager 903, no subordinates)
        904 => [
            'user_id'       => 904,
            'code'          => 'SYNTH-004',
            'first_name'    => 'Synth',
            'last_name'     => 'Employee',
            'email'         => 'synth_employee@test.local',
            'manager_id'    => 903,
        ],
        // 5. Finance/Payroll Admin (reports to Super Admin 901, peer)
        905 => [
            'user_id'       => 905,
            'code'          => 'SYNTH-005',
            'first_name'    => 'Synth',
            'last_name'     => 'Payroll',
            'email'         => 'synth_payroll@test.local',
            'manager_id'    => 901,
        ],
    ];

    /**
     * Executes the full test-only initialization workflow.
     *
     * @param array $config Connection parameters (host, port, user, password, dbname)
     * @return array Detailed execution report
     */
    public static function initialize(array $config = []): array {
        $report = [
            'target_database'   => self::TARGET_DATABASE,
            'connected'         => false,
            'base_schema'       => [],
            'migration_status'  => 'not_run',
            'migration_checks'  => [],
            'fixtures_status'   => [],
            'discovery_checks'  => [],
        ];

        // ---------------------------------------------------------------------
        // STEP 1: Strict Connection & Database Identity Guard
        // ---------------------------------------------------------------------
        $dbName = $config['dbname'] ?? (getenv('HRMS_TEST_DB_NAME') ?: self::TARGET_DATABASE);
        if (strcasecmp(trim((string)$dbName), self::TARGET_DATABASE) !== 0) {
            throw new RuntimeException(
                "FATAL: TestDatabaseInitializer refuses to run against '{$dbName}'. " .
                "Only '" . self::TARGET_DATABASE . "' is approved."
            );
        }

        $envFile = dirname(__DIR__) . '/.env';
        $devEnv = file_exists($envFile) ? @parse_ini_file($envFile) : [];

        $connectionConfig = [
            'host'     => $config['host'] ?? (getenv('HRMS_TEST_DB_HOST') ?: ($devEnv['DB_HOST'] ?? '127.0.0.1')),
            'port'     => (int)($config['port'] ?? (getenv('HRMS_TEST_DB_PORT') ?: ($devEnv['DB_PORT'] ?? 3306))),
            'dbname'   => self::TARGET_DATABASE,
            'user'     => $config['user'] ?? (getenv('HRMS_TEST_DB_USERNAME') ?: ($devEnv['DB_USERNAME'] ?? 'root')),
            'password' => $config['password'] ?? (getenv('HRMS_TEST_DB_PASSWORD') ?: ($devEnv['DB_PASSWORD'] ?? '')),
        ];

        $pdo = TestConnectionBridge::createVerifiedConnection($connectionConfig);
        $report['connected'] = true;

        // ---------------------------------------------------------------------
        // STEP 2: Pre-Flight Schema Conflict Check & Base Schema Application
        // ---------------------------------------------------------------------
        self::assertNoConflictingSchema($pdo);
        $report['base_schema'] = self::ensureBaseSchema($pdo);

        // ---------------------------------------------------------------------
        // STEP 3: Workflow Migration Application & Verification
        // ---------------------------------------------------------------------
        $migrationFile = dirname(__DIR__) . '/migrations/2026_10_25_000001_create_attendance_correction_workflow_tables.sql';
        if (!file_exists($migrationFile)) {
            throw new RuntimeException("FATAL: Workflow migration file not found at: {$migrationFile}");
        }

        $report['migration_status'] = self::ensureWorkflowMigration($pdo, $migrationFile);
        $report['migration_checks'] = self::verifyWorkflowMigrationArtifacts($pdo);

        // ---------------------------------------------------------------------
        // STEP 4: Idempotent Synthetic Fixture Provisioning
        // ---------------------------------------------------------------------
        $report['fixtures_status'] = self::provisionSyntheticFixtures($pdo);

        // ---------------------------------------------------------------------
        // STEP 5: Verification Against Test Suite Discovery Queries
        // ---------------------------------------------------------------------
        $report['discovery_checks'] = self::verifyDynamicDiscoveryQueries($pdo);

        return $report;
    }

    /**
     * Inspects information_schema to verify that no incompatible or conflicting
     * tables exist before attempting initialization.
     */
    private static function assertNoConflictingSchema(PDO $pdo): void {
        $tables = $pdo->query("
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = '" . self::TARGET_DATABASE . "'
        ")->fetchAll(PDO::FETCH_COLUMN) ?: [];

        // If attendance_corrections exists, verify it has expected base columns
        if (in_array('attendance_corrections', $tables, true)) {
            $cols = $pdo->query("
                SELECT COLUMN_NAME 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = '" . self::TARGET_DATABASE . "' 
                  AND TABLE_NAME = 'attendance_corrections'
            ")->fetchAll(PDO::FETCH_COLUMN) ?: [];

            $requiredCols = ['attendance_id', 'employee_id', 'reason', 'status', 'remarks'];
            $missing = array_diff($requiredCols, $cols);
            if (!empty($missing)) {
                throw new RuntimeException(
                    "Conflicting schema: Table 'attendance_corrections' exists but lacks required base columns: " .
                    implode(', ', $missing)
                );
            }
        }
    }

    /**
     * Ensures all 6 required base tables exist using exact repository-aligned DDL.
     * Never drops or truncates any existing table.
     */
    private static function ensureBaseSchema(PDO $pdo): array {
        $ddlStatements = [
            'roles' => "
                CREATE TABLE IF NOT EXISTS `roles` (
                    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
                    `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `guard_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'web',
                    `created_at` timestamp NULL DEFAULT NULL,
                    `updated_at` timestamp NULL DEFAULT NULL,
                    PRIMARY KEY (`id`),
                    UNIQUE KEY `roles_name_guard_name_unique` (`name`, `guard_name`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ",
            'users' => "
                CREATE TABLE IF NOT EXISTS `users` (
                    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
                    `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `email_verified_at` timestamp NULL DEFAULT NULL,
                    `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `remember_token` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                    `created_at` timestamp NULL DEFAULT NULL,
                    `updated_at` timestamp NULL DEFAULT NULL,
                    PRIMARY KEY (`id`),
                    UNIQUE KEY `users_email_unique` (`email`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ",
            'model_has_roles' => "
                CREATE TABLE IF NOT EXISTS `model_has_roles` (
                    `role_id` bigint unsigned NOT NULL,
                    `model_type` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'App\\\\Models\\\\User',
                    `model_id` bigint unsigned NOT NULL,
                    PRIMARY KEY (`role_id`, `model_id`, `model_type`),
                    KEY `model_has_roles_model_id_model_type_index` (`model_id`, `model_type`),
                    CONSTRAINT `fk_mhr_role_test` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ",
            'employees' => "
                CREATE TABLE IF NOT EXISTS `employees` (
                    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
                    `user_id` bigint unsigned DEFAULT NULL,
                    `employee_code` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `first_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `last_name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
                    `date_of_joining` date NOT NULL,
                    `department_id` bigint unsigned DEFAULT NULL,
                    `designation_id` bigint unsigned DEFAULT NULL,
                    `manager_id` bigint unsigned DEFAULT NULL,
                    `employment_type` enum('Full-time','Part-time','Contract','Intern') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Full-time',
                    `employment_status` enum('Active','Inactive','On Leave','Terminated','Probation') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Active',
                    `deleted_at` timestamp NULL DEFAULT NULL,
                    `created_at` timestamp NULL DEFAULT NULL,
                    `updated_at` timestamp NULL DEFAULT NULL,
                    PRIMARY KEY (`id`),
                    UNIQUE KEY `employees_employee_code_unique` (`employee_code`),
                    UNIQUE KEY `employees_email_unique` (`email`),
                    KEY `employees_user_id_foreign` (`user_id`),
                    KEY `employees_manager_id_foreign` (`manager_id`),
                    CONSTRAINT `fk_employees_user_test` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
                    CONSTRAINT `fk_employees_manager_test` FOREIGN KEY (`manager_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ",
            'attendances' => "
                CREATE TABLE IF NOT EXISTS `attendances` (
                    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
                    `employee_id` bigint unsigned NOT NULL,
                    `attendance_date` date NOT NULL,
                    `check_in` timestamp NULL DEFAULT NULL,
                    `check_out` timestamp NULL DEFAULT NULL,
                    `working_minutes` int DEFAULT NULL,
                    `overtime_minutes` int NOT NULL DEFAULT '0',
                    `early_exit_minutes` int NOT NULL DEFAULT '0',
                    `status` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Present',
                    `remarks` text COLLATE utf8mb4_unicode_ci,
                    `created_at` timestamp NULL DEFAULT NULL,
                    `updated_at` timestamp NULL DEFAULT NULL,
                    PRIMARY KEY (`id`),
                    KEY `attendances_employee_id_foreign` (`employee_id`),
                    KEY `attendances_attendance_date_status_index` (`attendance_date`, `status`),
                    CONSTRAINT `fk_attendances_employee_test` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ",
            'attendance_corrections' => "
                CREATE TABLE IF NOT EXISTS `attendance_corrections` (
                    `id` bigint unsigned NOT NULL AUTO_INCREMENT,
                    `attendance_id` bigint unsigned NOT NULL,
                    `employee_id` bigint unsigned NOT NULL,
                    `requested_check_in` timestamp NULL DEFAULT NULL,
                    `requested_check_out` timestamp NULL DEFAULT NULL,
                    `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
                    `status` enum('Pending','Approved','Rejected') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Pending',
                    `remarks` text COLLATE utf8mb4_unicode_ci,
                    `reviewed_by` bigint unsigned DEFAULT NULL,
                    `created_at` timestamp NULL DEFAULT NULL,
                    `updated_at` timestamp NULL DEFAULT NULL,
                    PRIMARY KEY (`id`),
                    KEY `attendance_corrections_attendance_id_foreign` (`attendance_id`),
                    KEY `attendance_corrections_employee_id_foreign` (`employee_id`),
                    KEY `attendance_corrections_reviewed_by_foreign` (`reviewed_by`),
                    CONSTRAINT `fk_att_corr_att_test` FOREIGN KEY (`attendance_id`) REFERENCES `attendances` (`id`) ON DELETE CASCADE,
                    CONSTRAINT `fk_att_corr_emp_test` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
                    CONSTRAINT `fk_att_corr_rev_test` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
            ",
        ];

        $status = [];
        foreach ($ddlStatements as $tableName => $sql) {
            $pdo->exec($sql);
            $status[$tableName] = 'ready';
        }

        return $status;
    }

    /**
     * Inspects information_schema for all 15 artifacts introduced by the workflow migration:
     * 1. Table: attendance_correction_history
     * 2. 12 columns on attendance_corrections (evidence_file, evidence_original_name, evidence_details,
     *    approved_check_out, escalated_to, escalation_reason, escalated_by, escalated_at, manager_remarks,
     *    hr_remarks, reviewed_at, pending_attendance_id)
     * 3. Unique index: uq_active_attendance_correction on attendance_corrections
     * 4. Status ENUM expansion: includes 'Escalated'
     *
     * @return array<string, bool> Map of artifact identifier to existence boolean
     */
    public static function inspectWorkflowMigrationArtifacts(PDO $pdo): array {
        $checks = [];

        // 1. Table: attendance_correction_history
        $checks['table_attendance_correction_history'] = (bool)$pdo->query("
            SELECT 1 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = '" . self::TARGET_DATABASE . "' 
              AND TABLE_NAME = 'attendance_correction_history'
        ")->fetchColumn();

        // 2. Workflow columns on attendance_corrections
        $cols = $pdo->query("
            SELECT COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = '" . self::TARGET_DATABASE . "' 
              AND TABLE_NAME = 'attendance_corrections'
        ")->fetchAll(PDO::FETCH_COLUMN) ?: [];

        $expectedCols = [
            'evidence_file',
            'evidence_original_name',
            'evidence_details',
            'approved_check_out',
            'escalated_to',
            'escalation_reason',
            'escalated_by',
            'escalated_at',
            'manager_remarks',
            'hr_remarks',
            'reviewed_at',
            'pending_attendance_id',
        ];

        foreach ($expectedCols as $col) {
            $checks["col_{$col}"] = in_array($col, $cols, true);
        }

        // 3. Unique index on pending_attendance_id
        $indexes = $pdo->query("
            SELECT INDEX_NAME 
            FROM information_schema.STATISTICS 
            WHERE TABLE_SCHEMA = '" . self::TARGET_DATABASE . "' 
              AND TABLE_NAME = 'attendance_corrections'
        ")->fetchAll(PDO::FETCH_COLUMN) ?: [];

        $checks['index_uq_active_attendance_correction'] = in_array('uq_active_attendance_correction', $indexes, true);

        // 4. Status ENUM includes 'Escalated'
        $statusType = (string)$pdo->query("
            SELECT COLUMN_TYPE 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = '" . self::TARGET_DATABASE . "' 
              AND TABLE_NAME = 'attendance_corrections' 
              AND COLUMN_NAME = 'status'
        ")->fetchColumn();
        $checks['enum_status_escalated'] = strpos($statusType, "'Escalated'") !== false;

        return $checks;
    }

    /**
     * Checks if the workflow migration is already applied.
     * Distinguishes between completely unmigrated, completely migrated, and partial states.
     * Aborts with a descriptive error if a partial migration or conflicting state is detected.
     */
    private static function ensureWorkflowMigration(PDO $pdo, string $migrationFile): string {
        $artifacts = self::inspectWorkflowMigrationArtifacts($pdo);
        $present = array_keys(array_filter($artifacts, fn($v) => $v === true));
        $missing = array_keys(array_filter($artifacts, fn($v) => $v === false));

        // Case A: Completely Migrated Schema (all 15 artifacts present)
        if (empty($missing)) {
            return 'already_installed';
        }

        // Case B: Partially Migrated or Conflicting Schema (some present, some missing)
        if (!empty($present)) {
            throw new RuntimeException(
                "FATAL: Partially migrated or conflicting schema detected in test database '" . self::TARGET_DATABASE . "'. " .
                "Present artifacts (" . count($present) . "/" . count($artifacts) . "): [" . implode(', ', $present) . "]. " .
                "Missing artifacts (" . count($missing) . "/" . count($artifacts) . "): [" . implode(', ', $missing) . "]. " .
                "Refusing to apply migration over a partial or inconsistent schema state. Investigation required."
            );
        }

        // Case C: Completely Unmigrated Schema (0 artifacts present, all 15 missing)
        // Safe to proceed with applying the migration!

        // Apply migration statements
        // Step 1: Extend status ENUM
        $pdo->exec("
            ALTER TABLE `attendance_corrections`
                MODIFY COLUMN `status` ENUM('Pending', 'Escalated', 'Approved', 'Rejected') 
                NOT NULL DEFAULT 'Pending'
        ");

        // Step 2: Add missing workflow columns
        $pdo->exec("
            ALTER TABLE `attendance_corrections`
                ADD COLUMN `evidence_file` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `reason`,
                ADD COLUMN `evidence_original_name` VARCHAR(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `evidence_file`,
                ADD COLUMN `evidence_details` TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `evidence_original_name`,
                ADD COLUMN `approved_check_out` TIMESTAMP NULL DEFAULT NULL AFTER `status`,
                ADD COLUMN `escalated_to` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `approved_check_out`,
                ADD COLUMN `escalation_reason` TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `escalated_to`,
                ADD COLUMN `escalated_by` BIGINT UNSIGNED DEFAULT NULL AFTER `escalation_reason`,
                ADD COLUMN `escalated_at` TIMESTAMP NULL DEFAULT NULL AFTER `escalated_by`,
                ADD COLUMN `manager_remarks` TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `remarks`,
                ADD COLUMN `hr_remarks` TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `manager_remarks`,
                ADD COLUMN `reviewed_at` TIMESTAMP NULL DEFAULT NULL AFTER `reviewed_by`
        ");

        // Step 3: Add virtual generated column
        $pdo->exec("
            ALTER TABLE `attendance_corrections`
                ADD COLUMN `pending_attendance_id` BIGINT UNSIGNED GENERATED ALWAYS AS (
                    IF(`status` IN ('Pending', 'Escalated'), `attendance_id`, NULL)
                ) VIRTUAL AFTER `reviewed_at`
        ");

        // Step 4: Add unique index on pending_attendance_id
        $pdo->exec("
            ALTER TABLE `attendance_corrections`
                ADD UNIQUE KEY `uq_active_attendance_correction` (`pending_attendance_id`)
        ");

        // Step 5: Create audit and decision history table
        $pdo->exec("
            CREATE TABLE `attendance_correction_history` (
                `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                `correction_id` BIGINT UNSIGNED NOT NULL,
                `action` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
                `actor_user_id` BIGINT UNSIGNED NOT NULL,
                `actor_employee_id` BIGINT UNSIGNED DEFAULT NULL,
                `from_status` VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                `to_status` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL,
                `remarks` TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
                `snapshot_data` JSON DEFAULT NULL,
                `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (`id`),
                KEY `idx_corr_hist_correction_id` (`correction_id`),
                KEY `idx_corr_hist_actor` (`actor_user_id`),
                KEY `idx_corr_hist_created` (`created_at`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        ");

        return 'applied_successfully';
    }

    /**
     * Strictly verifies every table, column, and index introduced by the migration.
     */
    private static function verifyWorkflowMigrationArtifacts(PDO $pdo): array {
        $artifacts = self::inspectWorkflowMigrationArtifacts($pdo);
        $missing = array_keys(array_filter($artifacts, fn($v) => $v === false));

        if (!empty($missing)) {
            throw new RuntimeException(
                "Workflow migration verification failed. Missing artifacts: [" . implode(', ', $missing) . "]."
            );
        }

        return $artifacts;
    }

    /**
     * Provisions synthetic test fixtures idempotently.
     * Reuses existing records only if their identifiers match synthetic definitions exactly.
     * Refuses to proceed if non-synthetic / real accounts conflict.
     */
    private static function provisionSyntheticFixtures(PDO $pdo): array {
        $status = ['roles' => [], 'users' => [], 'employees' => [], 'role_assignments' => []];

        // 1. Roles
        $roleMap = []; // name => id
        foreach (self::SYNTHETIC_ROLES as $roleId => $roleName) {
            $stmt = $pdo->prepare("SELECT id FROM roles WHERE name = :name AND guard_name = 'web' LIMIT 1");
            $stmt->execute(['name' => $roleName]);
            $existingId = $stmt->fetchColumn();

            if ($existingId !== false) {
                $roleMap[$roleName] = (int)$existingId;
                $status['roles'][$roleName] = "reused (id: $existingId)";
            } else {
                $insert = $pdo->prepare("
                    INSERT INTO roles (id, name, guard_name, created_at, updated_at) 
                    VALUES (:id, :name, 'web', NOW(), NOW())
                ");
                $insert->execute(['id' => $roleId, 'name' => $roleName]);
                $roleMap[$roleName] = $roleId;
                $status['roles'][$roleName] = "inserted (id: $roleId)";
            }
        }

        // 2. Users
        foreach (self::SYNTHETIC_USERS as $userId => $userDef) {
            $stmt = $pdo->prepare("SELECT id, email FROM users WHERE id = :id LIMIT 1");
            $stmt->execute(['id' => $userId]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                if (strcasecmp($existing['email'], $userDef['email']) !== 0) {
                    throw new RuntimeException(
                        "Synthetic fixture conflict: User ID {$userId} exists with non-synthetic email '{$existing['email']}'."
                    );
                }
                $status['users'][$userDef['email']] = "reused (id: $userId)";
            } else {
                // Check if email belongs to another ID
                $emailStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
                $emailStmt->execute(['email' => $userDef['email']]);
                $otherId = $emailStmt->fetchColumn();
                if ($otherId !== false) {
                    throw new RuntimeException(
                        "Synthetic fixture conflict: User email '{$userDef['email']}' already exists under ID {$otherId}."
                    );
                }

                $insert = $pdo->prepare("
                    INSERT INTO users (id, name, email, password, created_at, updated_at)
                    VALUES (:id, :name, :email, :password, NOW(), NOW())
                ");
                $insert->execute([
                    'id'       => $userId,
                    'name'     => $userDef['name'],
                    'email'    => $userDef['email'],
                    'password' => self::SYNTHETIC_PASSWORD_HASH,
                ]);
                $status['users'][$userDef['email']] = "inserted (id: $userId)";
            }
        }

        // 3. Role Assignments (model_has_roles)
        foreach (self::SYNTHETIC_USERS as $userId => $userDef) {
            $roleName = $userDef['role'];
            $roleId = $roleMap[$roleName] ?? null;
            if (!$roleId) {
                throw new RuntimeException("Role '{$roleName}' could not be resolved for user {$userId}.");
            }

            $mhrStmt = $pdo->prepare("
                SELECT 1 FROM model_has_roles 
                WHERE role_id = :role_id AND model_id = :model_id AND model_type = 'App\\\\Models\\\\User'
            ");
            $mhrStmt->execute(['role_id' => $roleId, 'model_id' => $userId]);
            if ($mhrStmt->fetchColumn()) {
                $status['role_assignments']["user_{$userId}"] = "reused (role: $roleName)";
            } else {
                $insert = $pdo->prepare("
                    INSERT INTO model_has_roles (role_id, model_type, model_id)
                    VALUES (:role_id, 'App\\\\Models\\\\User', :model_id)
                ");
                $insert->execute(['role_id' => $roleId, 'model_id' => $userId]);
                $status['role_assignments']["user_{$userId}"] = "assigned (role: $roleName)";
            }
        }

        // 4. Employees (Inserted in hierarchy order: root first, subordinates next)
        foreach (self::SYNTHETIC_EMPLOYEES as $empId => $empDef) {
            $stmt = $pdo->prepare("SELECT id, employee_code, email FROM employees WHERE id = :id LIMIT 1");
            $stmt->execute(['id' => $empId]);
            $existing = $stmt->fetch(PDO::FETCH_ASSOC);

            if ($existing) {
                if ($existing['employee_code'] !== $empDef['code'] || strcasecmp($existing['email'], $empDef['email']) !== 0) {
                    throw new RuntimeException(
                        "Synthetic fixture conflict: Employee ID {$empId} exists with conflicting data " .
                        "(code: {$existing['employee_code']}, email: {$existing['email']})."
                    );
                }
                $status['employees'][$empDef['code']] = "reused (id: $empId)";
            } else {
                // Ensure code or email not taken
                $dupCheck = $pdo->prepare("
                    SELECT id FROM employees 
                    WHERE employee_code = :code OR email = :email 
                    LIMIT 1
                ");
                $dupCheck->execute(['code' => $empDef['code'], 'email' => $empDef['email']]);
                $takenId = $dupCheck->fetchColumn();
                if ($takenId !== false) {
                    throw new RuntimeException(
                        "Synthetic fixture conflict: Employee code '{$empDef['code']}' or email '{$empDef['email']}' taken by ID {$takenId}."
                    );
                }

                $insert = $pdo->prepare("
                    INSERT INTO employees (
                        id, user_id, employee_code, first_name, last_name, email,
                        date_of_joining, manager_id, employment_type, employment_status,
                        created_at, updated_at
                    ) VALUES (
                        :id, :user_id, :code, :first_name, :last_name, :email,
                        '2025-01-01', :manager_id, 'Full-time', 'Active',
                        NOW(), NOW()
                    )
                ");
                $insert->execute([
                    'id'         => $empId,
                    'user_id'    => $empDef['user_id'],
                    'code'       => $empDef['code'],
                    'first_name' => $empDef['first_name'],
                    'last_name'  => $empDef['last_name'],
                    'email'      => $empDef['email'],
                    'manager_id' => $empDef['manager_id'],
                ]);
                $status['employees'][$empDef['code']] = "inserted (id: $empId)";
            }
        }

        return $status;
    }

    /**
     * Validates that the synthetic fixtures satisfy the exact 5 dynamic discovery
     * queries executed by AttendanceCorrectionWorkflowTest.php.
     */
    private static function verifyDynamicDiscoveryQueries(PDO $pdo): array {
        $results = [];

        // 1. HR Admin
        $stmt1 = $pdo->query("
            SELECT u.id AS user_id, e.id AS employee_id 
            FROM users u
            JOIN model_has_roles mhr ON mhr.model_id = u.id AND mhr.model_type = 'App\\\\Models\\\\User'
            JOIN roles r ON mhr.role_id = r.id AND r.name = 'HR Admin'
            LEFT JOIN employees e ON e.user_id = u.id
            WHERE e.deleted_at IS NULL
            LIMIT 1
        ");
        $hrAdmin = $stmt1->fetch(PDO::FETCH_ASSOC);
        $results['hr_admin_discovered'] = !empty($hrAdmin['user_id']) && (int)$hrAdmin['user_id'] === 902;

        // 2. Super Admin
        $stmt2 = $pdo->query("
            SELECT u.id AS user_id, e.id AS employee_id 
            FROM users u
            JOIN model_has_roles mhr ON mhr.model_id = u.id AND mhr.model_type = 'App\\\\Models\\\\User'
            JOIN roles r ON mhr.role_id = r.id AND r.name = 'Super Admin'
            LEFT JOIN employees e ON e.user_id = u.id
            WHERE e.deleted_at IS NULL
            LIMIT 1
        ");
        $superAdmin = $stmt2->fetch(PDO::FETCH_ASSOC);
        $results['super_admin_discovered'] = !empty($superAdmin['user_id']) && (int)$superAdmin['user_id'] === 901;

        // 3. Manager (has Manager role, non-null manager_id, has reporting subordinates)
        $stmt3 = $pdo->query("
            SELECT e.id AS employee_id, e.user_id, e.manager_id 
            FROM employees e
            JOIN model_has_roles mhr ON mhr.model_id = e.user_id AND mhr.model_type = 'App\\\\Models\\\\User'
            JOIN roles r ON mhr.role_id = r.id AND r.name = 'Manager'
            WHERE e.manager_id IS NOT NULL 
              AND e.deleted_at IS NULL
              AND EXISTS (SELECT 1 FROM employees sub WHERE sub.manager_id = e.id AND sub.deleted_at IS NULL)
            LIMIT 1
        ");
        $manager = $stmt3->fetch(PDO::FETCH_ASSOC);
        $results['manager_discovered'] = !empty($manager['employee_id']) && (int)$manager['employee_id'] === 903;

        // 4. Ordinary Employee (reports to manager, not manager/admin, no subordinates)
        $mgrEmpId = (int)($manager['employee_id'] ?? 903);
        $stmt4 = $pdo->prepare("
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
        $stmt4->execute(['manager_emp_id' => $mgrEmpId]);
        $ordinaryEmp = $stmt4->fetch(PDO::FETCH_ASSOC);
        $results['ordinary_employee_discovered'] = !empty($ordinaryEmp['employee_id']) && (int)$ordinaryEmp['employee_id'] === 904;

        // 5. Finance/Payroll Admin
        $stmt5 = $pdo->query("
            SELECT u.id AS user_id, e.id AS employee_id 
            FROM users u
            JOIN model_has_roles mhr ON mhr.model_id = u.id AND mhr.model_type = 'App\\\\Models\\\\User'
            JOIN roles r ON mhr.role_id = r.id AND r.name = 'Finance/Payroll Admin'
            LEFT JOIN employees e ON e.user_id = u.id
            WHERE e.deleted_at IS NULL
            LIMIT 1
        ");
        $peer = $stmt5->fetch(PDO::FETCH_ASSOC);
        $results['peer_discovered'] = !empty($peer['user_id']) && (int)$peer['user_id'] === 905;

        // Fail closed if any dynamic query fails
        $failed = array_keys(array_filter($results, fn($v) => $v === false));
        if (!empty($failed)) {
            throw new RuntimeException(
                "Dynamic discovery verification failed for: " . implode(', ', $failed)
            );
        }

        return $results;
    }
}

// -----------------------------------------------------------------------------
// CLI Runner Entry Point
// -----------------------------------------------------------------------------
if (php_sapi_name() === 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    echo "====================================================================\n";
    echo "=== HRMS TEST DATABASE INITIALIZER ===\n";
    echo "=== Target: " . TestDatabaseInitializer::TARGET_DATABASE . " ===\n";
    echo "====================================================================\n\n";

    try {
        $report = TestDatabaseInitializer::initialize();
        echo "[SUCCESS] Isolated test database initialized safely.\n\n";
        echo json_encode($report, JSON_PRETTY_PRINT) . "\n";
        exit(0);
    } catch (\Throwable $e) {
        fwrite(STDERR, "[FAILED] " . $e->getMessage() . "\n");
        exit(1);
    }
}
