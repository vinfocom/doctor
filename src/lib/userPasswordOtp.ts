import { createHash, randomBytes, timingSafeEqual } from "crypto";

import prisma from "@/lib/prisma";

export type UserPasswordOtpPurpose = "RESET_PASSWORD";
export type AllowedForgotPasswordRole = "DOCTOR" | "CLINIC_STAFF";

type UserLookup = {
  user_id: number;
  name: string | null;
  email: string | null;
  password: string | null;
  role: AllowedForgotPasswordRole | string;
};

type UserPasswordOtpRecord = {
  otp_id: number;
  user_id: number;
  email: string;
  purpose: UserPasswordOtpPurpose;
  otp_hash: string;
  expires_at: Date;
  resend_after: Date | null;
  used_at: Date | null;
  attempt_count: number;
  verification_token: string | null;
  verification_expires_at: Date | null;
  verified_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

type SendEmailOtpInput = {
  email: string;
  otp: string;
};

type SendEmailOtpResult = {
  ok: boolean;
  messageId?: string | null;
};

const DEFAULT_OTP_LENGTH = 6;
const OTP_HASH_PREFIX = "sha256:";
export const USER_PASSWORD_OTP_EMAIL_SUBJECT = "DAPTO - Your OTP Verification Code";
export const USER_PASSWORD_OTP_EMAIL_BODY_TEMPLATE = `Hello,

Your OTP for verification in DAPTO is:

{{OTP}}

This OTP is valid for 10 minutes.

Please do not share this code with anyone for security reasons.

Regards,
Team DAPTO`;

function getOtpSecret() {
  return process.env.OTP_SECRET || process.env.JWT_SECRET || "SUPER_SECRET_KEY";
}

function getOtpHashBuffer(value: string) {
  return createHash("sha256")
    .update(`${getOtpSecret()}:${value}`, "utf8")
    .digest();
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getUsersDelegate() {
  return (prisma as unknown as {
    users: {
      findUnique: (args: unknown) => Promise<UserLookup | null>;
    };
  }).users;
}

function getUserOtpDelegate() {
  return (prisma as unknown as {
    user_password_otps: {
      create: (args: unknown) => Promise<UserPasswordOtpRecord>;
      findFirst: (args: unknown) => Promise<UserPasswordOtpRecord | null>;
      update: (args: unknown) => Promise<UserPasswordOtpRecord>;
      updateMany: (args: unknown) => Promise<{ count: number }>;
    };
  }).user_password_otps;
}

export function normalizeEmail(email: string | null | undefined) {
  return String(email || "").trim().toLowerCase();
}

export async function findUserByEmail(email: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const usersDelegate = getUsersDelegate();
  return usersDelegate.findUnique({
    where: { email: normalizedEmail },
    select: {
      user_id: true,
      name: true,
      email: true,
      password: true,
      role: true,
    },
  });
}

export function isAllowedForgotPasswordRole(
  role: string | null | undefined
): role is AllowedForgotPasswordRole {
  return role === "DOCTOR" || role === "CLINIC_STAFF";
}

export async function findAllowedUserByEmail(email: string) {
  const user = await findUserByEmail(email);
  if (!user) return null;
  if (!isAllowedForgotPasswordRole(user.role)) return null;
  return user as UserLookup & { role: AllowedForgotPasswordRole };
}

export function generateOtp(length = DEFAULT_OTP_LENGTH) {
  const otpLength = Math.max(4, Math.min(8, Number(length) || DEFAULT_OTP_LENGTH));
  const min = 10 ** (otpLength - 1);
  const max = 10 ** otpLength;
  return String(Math.floor(Math.random() * (max - min)) + min);
}

export function hashOtp(otp: string) {
  const normalizedOtp = String(otp || "").trim();
  const digest = getOtpHashBuffer(normalizedOtp).toString("hex");
  return `${OTP_HASH_PREFIX}${digest}`;
}

export function compareOtp(plainOtp: string, otpHash: string | null | undefined) {
  const normalizedHash = String(otpHash || "").trim();
  if (!normalizedHash.startsWith(OTP_HASH_PREFIX)) return false;

  const storedHex = normalizedHash.slice(OTP_HASH_PREFIX.length);
  if (!storedHex) return false;

  const storedBuffer = Buffer.from(storedHex, "hex");
  const computedBuffer = getOtpHashBuffer(String(plainOtp || "").trim());
  if (storedBuffer.length !== computedBuffer.length) return false;

  return timingSafeEqual(storedBuffer, computedBuffer);
}

export function generateOtpVerificationToken() {
  return randomBytes(32).toString("hex");
}

export function buildOtpEmailBody(otp: string) {
  return USER_PASSWORD_OTP_EMAIL_BODY_TEMPLATE.replace("{{OTP}}", String(otp || "").trim());
}

async function loadNodeMailer() {
  const dynamicImport = new Function("specifier", "return import(specifier);") as (
    specifier: string
  ) => Promise<{
    default?: {
      createTransport: (options: unknown) => {
        sendMail: (options: unknown) => Promise<{ messageId?: string | null }>;
      };
    };
  }>;

  const mod = await dynamicImport("nodemailer");
  const nodemailer = mod?.default;
  if (!nodemailer?.createTransport) {
    throw new Error("nodemailer is not available");
  }

  return nodemailer;
}

export async function sendEmailOtp({ email, otp }: SendEmailOtpInput): Promise<SendEmailOtpResult> {
  const host = String(process.env.SMTP_HOST || "").trim();
  const port = parsePositiveInt(process.env.SMTP_PORT, 587);
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const normalizedEmail = normalizeEmail(email);
  const normalizedOtp = String(otp || "").trim();

  if (!host || !user || !pass) {
    throw new Error("Missing SMTP configuration");
  }
  if (!normalizedEmail) {
    throw new Error("A valid email is required to send OTP");
  }
  if (!normalizedOtp) {
    throw new Error("A valid OTP is required to send email");
  }

  const nodemailer = await loadNodeMailer();
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  const info = await transport.sendMail({
    from: user,
    to: normalizedEmail,
    subject: USER_PASSWORD_OTP_EMAIL_SUBJECT,
    text: buildOtpEmailBody(normalizedOtp),
  });

  return {
    ok: true,
    messageId: info?.messageId ?? null,
  };
}

export async function invalidatePreviousOtps(
  email: string,
  purpose: UserPasswordOtpPurpose,
  userId?: number
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return { count: 0 };
  }

  const otpDelegate = getUserOtpDelegate();
  return otpDelegate.updateMany({
    where: {
      ...(userId ? { user_id: userId } : {}),
      email: normalizedEmail,
      purpose,
      used_at: null,
    },
    data: {
      used_at: new Date(),
      verification_token: null,
      verification_expires_at: null,
      verified_at: null,
    },
  });
}

export async function findLatestActiveOtp(email: string, purpose: UserPasswordOtpPurpose) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const otpDelegate = getUserOtpDelegate();
  return otpDelegate.findFirst({
    where: {
      email: normalizedEmail,
      purpose,
      used_at: null,
    },
    orderBy: { created_at: "desc" },
  });
}

