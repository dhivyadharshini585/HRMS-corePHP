<?php

class Auth {
    /**
     * Known insecure placeholder secret that must never be accepted.
     */
    private const INSECURE_PLACEHOLDER = 'your-super-secret-key-change-this';

    /**
     * Minimum secret length recommended for HS256 (256 bits = 32 bytes/characters).
     */
    private const MIN_SECRET_LENGTH = 32;

    /**
     * Loads and validates the JWT secret from server-side configuration.
     * Fails closed if missing, empty, matching the insecure placeholder, or too short.
     *
     * @return string Valid secret, or empty string if invalid/missing
     */
    public static function getSecret(): string {
        static $cachedSecret = null;
        if ($cachedSecret !== null) {
            return $cachedSecret;
        }

        $envPath = __DIR__ . '/../.env';
        if (!file_exists($envPath)) {
            $cachedSecret = '';
            return $cachedSecret;
        }

        $env = @parse_ini_file($envPath);
        if (!is_array($env)) {
            $cachedSecret = '';
            return $cachedSecret;
        }

        $secret = $env['JWT_SECRET'] ?? '';
        if (!is_string($secret)) {
            $cachedSecret = '';
            return $cachedSecret;
        }

        $secret = trim($secret);

        // Fail closed: reject empty, known placeholder, or obviously weak secret
        if ($secret === '' || $secret === self::INSECURE_PLACEHOLDER || strlen($secret) < self::MIN_SECRET_LENGTH) {
            $cachedSecret = '';
            return $cachedSecret;
        }

        $cachedSecret = $secret;
        return $cachedSecret;
    }

    /**
     * Base64Url encoding helper
     */
    private static function base64UrlEncode(string $data): string {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    /**
     * Base64Url decoding helper with strict validation
     */
    private static function base64UrlDecode(string $data): ?string {
        $remainder = strlen($data) % 4;
        if ($remainder) {
            $padLen = 4 - $remainder;
            $data .= str_repeat('=', $padLen);
        }
        $decoded = base64_decode(strtr($data, '-_', '+/'), true);
        return $decoded !== false ? $decoded : null;
    }

    public static function generateToken($user_id) {
        $secret = self::getSecret();
        if ($secret === '') {
            error_log('[Auth] Refusing to sign JWT: JWT_SECRET is missing, insecure, or invalid.');
            return false;
        }

        if (empty($user_id) || !is_numeric($user_id)) {
            return false;
        }

        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $payload = json_encode([
            'user_id' => (int)$user_id,
            'iat' => time(),
            'exp' => time() + 86400 // 1 day expiration
        ]);

        if ($header === false || $payload === false) {
            return false;
        }

        $base64UrlHeader = self::base64UrlEncode($header);
        $base64UrlPayload = self::base64UrlEncode($payload);

        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, $secret, true);
        $base64UrlSignature = self::base64UrlEncode($signature);

        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }

    public static function verifyToken($token) {
        $secret = self::getSecret();
        if ($secret === '') {
            error_log('[Auth] Refusing to verify JWT: JWT_SECRET is missing, insecure, or invalid.');
            return false;
        }

        if (!is_string($token)) {
            return false;
        }

        $tokenParts = explode('.', $token);
        if (count($tokenParts) !== 3) {
            return false;
        }

        list($headerB64, $payloadB64, $signatureProvided) = $tokenParts;

        $headerJson = self::base64UrlDecode($headerB64);
        $payloadJson = self::base64UrlDecode($payloadB64);

        if ($headerJson === null || $payloadJson === null) {
            return false;
        }

        // Validate Header
        $headerData = json_decode($headerJson, true);
        if (!is_array($headerData) || !isset($headerData['alg']) || $headerData['alg'] !== 'HS256') {
            return false;
        }

        // Validate Payload & Claims
        $payloadData = json_decode($payloadJson, true);
        if (!is_array($payloadData)) {
            return false;
        }

        // Require 'exp' claim and verify token has not expired
        if (!isset($payloadData['exp']) || !is_numeric($payloadData['exp']) || (int)$payloadData['exp'] < time()) {
            return false;
        }

        // Require 'user_id' claim and ensure it is valid
        if (!isset($payloadData['user_id']) || !is_numeric($payloadData['user_id']) || (int)$payloadData['user_id'] <= 0) {
            return false;
        }

        // Verify HMAC-SHA256 signature using timing-safe comparison
        $expectedSignatureRaw = hash_hmac('sha256', $headerB64 . "." . $payloadB64, $secret, true);
        $expectedSignatureB64 = self::base64UrlEncode($expectedSignatureRaw);

        if (!hash_equals($expectedSignatureB64, $signatureProvided)) {
            return false;
        }

        return (int)$payloadData['user_id'];
    }

