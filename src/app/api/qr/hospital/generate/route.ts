import { NextResponse } from "next/server";
import { getQrFileExtension, getHospitalQrPreviewDataUrl, parseQrDataUrl } from "@/lib/qr";
import { sanitizeFilename, uploadBufferToS3 } from "@/lib/s3";

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const hospitalCode = String(body?.hospital_code || "").trim();

        if (!hospitalCode) {
            return NextResponse.json({ error: "hospital_code is required" }, { status: 400 });
        }

        const dataUrl = await getHospitalQrPreviewDataUrl({
            hospital_code: hospitalCode,
        });

        const { contentType, buffer } = parseQrDataUrl(dataUrl);
        const extension = getQrFileExtension(contentType);
        const filename = sanitizeFilename(`hospital_${hospitalCode}.${extension}`);
        const key = `hospital_qr/${hospitalCode}/${Date.now()}_${filename}`;
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
        console.error("Hospital QR preview proxy failed:", error);
        return NextResponse.json({ error: "Failed to generate hospital QR preview" }, { status: 502 });
    }
}
