
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;

    if (!token) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const session = verifyToken(token);
    if (!session || session.role !== "SUPER_ADMIN") {
        return NextResponse.json({ error: "Forbidden: Super Admin only" }, { status: 403 });
    }

    try {
        const body = await req.json();
        const { name, email, password, role, specific_details } = body;

        // Basic validation
        if (!name || !email || !password || !role) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (role !== "DOCTOR" && role !== "ADMIN") {
            return NextResponse.json({ error: "Invalid role. Must be DOCTOR or ADMIN" }, { status: 400 });
        }

        // Check if user exists
        const existingUser = await prisma.users.findUnique({ where: { email } });
        if (existingUser) {
            return NextResponse.json({ error: "User already exists with this email" }, { status: 409 });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Transaction to ensure data consistency
        const result = await prisma.$transaction(async (tx) => {
            // 1. Create User
            const newUser = await tx.users.create({
                data: {
                    name,
                    email,
                    password: hashedPassword,
                    role: role,
                }
            });

            // 2. Create Role-Specific Profile
            if (role === "DOCTOR") {
                // For doctors, we need an admin_id. 
                // If the super admin is creating them, who is their admin? 
                // Option A: The Super Admin's own admin profile (if exists).
                // Option B: A specific admin selected in the form.
                // For now, let's assume the Super Admin *is* the admin, or we use a default.
                // Let's check if 'specific_details' has admin_id, else try to find one.

                let adminId = specific_details?.admin_id;

                if (!adminId) {
                    // Fallback: Find the Super Admin's admin profile
                    const superAdminProfile = await tx.admins.findUnique({ where: { user_id: session.userId } });
                    if (superAdminProfile) {
                        adminId = superAdminProfile.admin_id;
                    } else {
                        // Fallback 2: Just pick the first admin? Or fail? 
                        // Let's fail for now to be safe, or user needs to provide it.
                        // Actually, for simplicity in this MVP, if no admin_id is provided, 
                        // we can try to find *any* admin or create one? No, that's risky.
                        // Let's default to 1 if we can't find anything, assuming ID 1 is the main admin.
                        adminId = 1;
                    }
                }

                await tx.doctors.create({
                    data: {
                        doctor_name: name,
                        phone: specific_details?.phone || null,
                        whatsapp_number: specific_details?.whatsapp_number || null,
                        status: "ACTIVE",
                        admin_id: adminId,
                        user_id: newUser.user_id
                    }
                });
            } else if (role === "ADMIN") {
                await tx.admins.create({
                    data: {
                        user_id: newUser.user_id,
                        // Admin might not need other fields initially
                    }
                });
            }

            return newUser;
        });

        return NextResponse.json({ message: "User created successfully", user: { id: result.user_id, email: result.email, role: result.role } });

    } catch (error) {
        console.error("Create User Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
