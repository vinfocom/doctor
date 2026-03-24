import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
        const { id } = await params;
        const clinicId = parseInt(id);
        const { clinic_name, location, phone, status, schedule, barcode_url, qr_storage_url } = await req.json();

        const existingClinic = await prisma.clinics.findUnique({
            where: { clinic_id: clinicId },
        });

        if (!existingClinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        const updatedClinic = await prisma.$transaction(async (tx) => {
            const clinic = await tx.clinics.update({
                where: { clinic_id: clinicId },
                data: {
                    ...(clinic_name !== undefined && { clinic_name }),
                    ...(location !== undefined && { location }),
                    ...(phone !== undefined && { phone }),
                    ...(status !== undefined && { status }),
                    ...(barcode_url !== undefined && { barcode_url: barcode_url || null }),
                },
            });

            if (qr_storage_url !== undefined) {
                await tx.$executeRaw`
                    UPDATE clinics
                    SET qr_storage_url = ${qr_storage_url || null}
                    WHERE clinic_id = ${clinicId}
                `;
            }

            // If new schedule entries are provided, APPEND them (individual edits/deletes
            // are handled via /api/schedule endpoints directly, not here)
            if (schedule && Array.isArray(schedule) && schedule.length > 0) {
                const scheduleData = schedule.map((s: any) => ({
                    doctor_id: existingClinic.doctor_id,
                    clinic_id: clinicId,
                    admin_id: existingClinic.admin_id,
                    day_of_week: Number(s.day_of_week),
                    start_time: s.start_time,
                    end_time: s.end_time,
                    slot_duration: Number(s.slot_duration),
                    effective_from: new Date(),
                    effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
                }));

                await tx.doctor_clinic_schedule.createMany({
                    data: scheduleData
                });
            }

            return clinic;
        });

        return NextResponse.json({ clinic: updatedClinic });
    } catch (error) {
        console.error("Error updating clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
        const { id } = await params;
        const clinicId = parseInt(id);

        const existingClinic = await prisma.clinics.findUnique({
            where: { clinic_id: clinicId },
        });

        if (!existingClinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        const doctorId = existingClinic.doctor_id;

        await prisma.$transaction(async (tx) => {
            await tx.clinics.delete({
                where: { clinic_id: clinicId },
            });

            // Sync num_clinics on doctor after deletion
            if (doctorId) {
                const count = await tx.clinics.count({ where: { doctor_id: doctorId } });
                await tx.doctors.update({
                    where: { doctor_id: doctorId },
                    data: { num_clinics: count }
                });
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
