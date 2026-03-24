ALTER TABLE `patients`
  ADD COLUMN `status` ENUM('Blocked', 'Unblocked') NULL;
