import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
    // Auth check – must be a DOCTOR
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;

    if (!token) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user || user.role !== "DOCTOR") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const type = (formData.get("type") as string) || "document"; // profile_pic | barcode | document

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // Allowed types
        const allowedTypes = [
            "application/pdf",
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
        ];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json(
                { error: "Invalid file type. Allowed: PDF, JPG, PNG, WEBP" },
                { status: 400 }
            );
        }

        // Max 10 MB
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: "File too large. Max size is 10 MB." }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Cloudinary folder based on type
        const folderMap: Record<string, string> = {
            profile_pic: "doctor_profile_pics",
            barcode: "doctor_barcodes",
            document: "doctor_documents",
        };
        const folder = folderMap[type] || "doctor_documents";

        const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: "auto",
                },
                (error, result) => {
                    if (error || !result) reject(error || new Error("Upload failed"));
                    else resolve(result);
                }
            );
            stream.end(buffer);
        });

        return NextResponse.json({ url: result.secure_url });
    } catch (error) {
        console.error("Doctor upload error:", error);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
