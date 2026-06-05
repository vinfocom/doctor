const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

type EmrRateLimitInput = {
  key: string;
  limit: number;
  windowMs: number;
};

export class EmrRateLimitError extends Error {
  status: number;
  retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.status = 429;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getBucket(input: EmrRateLimitInput) {
  const now = Date.now();
  const existing = rateLimitStore.get(input.key);
  if (!existing || existing.resetAt <= now) {
    const next = {
      count: 0,
      resetAt: now + input.windowMs,
    };
    rateLimitStore.set(input.key, next);
    return next;
  }

  return existing;
}

function assertMemoryRateLimit(input: EmrRateLimitInput) {
  const bucket = getBucket(input);
  bucket.count += 1;

  if (bucket.count > input.limit) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.resetAt - Date.now()) / 1000)
    );
    throw new EmrRateLimitError(
      "Too many requests. Please slow down and try again shortly.",
      retryAfterSeconds
    );
  }

  rateLimitStore.set(input.key, bucket);
}

export async function assertRateLimit(input: EmrRateLimitInput) {
  assertMemoryRateLimit(input);
}

export function buildDoctorRateLimitKey(input: {
  scope: string;
  doctorId: number;
  ip: string;
}) {
  return `emr:${input.scope}:doctor:${input.doctorId}:ip:${input.ip}`;
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

export function getRateLimitErrorResponse(error: unknown) {
  if (error instanceof EmrRateLimitError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        retry_after_seconds: error.retryAfterSeconds,
      },
      headers: {
        "Retry-After": String(error.retryAfterSeconds),
      },
    };
  }

  return null;
}
