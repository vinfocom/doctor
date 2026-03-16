// Adds doctors.active_from and doctors.active_to if missing.
// Safe to run multiple times.

require("dotenv").config();

const mysql = require("mysql2/promise");

function parseMysqlUrl(url) {
  const u = new URL(url);
  u.searchParams.delete("ssl-mode");
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ""),
    // Use TLS without verifying the chain (no CA file in this script).
    ssl: { rejectUnauthorized: false },
  };
}

async function columnExists(conn, column) {
  const [rows] = await conn.execute(
    `
    SELECT COUNT(*) AS cnt
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'doctors'
      AND COLUMN_NAME = ?
    `,
    [column]
  );
  return Number(rows?.[0]?.cnt || 0) > 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not found in environment (.env).");

  const conn = await mysql.createConnection(parseMysqlUrl(url));
  try {
    const hasFrom = await columnExists(conn, "active_from");
    const hasTo = await columnExists(conn, "active_to");

    if (!hasFrom) {
      await conn.execute("ALTER TABLE `doctors` ADD COLUMN `active_from` DATE NULL;");
      console.log("DONE: Added doctors.active_from.");
    } else {
      console.log("OK: doctors.active_from already exists.");
    }

    if (!hasTo) {
      await conn.execute("ALTER TABLE `doctors` ADD COLUMN `active_to` DATE NULL;");
      console.log("DONE: Added doctors.active_to.");
    } else {
      console.log("OK: doctors.active_to already exists.");
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error("FAILED:", e?.message || e);
  process.exit(1);
});

