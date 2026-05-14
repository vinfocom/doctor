import { NextRequest, NextResponse } from "next/server";
import { validateLoginChallengeProof } from "@/lib/loginChallenge";
import { sanitizeFilename, uploadBufferToS3 } from "@/lib/s3";

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const challengeId = normalizeText(formData.get("challengeId"));
        const challengeVerificationToken = normalizeText(formData.get("challengeVerificationToken"));
        const uploadType = normalizeText(formData.get("uploadType")) === "profile_pic" ? "profile_pic" : "document";

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (!challengeId || !challengeVerificationToken) {
            return NextResponse.json(
                { error: "Verified calculation is required before uploading a document" },
                { status: 400 }
            );
        }

        const challengeResult = validateLoginChallengeProof(challengeId, challengeVerificationToken);
        if (!challengeResult.ok) {
            const message =
                challengeResult.reason === "expired"
                    ? "Calculation expired. Please generate a new one."
                    : "Please verify the calculation before uploading a document.";

            return NextResponse.json({ error: message }, { status: 400 });
        }

        const documentTypes = [
            "application/pdf",
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        ];
        const profilePicTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        ];
        const allowedTypes = uploadType === "profile_pic" ? profilePicTypes : documentTypes;
        if (!allowedTypes.includes(file.type)) {
            const allowedLabel = uploadType === "profile_pic" ? "JPG, PNG, WEBP" : "PDF, JPG, PNG, WEBP";
            return NextResponse.json(
                { error: `Invalid file type. Allowed: ${allowedLabel}` },
                { status: 400 }
            );
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: "File too large. Max size is 10 MB." }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fallbackName = uploadType === "profile_pic" ? "profile-picture" : "degree-document";
        const safeName = sanitizeFilename(file.name || fallbackName);
        const folder = uploadType === "profile_pic" ? "doctor_profile_pictures" : "doctor_documents";
        const key = `${folder}/signup_${Date.now()}_${safeName}`;
        const result = await uploadBufferToS3({
            key,
            buffer,
            contentType: file.type || "application/octet-stream",
        });

        return NextResponse.json({
            url: result.url,
            name: file.name || safeName,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
        });
    } catch (error) {
        console.error("Doctor signup upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
