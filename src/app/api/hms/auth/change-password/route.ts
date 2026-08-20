export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { generateToken } from "@/lib/jwt";
import { validateHmsPassword } from "@/lib/hms-passwords";

type UserPasswordRow = {
    password: string | null;
};

export async function POST(req: Request) {
    try {
        const session = await getHmsSessionFromRequest(req, { allowPasswordChange: true });
        if (!session) {
            return NextResponse.json({ error: "HMS login is required." }, { status: 401 });
        }

        const body = await req.json();
        const password = String(body?.password || "");
        const confirmPassword = String(body?.confirmPassword || "");
        const fieldErrors: Record<string, string> = {};
        const passwordError = validateHmsPassword(password);

        if (passwordError) fieldErrors.password = passwordError;
        if (password !== confirmPassword) fieldErrors.confirmPassword = "Passwords do not match.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const rows = await prisma.$queryRawUnsafe<UserPasswordRow[]>(
            `
            SELECT password
            FROM users
            WHERE user_id = ?
            LIMIT 1
            `,
            session.hospitalContext.userId
        );
        const currentHash = rows[0]?.password;

        if (!currentHash) {
            return NextResponse.json({ error: "Account password is not configured." }, { status: 400 });
        }

        const isSamePassword = await bcrypt.compare(password, currentHash);
        if (isSamePassword) {
            return NextResponse.json(
                { error: "Choose a new password.", fieldErrors: { password: "New password cannot match the temporary password." } },
                { status: 400 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
                `
                UPDATE users
                SET password = ?,
                    force_password_change = FALSE
                WHERE user_id = ?
                `,
                hashedPassword,
                session.hospitalContext.userId
            );
        });

        const token = generateToken({
            userId: session.userId,
            email: session.email,
            role: session.hospitalContext.role,
            hospitalContext: session.hospitalContext,
            forcePasswordChange: false,
        });

        const response = NextResponse.json({
            message: "Password changed.",
            user: {
                id: session.userId,
                email: session.email,
                role: session.hospitalContext.role,
                hospitalContext: session.hospitalContext,
                forcePasswordChange: false,
            },
            token,
        });

        response.cookies.set("hms_token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("HMS password change error:", error);
        return NextResponse.json({ error: "Unable to change password. Please try again." }, { status: 500 });
    }
}
