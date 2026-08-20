export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { getHmsFeatureFlags } from "@/lib/hms-feature-flags";

type RouteContext = {
    params: Promise<{
        visitId: string;
    }>;
};

type DoctorRow = {
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
};

type VisitDetailRow = {
    visit_id: number;
    visit_number: string | null;
    daily_token_number: number | null;
    visit_date: Date | string;
    visit_type: string;
    status: string;
    fee_charged: string | number;
    payment_mode: string;
    payment_status: string;
    fee_waived_reason: string | null;
    created_at: Date | string | null;
    started_at: Date | string | null;
    finalized_at: Date | string | null;
    patient_id: number;
    patient_name: string | null;
    patient_uhid: string | null;
    patient_phone: string | null;
    age: number | null;
    gender: string | null;
    city: string | null;
    location: string | null;
    address: string | null;
    doctor_id: number;
    doctor_name: string | null;
    room_no: string | null;
};

type PrescriptionRow = {
    id: number;
    doctor_id: number;
    doctor_name: string | null;
    visit_date: Date | string;
    status: string;
    finalized_at: Date | string | null;
    referring_prescription_id: number | null;
};

type PrintEventRow = {
    event_id: bigint | number;
    print_type: string;
    start_offset_mm: string | number;
    rendered_height_mm: string | number | null;
    created_at: Date | string | null;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function dateOnly(value: Date | string | null | undefined) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

function toNumber(value: bigint | number | string | null | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

async function requireDoctorContext(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "DOCTOR") {
        return null;
    }

    const doctors = await prisma.$queryRawUnsafe<DoctorRow[]>(
        `
        SELECT d.doctor_id, d.doctor_name, hd.room_no
        FROM doctors d
        INNER JOIN hospital_doctors hd
          ON hd.doctor_id = d.doctor_id
        WHERE d.user_id = ?
          AND d.admin_id = ?
          AND hd.hospital_id = ?
        LIMIT 1
        `,
        session.hospitalContext.userId,
        session.hospitalContext.adminId,
        session.hospitalContext.hospitalId
    );

    if (!doctors[0]) return null;

    return {
        hospital: session.hospitalContext,
        doctor: {
            doctorId: Number(doctors[0].doctor_id),
            doctorName: doctors[0].doctor_name,
            roomNo: doctors[0].room_no,
        },
    };
}

export async function GET(req: Request, context: RouteContext) {
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

        const { hospital, doctor } = doctorContext;
        const visits = await prisma.$queryRawUnsafe<VisitDetailRow[]>(
            `
            SELECT
                v.visit_id,
                v.visit_number,
                v.daily_token_number,
                v.visit_date,
                v.visit_type,
                v.status,
                v.fee_charged,
                v.payment_mode,
                v.payment_status,
                v.fee_waived_reason,
                v.created_at,
                v.started_at,
                v.finalized_at,
                p.patient_id,
                p.full_name AS patient_name,
                p.uhid AS patient_uhid,
                p.phone AS patient_phone,
                p.age,
                p.gender,
                p.city,
                p.location,
                p.address,
                d.doctor_id,
                d.doctor_name,
                hd.room_no
            FROM visits v
            INNER JOIN patients p
              ON p.patient_id = v.patient_id
             AND p.admin_id = ?
             AND p.hospital_group_code = ?
            INNER JOIN doctors d
              ON d.doctor_id = v.doctor_id
             AND d.admin_id = ?
            INNER JOIN hospital_doctors hd
              ON hd.hospital_id = v.hospital_id
             AND hd.doctor_id = v.doctor_id
            WHERE v.visit_id = ?
              AND v.hospital_id = ?
              AND v.admin_id = ?
              AND v.hospital_group_code = ?
              AND v.doctor_id = ?
            LIMIT 1
            `,
            hospital.adminId,
            hospital.hospitalCode,
            hospital.adminId,
            visitId,
            hospital.hospitalId,
            hospital.adminId,
            hospital.hospitalCode,
            doctor.doctorId
        );
        const visit = visits[0];

        if (!visit) {
            return NextResponse.json({ error: "Visit was not found in your HMS queue." }, { status: 404 });
        }

        const [prescriptions, printEvents, featureFlags] = await Promise.all([
            prisma.$queryRawUnsafe<PrescriptionRow[]>(
                `
                SELECT
                    p.id,
                    p.doctor_id,
                    d.doctor_name,
                    p.visit_date,
                    p.status,
                    p.finalized_at,
                    p.referring_prescription_id
                FROM prescriptions p
                INNER JOIN doctors d
                  ON d.doctor_id = p.doctor_id
                WHERE p.patient_id = ?
                  AND p.is_deleted = 0
                  AND d.admin_id = ?
                ORDER BY p.visit_date DESC, p.id DESC
                LIMIT 20
                `,
                visit.patient_id,
                hospital.adminId
            ),
            prisma.$queryRawUnsafe<PrintEventRow[]>(
                `
                SELECT event_id, print_type, start_offset_mm, rendered_height_mm, created_at
                FROM visit_print_events
                WHERE visit_id = ?
                ORDER BY event_id DESC
                LIMIT 20
                `,
                visit.visit_id
            ),
            getHmsFeatureFlags(hospital.hospitalId),
        ]);

        return NextResponse.json({
            featureFlags: {
                shared_paper_print_mode: featureFlags.shared_paper_print_mode,
                referral_followup_waivers: featureFlags.referral_followup_waivers,
                emr_module: featureFlags.emr_module,
            },
            visit: {
                visit_id: Number(visit.visit_id),
                visit_number: visit.visit_number,
                daily_token_number: visit.daily_token_number === null || visit.daily_token_number === undefined ? null : Number(visit.daily_token_number),
                visit_date: dateOnly(visit.visit_date),
                visit_type: visit.visit_type,
                status: visit.status,
                fee_charged: Number(visit.fee_charged),
                payment_mode: visit.payment_mode,
                payment_status: visit.payment_status,
                fee_waived_reason: visit.fee_waived_reason,
                created_at: visit.created_at,
                started_at: visit.started_at,
                finalized_at: visit.finalized_at,
                patient: {
                    patient_id: Number(visit.patient_id),
                    full_name: visit.patient_name,
                    uhid: visit.patient_uhid,
                    phone: visit.patient_phone,
                    age: visit.age,
                    gender: visit.gender,
                    city: visit.city,
                    location: visit.location,
                    address: visit.address,
                },
                doctor: {
                    doctor_id: Number(visit.doctor_id),
                    doctor_name: visit.doctor_name,
                    room_no: visit.room_no,
                },
            },
            prescriptions: prescriptions.map((prescription) => ({
                id: Number(prescription.id),
                doctor_id: Number(prescription.doctor_id),
                doctor_name: prescription.doctor_name,
                visit_date: dateOnly(prescription.visit_date),
                status: prescription.status,
                finalized_at: prescription.finalized_at,
                referring_prescription_id: prescription.referring_prescription_id,
            })),
            printEvents: printEvents.map((event) => ({
                event_id: toNumber(event.event_id),
                print_type: event.print_type,
                start_offset_mm: Number(event.start_offset_mm),
                rendered_height_mm: event.rendered_height_mm === null ? null : Number(event.rendered_height_mm),
                created_at: event.created_at,
            })),
        });
    } catch (error) {
        console.error("Load HMS doctor visit detail error:", error);
        return NextResponse.json({ error: "Unable to load visit details." }, { status: 500 });
    }
}
