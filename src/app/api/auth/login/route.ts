export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { generateToken } from "@/lib/jwt";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { email, password } = body;

        if (!email || !password) {
            return NextResponse.json(
                { error: "Email and password are required" },
                { status: 400 }
            );
        }

        // Find user
        const user = await prisma.users.findUnique({ where: { email } });
        if (!user || !user.password) {
            return NextResponse.json(
                { error: "Invalid email or password" },
                { status: 401 }
            );
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return NextResponse.json(
                { error: "Invalid email or password" },
                { status: 401 }
            );
        }

        // Block inactive doctors from logging in
        if (user.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: user.user_id },
                select: { status: true, active_from: true, active_to: true },
            });
            if (doctor?.status === "INACTIVE") {
                return NextResponse.json(
                    { error: "Your account has been deactivated. Please contact the administrator." },
                    { status: 403 }
                );
            }

            const todayStr = new Date().toISOString().split("T")[0];
            if (doctor?.active_from) {
                const fromStr = new Date(doctor.active_from).toISOString().split("T")[0];
                if (fromStr > todayStr) {
                    return NextResponse.json({ error: "Your account access has not started yet." }, { status: 403 });
                }
            }
            if (doctor?.active_to) {
                const toStr = new Date(doctor.active_to).toISOString().split("T")[0];
                if (toStr < todayStr) {
                    return NextResponse.json({ error: "Your account access has expired." }, { status: 403 });
                }
            }
        }

        // Check Clinic Staff validity
        if (user.role === "CLINIC_STAFF") {
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: user.user_id }
            });

            if (!staff || staff.status !== "ACTIVE") {
                return NextResponse.json({ error: "Your account is inactive or not found." }, { status: 403 });
            }

            // Compare only date parts (YYYY-MM-DD) to avoid UTC vs local timezone issues
            const todayStr = new Date().toISOString().split("T")[0]; // e.g. "2026-03-14"

            if (staff.valid_from) {
                const fromStr = new Date(staff.valid_from).toISOString().split("T")[0];
                if (fromStr > todayStr) {
                    return NextResponse.json({ error: "Your account access has not started yet." }, { status: 403 });
                }
            }
            if (staff.valid_to) {
                const toStr = new Date(staff.valid_to).toISOString().split("T")[0];
                if (toStr < todayStr) {
                    return NextResponse.json({ error: "Your account access has expired." }, { status: 403 });
                }
            }
        }

        // Generate JWT
        const token = generateToken({
            userId: user.user_id,
            email: user.email!,
            role: user.role as "SUPER_ADMIN" | "ADMIN" | "DOCTOR" | "CLINIC_STAFF",
        });

        const response = NextResponse.json({
            message: "Login successful",
            user: { id: user.user_id, email: user.email, name: user.name, role: user.role },
            token,
        });

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
        console.error("Login error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
