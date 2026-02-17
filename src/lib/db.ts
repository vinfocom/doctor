import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.1.127",
  user: "aditya",
  password: "Sidhu@2808",
  port: 3306,
  waitForConnections: true,
  connectionLimit: 30000000,
});

export default pool;
