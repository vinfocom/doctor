export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { findAllowedUserByEmail, normalizeEmail } from "@/lib/userPasswordOtp";

type VerifiedOtpRecord = {
  otp_id: number;
  user_id: number;
  verification_token: string | null;
  verification_expires_at: Date | null;
  used_at: Date | null;
};

function getOtpDelegate() {
  return (prisma as unknown as {
    user_password_otps: {
      findFirst: (args: unknown) => Promise<VerifiedOtpRecord | null>;
      update: (args: unknown) => Promise<unknown>;
    };
  }).user_password_otps;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = normalizeEmail(body?.email);
    const newPassword = String(body?.newPassword || "").trim();
    const confirmPassword = String(body?.confirmPassword || "").trim();
    const verificationToken = String(body?.verificationToken || "").trim();

    if (!email || !newPassword || !confirmPassword || !verificationToken) {
      return NextResponse.json(
        { error: "Email, passwords, and verification token are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters long" },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { error: "Password and confirm password must match" },
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
    const verifiedOtp = await otpDelegate.findFirst({
      where: {
        user_id: user.user_id,
        email,
        purpose: "RESET_PASSWORD",
        verification_token: verificationToken,
        verification_expires_at: { gt: now },
        used_at: null,
      },
      orderBy: { created_at: "desc" },
      select: {
        otp_id: true,
        user_id: true,
        verification_token: true,
        verification_expires_at: true,
        used_at: true,
      },
    });

    if (!verifiedOtp) {
      return NextResponse.json(
        { error: "Invalid or expired verification token" },
        { status: 401 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.users.update({
      where: { user_id: user.user_id },
      data: { password: hashedPassword },
    });

    await otpDelegate.update({
      where: { otp_id: verifiedOtp.otp_id },
      data: {
        used_at: now,
        verification_token: null,
        verification_expires_at: null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Password reset successful",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Doctor/staff reset password error:", error);
    return NextResponse.json(
      { error: "Unable to reset password right now" },
      { status: 500 }
    );
  }
}
