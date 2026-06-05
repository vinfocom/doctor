import net from "node:net";
import tls from "node:tls";

type RedisPrimitive = string | number | null;
type RedisValue = RedisPrimitive | RedisValue[];

const REDIS_URL = process.env.REDIS_URL || "";
const DEFAULT_TIMEOUT_MS = 1500;

type RedisUrlConfig = {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  database: number;
  tls: boolean;
};

function canUseRedis() {
  return Boolean(REDIS_URL);
}

function getRedisConfig(): RedisUrlConfig | null {
  if (!canUseRedis()) return null;

  try {
    const parsed = new URL(REDIS_URL);
    const host = parsed.hostname;
    const port = Number(parsed.port || (parsed.protocol === "rediss:" ? "6380" : "6379"));
    const username = parsed.username ? decodeURIComponent(parsed.username) : null;
    const password = parsed.password ? decodeURIComponent(parsed.password) : null;
    const database = Number(parsed.pathname.replace("/", "") || "0");

    if (!host || !Number.isInteger(port) || port <= 0) {
      return null;
    }

    return {
      host,
      port,
      username,
      password,
      database: Number.isInteger(database) && database >= 0 ? database : 0,
      tls: parsed.protocol === "rediss:",
    };
  } catch {
    return null;
  }
}

function encodeRedisCommand(command: string[]) {
  const parts = [`*${command.length}\r\n`];
  for (const entry of command) {
    const value = String(entry);
    parts.push(`$${Buffer.byteLength(value)}\r\n${value}\r\n`);
  }

  return parts.join("");
}

function readLine(buffer: Buffer, start: number) {
  for (let index = start; index < buffer.length - 1; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10) {
      return {
        line: buffer.toString("utf8", start, index),
        next: index + 2,
      };
    }
  }

  return null;
}

function parseRedisValue(
  buffer: Buffer,
  start = 0
): { value: RedisValue; next: number } | null {
  if (start >= buffer.length) return null;

  const prefix = String.fromCharCode(buffer[start]);
  const line = readLine(buffer, start + 1);
  if (!line) return null;

  if (prefix === "+") {
    return { value: line.line, next: line.next };
  }

  if (prefix === "-") {
    throw new Error(line.line || "Redis error");
  }

  if (prefix === ":") {
    return { value: Number(line.line), next: line.next };
  }

  if (prefix === "$") {
    const length = Number(line.line);
    if (length === -1) {
      return { value: null, next: line.next };
    }

    const end = line.next + length;
    if (buffer.length < end + 2) return null;

    return {
      value: buffer.toString("utf8", line.next, end),
      next: end + 2,
    };
  }

  if (prefix === "*") {
    const count = Number(line.line);
    if (count === -1) {
      return { value: [], next: line.next };
    }

    const values: RedisValue[] = [];
    let cursor = line.next;
    for (let index = 0; index < count; index += 1) {
      const parsed = parseRedisValue(buffer, cursor);
      if (!parsed) return null;
      values.push(parsed.value);
      cursor = parsed.next;
    }

    return {
      value: values,
      next: cursor,
    };
  }

  throw new Error("Unsupported Redis response");
}

async function sendRedisCommand(
  command: string[],
  socket: net.Socket | tls.TLSSocket
) {
  return new Promise<RedisValue>((resolve, reject) => {
    let settled = false;
    let buffer = Buffer.alloc(0);

    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      socket.off("timeout", onTimeout);
    };

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    const onError = (error: Error) => {
      settle(() => reject(error));
    };

    const onClose = () => {
      settle(() => reject(new Error("Redis socket closed before response")));
    };

    const onTimeout = () => {
      settle(() => reject(new Error("Redis command timed out")));
    };

    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);

      try {
        const parsed = parseRedisValue(buffer);
        if (!parsed) return;
        settle(() => resolve(parsed.value));
      } catch (error) {
        settle(() =>
          reject(error instanceof Error ? error : new Error(String(error)))
        );
      }
    };

    socket.on("data", onData);
    socket.on("error", onError);
    socket.on("close", onClose);
    socket.on("timeout", onTimeout);

    socket.write(encodeRedisCommand(command), "utf8");
  });
}

export async function executeRedisCommand<T = RedisValue>(command: string[]) {
  const config = getRedisConfig();
  if (!config) return null;

  const socket = config.tls
    ? tls.connect({
        host: config.host,
        port: config.port,
      })
    : net.createConnection({
        host: config.host,
        port: config.port,
      });

  socket.setTimeout(DEFAULT_TIMEOUT_MS);

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", () => resolve());
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("Redis connection timed out")));
    });

    if (config.password) {
      const authCommand =
        config.username && config.username !== "default"
          ? ["AUTH", config.username, config.password]
          : ["AUTH", config.password];
      await sendRedisCommand(authCommand, socket);
    }

    if (config.database > 0) {
      await sendRedisCommand(["SELECT", String(config.database)], socket);
    }

    const result = await sendRedisCommand(command, socket);
    return result as T;
  } finally {
    socket.end();
    socket.destroy();
  }
}

export function isRedisConfigured() {
  return Boolean(getRedisConfig());
}
