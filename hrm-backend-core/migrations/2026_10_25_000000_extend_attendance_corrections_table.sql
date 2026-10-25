-- Migration: Extend attendance_corrections table for verified missed check-out correction
-- Adds approved_check_out, reviewed_at, evidence fields, and unique constraint on pending requests per attendance session

ALTER TABLE `attendance_corrections` 
    ADD COLUMN IF NOT EXISTS `evidence_file` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `reason`,
    ADD COLUMN IF NOT EXISTS `evidence_original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `evidence_file`,
    ADD COLUMN IF NOT EXISTS `evidence_details` text COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `evidence_original_name`,
    ADD COLUMN IF NOT EXISTS `approved_check_out` timestamp NULL DEFAULT NULL AFTER `status`,
    ADD COLUMN IF NOT EXISTS `reviewed_at` timestamp NULL DEFAULT NULL AFTER `reviewed_by`,
    ADD COLUMN IF NOT EXISTS `pending_attendance_id` bigint unsigned GENERATED ALWAYS AS (if((`status` = 'Pending'), `attendance_id`, NULL)) VIRTUAL;

ALTER TABLE `attendance_corrections`
    ADD UNIQUE KEY IF NOT EXISTS `uq_pending_attendance` (`pending_attendance_id`);
