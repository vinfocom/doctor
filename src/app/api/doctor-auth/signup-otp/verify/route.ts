export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import {
  isDoctorSignupOtpChannel,
  normalizeDoctorSignupOtpTarget,
  verifyDoctorSignupOtp,
} from "@/lib/doctorSignupOtp";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const channel = String(body?.channel || "").trim().toUpperCase();
    const otp = String(body?.otp || "").trim();

    if (!isDoctorSignupOtpChannel(channel)) {
      return NextResponse.json({ error: "Invalid verification method" }, { status: 400 });
    }

    const target = normalizeDoctorSignupOtpTarget(channel, body?.target);
    if (!target || !otp) {
      return NextResponse.json(
        { error: "Verification method, target, and OTP are required" },
        { status: 400 }
      );
    }

    const result = await verifyDoctorSignupOtp({ channel, target, otp });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(
      {
        success: true,
        message: "OTP verified successfully",
        verificationToken: result.verificationToken,
        verificationExpiresAt: result.verificationExpiresAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Doctor signup verify OTP error:", error);
    return NextResponse.json(
      { error: "Unable to verify OTP right now" },
      { status: 500 }
    );
  }
}
