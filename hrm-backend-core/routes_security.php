<?php
require_once __DIR__ . '/core/Router.php';
require_once __DIR__ . '/core/Database.php';
require_once __DIR__ . '/core/Auth.php';

// ==========================================
// SECURITY / ADMIN RECOVERY SETTINGS
// ==========================================

Router::get('/api/admin/recovery-email/status', function() {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    
    // Check if authorized
    $stmt = $db->prepare("SELECT roles.name as role FROM roles INNER JOIN model_has_roles ON roles.id = model_has_roles.role_id WHERE model_has_roles.model_id = ? LIMIT 1");
    $stmt->execute([$user_id]);
    $userRole = $stmt->fetch(PDO::FETCH_ASSOC);
    $role = $userRole ? $userRole['role'] : 'Employee';
    
    if (!in_array($role, ['Super Admin', 'HR Admin'])) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action']);
        return;
    }
    
    $stmt = $db->prepare("SELECT recovery_email, recovery_email_verified_at FROM users WHERE id = ?");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$user) {
        http_response_code(404);
        echo json_encode(['message' => 'User not found']);
        return;
    }
    
    echo json_encode([
        'recovery_email' => $user['recovery_email'],
        'is_verified' => !empty($user['recovery_email_verified_at']),
        'verified_at' => $user['recovery_email_verified_at']
    ]);
});

Router::post('/api/admin/recovery-email/setup', function() {
    $user_id = Auth::authenticate();
    $db = Database::getConnection();
    
    // Check if authorized
    $stmt = $db->prepare("SELECT roles.name as role FROM roles INNER JOIN model_has_roles ON roles.id = model_has_roles.role_id WHERE model_has_roles.model_id = ? LIMIT 1");
    $stmt->execute([$user_id]);
    $userRole = $stmt->fetch(PDO::FETCH_ASSOC);
    $role = $userRole ? $userRole['role'] : 'Employee';
    
    if (!in_array($role, ['Super Admin', 'HR Admin'])) {
        http_response_code(403);
        echo json_encode(['message' => 'Unauthorized action']);
        return;
    }
    
    global $input;
    $data = $input ?: [];
    
    if (empty($data['recovery_email']) || !filter_var($data['recovery_email'], FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['message' => 'Invalid email address provided']);
        return;
    }
    
    // Here we'd typically generate a verification token and send an email.
    // For this migration, we'll just set it directly since we may not have an email service running locally.
    $stmt = $db->prepare("UPDATE users SET recovery_email = ?, recovery_email_verified_at = NULL WHERE id = ?");
    $stmt->execute([$data['recovery_email'], $user_id]);
    
    echo json_encode(['message' => 'Recovery email updated successfully. Verification email would be sent here.']);
});
