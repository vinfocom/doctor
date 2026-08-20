export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest, getHmsStaffProfile } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

const DEFAULT_REMAINING_SLIDE_SECONDS = 8;
const DEFAULT_DOCTOR_ROTATION_SECONDS = 40;

type AssignedDoctorRow = {
    doctor_id: number;
    doctor_name: string | null;
    education: string | null;
    specialization: string | null;
    room_no: string | null;
    status: string | null;
};

type VisitRow = {
    visit_id: number;
    doctor_id: number;
    daily_token_number: number | null;
    status: string;
    patient_id: number;
    patient_name: string | null;
};

type HospitalAdRow = {
    ad_id: number;
    position: string;
    type: string;
    asset_url: string;
    mime_type: string | null;
    title: string | null;
    sort_order: number;
    active_from: Date | string | null;
    active_to: Date | string | null;
};

type PolicyRow = {
    policies: unknown;
};

type QueueCard = {
    appointment_id: number;
    queue_number: number | null;
    patient_name: string;
    status: string;
    start_time_label: string;
};

function parseJsonObject(value: unknown): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === "object") return value as Record<string, unknown>;
    if (typeof value !== "string") return {};

    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
        return {};
    }
}

function parseSeconds(value: unknown, fallback: number, min: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

function getTodayDateInIst() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());

    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function getNowLabelInIst() {
    return new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
        timeZone: "Asia/Kolkata",
    }).format(new Date());
}

function formatDateLabel(dateYmd: string) {
    return new Intl.DateTimeFormat("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Kolkata",
    }).format(new Date(`${dateYmd}T00:00:00+05:30`));
}

function normalizeDate(value: unknown) {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;

    const date = new Date(`${text}T00:00:00+05:30`);
    if (Number.isNaN(date.getTime())) return null;

    return text;
}

function formatPatientName(value: string | null) {
    return String(value || "").trim() || "Patient";
}

function serializeVisit(row: VisitRow): QueueCard {
    return {
        appointment_id: Number(row.visit_id),
        queue_number: row.daily_token_number === null || row.daily_token_number === undefined
            ? null
            : Number(row.daily_token_number),
        patient_name: formatPatientName(row.patient_name),
        status: row.status,
        start_time_label: "",
    };
}

function dateOnly(value: Date | string | null | undefined) {
    if (!value) return null;
    if (typeof value === "string") return value.slice(0, 10);
    return value.toISOString().slice(0, 10);
}

function serializeAd(row: HospitalAdRow, hospitalId: number) {
    return {
        ad_id: Number(row.ad_id),
        doctor_id: 0,
        clinic_id: hospitalId,
        position: row.position,
        type: row.type,
        asset_url: row.asset_url,
        mime_type: row.mime_type,
        title: row.title,
        is_active: true,
        sort_order: Number(row.sort_order || 0),
        active_from: dateOnly(row.active_from),
        active_to: dateOnly(row.active_to),
        created_at: null,
        updated_at: null,
    };
}

async function requireTvDisplaySession(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        return null;
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "tv_display_module"))) {
        return null;
    }

    const staff = await getHmsStaffProfile(session.hospitalContext);
    if (staff?.staffType !== "TV_DISPLAY") {
        return null;
    }

    return {
        hospital: session.hospitalContext,
        staff,
    };
}

