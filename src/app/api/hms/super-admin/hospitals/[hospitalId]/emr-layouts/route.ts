export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
    createHmsPrintLayout,
    listHmsPrintLayoutDoctors,
    listHmsPrintLayouts,
    normalizeHmsPrintLayoutPayload,
} from "@/lib/hms-print-layout-service";
import prisma from "@/lib/prisma";

type RouteContext = {
    params: Promise<{ hospitalId: string }>;
};

type HospitalRow = {
    hospital_id: number;
    code: string;
    name: string;
    admin_id: number;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireSuperAdminHospital(req: Request, hospitalIdParam: string) {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "SUPER_ADMIN") return null;

    const hospitalId = normalizeId(hospitalIdParam);
    if (!hospitalId) throw new Error("Valid hospital id is required.");

    const rows = await prisma.$queryRawUnsafe<HospitalRow[]>(
        `
        SELECT hospital_id, code, name, admin_id
        FROM hospitals
        WHERE hospital_id = ?
        LIMIT 1
        `,
        hospitalId
    );

    if (!rows[0]) throw new Error("Hospital was not found.");

    return {
        session,
        hospital: {
            hospitalId: Number(rows[0].hospital_id),
            hospitalCode: rows[0].code,
            hospitalName: rows[0].name,
            adminId: Number(rows[0].admin_id),
        },
    };
}

export async function GET(req: Request, context: RouteContext) {
    try {
        const { hospitalId } = await context.params;
        const scope = await requireSuperAdminHospital(req, hospitalId);
        if (!scope) {
            return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
        }

        const [layouts, doctors] = await Promise.all([
            listHmsPrintLayouts(scope.hospital.hospitalId),
            listHmsPrintLayoutDoctors(scope.hospital.hospitalId),
        ]);

        return NextResponse.json({ layouts, doctors, hospital: scope.hospital });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load EMR layouts.";
        const status = message.includes("not found") ? 404 : message.includes("hospital id") ? 400 : 500;
        console.error("List HMS Super Admin EMR layouts error:", error);
        return NextResponse.json({ error: message }, { status });
    }
}

export async function POST(req: Request, context: RouteContext) {
    try {
        const { hospitalId } = await context.params;
        const scope = await requireSuperAdminHospital(req, hospitalId);
        if (!scope) {
            return NextResponse.json({ error: "Super Admin access is required." }, { status: 403 });
        }

        const body = await req.json();
        const { normalized, fieldErrors } = normalizeHmsPrintLayoutPayload(body);
        if (Object.keys(fieldErrors).length > 0 || !normalized.targetType) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        await createHmsPrintLayout({
            hospitalId: scope.hospital.hospitalId,
            userId: scope.session.userId,
            layoutName: normalized.layoutName,
            description: normalized.description,
            targetType: normalized.targetType,
            doctorIds: normalized.doctorIds,
            headerConfig: normalized.headerConfig,
            layoutConfig: normalized.layoutConfig,
        });

        const layouts = await listHmsPrintLayouts(scope.hospital.hospitalId);
        return NextResponse.json({ layouts }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save EMR layout.";
        const status = message.includes("already") || message.includes("selected doctors") ? 409 : 500;
        console.error("Create HMS Super Admin EMR layout error:", error);
        return NextResponse.json({ error: message }, { status });
    }
}
