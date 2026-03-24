import { NextResponse } from "next/server";
import { getQrFileExtension, getQrPreviewDataUrl, parseQrDataUrl } from "@/lib/qr";
import { sanitizeFilename, uploadBufferToS3 } from "@/lib/s3";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const doctorId = Number(body?.doctor_id);
        const clinicId = Number(body?.clinic_id);

        if (!doctorId || !clinicId) {
            return NextResponse.json({ error: "doctor_id and clinic_id are required" }, { status: 400 });
        }

        const dataUrl = await getQrPreviewDataUrl({
            doctor_id: doctorId,
            clinic_id: clinicId,
        });

        const { contentType, buffer } = parseQrDataUrl(dataUrl);
        const extension = getQrFileExtension(contentType);
        const filename = sanitizeFilename(`doctor_${doctorId}_clinic_${clinicId}.${extension}`);
        const key = `clinic_qr/${doctorId}/${clinicId}/${Date.now()}_${filename}`;
        const uploadResult = await uploadBufferToS3({
            key,
            buffer,
            contentType,
        });

        return NextResponse.json(
            { dataUrl, qrStorageUrl: uploadResult.url },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (error) {
        console.error("QR preview proxy failed:", error);
        return NextResponse.json({ error: "Failed to generate QR preview" }, { status: 502 });
    }
}
