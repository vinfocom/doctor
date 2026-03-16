
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

        if (!name || !email || !password || !role) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        if (role !== "DOCTOR" && role !== "ADMIN") {
            return NextResponse.json({ error: "Invalid role. Must be DOCTOR or ADMIN" }, { status: 400 });
        }

        // Check if user exists
        const existingUser = await prisma.users.findUnique({
            where: { email },
            include: { doctor: true },
        });

        if (existingUser) {
            // If user has an active linked doctor record → block (truly in use)
            if (existingUser.doctor) {
                return NextResponse.json({ error: "User already exists with this email" }, { status: 409 });
            }
            // Otherwise it's an orphan (doctor was deleted but user record wasn't cleaned up)
            // We'll reuse this user in the transaction below
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await prisma.$transaction(async (tx) => {
            // 1. Create or reuse user record
            let newUser: { user_id: number; email: string | null; role: string };
            if (existingUser) {
                // Reuse orphan user — update credentials
                newUser = await tx.users.update({
                    where: { email },
                    data: { name, password: hashedPassword, role: role as "DOCTOR" | "ADMIN" },
                });
            } else {
                newUser = await tx.users.create({
                    data: { name, email, password: hashedPassword, role: role },
                });
            }

            // 2. Create role-specific profile
            if (role === "DOCTOR") {
                let adminId = specific_details?.admin_id;
                if (!adminId) {
                    const superAdminProfile = await tx.admins.findUnique({ where: { user_id: session.userId } });
                    adminId = superAdminProfile?.admin_id ?? 1;
                }

                const doctor = await tx.doctors.create({
                    data: {
                        doctor_name: name,
                        phone: specific_details?.phone || null,
                        whatsapp_number: specific_details?.whatsapp_number || null,
                        status: "ACTIVE",
                        admin_id: adminId,
                        user_id: newUser.user_id,
                        username: String(
                            specific_details?.username ||
                            email.split("@")[0] ||
                            `doctor_${newUser.user_id}`
                        ),
                        chat_id: specific_details?.chat_id
                            ? BigInt(specific_details.chat_id)
                            : BigInt(Math.floor(Date.now() / 1000) + newUser.user_id),
                        gst_number: specific_details?.gst_number || null,
                        pan_number: specific_details?.pan_number || null,
                        address: specific_details?.address || null,
                        registration_no: specific_details?.registration_no || null,
                        education: specific_details?.education || null,
                        document_url: specific_details?.document_url || null,
                        specialization: specific_details?.specialization || null,
                        profile_pic_url: specific_details?.profile_pic_url || null,
                        num_clinics: specific_details?.num_clinics ? Number(specific_details.num_clinics) : 0,
                    }
                });

                // Create whatsapp_numbers rows if provided
                const waNums = specific_details?.whatsapp_numbers;
                if (Array.isArray(waNums) && waNums.length > 0) {
                    await tx.doctor_whatsapp_numbers.createMany({
                        data: waNums.map((wn: { whatsapp_number: string }, i: number) => ({
                            doctor_id: doctor.doctor_id,
                            whatsapp_number: wn.whatsapp_number,
                            is_primary: i === 0,
                        })),
                    });
                }
            } else if (role === "ADMIN") {
                await tx.admins.create({ data: { user_id: newUser.user_id } });
            }

            return newUser;
        });

        return NextResponse.json({
            message: "User created successfully",
            user: { id: result.user_id, email: result.email, role: result.role }
        });

    } catch (error) {
        console.error("Create User Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
