
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

function jsonSafe<T>(value: T): T {
    return JSON.parse(
        JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v))
    ) as T;
}

export async function GET(req: Request) {
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

    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Find doctor profile linked to this user
        // Note: user.id is verified, but we need to check if they have a doctor profile
        const doctor = await prisma.doctors.findUnique({
            where: { user_id: user.userId },
            include: {
                admin: {
                    select: {
                        user: {
                            select: {
                                email: true
                            }
                        }
                    }
                },
                clinics: {
                    include: {
                        schedules: true
                    }
                },
                whatsapp_numbers: true
            }
        });

        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        return NextResponse.json({ doctor: jsonSafe(doctor) });
    } catch (error) {
        console.error("Error fetching doctor profile:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
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

    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { doctor_name, phone, whatsapp_number, status, whatsapp_numbers } = body;

        // Ensure doctor exists for this user
        const doctor = await prisma.doctors.findUnique({
            where: { user_id: user.userId }
        });

        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const updatedDoctor = await tx.doctors.update({
                where: { doctor_id: doctor.doctor_id },
                data: {
                    doctor_name,
                    phone,
                    whatsapp_number, // Legacy support
                    status
                }
            });

            // Handle multiple whatsapp numbers
            if (Array.isArray(whatsapp_numbers)) {
                // Remove all existing
                await tx.doctor_whatsapp_numbers.deleteMany({
                    where: { doctor_id: doctor.doctor_id }
                });

                // Create new ones
                if (whatsapp_numbers.length > 0) {
                    await tx.doctor_whatsapp_numbers.createMany({
                        data: whatsapp_numbers.map((w: any) => ({
                            doctor_id: doctor.doctor_id,
                            whatsapp_number: w.whatsapp_number,
                            is_primary: w.is_primary || false
                        }))
                    });
                }
            }

            return updatedDoctor;
        });

        return NextResponse.json({ doctor: jsonSafe(result) });
    } catch (error) {
        console.error("Error updating doctor profile:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
