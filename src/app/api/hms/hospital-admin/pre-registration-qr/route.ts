export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";

const QR_SERVICE_BASE_URL = "https://daptoservices.vinfocom.co.in/qr/hospital/registration";

type GenerateQrResponse = {
    preview_data_url?: string;
    download_path?: string;
    error?: string;
};

async function requireHospitalAdminQrAccess(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        return null;
    }

    const enabled = await isHmsFeatureEnabled(session.hospitalContext, "qr_temp_token_enabled");
    if (!enabled) return null;

    return session.hospitalContext;
}

export async function POST(req: Request) {
    try {
        const hospital = await requireHospitalAdminQrAccess(req);
        if (!hospital) {
            return NextResponse.json({ error: "Pre-registration QR is not enabled for this hospital." }, { status: 403 });
        }

        const response = await fetch(`${QR_SERVICE_BASE_URL}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: hospital.hospitalCode }),
            cache: "no-store",
        });
        const data = await response.json().catch(() => ({} as GenerateQrResponse));

        if (!response.ok) {
            return NextResponse.json(
                { error: data.error || "Unable to generate pre-registration QR." },
                { status: response.status }
            );
        }

        return NextResponse.json({
            preview_data_url: data.preview_data_url || "",
            download_path: data.download_path || "",
        });
    } catch (error) {
        console.error("Generate HMS pre-registration QR error:", error);
        return NextResponse.json({ error: "Unable to generate pre-registration QR." }, { status: 500 });
    }
}
