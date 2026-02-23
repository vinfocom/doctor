ALTER TABLE `patients`
  ADD COLUMN `telegram_chat_id` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `patients_telegram_chat_id_key`
  ON `patients`(`telegram_chat_id`);