export async function createPasswordResetOtp(input: {
  userId: number;
  email: string;
  otp: string;
}) {
  const normalizedEmail = normalizeEmail(input.email);
  if (!input.userId || !normalizedEmail) {
    throw new Error("A valid user and email are required to create OTP");
  }

  const now = new Date();
  const otpLength = parsePositiveInt(process.env.OTP_LENGTH, DEFAULT_OTP_LENGTH);
  const expiryMinutes = parsePositiveInt(process.env.OTP_EXPIRY_MINUTES, 10);
  const resendCooldownSeconds = parsePositiveInt(
    process.env.OTP_RESEND_COOLDOWN_SECONDS,
    30
  );

  const normalizedOtp = String(input.otp || "").trim();
  if (!normalizedOtp || normalizedOtp.length !== otpLength) {
    throw new Error("A valid OTP is required to create password reset OTP");
  }

  const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
  const resendAfter = new Date(now.getTime() + resendCooldownSeconds * 1000);

  const otpDelegate = getUserOtpDelegate();
  return otpDelegate.create({
    data: {
      user_id: input.userId,
      email: normalizedEmail,
      purpose: "RESET_PASSWORD",
      otp_hash: hashOtp(normalizedOtp),
      attempt_count: 0,
      expires_at: expiresAt,
      resend_after: resendAfter,
      verification_token: null,
      verification_expires_at: null,
      verified_at: null,
      used_at: null,
    },
  });
}
