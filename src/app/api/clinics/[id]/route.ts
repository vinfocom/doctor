import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
        const { id } = await params;
        const clinicId = parseInt(id);
        const { clinic_name, location, phone } = await req.json();

        // Verify clinic exists
        const existingClinic = await prisma.clinics.findUnique({
            where: { clinic_id: clinicId },
        });

        if (!existingClinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        const updatedClinic = await prisma.clinics.update({
            where: { clinic_id: clinicId },
            data: {
                clinic_name,
                location,
                phone,
            },
        });

        return NextResponse.json({ clinic: updatedClinic });
    } catch (error) {
        console.error("Error updating clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
        const { id } = await params;
        const clinicId = parseInt(id);

        // Verify clinic exists
        const existingClinic = await prisma.clinics.findUnique({
            where: { clinic_id: clinicId },
        });

        if (!existingClinic) {
            return NextResponse.json({ error: "Clinic not found" }, { status: 404 });
        }

        await prisma.clinics.delete({
            where: { clinic_id: clinicId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting clinic:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
