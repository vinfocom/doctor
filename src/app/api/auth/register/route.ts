export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { generateToken } from "@/lib/jwt";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { email, password, name, role } = body;

        if (!email || !password || !name) {
            return NextResponse.json(
                { error: "Email, password, and name are required" },
                { status: 400 }
            );
        }

        // Check if user already exists
        const existingUser = await prisma.users.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json(
                { error: "User with this email already exists" },
                { status: 409 }
            );
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Only allow ADMIN and DOCTOR roles for self-registration
        const allowedRoles = ["ADMIN", "DOCTOR"];
        const userRole = allowedRoles.includes(role) ? role : "ADMIN";

        // Create user
        const user = await prisma.users.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: userRole,
            },
        });

        // If role is ADMIN, also create an admins record
        if (userRole === "ADMIN" || userRole === "SUPER_ADMIN") {
            await prisma.admins.create({
                data: {
                    user_id: user.user_id,
                },
            });
        }

        // Generate JWT
        const token = generateToken({
            userId: user.user_id,
            email: user.email!,
            role: user.role as "SUPER_ADMIN" | "ADMIN" | "DOCTOR",
        });

        const response = NextResponse.json(
            {
                message: "Registration successful",
                user: { id: user.user_id, email: user.email, name: user.name, role: user.role },
            },
            { status: 201 }
        );

        // Set cookie
        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 7, // 7 days
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Registration error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
