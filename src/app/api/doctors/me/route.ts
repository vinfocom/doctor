
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function GET(req: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

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
                            select: { email: true } // maybe?
                        }
                    }
                }
            }
        });

        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        return NextResponse.json({ doctor });
    } catch (error) {
        console.error("Error fetching doctor profile:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { doctor_name, phone, whatsapp_number, status } = body;

        // Ensure doctor exists for this user
        const doctor = await prisma.doctors.findUnique({
            where: { user_id: user.userId }
        });

        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        const updatedDoctor = await prisma.doctors.update({
            where: { doctor_id: doctor.doctor_id },
            data: {
                doctor_name,
                phone,
                whatsapp_number,
                status // Doctor can update their own status? Maybe restrict this if needed.
            }
        });

        return NextResponse.json({ doctor: updatedDoctor });
    } catch (error) {
        console.error("Error updating doctor profile:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
