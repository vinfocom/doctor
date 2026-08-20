export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import {
    createHmsPrintLayout,
    listHmsPrintLayoutDoctors,
    listHmsPrintLayouts,
    normalizeHmsPrintLayoutPayload,
} from "@/lib/hms-print-layout-service";

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

        const [layouts, doctors] = await Promise.all([
            listHmsPrintLayouts(hospital.hospitalId),
            listHmsPrintLayoutDoctors(hospital.hospitalId),
        ]);

        return NextResponse.json({ layouts, doctors, hospital });
    } catch (error) {
        console.error("List HMS EMR layouts error:", error);
        return NextResponse.json({ error: "Unable to load EMR layouts." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const body = await req.json();
        const { normalized, fieldErrors } = normalizeHmsPrintLayoutPayload(body);

        if (Object.keys(fieldErrors).length > 0 || !normalized.targetType) {
            return NextResponse.json({ error: "Please correct the highlighted fields.", fieldErrors }, { status: 400 });
        }

        await createHmsPrintLayout({
            hospitalId: hospital.hospitalId,
            userId: hospital.userId,
            layoutName: normalized.layoutName,
            description: normalized.description,
            targetType: normalized.targetType,
            doctorIds: normalized.doctorIds,
            headerConfig: normalized.headerConfig,
            layoutConfig: normalized.layoutConfig,
        });

        const layouts = await listHmsPrintLayouts(hospital.hospitalId);
        return NextResponse.json({ layouts }, { status: 201 });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to save EMR layout.";
        const status = message.includes("already") || message.includes("selected doctors") ? 409 : 500;
        console.error("Create HMS EMR layout error:", error);
        return NextResponse.json({ error: message }, { status });
    }
}
