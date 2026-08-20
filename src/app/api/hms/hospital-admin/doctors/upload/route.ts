import { NextRequest, NextResponse } from "next/server";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { sanitizeFilename, uploadBufferToS3 } from "@/lib/s3";

export const dynamic = "force-dynamic";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getHmsSessionFromRequest(req);
  if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
    return NextResponse.json({ error: "Hospital Admin access is required." }, { status: 403 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Choose a profile photo to upload." }, { status: 400 });
    }
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Upload JPG, PNG, or WEBP image." }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Profile photo must be 5 MB or smaller." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeName = sanitizeFilename(file.name || "doctor-profile");
    const key = `hospital_doctor_profile_pics/${session.hospitalContext.hospitalId}/${Date.now()}_${safeName}`;
    const result = await uploadBufferToS3({
      key,
      buffer,
      contentType: file.type,
    });

    return NextResponse.json({ url: result.url }, { status: 200 });
  } catch (error) {
    console.error("HMS doctor profile upload error:", error);
    return NextResponse.json({ error: "Unable to upload profile photo." }, { status: 500 });
  }
}
