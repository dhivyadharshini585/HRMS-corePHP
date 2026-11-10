-- ============================================================================
-- HRMS MIGRATION: Schema-Matched Attendance Correction Workflow & History
-- Target Database: hrms_backend
-- Target Engine:   MySQL 8.0.44
-- File:            hrm-backend-core/migrations/2026_10_25_000001_create_attendance_correction_workflow_tables.sql
-- ============================================================================
--
-- CRITICAL PRE-EXECUTION REQUIREMENTS & SAFETY WARNINGS:
-- 1. DATABASE IDENTITY:
--    Verify that the target database is explicitly 'hrms_backend' before execution:
--      SELECT DATABASE() = 'hrms_backend', VERSION() LIKE '8.0.%';
--
-- 2. BACKUP REQUIREMENT:
--    Ensure a verified full logical database backup exists and has been test-restored
--    in an isolated environment before executing any DDL statement below.
--
-- 3. SCHEMA INSPECTION:
--    Inspect information_schema immediately prior to execution to verify the current
--    state of existing columns, foreign keys, and indexes on attendance_corrections.
--
-- 4. ACTIVE DUPLICATE CHECK (HARD STOP):
--    Run this diagnostic query immediately before attempting to add the unique index:
--      SELECT attendance_id, COUNT(*) AS active_count
--      FROM attendance_corrections 
--      WHERE status IN ('Pending', 'Escalated') 
--      GROUP BY attendance_id 
--      HAVING COUNT(*) > 1;
--    * IF THE QUERY RETURNS ANY ROWS: STOP IMMEDIATELY.
--      Do not attempt to add the unique index until duplicates are investigated
--      and resolved under an approved, audited plan.
--
-- 5. IMPLICIT COMMITS & FORWARD RECOVERY:
--    In MySQL 8.0, DDL statements cause an IMPLICIT TRANSACTION COMMIT.
--    If any statement fails partway through, completed statements remain committed.
--    Do NOT blindly rerun this entire script or attempt destructive drop rollbacks.
--    Instead, inspect information_schema to identify what succeeded, diagnose the failure,
--    and prepare an approved forward-recovery script executing only the remaining steps.
--
-- 6. SCRIPT SCOPE & NON-IDEMPOTENCY:
--    This file is NOT idempotent and is NOT a general-purpose migration runner.
--    It is matched strictly to the verified schema baseline.
--    Do not introduce unsupported syntax such as ADD UNIQUE KEY IF NOT EXISTS.
--
-- 7. APPLICATION-LEVEL IMMUTABILITY:
--    The table attendance_correction_history is designed to be append-only in
--    application behavior. The database table definition alone does not enforce immutability.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1: Extend status ENUM to include 'Escalated' while preserving existing values
-- ----------------------------------------------------------------------------
ALTER TABLE `attendance_corrections`
    MODIFY COLUMN `status` ENUM('Pending', 'Escalated', 'Approved', 'Rejected') 
    NOT NULL DEFAULT 'Pending';

-- ----------------------------------------------------------------------------
-- STEP 2: Add missing workflow, escalation, review, evidence, and remarks columns
-- ----------------------------------------------------------------------------
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
    ADD COLUMN `reviewed_at` TIMESTAMP NULL DEFAULT NULL AFTER `reviewed_by`;

-- ----------------------------------------------------------------------------
-- STEP 3: Add virtual generated column returning attendance_id for active states
--         ('Pending', 'Escalated') and NULL otherwise (allowing multiple historical rows)
-- ----------------------------------------------------------------------------
ALTER TABLE `attendance_corrections`
    ADD COLUMN `pending_attendance_id` BIGINT UNSIGNED GENERATED ALWAYS AS (
        IF(`status` IN ('Pending', 'Escalated'), `attendance_id`, NULL)
    ) VIRTUAL AFTER `reviewed_at`;

-- ----------------------------------------------------------------------------
-- STEP 4: Add unique index on generated column to enforce at most ONE active correction
-- ----------------------------------------------------------------------------
ALTER TABLE `attendance_corrections`
    ADD UNIQUE KEY `uq_active_attendance_correction` (`pending_attendance_id`);

-- ----------------------------------------------------------------------------
-- STEP 5: Create audit and decision history table
-- ----------------------------------------------------------------------------
CREATE TABLE `attendance_correction_history` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `correction_id` BIGINT UNSIGNED NOT NULL,
    `action` VARCHAR(50) COLLATE utf8mb4_unicode_ci NOT NULL, -- 'submitted', 'resubmitted', 'escalated', 'approved', 'rejected'
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
