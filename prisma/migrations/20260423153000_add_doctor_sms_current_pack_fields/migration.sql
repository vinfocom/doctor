ALTER TABLE `doctor_sms_service`
    ADD COLUMN `current_pack_total` INTEGER NOT NULL DEFAULT 0 AFTER `sms_credit_used`,
    ADD COLUMN `current_pack_used` INTEGER NOT NULL DEFAULT 0 AFTER `current_pack_total`;

UPDATE `doctor_sms_service`
SET
    `current_pack_total` = `sms_credit_total`,
    `current_pack_used` = `sms_credit_used`
WHERE `current_pack_total` = 0 AND `current_pack_used` = 0;
