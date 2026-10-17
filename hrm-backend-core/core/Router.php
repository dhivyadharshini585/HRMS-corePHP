<?php

class Router {
    private static $routes = [];

    public static function get($path, $callback) {
        self::$routes['GET'][$path] = $callback;
    }

    public static function post($path, $callback) {
        self::$routes['POST'][$path] = $callback;
    }

    public static function put($path, $callback) {
        self::$routes['PUT'][$path] = $callback;
    }

    public static function delete($path, $callback) {
        self::$routes['DELETE'][$path] = $callback;
    }

    public static function patch($path, $callback) {
        self::$routes['PATCH'][$path] = $callback;
    }

    public static function run($method, $uri) {
        $uri = rtrim($uri, '/');
        if (empty($uri)) {
            $uri = '/';
        }

        if (isset(self::$routes[$method])) {
            foreach (self::$routes[$method] as $path => $callback) {
                // Convert {param} to regex
                $pattern = preg_replace('/\{([a-zA-Z0-9_]+)\}/', '(?P<$1>[a-zA-Z0-9_-]+)', $path);
                $pattern = '#^' . $pattern . '$#';

                if (preg_match($pattern, $uri, $matches)) {
                    // Extract named parameters
                    $params = array_filter($matches, 'is_string', ARRAY_FILTER_USE_KEY);
                    call_user_func_array($callback, array_values($params));
                    return;
                }
            }
        }

        // 404 Not Found
        http_response_code(404);
        echo json_encode(["error" => "Route not found", "uri" => $uri]);
    }
}

