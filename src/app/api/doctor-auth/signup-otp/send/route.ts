export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import prisma, { resetPrismaClient } from "@/lib/prisma";
import {
  generateOtp,
  getDoctorSignupOtpConfig,
  invalidateDoctorSignupOtps,
  isDoctorSignupOtpChannel,
  createDoctorSignupOtp,
  findLatestActiveDoctorSignupOtp,
  markLatestDoctorSignupOtpUsed,
  normalizeDoctorSignupOtpTarget,
  sendDoctorSignupOtp,
} from "@/lib/doctorSignupOtp";
import { normalizePhone } from "@/lib/patientOtp";

function phonesMatch(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizePhone(left);
  const normalizedRight = normalizePhone(right);
  if (!normalizedLeft || !normalizedRight) return false;
  if (normalizedLeft === normalizedRight) return true;
  return normalizedLeft.length >= 10 &&
    normalizedRight.length >= 10 &&
    normalizedLeft.slice(-10) === normalizedRight.slice(-10);
}

async function doctorPhoneExists(phone: string) {
  const digits = normalizePhone(phone);
  if (!digits) return false;

  const candidates = await prisma.doctors.findMany({
    where: {
      OR: [
        { phone: digits },
        ...(digits.length >= 10 ? [{ phone: { endsWith: digits.slice(-10) } }] : []),
      ],
    },
    select: { phone: true },
  });

  return candidates.some((doctor) => phonesMatch(doctor.phone, phone));
}

function isPoolAcquireError(error: unknown) {
  const message = String(
    (error as { message?: unknown })?.message ||
    (error as { cause?: { message?: unknown } })?.cause?.message ||
    ""
  ).toLowerCase();
  return message.includes("pool timeout") ||
    message.includes("failed to retrieve a connection from pool") ||
    message.includes("acquire");
}

async function withPrismaPoolRetry<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    if (!isPoolAcquireError(error)) throw error;
    await resetPrismaClient();
    return operation();
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const channel = String(body?.channel || "").trim().toUpperCase();

    if (!isDoctorSignupOtpChannel(channel)) {
      return NextResponse.json({ error: "Invalid verification method" }, { status: 400 });
    }

    const target = normalizeDoctorSignupOtpTarget(channel, body?.target);
    const signupEmail = normalizeDoctorSignupOtpTarget("EMAIL", body?.email);
    const signupPhone = normalizeDoctorSignupOtpTarget("PHONE", body?.phone);
    if (!target) {
      return NextResponse.json(
        { error: channel === "EMAIL" ? "Email is required" : "Phone number is required" },
        { status: 400 }
      );
    }

    const emailToCheck = signupEmail || (channel === "EMAIL" ? target : "");
    const phoneToCheck = signupPhone || (channel === "PHONE" ? target : "");

    const config = getDoctorSignupOtpConfig();
    const otp = generateOtp(config.otpLength);
    const preSendResult = await withPrismaPoolRetry(async () => {
      if (emailToCheck) {
        const existingUser = await prisma.users.findUnique({
          where: { email: emailToCheck },
          select: { user_id: true },
        });
        if (existingUser) {
          return {
            ok: false as const,
            response: NextResponse.json(
              { error: "A user with this email already exists" },
              { status: 409 }
            ),
          };
        }
      }

      if (phoneToCheck && await doctorPhoneExists(phoneToCheck)) {
        return {
          ok: false as const,
          response: NextResponse.json(
            { error: "A doctor with this phone number already exists" },
            { status: 409 }
          ),
        };
      }

      const now = new Date();
      const latestActiveOtp = await findLatestActiveDoctorSignupOtp(channel, target);
      if (latestActiveOtp?.resend_after && latestActiveOtp.resend_after > now) {
        const resendAfterSeconds = Math.max(
          1,
          Math.ceil((latestActiveOtp.resend_after.getTime() - now.getTime()) / 1000)
        );
        return {
          ok: false as const,
          response: NextResponse.json(
            {
              error: "OTP resend is available after the cooldown period.",
              resendAfterSeconds,
            },
            { status: 429 }
          ),
        };
      }

      await invalidateDoctorSignupOtps(channel, target);
      await createDoctorSignupOtp({ channel, target, otp });
      return { ok: true as const };
    });

    if (!preSendResult.ok) {
      return preSendResult.response;
    }

    try {
      await sendDoctorSignupOtp({ channel, target, otp });
    } catch (error) {
      await markLatestDoctorSignupOtpUsed(channel, target);
      return NextResponse.json(
        {
          error:
            error instanceof Error && error.message
              ? error.message
              : channel === "EMAIL"
                ? "Email send failed"
                : "SMS send failed",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "OTP sent successfully",
        expiresInSeconds: config.expiryMinutes * 60,
        resendAfterSeconds: config.resendCooldownSeconds,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Doctor signup send OTP error:", error);
    return NextResponse.json(
      { error: "Unable to send OTP right now" },
      { status: 500 }
    );
  }
}
