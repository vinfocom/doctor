CREATE TABLE `live_queue_side_ads` (
    `ad_id` INTEGER NOT NULL AUTO_INCREMENT,
    `doctor_id` INTEGER NOT NULL,
    `clinic_id` INTEGER NOT NULL,
    `position` ENUM('LEFT', 'RIGHT') NOT NULL,
    `type` ENUM('LOGO', 'VIDEO') NOT NULL,
    `asset_url` VARCHAR(1000) NOT NULL,
    `mime_type` VARCHAR(255) NULL,
    `title` VARCHAR(255) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`ad_id`),
    INDEX `idx_live_queue_side_ads_lookup`(`doctor_id`, `clinic_id`, `position`, `is_active`),
    INDEX `live_queue_side_ads_clinic_id_fkey`(`clinic_id`),
    INDEX `live_queue_side_ads_doctor_id_fkey`(`doctor_id`),
    CONSTRAINT `live_queue_side_ads_clinic_id_fkey` FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`clinic_id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `live_queue_side_ads_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`doctor_id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
