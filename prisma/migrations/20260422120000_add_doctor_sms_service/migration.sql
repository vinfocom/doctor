CREATE TABLE `doctor_sms_service` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `doctor_id` INTEGER NOT NULL,
    `sms_service_enabled` BOOLEAN NOT NULL DEFAULT false,
    `sms_service_status` ENUM('DISABLED', 'ACTIVE', 'EXHAUSTED') NOT NULL DEFAULT 'DISABLED',
    `sms_credit_total` INTEGER NOT NULL DEFAULT 0,
    `sms_credit_used` INTEGER NOT NULL DEFAULT 0,
    `last_recharged_at` TIMESTAMP(0) NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `doctor_sms_service_doctor_id_key`(`doctor_id`),
    INDEX `idx_doctor_sms_service_status`(`sms_service_status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `doctor_sms_recharge_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `doctor_id` INTEGER NOT NULL,
    `credits_added` INTEGER NOT NULL,
    `previous_total` INTEGER NOT NULL,
    `new_total` INTEGER NOT NULL,
    `remarks` VARCHAR(255) NULL,
    `recharged_by` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_doctor_sms_recharge_log_lookup`(`doctor_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `doctor_sms_usage_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `doctor_id` INTEGER NOT NULL,
    `appointment_id` INTEGER NOT NULL,
    `credits_used` INTEGER NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `uq_doctor_sms_usage_appointment`(`appointment_id`),
    INDEX `idx_doctor_sms_usage_lookup`(`doctor_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `doctor_sms_service`
    ADD CONSTRAINT `doctor_sms_service_doctor_id_fkey`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`doctor_id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `doctor_sms_recharge_log`
    ADD CONSTRAINT `doctor_sms_recharge_log_doctor_id_fkey`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`doctor_id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `doctor_sms_usage_log`
    ADD CONSTRAINT `doctor_sms_usage_log_doctor_id_fkey`
    FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`doctor_id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
