export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

const QR_SERVICE_BASE_URL = "https://daptoservices.vinfocom.co.in/qr/hospital/registration";

function extensionForContentType(contentType: string | null) {
    const normalized = String(contentType || "").toLowerCase();
    if (normalized.includes("svg")) return "svg";
    if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
    if (normalized.includes("webp")) return "webp";
    if (normalized.includes("pdf")) return "pdf";
    return "png";
}

export async function GET(req: Request) {
    try {
        const session = await getHmsSessionFromRequest(req);
        if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
            return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
        }

        const enabled = await isHmsFeatureEnabled(session.hospitalContext, "qr_temp_token_enabled");
        if (!enabled) {
            return NextResponse.json({ error: "Pre-registration QR is not enabled for this hospital." }, { status: 403 });
        }

        const downloadUrl = `${QR_SERVICE_BASE_URL}/generate/download?code=${encodeURIComponent(session.hospitalContext.hospitalCode)}`;
        const response = await fetch(downloadUrl, { cache: "no-store" });
        if (!response.ok || !response.body) {
            return NextResponse.json({ error: "Unable to download pre-registration QR." }, { status: 502 });
        }

        const contentType = response.headers.get("content-type") || "application/octet-stream";
        const fallbackFilename = `pre-registration-qr.${extensionForContentType(contentType)}`;

        return new NextResponse(response.body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="${fallbackFilename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        console.error("Download HMS pre-registration QR error:", error);
        return NextResponse.json({ error: "Unable to download pre-registration QR." }, { status: 500 });
    }
}
