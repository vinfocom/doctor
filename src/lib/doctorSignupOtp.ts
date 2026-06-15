import prisma from "@/lib/prisma";
import {
  compareOtp,
  generateOtp,
  generateOtpVerificationToken,
  hashOtp,
  normalizeEmail,
  sendEmailOtp,
} from "@/lib/userPasswordOtp";
import { normalizePhone, sendSmsOtp } from "@/lib/patientOtp";

export type DoctorSignupOtpChannel = "EMAIL" | "PHONE";

export type DoctorSignupOtpRecord = {
  otp_id: number;
  channel: DoctorSignupOtpChannel;
  target: string;
  otp_hash: string;
  attempt_count: number;
  resend_count: number;
  expires_at: Date;
  resend_after: Date | null;
  verified_at: Date | null;
  verification_token: string | null;
  verification_expires_at: Date | null;
  used_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isDoctorSignupOtpChannel(
  value: unknown
): value is DoctorSignupOtpChannel {
  return value === "EMAIL" || value === "PHONE";
}

export function normalizeDoctorSignupOtpTarget(
  channel: DoctorSignupOtpChannel,
  target: unknown
) {
  return channel === "EMAIL" ? normalizeEmail(String(target || "")) : normalizePhone(String(target || ""));
}

export async function findLatestActiveDoctorSignupOtp(
  channel: DoctorSignupOtpChannel,
  target: string
) {
  return prisma.doctor_signup_otps.findFirst({
    where: {
      target,
      channel,
      used_at: null,
    },
    orderBy: { created_at: "desc" },
  }) as Promise<DoctorSignupOtpRecord | null>;
}

export async function invalidateDoctorSignupOtps(
  channel: DoctorSignupOtpChannel,
  target: string
) {
  return prisma.doctor_signup_otps.updateMany({
    where: {
      target,
      channel,
      used_at: null,
    },
    data: {
      used_at: new Date(),
      verification_token: null,
      verification_expires_at: null,
    },
  });
}

export async function createDoctorSignupOtp(input: {
  channel: DoctorSignupOtpChannel;
  target: string;
  otp: string;
}) {
  const now = new Date();
  const expiryMinutes = parsePositiveInt(process.env.OTP_EXPIRY_MINUTES, 10);
  const resendCooldownSeconds = parsePositiveInt(
    process.env.OTP_RESEND_COOLDOWN_SECONDS,
    30
  );
  const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
  const resendAfter = new Date(now.getTime() + resendCooldownSeconds * 1000);

  return prisma.doctor_signup_otps.create({
    data: {
      channel: input.channel,
      target: input.target,
      otp_hash: hashOtp(input.otp),
      attempt_count: 0,
      resend_count: 0,
      expires_at: expiresAt,
      resend_after: resendAfter,
      verified_at: null,
      verification_token: null,
      verification_expires_at: null,
      used_at: null,
    },
  }) as Promise<DoctorSignupOtpRecord>;
}

export async function markLatestDoctorSignupOtpUsed(
  channel: DoctorSignupOtpChannel,
  target: string
) {
  return prisma.doctor_signup_otps.updateMany({
    where: {
      target,
      channel,
      used_at: null,
    },
    data: {
      used_at: new Date(),
      verification_token: null,
      verification_expires_at: null,
    },
  });
}

export async function sendDoctorSignupOtp(input: {
  channel: DoctorSignupOtpChannel;
  target: string;
  otp: string;
}) {
  if (input.channel === "EMAIL") {
    return sendEmailOtp({ email: input.target, otp: input.otp });
  }

  return sendSmsOtp({ phone: input.target, otp: input.otp });
}

export function getDoctorSignupOtpConfig() {
  return {
    otpLength: parsePositiveInt(process.env.OTP_LENGTH, 6),
    expiryMinutes: parsePositiveInt(process.env.OTP_EXPIRY_MINUTES, 10),
    resendCooldownSeconds: parsePositiveInt(
      process.env.OTP_RESEND_COOLDOWN_SECONDS,
      30
    ),
    maxAttempts: parsePositiveInt(process.env.OTP_MAX_ATTEMPTS, 5),
    verificationTokenTtlMinutes: parsePositiveInt(
      process.env.OTP_VERIFICATION_TOKEN_TTL_MINUTES,
      10
    ),
  };
}

export async function verifyDoctorSignupOtp(input: {
  channel: DoctorSignupOtpChannel;
  target: string;
  otp: string;
}) {
  const now = new Date();
  const config = getDoctorSignupOtpConfig();
  const latestOtp = await findLatestActiveDoctorSignupOtp(input.channel, input.target);

  if (!latestOtp) {
    return { ok: false as const, status: 400, error: "OTP is invalid" };
  }

  if (latestOtp.expires_at <= now) {
    return { ok: false as const, status: 400, error: "OTP has expired" };
  }

  if (latestOtp.attempt_count >= config.maxAttempts) {
    return {
      ok: false as const,
      status: 429,
      error: "Maximum OTP verification attempts exceeded",
    };
  }

  if (!compareOtp(input.otp, latestOtp.otp_hash)) {
    await prisma.doctor_signup_otps.update({
      where: { otp_id: latestOtp.otp_id },
      data: { attempt_count: { increment: 1 } },
    });

    return { ok: false as const, status: 401, error: "Invalid OTP" };
  }

  const verificationToken = generateOtpVerificationToken();
  const verificationExpiresAt = new Date(
    now.getTime() + config.verificationTokenTtlMinutes * 60 * 1000
  );

  await prisma.doctor_signup_otps.update({
    where: { otp_id: latestOtp.otp_id },
    data: {
      verified_at: now,
      verification_token: verificationToken,
      verification_expires_at: verificationExpiresAt,
    },
  });

  return {
    ok: true as const,
    verificationToken,
    verificationExpiresAt,
  };
}

export async function validateDoctorSignupVerificationToken(input: {
  channel: DoctorSignupOtpChannel;
  target: string;
  verificationToken: string;
}) {
  return prisma.doctor_signup_otps.findFirst({
    where: {
      target: input.target,
      channel: input.channel,
      verification_token: input.verificationToken,
      verified_at: { not: null },
      used_at: null,
      verification_expires_at: { gt: new Date() },
    },
    orderBy: { verified_at: "desc" },
  }) as Promise<DoctorSignupOtpRecord | null>;
}

export async function consumeDoctorSignupVerificationToken(otpId: number) {
  return prisma.doctor_signup_otps.updateMany({
    where: {
      otp_id: otpId,
      used_at: null,
    },
    data: { used_at: new Date() },
  });
}

export { generateOtp };
