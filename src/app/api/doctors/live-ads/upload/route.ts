import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
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

export async function POST(req: NextRequest) {
    const session = await getSession();

    if (!session || session.role !== "DOCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const adType = String(formData.get("adType") || "LOGO").toUpperCase();

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
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
        const safeName = sanitizeFilename(file.name || (adType === "VIDEO" ? "queue-video.mp4" : "queue-logo"));
        const folder = adType === "VIDEO" ? "live_queue_ads/videos" : "live_queue_ads/logos";
        const key = `${folder}/${Date.now()}_${safeName}`;

        const result = await uploadBufferToS3({
            key,
            buffer,
            contentType: file.type || "application/octet-stream",
        });

        return NextResponse.json({
            url: result.url,
            mimeType: file.type,
        });
    } catch (error) {
        console.error("Live ad upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
