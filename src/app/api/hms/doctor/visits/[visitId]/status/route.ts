export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

type RouteContext = {
    params: Promise<{
        visitId: string;
    }>;
};

type DoctorRow = {
    doctor_id: number;
};

type VisitStatusRow = {
    visit_id: number;
    status: string;
};

const FINALIZE_STATUSES = ["COMPLETED", "LAB"] as const;

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeStatus(value: unknown) {
    const status = String(value || "").trim().toUpperCase();
    if (status === "IN_CONSULT") return status;
    return FINALIZE_STATUSES.includes(status as (typeof FINALIZE_STATUSES)[number])
        ? status as (typeof FINALIZE_STATUSES)[number]
        : null;
}

async function requireDoctorContext(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "DOCTOR") {
        return null;
    }

    const doctors = await prisma.$queryRawUnsafe<DoctorRow[]>(
        `
        SELECT doctor_id
        FROM doctors
        WHERE user_id = ?
          AND admin_id = ?
        LIMIT 1
        `,
        session.hospitalContext.userId,
        session.hospitalContext.adminId
    );

    if (!doctors[0]) return null;

    return {
        ...session.hospitalContext,
        doctorId: Number(doctors[0].doctor_id),
    };
}

export async function PATCH(req: Request, context: RouteContext) {
    try {
        const doctorContext = await requireDoctorContext(req);
        if (!doctorContext) {
            return NextResponse.json({ error: "Doctor access is required." }, { status: 403 });
        }

        const { visitId: visitIdParam } = await context.params;
        const visitId = normalizeId(visitIdParam);
        if (!visitId) {
            return NextResponse.json({ error: "Valid visit id is required." }, { status: 400 });
        }

        const body = await req.json();
        const nextStatus = normalizeStatus(body?.status);
        if (!nextStatus) {
            return NextResponse.json({ error: "Status must be IN_CONSULT, COMPLETED, or LAB." }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRawUnsafe<VisitStatusRow[]>(
                `
                SELECT visit_id, status
                FROM visits
                WHERE visit_id = ?
                  AND hospital_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                  AND doctor_id = ?
                LIMIT 1
                FOR UPDATE
                `,
                visitId,
                doctorContext.hospitalId,
                doctorContext.adminId,
                doctorContext.hospitalCode,
                doctorContext.doctorId
            );

            const visit = rows[0];
            if (!visit) {
                return { status: 404 as const, body: { error: "Visit was not found in your queue." } };
            }

            if (nextStatus === "IN_CONSULT" && visit.status !== "WAITING" && visit.status !== "LAB") {
                return { status: 409 as const, body: { error: "Only waiting or lab visits can be moved into consult." } };
            }

            if (nextStatus !== "IN_CONSULT" && visit.status !== "IN_CONSULT") {
                return { status: 409 as const, body: { error: "Only in-consult visits can be finalized." } };
            }

            await tx.$executeRawUnsafe(
                `
                UPDATE visits
                SET status = ?,
                    started_at = CASE WHEN ? = 'IN_CONSULT' THEN COALESCE(started_at, CURRENT_TIMESTAMP) ELSE started_at END,
                    finalized_at = CASE WHEN ? = 'COMPLETED' THEN CURRENT_TIMESTAMP ELSE finalized_at END
                WHERE visit_id = ?
                  AND hospital_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                  AND doctor_id = ?
                `,
                nextStatus,
                nextStatus,
                nextStatus,
                visitId,
                doctorContext.hospitalId,
                doctorContext.adminId,
                doctorContext.hospitalCode,
                doctorContext.doctorId
            );

            return { status: 200 as const, body: { visit_id: visitId, status: nextStatus } };
        });

        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        console.error("Update HMS doctor visit status error:", error);
        return NextResponse.json({ error: "Unable to update visit status." }, { status: 500 });
    }
}