export async function GET(req: Request) {
    try {
        const access = await requireTvDisplaySession(req);
        if (!access) {
            return NextResponse.json({ error: "TV Display access is required." }, { status: 403 });
        }

        const { hospital, staff } = access;
        const { searchParams } = new URL(req.url);
        const visitDate = normalizeDate(searchParams.get("date")) || getTodayDateInIst();
        const adsEnabled = await isHmsFeatureEnabled(hospital, "ads_module");

        const policyRows = await prisma.$queryRawUnsafe<PolicyRow[]>(
            `
            SELECT policies
            FROM hospital_policy_settings
            WHERE hospital_id = ?
            LIMIT 1
            `,
            hospital.hospitalId
        );
        const policies = parseJsonObject(policyRows[0]?.policies);
        const displaySettings = {
            remaining_slide_seconds: parseSeconds(
                policies.tv_remaining_slide_seconds,
                DEFAULT_REMAINING_SLIDE_SECONDS,
                2
            ),
            missed_slide_seconds: DEFAULT_REMAINING_SLIDE_SECONDS,
            doctor_rotation_seconds: parseSeconds(
                policies.tv_rotation_seconds,
                DEFAULT_DOCTOR_ROTATION_SECONDS,
                5
            ),
        };

        const doctors = await prisma.$queryRawUnsafe<AssignedDoctorRow[]>(
            `
            SELECT
                d.doctor_id,
                d.doctor_name,
                d.education,
                d.specialization,
                hd.room_no,
                d.status
            FROM hospital_staff_doctor_access hsda
            INNER JOIN hospital_staff hs
              ON hs.staff_id = hsda.staff_id
             AND hs.hospital_id = ?
             AND hs.staff_type = 'TV_DISPLAY'
             AND hs.status = 'ACTIVE'
            INNER JOIN hospital_doctors hd
              ON hd.hospital_id = hs.hospital_id
             AND hd.doctor_id = hsda.doctor_id
            INNER JOIN doctors d
              ON d.doctor_id = hsda.doctor_id
             AND d.admin_id = ?
            WHERE hsda.staff_id = ?
              AND d.status = 'ACTIVE'
            ORDER BY d.doctor_name ASC, d.doctor_id ASC
            `,
            hospital.hospitalId,
            hospital.adminId,
            staff.staffId
        );

        if (doctors.length === 0) {
            return NextResponse.json({
                hospital: {
                    hospital_id: hospital.hospitalId,
                    code: hospital.hospitalCode,
                    name: hospital.hospitalName,
                },
                display_settings: displaySettings,
                side_ads: [],
                slides: [],
            });
        }

        const doctorIds = doctors.map((doctor) => Number(doctor.doctor_id));
        const doctorPlaceholders = doctorIds.map(() => "?").join(", ");

        const [visits, ads] = await Promise.all([
            prisma.$queryRawUnsafe<VisitRow[]>(
                `
                SELECT
                    visit_id,
                    doctor_id,
                    daily_token_number,
                    status,
                    patient_id,
                    patient_name
                FROM (
                SELECT
                    v.visit_id,
                    v.doctor_id,
                    v.daily_token_number,
                    v.status,
                    p.patient_id,
                    p.full_name AS patient_name,
                    ROW_NUMBER() OVER (
                        PARTITION BY v.doctor_id, v.status
                        ORDER BY
                            COALESCE(v.daily_token_number, 2147483647) ASC,
                            v.visit_id ASC
                    ) AS queue_rank
                FROM visits v
                INNER JOIN patients p
                  ON p.patient_id = v.patient_id
                 AND p.admin_id = ?
                 AND p.hospital_group_code = ?
                WHERE v.hospital_id = ?
                  AND v.admin_id = ?
                  AND v.hospital_group_code = ?
                  AND v.visit_date = ?
                  AND v.doctor_id IN (${doctorPlaceholders})
                  AND v.status IN ('WAITING', 'IN_CONSULT')
                ) ranked_visits
                WHERE
                    (status = 'IN_CONSULT' AND queue_rank <= 1)
                    OR (status = 'WAITING' AND queue_rank <= 120)
                ORDER BY
                    doctor_id ASC,
                    FIELD(status, 'IN_CONSULT', 'WAITING'),
                    COALESCE(daily_token_number, 2147483647) ASC,
                    visit_id ASC
                `,
                hospital.adminId,
                hospital.hospitalCode,
                hospital.hospitalId,
                hospital.adminId,
                hospital.hospitalCode,
                visitDate,
                ...doctorIds
            ),
            adsEnabled
                ? prisma.$queryRawUnsafe<HospitalAdRow[]>(
                    `
                    SELECT
                        ad_id,
                        position,
                        type,
                        asset_url,
                        mime_type,
                        title,
                        sort_order,
                        active_from,
                        active_to
                    FROM hospital_wide_ads
                    WHERE hospital_id = ?
                      AND is_active = TRUE
                      AND (active_from IS NULL OR active_from <= ?)
                      AND (active_to IS NULL OR active_to >= ?)
                    ORDER BY position ASC, sort_order ASC, created_at ASC, ad_id ASC
                    `,
                    hospital.hospitalId,
                    visitDate,
                    visitDate
                )
                : Promise.resolve([] as HospitalAdRow[]),
        ]);

        const slides = doctors.map((doctor) => {
            const doctorVisits = visits
                .filter((visit) => Number(visit.doctor_id) === Number(doctor.doctor_id))
                .sort((left, right) => {
                    if (left.status !== right.status) {
                        return left.status === "IN_CONSULT" ? -1 : 1;
                    }
                    return Number(left.daily_token_number || 2147483647) - Number(right.daily_token_number || 2147483647)
                        || Number(left.visit_id) - Number(right.visit_id);
                });
            const current = doctorVisits.find((visit) => visit.status === "IN_CONSULT") || null;
            const waiting = doctorVisits.filter((visit) => visit.status === "WAITING");
            const next = waiting[0] || null;
            const remaining = waiting.slice(1);

            return {
                doctor_id: Number(doctor.doctor_id),
                clinic_id: hospital.hospitalId,
                doctor_name: doctor.doctor_name || "Doctor",
                doctor_education: doctor.room_no ? `Room ${doctor.room_no}` : "",
                doctor_specialization: doctor.specialization || "",
                clinic_name: hospital.hospitalName,
                room_no: doctor.room_no,
                selected_clinic_id: hospital.hospitalId,
                today_label: formatDateLabel(visitDate),
                now_label: getNowLabelInIst(),
                schedule_label: "",
                schedule_has_ended: false,
                current: current ? serializeVisit(current) : null,
                next: next ? serializeVisit(next) : null,
                missed: [],
                remaining: remaining.map(serializeVisit),
                total_today: doctorVisits.length,
            };
        });

        return NextResponse.json({
            hospital: {
                hospital_id: hospital.hospitalId,
                code: hospital.hospitalCode,
                name: hospital.hospitalName,
            },
            display_settings: displaySettings,
            side_ads: ads.map((ad) => serializeAd(ad, hospital.hospitalId)),
            slides,
        });
    } catch (error) {
        console.error("Load HMS TV display queue error:", error);
        return NextResponse.json({ error: "Unable to load TV display queue." }, { status: 500 });
    }
}
