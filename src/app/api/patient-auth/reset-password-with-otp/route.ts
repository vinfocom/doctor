export const dynamic = "force-dynamic";

import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";

import { generateToken } from "@/lib/jwt";
import { findPatientByPhone, normalizePhone, toSafePatient } from "@/lib/patientOtp";
import prisma from "@/lib/prisma";

type VerifiedOtpRecord = {
  otp_id: number;
  patient_id: number;
  verification_token: string | null;
  verification_expires_at: Date | null;
};

function getOtpDelegate() {
  return (prisma as unknown as {
    patient_password_otps: {
      findFirst: (args: unknown) => Promise<VerifiedOtpRecord | null>;
      update: (args: unknown) => Promise<unknown>;
    };
  }).patient_password_otps;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const phone = normalizePhone(body?.phone);
    const newPassword = String(body?.newPassword || "").trim();
    const confirmPassword = String(body?.confirmPassword || "").trim();
    const verificationToken = String(body?.verificationToken || "").trim();

    if (!phone || !newPassword || !confirmPassword || !verificationToken) {
      return NextResponse.json(
        { error: "Phone, passwords, and verification token are required" },
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

    const patient = await findPatientByPhone(phone);
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    if (!String(patient.password || "").trim()) {
      return NextResponse.json(
        { error: "This account does not have a password yet. Please use set password." },
        { status: 400 }
      );
    }

    const now = new Date();
    const otpDelegate = getOtpDelegate();
    const verifiedOtp = await otpDelegate.findFirst({
      where: {
        patient_id: patient.patient_id,
        phone,
        purpose: "RESET_PASSWORD",
        verification_token: verificationToken,
        verification_expires_at: { gt: now },
      },
      orderBy: { created_at: "desc" },
      select: {
        otp_id: true,
        patient_id: true,
        verification_token: true,
        verification_expires_at: true,
      },
    });

    if (!verifiedOtp) {
      return NextResponse.json(
        { error: "Invalid or expired verification token" },
        { status: 401 }
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.patients.update({
      where: { patient_id: patient.patient_id },
      data: { password: hashedPassword },
    });

    await otpDelegate.update({
      where: { otp_id: verifiedOtp.otp_id },
      data: {
        verification_token: null,
        verification_expires_at: null,
      },
    });

    const token = generateToken({
      userId: patient.patient_id,
      patientId: patient.patient_id,
      role: "PATIENT",
    });

    const response = NextResponse.json(
      {
        message: "Password reset successful",
        role: "PATIENT",
        token,
        patient: toSafePatient(patient),
      },
      { status: 200 }
    );

    response.cookies.set("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Patient reset password with OTP error:", error);
    return NextResponse.json(
      { error: "Unable to reset password right now" },
      { status: 500 }
    );
  }
}
