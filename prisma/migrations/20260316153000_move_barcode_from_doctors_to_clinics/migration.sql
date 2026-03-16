-- Move barcode storage from doctors -> clinics.
-- This keeps existing data by copying doctor.barcode_url into all of that doctor's clinics
-- (only where clinics.barcode_url is currently NULL), then drops the doctors column.

ALTER TABLE `clinics`
  ADD COLUMN `barcode_url` VARCHAR(500) NULL;

UPDATE `clinics` c
JOIN `doctors` d ON d.`doctor_id` = c.`doctor_id`
SET c.`barcode_url` = d.`barcode_url`
WHERE c.`barcode_url` IS NULL
  AND d.`barcode_url` IS NOT NULL;

ALTER TABLE `doctors`
  DROP COLUMN `barcode_url`;