    public static function getBearerToken() {
        $headers = null;
        if (isset($_SERVER['Authorization'])) {
            $headers = trim($_SERVER["Authorization"]);
        } else if (isset($_SERVER['HTTP_AUTHORIZATION'])) { // Nginx or fast CGI
            $headers = trim($_SERVER["HTTP_AUTHORIZATION"]);
        } elseif (function_exists('apache_request_headers')) {
            $requestHeaders = apache_request_headers();
            $requestHeaders = array_combine(array_map('ucwords', array_keys($requestHeaders)), array_values($requestHeaders));
            if (isset($requestHeaders['Authorization'])) {
                $headers = trim($requestHeaders['Authorization']);
            }
        }
        if (!empty($headers)) {
            if (preg_match('/Bearer\s(\S+)/', $headers, $matches)) {
                return $matches[1];
            }
        }
        return null;
    }

    public static function authenticate() {
        $token = self::getBearerToken();
        if (!$token) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthenticated']);
            exit();
        }
        $user_id = self::verifyToken($token);
        if (!$user_id) {
            http_response_code(401);
            echo json_encode(['error' => 'Invalid or expired token']);
            exit();
        }
        return $user_id;
    }

    /**
     * Resolves an authenticated user ID into an authoritative server-side identity context.
     * Fetches primary user details, assigned RBAC roles, and linked employee profile.
     *
     * @param int|string $user_id
     * @return array|null Resolved identity array or null if user does not exist or invalid
     */
    public static function resolveUser($user_id): ?array {
        if (empty($user_id) || !is_numeric($user_id) || (int)$user_id <= 0) {
            return null;
        }

        $userId = (int)$user_id;

        try {
            $db = Database::getConnection();

            // 1. Fetch user existence and basic account details
            $userStmt = $db->prepare("SELECT id, name, email FROM users WHERE id = :id LIMIT 1");
            $userStmt->execute(['id' => $userId]);
            $userData = $userStmt->fetch(PDO::FETCH_ASSOC);

            if (!$userData) {
                return null;
            }

            // 2. Fetch authoritative roles from Spatie RBAC schema
            $roleStmt = $db->prepare("
                SELECT r.name
                FROM roles r
                JOIN model_has_roles mhr ON r.id = mhr.role_id
                WHERE mhr.model_id = :user_id
                  AND mhr.model_type = 'App\\\\Models\\\\User'
            ");
            $roleStmt->execute(['user_id' => $userId]);
            $roles = $roleStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

            // Primary role determination with safe unprivileged fallback ('Employee')
            $primaryRole = 'Employee';
            if (in_array('Super Admin', $roles, true)) {
                $primaryRole = 'Super Admin';
            } elseif (in_array('HR Admin', $roles, true)) {
                $primaryRole = 'HR Admin';
            } elseif (in_array('HR Executive', $roles, true)) {
                $primaryRole = 'HR Executive';
            } elseif (in_array('Manager', $roles, true)) {
                $primaryRole = 'Manager';
            } elseif (!empty($roles)) {
                $primaryRole = $roles[0];
            }

            // 3. Fetch linked employee profile (if one exists)
            $empStmt = $db->prepare("
                SELECT id, first_name, last_name, employee_code, department_id, designation_id, manager_id
                FROM employees
                WHERE user_id = :user_id
                LIMIT 1
            ");
            $empStmt->execute(['user_id' => $userId]);
            $employeeData = $empStmt->fetch(PDO::FETCH_ASSOC);

            $employeeId = $employeeData ? (int)$employeeData['id'] : null;

            return [
                'user_id' => $userId,
                'name' => $userData['name'],
                'email' => $userData['email'],
                'role' => $primaryRole,
                'roles' => $roles,
                'employee_id' => $employeeId,
                'employee' => $employeeData ?: null,
            ];
        } catch (\Throwable $e) {
            error_log('[Auth] Failed to resolve user identity: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Authenticates the incoming request via JWT and returns the resolved identity context.
     * Fails closed with 401 if token is invalid or if the user record no longer exists.
     *
     * @return array Resolved identity context: ['user_id' => ..., 'role' => ..., 'roles' => ..., 'employee_id' => ...]
     */
    public static function user(): array {
        static $resolvedContext = null;
        if ($resolvedContext !== null) {
            return $resolvedContext;
        }

        $userId = self::authenticate();
        $identity = self::resolveUser($userId);

        if (!$identity) {
            http_response_code(401);
            echo json_encode(['error' => 'User identity could not be verified']);
            exit();
        }

        $resolvedContext = $identity;
        return $resolvedContext;
    }
}
