<?php

class Database {
    private static $conn = null;

    public static function getConnection() {
        if (self::$conn === null) {
            // Load env variables from local .env file
            $envPath = __DIR__ . '/../.env';
            $env = parse_ini_file($envPath);
            
            $host = $env['DB_HOST'] ?? '127.0.0.1';
            $port = $env['DB_PORT'] ?? '3306';
            $db_name = $env['DB_DATABASE'] ?? 'hrms_backend';
            $username = $env['DB_USERNAME'] ?? 'root';
            $password = $env['DB_PASSWORD'] ?? '';

            try {
                self::$conn = new PDO("mysql:host=" . $host . ";port=" . $port . ";dbname=" . $db_name, $username, $password);
                self::$conn->exec("set names utf8");
                self::$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            } catch(PDOException $exception) {
                http_response_code(500);
                echo json_encode(["error" => "Connection error: " . $exception->getMessage()]);
                exit;
            }
        }
        return self::$conn;
    }
}
