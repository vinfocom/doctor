import { NextResponse } from "next/server";
import { getQrDownloadUrl } from "@/lib/qr";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const doctorId = Number(searchParams.get("doctor_id"));
    const clinicId = Number(searchParams.get("clinic_id"));

    if (!doctorId || !clinicId) {
        return NextResponse.json({ error: "doctor_id and clinic_id are required" }, { status: 400 });
    }

    return NextResponse.redirect(getQrDownloadUrl(doctorId, clinicId), {
        headers: { "Cache-Control": "no-store" },
    });
}
