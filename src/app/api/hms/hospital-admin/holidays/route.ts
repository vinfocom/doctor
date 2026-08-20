export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";

type HolidayRow = {
    id: number;
    holiday_date: Date | string;
    description: string | null;
    created_at: Date | string | null;
};

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function normalizeDate(value: unknown) {
    const text = normalizeText(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    return Number.isNaN(new Date(`${text}T00:00:00+05:30`).getTime()) ? null : text;
}

function dateOnly(value: Date | string) {
    return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

function serializeHoliday(row: HolidayRow) {
    return {
        id: Number(row.id),
        holiday_date: dateOnly(row.holiday_date),
        description: row.description,
        created_at: row.created_at,
    };
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
    return session.hospitalContext;
}

export async function GET(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const rows = await prisma.$queryRawUnsafe<HolidayRow[]>(
            `
            SELECT id, holiday_date, description, created_at
            FROM hospital_holidays
            WHERE hospital_id = ?
            ORDER BY holiday_date DESC, id DESC
            LIMIT 200
            `,
            hospital.hospitalId
        );

        return NextResponse.json({ holidays: rows.map(serializeHoliday) });
    } catch (error) {
        console.error("Load HMS hospital holidays error:", error);
        return NextResponse.json({ error: "Unable to load holidays." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const body = await req.json();
        const holidayDate = normalizeDate(body?.holiday_date);
        const description = normalizeText(body?.description) || null;
        const fieldErrors: Record<string, string> = {};

        if (!holidayDate) fieldErrors.holiday_date = "Holiday date must use YYYY-MM-DD format.";
        if (description && description.length > 255) fieldErrors.description = "Description must be 255 characters or fewer.";

        if (Object.keys(fieldErrors).length > 0) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        await prisma.$executeRawUnsafe(
            `
            INSERT INTO hospital_holidays (hospital_id, holiday_date, description)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
                description = VALUES(description)
            `,
            hospital.hospitalId,
            holidayDate,
            description
        );

        const rows = await prisma.$queryRawUnsafe<HolidayRow[]>(
            `
            SELECT id, holiday_date, description, created_at
            FROM hospital_holidays
            WHERE hospital_id = ?
              AND holiday_date = ?
            LIMIT 1
            `,
            hospital.hospitalId,
            holidayDate
        );

        return NextResponse.json({ holiday: serializeHoliday(rows[0]) }, { status: 201 });
    } catch (error) {
        console.error("Save HMS hospital holiday error:", error);
        return NextResponse.json({ error: "Unable to save holiday." }, { status: 500 });
    }
}
