<?php
/**
 * TestConnectionBridge.php
 * 
 * Strict test database isolation bridge.
 * Enforces that all database operations in the test suite and its API subprocesses
 * connect strictly and exclusively to 'hrms_backend_test'.
 * 
 * Safety & Isolation Guards:
 * 1. Hardcoded target database whitelist: only 'hrms_backend_test' is permitted.
 * 2. Active runtime database verification via SELECT DATABASE().
 * 3. Verified reflection binding into core/Database::$conn with strict identity (===) check.
 * 4. Zero fallback to .env or development database.
 */

declare(strict_types=1);

class TestConnectionBridge {
    public const APPROVED_TEST_DB = 'hrms_backend_test';

    /**
     * Validates that the provided database name strictly matches the approved test database.
     *
     * @param string $dbName Database name to validate
     * @return string The validated database name
     * @throws RuntimeException if database name does not strictly equal APPROVED_TEST_DB
     */
    public static function validateDbName(string $dbName): string {
        $trimmed = trim($dbName);
        if (strcasecmp($trimmed, self::APPROVED_TEST_DB) !== 0) {
            throw new RuntimeException(
                "TestConnectionBridge FATAL: Target database '{$trimmed}' is rejected. " .
                "Only '" . self::APPROVED_TEST_DB . "' is permitted."
            );
        }
        return self::APPROVED_TEST_DB;
    }

    /**
     * Injects an isolated test PDO connection into Database::$conn and strictly
     * verifies that Database::getConnection() returns this exact instance pointing
     * to hrms_backend_test.
     *
     * @param PDO $pdo Active PDO connection
     * @param string $expectedDb Expected database name (must equal self::APPROVED_TEST_DB)
     * @return PDO The verified connection
     * @throws RuntimeException if injection or database identity verification fails
     */
    public static function injectAndVerify(PDO $pdo, string $expectedDb = self::APPROVED_TEST_DB): PDO {
        self::validateDbName($expectedDb);

        // 1. Verify active database on passed connection
        $activeDb = (string)$pdo->query("SELECT DATABASE()")->fetchColumn();
        if (strcasecmp($activeDb, self::APPROVED_TEST_DB) !== 0) {
            throw new RuntimeException(
                "TestConnectionBridge FATAL: Active PDO connection is on database '{$activeDb}', " .
                "not '" . self::APPROVED_TEST_DB . "'."
            );
        }

        // 2. Ensure Database class is loaded
        $dbFile = dirname(__DIR__) . '/core/Database.php';
        if (!class_exists('Database', false)) {
            if (!file_exists($dbFile)) {
                throw new RuntimeException("TestConnectionBridge FATAL: core/Database.php not found at {$dbFile}.");
            }
            require_once $dbFile;
        }

        // 3. Inject into Database::$conn
        $refProp = new ReflectionProperty('Database', 'conn');
        $refProp->setAccessible(true);
        $refProp->setValue(null, $pdo);

        // 4. Strict Identity & Active Database Verification
        $resolvedConn = Database::getConnection();
        if ($resolvedConn !== $pdo) {
            throw new RuntimeException(
                "TestConnectionBridge FATAL: Database::getConnection() did not return the injected test PDO instance."
            );
        }

        $resolvedDb = (string)$resolvedConn->query("SELECT DATABASE()")->fetchColumn();
        if (strcasecmp($resolvedDb, self::APPROVED_TEST_DB) !== 0) {
            throw new RuntimeException(
                "TestConnectionBridge FATAL: Database::getConnection() reports active database '{$resolvedDb}', " .
                "expected '" . self::APPROVED_TEST_DB . "'."
            );
        }

        return $resolvedConn;
    }

    /**
     * Creates a verified isolated PDO connection and injects it into Database::$conn.
     *
     * @param array $config Connection parameters: host, port, dbname, user, password
     * @return PDO Verified PDO connection
     * @throws RuntimeException if database name is unapproved or connection/verification fails
     */
    public static function createVerifiedConnection(array $config): PDO {
        $dbName = self::validateDbName($config['dbname'] ?? '');
        $host = $config['host'] ?? '127.0.0.1';
        $port = (int)($config['port'] ?? 3306);
        $user = $config['user'] ?? 'root';
        $pass = $config['password'] ?? '';

        $dsn = "mysql:host={$host};port={$port};dbname={$dbName};charset=utf8mb4";

        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4"
        ]);

        return self::injectAndVerify($pdo, $dbName);
    }
}
