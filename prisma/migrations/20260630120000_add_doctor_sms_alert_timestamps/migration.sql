ALTER TABLE `doctor_sms_service`
    ADD COLUMN `low_pack_alert_sent_at` TIMESTAMP NULL DEFAULT NULL AFTER `last_recharged_at`,
    ADD COLUMN `exhausted_alert_sent_at` TIMESTAMP NULL DEFAULT NULL AFTER `low_pack_alert_sent_at`;
