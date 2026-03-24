ALTER TABLE `clinics`
  ADD COLUMN `qr_storage_url` VARCHAR(500) NULL AFTER `barcode_url`;
