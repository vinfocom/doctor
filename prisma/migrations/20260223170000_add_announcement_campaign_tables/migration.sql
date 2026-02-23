CREATE TABLE `announcement_campaigns` (
  `campaign_id` INTEGER NOT NULL AUTO_INCREMENT,
  `doctor_id` INTEGER NOT NULL,
  `message` TEXT NOT NULL,
  `target_mode` VARCHAR(20) NULL,
  `target_date` DATE NULL,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  INDEX `announcement_campaigns_doctor_id_created_at_idx`(`doctor_id`, `created_at`),
  PRIMARY KEY (`campaign_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `announcement_campaign_recipients` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `campaign_id` INTEGER NOT NULL,
  `patient_id` INTEGER NOT NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT false,
  `created_at` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
  `read_at` TIMESTAMP(0) NULL,

  UNIQUE INDEX `announcement_campaign_recipients_campaign_id_patient_id_key`(`campaign_id`, `patient_id`),
  INDEX `announcement_campaign_recipients_patient_id_created_at_idx`(`patient_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `announcement_campaigns`
  ADD CONSTRAINT `announcement_campaigns_doctor_id_fkey`
  FOREIGN KEY (`doctor_id`) REFERENCES `doctors`(`doctor_id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `announcement_campaign_recipients`
  ADD CONSTRAINT `announcement_campaign_recipients_campaign_id_fkey`
  FOREIGN KEY (`campaign_id`) REFERENCES `announcement_campaigns`(`campaign_id`)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `announcement_campaign_recipients`
  ADD CONSTRAINT `announcement_campaign_recipients_patient_id_fkey`
  FOREIGN KEY (`patient_id`) REFERENCES `patients`(`patient_id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
