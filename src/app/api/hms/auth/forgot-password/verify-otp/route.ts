export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { verifyHmsPasswordResetOtp } from "@/lib/hmsForgotPassword";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const email = String(body?.email || "").trim();
        const otp = String(body?.otp || "").trim();

        if (!email || !otp) {
            return NextResponse.json({ error: "Email and OTP are required." }, { status: 400 });
        }

        const result = await verifyHmsPasswordResetOtp(email, otp);
        if (!result.found) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        if (result.rateLimited) {
            return NextResponse.json({ error: result.error }, { status: 429 });
        }

        if (result.error) {
            const status = result.error === "Invalid OTP"
                ? 401
                : result.error === "OTP has expired"
                    ? 400
                    : 400;
            return NextResponse.json({ error: result.error }, { status });
        }

        return NextResponse.json(
            {
                success: true,
                message: "OTP verified successfully",
                verificationToken: result.verificationToken,
                expiresInSeconds: result.expiresInSeconds,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("HMS forgot-password verify OTP error:", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error && error.message
                        ? error.message
                        : "Unable to verify OTP right now",
            },
            { status: 500 }
        );
    }
}
