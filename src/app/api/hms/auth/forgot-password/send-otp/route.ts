export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { sendHmsPasswordResetOtp } from "@/lib/hmsForgotPassword";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const email = String(body?.email || "").trim();

        if (!email) {
            return NextResponse.json({ error: "Email is required." }, { status: 400 });
        }

        const result = await sendHmsPasswordResetOtp(email);
        if (!result.found) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        if (result.cooldown) {
            return NextResponse.json(
                {
                    error: "OTP resend is available after the cooldown period.",
                    resendAfterSeconds: result.resendAfterSeconds,
                },
                { status: 429 }
            );
        }

        return NextResponse.json(
            {
                success: true,
                message: "OTP sent successfully",
                expiresInSeconds: result.expiresInSeconds,
                resendAfterSeconds: result.resendAfterSeconds,
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("HMS forgot-password send OTP error:", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error && error.message
                        ? error.message
                        : "Unable to send OTP right now",
            },
            { status: 502 }
        );
    }
}
