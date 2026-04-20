ALTER TABLE `live_queue_side_ads`
    ADD COLUMN `active_from` DATE NULL AFTER `is_active`,
    ADD COLUMN `active_to` DATE NULL AFTER `active_from`;
