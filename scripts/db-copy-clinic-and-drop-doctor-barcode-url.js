// Copies doctors.barcode_url -> clinics.barcode_url (only where clinics.barcode_url is NULL),
// then drops doctors.barcode_url. No other columns/tables are modified.

require("dotenv").config();

const mysql = require("mysql2/promise");

function parseMysqlUrl(url) {
  const u = new URL(url);
  // mysql2 doesn't understand ssl-mode query param (warns). We'll ignore it and force TLS.
  u.searchParams.delete("ssl-mode");
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    // Aiven uses TLS; without a CA file we can't validate the chain here.
    // This still uses TLS but skips certificate verification.
    ssl: { rejectUnauthorized: false },
  };
}

async function columnExists(conn, table, column) {
  const [rows] = await conn.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
    `,
    [table, column]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not found in environment (.env).");

  const conn = await mysql.createConnection(parseMysqlUrl(url));
  try {
    const hasClinicBarcode = await columnExists(conn, "clinics", "barcode_url");
    if (!hasClinicBarcode) {
      throw new Error("clinics.barcode_url does not exist. Add it first, then re-run.");
    }

    const hasDoctorBarcode = await columnExists(conn, "doctors", "barcode_url");
    if (!hasDoctorBarcode) {
      console.log("OK: doctors.barcode_url already removed.");
      return;
    }

    const [copyRes] = await conn.execute(
      `
      UPDATE \`clinics\` c
      JOIN \`doctors\` d ON d.\`doctor_id\` = c.\`doctor_id\`
      SET c.\`barcode_url\` = d.\`barcode_url\`
      WHERE c.\`barcode_url\` IS NULL
        AND d.\`barcode_url\` IS NOT NULL
      `
    );

    // mysql2 returns OkPacket for UPDATE with affectedRows.
    const affected = Number(copyRes?.affectedRows ?? 0);
    console.log(`DONE: Copied doctor barcodes into clinics (rows updated: ${affected}).`);

    await conn.execute("ALTER TABLE `doctors` DROP COLUMN `barcode_url`;");
    console.log("DONE: Dropped doctors.barcode_url.");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});
