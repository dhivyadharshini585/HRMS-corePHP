<?php

class Auth {
    private static $secret_key = 'your-super-secret-key-change-this'; // In production, move to .env

    public static function generateToken($user_id) {
        $header = json_encode(['typ' => 'JWT', 'alg' => 'HS256']);
        $payload = json_encode(['user_id' => $user_id, 'exp' => time() + 86400]); // 1 day expiration
        
        $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
        $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
        
        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::$secret_key, true);
        $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));
        
        return $base64UrlHeader . "." . $base64UrlPayload . "." . $base64UrlSignature;
    }

    public static function verifyToken($token) {
        $tokenParts = explode('.', $token);
        if (count($tokenParts) != 3) {
            return false;
        }

        $header = base64_decode(str_replace(['-', '_'], ['+', '/'], $tokenParts[0]));
        $payload = base64_decode(str_replace(['-', '_'], ['+', '/'], $tokenParts[1]));
        $signature_provided = $tokenParts[2];

        // check expiration
        $payload_data = json_decode($payload, true);
        if ($payload_data['exp'] < time()) {
            return false;
        }

        $base64UrlHeader = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($header));
        $base64UrlPayload = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($payload));
        $signature = hash_hmac('sha256', $base64UrlHeader . "." . $base64UrlPayload, self::$secret_key, true);
        $base64UrlSignature = str_replace(['+', '/', '='], ['-', '_', ''], base64_encode($signature));

        if ($base64UrlSignature === $signature_provided) {
            return $payload_data['user_id'];
        }

        return false;
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

    public static function user() {
        $userId = self::authenticate();
        $db = Database::getConnection();
        
        $userStmt = $db->prepare("SELECT id, name, email FROM users WHERE id = :id");
        $userStmt->execute(['id' => $userId]);
        $user = $userStmt->fetch(PDO::FETCH_ASSOC);
        if (!$user) {
            http_response_code(404);
            echo json_encode(['message' => 'User not found']);
            exit();
        }

        // Fetch employee_id
        $empStmt = $db->prepare("SELECT id FROM employees WHERE user_id = :uid AND deleted_at IS NULL");
        $empStmt->execute(['uid' => $userId]);
        $empId = $empStmt->fetchColumn();

        if (!$empId && !empty($user['email'])) {
            $empStmt2 = $db->prepare("SELECT id FROM employees WHERE email = :email AND deleted_at IS NULL");
            $empStmt2->execute(['email' => $user['email']]);
            $empId = $empStmt2->fetchColumn();
            if ($empId) {
                $db->prepare("UPDATE employees SET user_id = :uid WHERE id = :eid")->execute(['uid' => $userId, 'eid' => $empId]);
            }
        }

        // Fetch roles
        $roleStmt = $db->prepare("
            SELECT r.name
            FROM roles r
            JOIN model_has_roles mhr ON r.id = mhr.role_id
            WHERE mhr.model_id = :user_id AND mhr.model_type = 'App\\\\Models\\\\User'
        ");
        $roleStmt->execute(['user_id' => $userId]);
        $roles = $roleStmt->fetchAll(PDO::FETCH_COLUMN) ?: [];

        $primaryRole = !empty($roles) ? $roles[0] : '';

        return [
            'id' => (int)$userId,
            'user_id' => (int)$userId,
            'name' => $user['name'],
            'email' => $user['email'],
            'employee_id' => $empId ? (int)$empId : null,
            'role' => $primaryRole,
            'roles' => $roles
        ];
    }
}
