export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { deactivateHmsPrintLayout, listHmsPrintLayouts } from "@/lib/hms-print-layout-service";

type RouteContext = {
    params: Promise<{ layoutId: string }>;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") return null;
    return session.hospitalContext;
}

export async function DELETE(req: Request, context: RouteContext) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const { layoutId: layoutIdParam } = await context.params;
        const layoutId = normalizeId(layoutIdParam);
        if (!layoutId) {
            return NextResponse.json({ error: "Valid layout id is required." }, { status: 400 });
        }

        const deactivated = await deactivateHmsPrintLayout({
            hospitalId: hospital.hospitalId,
            layoutId,
            userId: hospital.userId,
        });
        if (!deactivated) {
            return NextResponse.json({ error: "Layout was not found." }, { status: 404 });
        }

        const layouts = await listHmsPrintLayouts(hospital.hospitalId);
        return NextResponse.json({ layouts });
    } catch (error) {
        console.error("Deactivate HMS EMR layout error:", error);
        return NextResponse.json({ error: "Unable to deactivate layout." }, { status: 500 });
    }
}
