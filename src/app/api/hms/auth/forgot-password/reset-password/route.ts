export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { resetHmsPasswordWithOtpToken } from "@/lib/hmsForgotPassword";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const email = String(body?.email || "").trim();
        const verificationToken = String(body?.verificationToken || "").trim();
        const newPassword = String(body?.newPassword || "").trim();
        const confirmPassword = String(body?.confirmPassword || "").trim();

        if (!email || !verificationToken || !newPassword || !confirmPassword) {
            return NextResponse.json(
                { error: "Email, verification token, and passwords are required." },
                { status: 400 }
            );
        }

        const result = await resetHmsPasswordWithOtpToken({
            email,
            verificationToken,
            newPassword,
            confirmPassword,
        });

        if (!result.found) {
            return NextResponse.json({ error: result.error }, { status: 404 });
        }

        if (result.error) {
            const status = result.error === "Invalid or expired verification token"
                ? 401
                : 400;
            return NextResponse.json({ error: result.error }, { status });
        }

        return NextResponse.json(
            {
                success: true,
                message: "Password reset successful",
            },
            { status: 200 }
        );
    } catch (error) {
        console.error("HMS forgot-password reset password error:", error);
        return NextResponse.json(
            {
                error:
                    error instanceof Error && error.message
                        ? error.message
                        : "Unable to reset password right now",
            },
            { status: 500 }
        );
    }
}
