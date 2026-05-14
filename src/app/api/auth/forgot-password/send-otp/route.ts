export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import {
  createPasswordResetOtp,
  findAllowedUserByEmail,
  findLatestActiveOtp,
  generateOtp,
  invalidatePreviousOtps,
  normalizeEmail,
  sendEmailOtp,
} from "@/lib/userPasswordOtp";

type UserPasswordOtpRecord = {
  otp_id: number;
};

function getOtpDelegate() {
  return (prisma as unknown as {
    user_password_otps: {
      update: (args: unknown) => Promise<UserPasswordOtpRecord>;
    };
  }).user_password_otps;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body?.email);

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const user = await findAllowedUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Doctor or clinic staff account not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const latestActiveOtp = await findLatestActiveOtp(email, "RESET_PASSWORD");
    if (latestActiveOtp?.resend_after && latestActiveOtp.resend_after > now) {
      const resendAfterSeconds = Math.max(
        1,
        Math.ceil((latestActiveOtp.resend_after.getTime() - now.getTime()) / 1000)
      );
      return NextResponse.json(
        {
          error: "OTP resend is available after the cooldown period.",
          resendAfterSeconds,
        },
        { status: 429 }
      );
    }

    const otpLength = parsePositiveInt(process.env.OTP_LENGTH, 6);
    const expiryMinutes = parsePositiveInt(process.env.OTP_EXPIRY_MINUTES, 10);
    const resendCooldownSeconds = parsePositiveInt(
      process.env.OTP_RESEND_COOLDOWN_SECONDS,
      30
    );

    const otp = generateOtp(otpLength);
    await invalidatePreviousOtps(email, "RESET_PASSWORD", user.user_id);
    const createdOtp = await createPasswordResetOtp({
      userId: user.user_id,
      email,
      otp,
    });

    try {
      await sendEmailOtp({ email, otp });
    } catch (error) {
      const otpDelegate = getOtpDelegate();
      await otpDelegate.update({
        where: { otp_id: createdOtp.otp_id },
        data: {
          used_at: new Date(),
          verification_token: null,
          verification_expires_at: null,
          verified_at: null,
        },
      });

      return NextResponse.json(
        {
          error:
            error instanceof Error && error.message
              ? error.message
              : "Email send failed",
        },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "OTP sent successfully",
        expiresInSeconds: expiryMinutes * 60,
        resendAfterSeconds: resendCooldownSeconds,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Doctor/staff send OTP error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : "Unable to send OTP right now",
      },
      { status: 500 }
    );
  }
}
