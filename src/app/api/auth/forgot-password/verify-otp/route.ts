export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import {
  compareOtp,
  findAllowedUserByEmail,
  generateOtpVerificationToken,
  normalizeEmail,
} from "@/lib/userPasswordOtp";

type UserPasswordOtpRecord = {
  otp_id: number;
  user_id: number;
  otp_hash: string;
  attempt_count: number;
  expires_at: Date;
  used_at: Date | null;
  verified_at: Date | null;
  verification_token: string | null;
  verification_expires_at: Date | null;
  created_at: Date;
};

function getOtpDelegate() {
  return (prisma as unknown as {
    user_password_otps: {
      findFirst: (args: unknown) => Promise<UserPasswordOtpRecord | null>;
      update: (args: unknown) => Promise<unknown>;
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
    const otp = String(body?.otp || "").trim();

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email and OTP are required" },
        { status: 400 }
      );
    }

    const user = await findAllowedUserByEmail(email);
    if (!user) {
      return NextResponse.json(
        { error: "Doctor or clinic staff account not found" },
        { status: 404 }
      );
    }

    const now = new Date();
    const otpDelegate = getOtpDelegate();
    const latestOtp = await otpDelegate.findFirst({
      where: {
        user_id: user.user_id,
        email,
        purpose: "RESET_PASSWORD",
        used_at: null,
      },
      orderBy: { created_at: "desc" },
      select: {
        otp_id: true,
        user_id: true,
        otp_hash: true,
        attempt_count: true,
        expires_at: true,
        used_at: true,
        verified_at: true,
        verification_token: true,
        verification_expires_at: true,
        created_at: true,
      },
    });

    if (!latestOtp) {
      return NextResponse.json({ error: "OTP is invalid" }, { status: 400 });
    }

    if (latestOtp.expires_at <= now) {
      return NextResponse.json({ error: "OTP has expired" }, { status: 400 });
    }

    const maxAttempts = parsePositiveInt(process.env.OTP_MAX_ATTEMPTS, 5);
    if (latestOtp.attempt_count >= maxAttempts) {
      return NextResponse.json(
        { error: "Maximum OTP verification attempts exceeded" },
        { status: 429 }
      );
    }

    const isValidOtp = compareOtp(otp, latestOtp.otp_hash);
    if (!isValidOtp) {
      await otpDelegate.update({
        where: { otp_id: latestOtp.otp_id },
        data: {
          attempt_count: { increment: 1 },
        },
      });

      return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
    }

    const verificationToken = generateOtpVerificationToken();
    const verificationTokenTtlMinutes = parsePositiveInt(
      process.env.OTP_VERIFICATION_TOKEN_TTL_MINUTES,
      10
    );
    const verificationExpiresAt = new Date(
      now.getTime() + verificationTokenTtlMinutes * 60 * 1000
    );

    await otpDelegate.update({
      where: { otp_id: latestOtp.otp_id },
      data: {
        verified_at: now,
        verification_token: verificationToken,
        verification_expires_at: verificationExpiresAt,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "OTP verified successfully",
        verificationToken,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Doctor/staff verify OTP error:", error);
    return NextResponse.json(
      { error: "Unable to verify OTP right now" },
      { status: 500 }
    );
  }
}
