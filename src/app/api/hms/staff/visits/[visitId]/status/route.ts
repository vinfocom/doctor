export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest, getHmsStaffAssignedDoctorIds, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

type RouteContext = {
    params: Promise<{
        visitId: string;
    }>;
};

type VisitStatusRow = {
    visit_id: number;
    doctor_id: number;
    status: string;
};

type ReceptionAccess = {
    hospital: NonNullable<Awaited<ReturnType<typeof getHmsSessionFromRequest>>>["hospitalContext"];
    staffId: number;
    assignedDoctorIds: number[];
};

type StaffAction = "CANCEL";

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeAction(value: unknown): StaffAction | null {
    const action = String(value || "").trim().toUpperCase();
    return action === "CANCEL" ? action : null;
}

async function requireReceptionSession(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        return null;
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "reception_module"))) {
        return null;
    }

    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "REGISTRATION") {
        return null;
    }

    return {
        hospital: session.hospitalContext,
        staffId: staff.staffId,
        assignedDoctorIds: await getHmsStaffAssignedDoctorIds(session.hospitalContext, staff.staffId),
    } satisfies ReceptionAccess;
}

export async function PATCH(req: Request, context: RouteContext) {
    try {
        const access = await requireReceptionSession(req);
        if (!access) {
            return NextResponse.json({ error: "Reception access is required." }, { status: 403 });
        }
        const { hospital, assignedDoctorIds } = access;

        const { visitId: visitIdParam } = await context.params;
        const visitId = normalizeId(visitIdParam);
        if (!visitId) {
            return NextResponse.json({ error: "Valid visit id is required." }, { status: 400 });
        }

        const body = await req.json();
        const action = normalizeAction(body?.action);
        if (!action) {
            return NextResponse.json({ error: "Action must be CANCEL." }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRawUnsafe<VisitStatusRow[]>(
                `
                SELECT visit_id, doctor_id, status
                FROM visits
                WHERE visit_id = ?
                  AND hospital_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                LIMIT 1
                FOR UPDATE
                `,
                visitId,
                hospital.hospitalId,
                hospital.adminId,
                hospital.hospitalCode
            );

            const visit = rows[0];
            if (!visit) {
                return { status: 404 as const, body: { error: "Visit was not found for this hospital." } };
            }

            if (!assignedDoctorIds.includes(Number(visit.doctor_id))) {
                return { status: 403 as const, body: { error: "Visit doctor is not assigned to this staff account." } };
            }

            if (action === "CANCEL") {
                if (visit.status !== "WAITING") {
                    return { status: 409 as const, body: { error: "Only waiting visits can be cancelled by Reception." } };
                }

                await tx.$executeRawUnsafe(
                    `
                    UPDATE visits
                    SET status = 'CANCELLED',
                        cancelled_by_user_id = ?,
                        cancelled_at = CURRENT_TIMESTAMP
                    WHERE visit_id = ?
                    `,
                    hospital.userId,
                    visitId
                );

                return { status: 200 as const, body: { visit_id: visitId, status: "CANCELLED" } };
            }

            return { status: 403 as const, body: { error: "Reception cannot complete doctor visits." } };
        });

        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        console.error("Update HMS staff visit status error:", error);
        return NextResponse.json({ error: "Unable to update visit status." }, { status: 500 });
    }
}
