export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { updateHmsPrintEventHeight } from "@/lib/hms-print-events";

type RouteContext = {
    params: Promise<{
        eventId: string;
    }>;
};

function normalizeId(value: unknown) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeRenderedHeight(value: unknown) {
    const height = Number(value);
    if (!Number.isFinite(height) || height <= 0 || height > 297) return null;
    return Math.round(height * 100) / 100;
}

function normalizeFailedHeight(value: unknown) {
    return value === true ? 0 : null;
}

export async function PATCH(req: Request, context: RouteContext) {
    try {
        const session = await getHmsSessionFromRequest(req);
        if (!session || !["HOSPITAL_STAFF", "DOCTOR"].includes(session.hospitalContext.role)) {
            return NextResponse.json({ error: "HMS access is required." }, { status: 403 });
        }

        if (!(await isHmsFeatureEnabled(session.hospitalContext, "shared_paper_print_mode"))) {
            return NextResponse.json({ error: "HMS shared-paper print is disabled for this hospital." }, { status: 403 });
        }

        const { eventId: eventIdParam } = await context.params;
        const eventId = normalizeId(eventIdParam);
        if (!eventId) {
            return NextResponse.json({ error: "Valid print event id is required." }, { status: 400 });
        }

        const body = await req.json();
        const failedHeightMm = normalizeFailedHeight(body?.mark_failed);
        const renderedHeightMm = failedHeightMm ?? normalizeRenderedHeight(body?.rendered_height_mm);
        if (renderedHeightMm === null) {
            return NextResponse.json({ error: "Rendered height must be a positive millimetre value." }, { status: 400 });
        }

        const event = await updateHmsPrintEventHeight({
            session,
            eventId,
            renderedHeightMm,
        });

        if (!event) {
            return NextResponse.json({ error: "Print event was not found for this hospital." }, { status: 404 });
        }

        return NextResponse.json({ event });
    } catch (error) {
        console.error("Update HMS print event height error:", error);
        return NextResponse.json({ error: "Unable to update print height." }, { status: 500 });
    }
}
