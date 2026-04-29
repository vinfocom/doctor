export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import {
  type PatientOtpPurpose,
  findPatientByPhone,
  generateOtp,
  hashOtp,
  invalidatePreviousOtps,
  normalizePhone,
  sendSmsOtp,
} from "@/lib/patientOtp";

type PatientPasswordOtpRecord = {
  otp_id: number;
  patient_id: number;
  phone: string;
  purpose: PatientOtpPurpose;
  expires_at: Date;
  resend_after: Date | null;
  used_at: Date | null;
  created_at: Date;
};

function getOtpDelegate() {
  return (prisma as unknown as {
    patient_password_otps: {
      findFirst: (args: unknown) => Promise<PatientPasswordOtpRecord | null>;
      create: (args: unknown) => Promise<{ otp_id: number }>;
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

    if (!phone || !purpose) {
      return NextResponse.json(
        { error: "Phone and purpose are required" },
        { status: 400 }
      );
    }

    if (!isPurpose(purpose)) {
      return NextResponse.json(
        { error: "Invalid OTP purpose" },
        { status: 400 }
      );
    }

    const patient = await findPatientByPhone(phone);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const hasPassword = Boolean(String(patient.password || "").trim());
    if (purpose === "SET_PASSWORD_FIRST_TIME" && hasPassword) {
      return NextResponse.json(
        { error: "Password already set. Please log in or use forgot password." },
        { status: 400 }
      );
    }

    if (purpose === "RESET_PASSWORD" && !hasPassword) {
      return NextResponse.json(
        { error: "This account does not have a password yet. Please use set password." },
        { status: 400 }
      );
    }

    const otpDelegate = getOtpDelegate();
    const now = new Date();
    const latestActiveOtp = await otpDelegate.findFirst({
      where: {
        patient_id: patient.patient_id,
        phone,
        purpose,
        used_at: null,
        expires_at: { gt: now },
      },
      orderBy: { created_at: "desc" },
      select: {
        otp_id: true,
        patient_id: true,
        phone: true,
        purpose: true,
        expires_at: true,
        resend_after: true,
        used_at: true,
        created_at: true,
      },
    });

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
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
    const resendAfter = new Date(now.getTime() + resendCooldownSeconds * 1000);

    await invalidatePreviousOtps(phone, purpose, patient.patient_id);

    const createdOtp = await otpDelegate.create({
      data: {
        patient_id: patient.patient_id,
        phone,
        purpose,
        otp_hash: otpHash,
        expires_at: expiresAt,
        resend_after: resendAfter,
        attempt_count: 0,
        resend_count: 0,
      },
      select: { otp_id: true },
    });

    try {
      await sendSmsOtp({ phone, otp });
    } catch (error) {
      await otpDelegate.update({
        where: { otp_id: createdOtp.otp_id },
        data: {
          used_at: new Date(),
          verification_token: null,
          verification_expires_at: null,
        },
      });
      return NextResponse.json(
        {
          error:
            error instanceof Error && error.message
              ? error.message
              : "SMS send failed",
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
    console.error("Patient send OTP error:", error);
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
