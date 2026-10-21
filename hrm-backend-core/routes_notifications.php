<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// NOTIFICATIONS MODULE
// ==========================================

/**
 * Helper to fetch unread notification count for a specific user
 */
function getUnreadNotificationCount(PDO $db, int $userId): int {
    $stmt = $db->prepare("
        SELECT COUNT(*) 
        FROM notifications 
        WHERE notifiable_type = 'App\\\\Models\\\\User' 
          AND notifiable_id = :user_id 
          AND read_at IS NULL
    ");
    $stmt->execute(['user_id' => $userId]);
    return (int)$stmt->fetchColumn();
}

/**
 * GET /api/notifications
 * Supports pagination: ?page=1&per_page=15
 */
Router::get('/api/notifications', function() {
    $user = Auth::user();
    $userId = $user['user_id'];
    $db = Database::getConnection();

    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $limit = isset($_GET['per_page']) ? max(1, min(100, (int)$_GET['per_page'])) : 15;
    $offset = ($page - 1) * $limit;

    // Total count for current user
    $countStmt = $db->prepare("
        SELECT COUNT(*) 
        FROM notifications 
        WHERE notifiable_type = 'App\\\\Models\\\\User' 
          AND notifiable_id = :user_id
    ");
    $countStmt->execute(['user_id' => $userId]);
    $total = (int)$countStmt->fetchColumn();
    $lastPage = $total > 0 ? (int)ceil($total / $limit) : 1;

    // Unread count
    $unreadCount = getUnreadNotificationCount($db, $userId);

    // Fetch notifications
    $stmt = $db->prepare("
        SELECT id, type, notifiable_type, notifiable_id, data, read_at, created_at, updated_at
        FROM notifications 
        WHERE notifiable_type = 'App\\\\Models\\\\User' 
          AND notifiable_id = :user_id
        ORDER BY created_at DESC 
        LIMIT :limit OFFSET :offset
    ");
    $stmt->bindValue(':user_id', $userId, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Decode JSON in `data` column
    $notifications = array_map(function($row) {
        $decodedData = json_decode($row['data'], true);
        $row['data'] = $decodedData !== null ? $decodedData : $row['data'];
        return $row;
    }, $rows);

    echo json_encode([
        'data' => $notifications,
        'unread_count' => $unreadCount,
        'total' => $total,
        'current_page' => $page,
        'last_page' => $lastPage,
        'per_page' => $limit
    ]);
});

/**
 * GET /api/notifications/unread-count
 */
Router::get('/api/notifications/unread-count', function() {
    $user = Auth::user();
    $userId = $user['user_id'];
    $db = Database::getConnection();

    $unreadCount = getUnreadNotificationCount($db, $userId);

    echo json_encode([
        'unread_count' => $unreadCount
    ]);
});

/**
 * PATCH /api/notifications/{id}/read
 */
Router::patch('/api/notifications/{id}/read', function($id) {
    $user = Auth::user();
    $userId = $user['user_id'];
    $db = Database::getConnection();

    // Verify ownership and check current state
    $checkStmt = $db->prepare("
        SELECT id, read_at 
        FROM notifications 
        WHERE id = :id 
          AND notifiable_type = 'App\\\\Models\\\\User' 
          AND notifiable_id = :user_id
        LIMIT 1
    ");
    $checkStmt->execute([
        'id' => $id,
        'user_id' => $userId
    ]);
    $notification = $checkStmt->fetch(PDO::FETCH_ASSOC);

    if (!$notification) {
        http_response_code(404);
        echo json_encode(['message' => 'Notification not found']);
        return;
    }

    if ($notification['read_at'] === null) {
        $updateStmt = $db->prepare("
            UPDATE notifications 
            SET read_at = NOW(), updated_at = NOW() 
            WHERE id = :id 
              AND notifiable_type = 'App\\\\Models\\\\User' 
              AND notifiable_id = :user_id
        ");
        $updateStmt->execute([
            'id' => $id,
            'user_id' => $userId
        ]);
    }

    $unreadCount = getUnreadNotificationCount($db, $userId);

    echo json_encode([
        'message' => 'Notification marked as read',
        'id' => $id,
        'unread_count' => $unreadCount
    ]);
});

/**
 * POST /api/notifications/mark-all-read
 */
Router::post('/api/notifications/mark-all-read', function() {
    $user = Auth::user();
    $userId = $user['user_id'];
    $db = Database::getConnection();

    $stmt = $db->prepare("
        UPDATE notifications 
        SET read_at = NOW(), updated_at = NOW() 
        WHERE notifiable_type = 'App\\\\Models\\\\User' 
          AND notifiable_id = :user_id 
          AND read_at IS NULL
    ");
    $stmt->execute(['user_id' => $userId]);

    echo json_encode([
        'message' => 'All notifications marked as read',
        'unread_count' => 0
    ]);
});
