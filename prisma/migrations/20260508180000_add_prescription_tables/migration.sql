-- CreateTable
CREATE TABLE `prescription_records` (
    `prescription_id` INTEGER NOT NULL AUTO_INCREMENT,
    `patient_id` INTEGER NOT NULL,
    `doctor_id` INTEGER NOT NULL,
    `clinic_id` INTEGER NULL,
    `appointment_id` INTEGER NULL,
    `uploaded_by_role` ENUM('PATIENT', 'DOCTOR', 'STAFF') NOT NULL,
    `uploaded_by_user_id` INTEGER NULL,
    `uploaded_by_patient_id` INTEGER NULL,
    `note` VARCHAR(500) NULL,
    `page_count` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('ACTIVE', 'ARCHIVED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_prescription_patient_doctor_created`(`patient_id`, `doctor_id`, `created_at`),
    INDEX `idx_prescription_doctor_created`(`doctor_id`, `created_at`),
    INDEX `idx_prescription_appointment`(`appointment_id`),
    INDEX `idx_prescription_clinic`(`clinic_id`),
    INDEX `idx_prescription_uploaded_by_user`(`uploaded_by_user_id`),
    INDEX `idx_prescription_uploaded_by_patient`(`uploaded_by_patient_id`),
    PRIMARY KEY (`prescription_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `prescription_pages` (
    `prescription_page_id` INTEGER NOT NULL AUTO_INCREMENT,
    `prescription_id` INTEGER NOT NULL,
    `page_number` INTEGER NOT NULL,
    `storage_key` VARCHAR(1000) NOT NULL,
    `file_url` VARCHAR(1000) NOT NULL,
    `mime_type` VARCHAR(100) NULL,
    `original_file_name` VARCHAR(255) NULL,
    `file_size_bytes` INTEGER NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `idx_prescription_pages_prescription`(`prescription_id`),
    UNIQUE INDEX `uq_prescription_page_number`(`prescription_id`, `page_number`),
    PRIMARY KEY (`prescription_page_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `prescription_records` ADD CONSTRAINT `prescription_records_patient_id_fkey` FOREIGN KEY (`patient_id`) REFERENCES `patients`(`patient_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prescription_records` ADD CONSTRAINT `prescription_records_doctor_id_fkey` FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`doctor_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prescription_records` ADD CONSTRAINT `prescription_records_clinic_id_fkey` FOREIGN KEY (`clinic_id`) REFERENCES `clinics`(`clinic_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prescription_records` ADD CONSTRAINT `prescription_records_appointment_id_fkey` FOREIGN KEY (`appointment_id`) REFERENCES `appointment`(`appointment_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prescription_records` ADD CONSTRAINT `prescription_records_uploaded_by_user_id_fkey` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prescription_records` ADD CONSTRAINT `prescription_records_uploaded_by_patient_id_fkey` FOREIGN KEY (`uploaded_by_patient_id`) REFERENCES `patients`(`patient_id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prescription_pages` ADD CONSTRAINT `prescription_pages_prescription_id_fkey` FOREIGN KEY (`prescription_id`) REFERENCES `prescription_records`(`prescription_id`) ON DELETE CASCADE ON UPDATE CASCADE;
