export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import {
  compareOtp,
  findPatientByPhone,
  generateOtpVerificationToken,
  normalizePhone,
  type PatientOtpPurpose,
} from "@/lib/patientOtp";

type PatientPasswordOtpRecord = {
  otp_id: number;
  patient_id: number;
  otp_hash: string;
  attempt_count: number;
  expires_at: Date;
  used_at: Date | null;
  resend_after: Date | null;
  created_at: Date;
};

function getOtpDelegate() {
  return (prisma as unknown as {
    patient_password_otps: {
      findFirst: (args: unknown) => Promise<PatientPasswordOtpRecord | null>;
      update: (args: unknown) => Promise<unknown>;
    };
  }).patient_password_otps;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isPurpose(value: string): value is PatientOtpPurpose {
  return value === "SET_PASSWORD_FIRST_TIME" || value === "RESET_PASSWORD";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const phone = normalizePhone(body?.phone);
    const purpose = String(body?.purpose || "").trim();
    const otp = String(body?.otp || "").trim();

    if (!phone || !purpose || !otp) {
      return NextResponse.json(
        { error: "Phone, purpose, and OTP are required" },
        { status: 400 }
      );
    }

    if (!isPurpose(purpose)) {
      return NextResponse.json({ error: "Invalid OTP purpose" }, { status: 400 });
    }

    const patient = await findPatientByPhone(phone);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const now = new Date();
    const otpDelegate = getOtpDelegate();
    const latestOtp = await otpDelegate.findFirst({
      where: {
        patient_id: patient.patient_id,
        phone,
        purpose,
        used_at: null,
      },
      orderBy: { created_at: "desc" },
      select: {
        otp_id: true,
        patient_id: true,
        otp_hash: true,
        attempt_count: true,
        expires_at: true,
        used_at: true,
        resend_after: true,
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
        used_at: now,
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
    console.error("Patient verify OTP error:", error);
    return NextResponse.json(
      { error: "Unable to verify OTP right now" },
      { status: 500 }
    );
  }
}
