export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { buildHmsReports, todayYmdInIst } from "@/lib/hms-reports";

export async function GET(req: Request) {
    try {
        const session = await getHmsSessionFromRequest(req);
        if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const url = new URL(req.url);
        const today = todayYmdInIst();
        const fromDate = url.searchParams.get("from_date") || today;
        const toDate = url.searchParams.get("to_date") || fromDate;

        const reports = await buildHmsReports({
            hospitalId: session.hospitalContext.hospitalId,
            fromDate,
            toDate,
        });

        return NextResponse.json({ reports }, { status: 200 });
    } catch (error) {
        console.error("Load HMS hospital reports error:", error);
        return NextResponse.json({ error: "Unable to load hospital reports." }, { status: 500 });
    }
}
