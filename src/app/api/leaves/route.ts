export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

async function getDoctor(req: Request) {
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;
    if (!token) {
        const h = req.headers.get("Authorization");
        if (h?.startsWith("Bearer ")) token = h.split(" ")[1];
    }
    if (!token) return null;
    const session = await verifyToken(token);
    if (!session || session.role !== "DOCTOR") return null;
    return prisma.doctors.findFirst({ where: { user_id: session.userId } });
}

// GET — list leaves (optionally filter by year/month)
export async function GET(req: Request) {
    try {
        const doctor = await getDoctor(req);
        if (!doctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const year = searchParams.get("year");
        const month = searchParams.get("month");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const where: any = { doctor_id: doctor.doctor_id };
        if (year && month) {
            const y = parseInt(year), m = parseInt(month);
            where.leave_date = {
                gte: new Date(Date.UTC(y, m - 1, 1)),
                lt: new Date(Date.UTC(y, m, 1)),
            };
        }

        const leaves = await prisma.doctor_leaves.findMany({
            where,
            orderBy: { leave_date: "asc" },
            select: { leave_id: true, leave_date: true, reason: true },
        });

        const result = leaves.map(l => ({
            leave_id: l.leave_id,
            date: new Date(l.leave_date).toISOString().slice(0, 10),
            reason: l.reason || "",
        }));

        return NextResponse.json({ leaves: result });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST — add a leave day
export async function POST(req: Request) {
    try {
        const doctor = await getDoctor(req);
        if (!doctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();
        const dateStr = String(body?.date || "").slice(0, 10);
        if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            return NextResponse.json({ error: "Invalid date (YYYY-MM-DD required)" }, { status: 400 });
        }

        const leaveDate = new Date(`${dateStr}T00:00:00.000Z`);

        // Upsert — avoid duplicate for same doctor + date
        const existing = await prisma.doctor_leaves.findFirst({
            where: { doctor_id: doctor.doctor_id, leave_date: leaveDate },
        });
        if (existing) {
            return NextResponse.json({ error: "Leave already marked for this date" }, { status: 409 });
        }

        const leave = await prisma.doctor_leaves.create({
            data: {
                doctor_id: doctor.doctor_id,
                admin_id: doctor.admin_id,
                leave_date: leaveDate,
                reason: body?.reason ? String(body.reason).slice(0, 255) : null,
            },
        });

        return NextResponse.json({
            leave_id: leave.leave_id,
            date: new Date(leave.leave_date).toISOString().slice(0, 10),
            reason: leave.reason || "",
        }, { status: 201 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE — remove a leave by leave_id
export async function DELETE(req: Request) {
    try {
        const doctor = await getDoctor(req);
        if (!doctor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const leaveId = parseInt(searchParams.get("leaveId") || "0");
        if (!leaveId) return NextResponse.json({ error: "leaveId required" }, { status: 400 });

        // Verify ownership
        const existing = await prisma.doctor_leaves.findFirst({
            where: { leave_id: leaveId, doctor_id: doctor.doctor_id },
        });
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

        await prisma.doctor_leaves.delete({ where: { leave_id: leaveId } });

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
