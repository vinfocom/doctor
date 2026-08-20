export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest, getHmsStaffAssignedDoctorIds, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

type RouteContext = {
    params: Promise<{
        registrationId: string;
    }>;
};

type ScopedTokenRow = {
    registration_id: number;
    patient_id: number | null;
    visit_id: number | null;
    doctor_id: number | null;
};

type ScopedPatientRow = {
    patient_id: number;
};

type ScopedVisitRow = {
    visit_id: number;
    patient_id: number;
    doctor_id: number;
};

type ReceptionAccess = {
    hospital: NonNullable<Awaited<ReturnType<typeof getHmsSessionFromRequest>>>["hospitalContext"];
    staffId: number;
    assignedDoctorIds: number[];
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
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

        const { registrationId: registrationIdParam } = await context.params;
        const registrationId = normalizeId(registrationIdParam);
        if (!registrationId) {
            return NextResponse.json({ error: "Valid temp token id is required." }, { status: 400 });
        }

        const body = await req.json();
        const patientId = normalizeId(body?.patient_id);
        const visitId = normalizeId(body?.visit_id);

        const fieldErrors: Record<string, string> = {};
        if (!patientId) fieldErrors.patient_id = "Valid patient id is required.";
        if (!visitId) fieldErrors.visit_id = "Valid visit id is required.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const tokenRows = await tx.$queryRawUnsafe<ScopedTokenRow[]>(
                `
                SELECT registration_id, patient_id, visit_id, doctor_id
                FROM hospital_registrations
                WHERE registration_id = ?
                  AND hospital_group_code = ?
                  AND admin_id = ?
                LIMIT 1
                FOR UPDATE
                `,
                registrationId,
                hospital.hospitalCode,
                hospital.adminId
            );

            const token = tokenRows[0];
            if (!token) {
                return { status: 404 as const, body: { error: "Temp token was not found for this hospital." } };
            }

            if (token.doctor_id !== null && !assignedDoctorIds.includes(Number(token.doctor_id))) {
                return { status: 403 as const, body: { error: "Temp token doctor is not assigned to this staff account." } };
            }

            const patientRows = await tx.$queryRawUnsafe<ScopedPatientRow[]>(
                `
                SELECT patient_id
                FROM patients
                WHERE patient_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                LIMIT 1
                `,
                patientId,
                hospital.adminId,
                hospital.hospitalCode
            );

            if (!patientRows[0]) {
                return { status: 400 as const, body: { error: "Patient does not belong to this hospital.", fieldErrors: { patient_id: "Patient does not belong to this hospital." } } };
            }

            const visitRows = await tx.$queryRawUnsafe<ScopedVisitRow[]>(
                `
                SELECT visit_id, patient_id, doctor_id
                FROM visits
                WHERE visit_id = ?
                  AND hospital_id = ?
                  AND admin_id = ?
                  AND hospital_group_code = ?
                LIMIT 1
                `,
                visitId,
                hospital.hospitalId,
                hospital.adminId,
                hospital.hospitalCode
            );

            const visit = visitRows[0];
            if (!visit) {
                return { status: 400 as const, body: { error: "Visit does not belong to this hospital.", fieldErrors: { visit_id: "Visit does not belong to this hospital." } } };
            }

            if (Number(visit.patient_id) !== patientId) {
                return { status: 400 as const, body: { error: "Visit is linked to a different patient.", fieldErrors: { visit_id: "Visit must belong to the selected patient." } } };
            }

            if (!assignedDoctorIds.includes(Number(visit.doctor_id))) {
                return { status: 403 as const, body: { error: "Visit doctor is not assigned to this staff account.", fieldErrors: { visit_id: "Select a visit for an assigned doctor." } } };
            }

            await tx.$executeRawUnsafe(
                `
                UPDATE hospital_registrations
                SET patient_id = ?,
                    visit_id = ?,
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_by_user_id = ?
                WHERE registration_id = ?
                  AND hospital_group_code = ?
                  AND admin_id = ?
                `,
                patientId,
                visitId,
                hospital.userId,
                registrationId,
                hospital.hospitalCode,
                hospital.adminId
            );

            return {
                status: 200 as const,
                body: {
                    tempToken: {
                        registration_id: registrationId,
                        patient_id: patientId,
                        visit_id: visitId,
                    },
                },
            };
        });

        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        console.error("Resolve HMS temp token error:", error);
        return NextResponse.json({ error: "Unable to resolve temp token." }, { status: 500 });
    }
}
