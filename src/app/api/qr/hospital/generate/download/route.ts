import { NextResponse } from "next/server";
import { getHospitalQrDownloadUrl } from "@/lib/qr";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const hospitalCode = String(searchParams.get("hospital_code") || "").trim();
    const hospitalName = String(searchParams.get("hospital_name") || "").trim();

    if (!hospitalCode) {
        return NextResponse.json({ error: "hospital_code is required" }, { status: 400 });
    }

    return NextResponse.redirect(getHospitalQrDownloadUrl(hospitalCode, hospitalName || undefined), {
        headers: { "Cache-Control": "no-store" },
    });
}
