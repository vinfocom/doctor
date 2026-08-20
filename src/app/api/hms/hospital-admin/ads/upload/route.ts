export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { sanitizeFilename, uploadBufferToS3 } from "@/lib/s3";

const MAX_LOGO_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
const LOGO_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/svg+xml",
];
const VIDEO_TYPES = ["video/mp4", "application/mp4", "video/x-m4v"];

function normalizeAdType(value: unknown) {
    const type = String(value || "LOGO").trim().toUpperCase();
    return type === "VIDEO" ? "VIDEO" : "LOGO";
}

async function requireHospitalAdmin(req: Request) {
    const session = await getHmsSessionFromRequest(req);
    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        return null;
    }

    if (!(await isHmsFeatureEnabled(session.hospitalContext, "ads_module"))) {
        return null;
    }

    return session.hospitalContext;
}

export async function POST(req: Request) {
    try {
        const hospital = await requireHospitalAdmin(req);
        if (!hospital) {
            return NextResponse.json({ error: "Hospital Admin ads access is required." }, { status: 403 });
        }

        const formData = await req.formData();
        const file = formData.get("file");
        const adType = normalizeAdType(formData.get("adType"));

        if (!(file instanceof File)) {
            return NextResponse.json({ error: "No file provided." }, { status: 400 });
        }

        const normalizedMimeType = String(file.type || "").toLowerCase();
        const hasMp4Extension = /\.mp4$/i.test(file.name || "");
        const isAllowedVideoType =
            VIDEO_TYPES.includes(normalizedMimeType) ||
            (hasMp4Extension &&
                (!normalizedMimeType || normalizedMimeType === "application/octet-stream"));
        const isAllowedLogoType = LOGO_TYPES.includes(normalizedMimeType);

        if ((adType === "VIDEO" && !isAllowedVideoType) || (adType !== "VIDEO" && !isAllowedLogoType)) {
            return NextResponse.json(
                {
                    error:
                        adType === "VIDEO"
                            ? "Invalid video type. Only MP4 is allowed."
                            : "Invalid logo type. Allowed: JPG, PNG, WEBP, SVG.",
                },
                { status: 400 }
            );
        }

        const maxSizeBytes = adType === "VIDEO" ? MAX_VIDEO_SIZE_BYTES : MAX_LOGO_SIZE_BYTES;
        if (file.size > maxSizeBytes) {
            return NextResponse.json(
                {
                    error:
                        adType === "VIDEO"
                            ? "Video too large. Max size is 50 MB."
                            : "Logo too large. Max size is 10 MB.",
                },
                { status: 400 }
            );
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fallbackName = adType === "VIDEO" ? "hospital-ad.mp4" : "hospital-logo";
        const safeName = sanitizeFilename(file.name || fallbackName);
        const folder = adType === "VIDEO"
            ? `hospital_ads/${hospital.hospitalId}/videos`
            : `hospital_ads/${hospital.hospitalId}/logos`;
        const key = `${folder}/${Date.now()}_${safeName}`;

        const result = await uploadBufferToS3({
            key,
            buffer,
            contentType: file.type || "application/octet-stream",
        });

        return NextResponse.json({
            url: result.url,
            storageKey: result.key,
            mimeType: file.type || null,
            originalFilename: file.name || null,
            fileSizeBytes: file.size,
        });
    } catch (error) {
        console.error("HMS hospital ad upload error:", error);
        return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    }
}
