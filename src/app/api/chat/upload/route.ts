import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { sanitizeFilename, uploadBufferToS3 } from "@/lib/s3";

const ALLOWED_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
]);

export async function POST(req: NextRequest) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || (session.role !== "DOCTOR" && session.role !== "PATIENT")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const patient_id = formData.get("patient_id");
        const doctor_id = formData.get("doctor_id");

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }
        if (!patient_id || !doctor_id) {
            return NextResponse.json({ error: "Missing patient_id or doctor_id" }, { status: 400 });
        }

        const patientIdNum = parseInt(String(patient_id), 10);
        let doctorIdNum = parseInt(String(doctor_id), 10);

        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { doctor_id: true },
            });
            if (!doctor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            doctorIdNum = doctor.doctor_id;
        } else {
            const sessionPatientId = session.patientId ?? session.userId;
            if (sessionPatientId !== patientIdNum) {
                return NextResponse.json({ error: "Forbidden" }, { status: 403 });
            }
            const link = await prisma.appointment.findFirst({
                where: { patient_id: patientIdNum, doctor_id: doctorIdNum },
                select: { appointment_id: true },
            });
            if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        if (!ALLOWED_TYPES.has(file.type)) {
            return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: "File too large. Max size is 10 MB." }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const safeName = sanitizeFilename(file.name || "attachment");
        const key = `chat_attachments/${patientIdNum}/${Date.now()}_${safeName}`;
        const result = await uploadBufferToS3({
            key,
            buffer,
            contentType: file.type || "application/octet-stream",
        });

        return NextResponse.json({
            url: result.url,
            name: file.name,
            mime: file.type,
            size: file.size,
            type: file.type.startsWith("image/") ? "image" : "file",
        });
    } catch (error: any) {
        console.error("Chat upload error:", error);
        return NextResponse.json(
            { error: "Upload failed", detail: error?.message || String(error) },
            { status: 500 }
        );
    }
}
