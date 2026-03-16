// Adds clinics.barcode_url if missing.
// Safe to run multiple times.

require("dotenv").config();

const mysql = require("mysql2/promise");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL not found in environment (.env).");
  }

  const conn = await mysql.createConnection(url);
  try {
    const [rows] = await conn.execute(
      `
      SELECT COUNT(*) AS cnt
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'clinics'
        AND COLUMN_NAME = 'barcode_url'
      `
    );
    const cnt = Number(rows?.[0]?.cnt || 0);
    if (cnt > 0) {
      console.log("OK: clinics.barcode_url already exists.");
      return;
    }

    await conn.execute("ALTER TABLE `clinics` ADD COLUMN `barcode_url` VARCHAR(500) NULL;");
    console.log("DONE: Added clinics.barcode_url.");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});

