export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

type RouteContext = {
    params: Promise<{
        prescriptionId: string;
    }>;
};

type DoctorRow = {
    doctor_id: number;
};

type PrescriptionScopeRow = {
    id: number;
    doctor_id: number;
    patient_id: number;
    referring_prescription_id: number | null;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
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

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "referral_followup_waivers"))) {
        return null;
    }

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

        const { prescriptionId: prescriptionIdParam } = await context.params;
        const prescriptionId = normalizeId(prescriptionIdParam);
        if (!prescriptionId) {
            return NextResponse.json({ error: "Valid prescription id is required." }, { status: 400 });
        }

        const body = await req.json();
        const rawReferringPrescriptionId = body?.referring_prescription_id;
        const referringPrescriptionId = rawReferringPrescriptionId === null ? null : normalizeId(rawReferringPrescriptionId);

        if (rawReferringPrescriptionId !== null && !referringPrescriptionId) {
            return NextResponse.json({ error: "Referring prescription id must be valid or null." }, { status: 400 });
        }

        if (referringPrescriptionId === prescriptionId) {
            return NextResponse.json({ error: "A prescription cannot refer to itself." }, { status: 400 });
        }

        const result = await prisma.$transaction(async (tx) => {
            const currentRows = await tx.$queryRawUnsafe<PrescriptionScopeRow[]>(
                `
                SELECT p.id, p.doctor_id, p.patient_id, p.referring_prescription_id
                FROM prescriptions p
                INNER JOIN doctors d
                  ON d.doctor_id = p.doctor_id
                 AND d.admin_id = ?
                INNER JOIN patients pt
                  ON pt.patient_id = p.patient_id
                 AND pt.admin_id = ?
                 AND pt.hospital_group_code = ?
                WHERE p.id = ?
                  AND p.doctor_id = ?
                  AND p.is_deleted = 0
                LIMIT 1
                FOR UPDATE
                `,
                doctorContext.adminId,
                doctorContext.adminId,
                doctorContext.hospitalCode,
                prescriptionId,
                doctorContext.doctorId
            );

            const current = currentRows[0];
            if (!current) {
                return { status: 404 as const, body: { error: "Prescription was not found in your HMS hospital scope." } };
            }

            if (referringPrescriptionId) {
                const referringRows = await tx.$queryRawUnsafe<PrescriptionScopeRow[]>(
                    `
                    SELECT p.id, p.doctor_id, p.patient_id, p.referring_prescription_id
                    FROM prescriptions p
                    INNER JOIN doctors d
                      ON d.doctor_id = p.doctor_id
                     AND d.admin_id = ?
                    INNER JOIN patients pt
                      ON pt.patient_id = p.patient_id
                     AND pt.admin_id = ?
                     AND pt.hospital_group_code = ?
                    WHERE p.id = ?
                      AND p.patient_id = ?
                      AND p.status = 'final'
                      AND p.is_deleted = 0
                    LIMIT 1
                    `,
                    doctorContext.adminId,
                    doctorContext.adminId,
                    doctorContext.hospitalCode,
                    referringPrescriptionId,
                    current.patient_id
                );

                if (!referringRows[0]) {
                    return { status: 400 as const, body: { error: "Referring prescription must be a final prescription for the same HMS patient and hospital." } };
                }
            }

            await tx.$executeRawUnsafe(
                `
                UPDATE prescriptions
                SET referring_prescription_id = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                referringPrescriptionId,
                prescriptionId
            );

            return {
                status: 200 as const,
                body: {
                    prescription: {
                        id: prescriptionId,
                        referring_prescription_id: referringPrescriptionId,
                    },
                },
            };
        });

        return NextResponse.json(result.body, { status: result.status });
    } catch (error) {
        console.error("Update HMS prescription referral error:", error);
        return NextResponse.json({ error: "Unable to update prescription referral." }, { status: 500 });
    }
}
