import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { deleteObjectFromS3, uploadBufferToS3 } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PAGES = 5;
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);
type RecordRow = Record<string, unknown>;

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function getOwner(req: Request) {
  const session = await getSessionFromRequest(req);
  if (!session || session.role !== "PATIENT") return null;
  const patientId = Number(session.patientId ?? session.userId);
  if (!Number.isInteger(patientId) || patientId <= 0) return null;
  const rows = await prisma.$queryRawUnsafe<RecordRow[]>(
    "SELECT patient_id, admin_id FROM patients WHERE patient_id = ? LIMIT 1",
    patientId
  );
  return rows[0] ? { patientId, adminId: Number(rows[0].admin_id) } : null;
}

export async function GET(req: Request) {
  try {
    const owner = await getOwner(req);
    if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const records = await prisma.$queryRawUnsafe<RecordRow[]>(
      `SELECT r.record_id, r.category, r.title, r.for_label, r.relationship_label,
              r.doctor_id, r.doctor_name, r.note, r.created_at,
              d.doctor_name AS current_doctor_name
       FROM patient_archive_records r
       LEFT JOIN doctors d ON d.doctor_id = r.doctor_id
       WHERE r.owner_patient_id = ?
       ORDER BY r.created_at DESC`,
      owner.patientId
    );
    const ids = records.map((record) => String(record.record_id));
    const pages = ids.length
      ? await prisma.$queryRawUnsafe<RecordRow[]>(
      `SELECT record_id, page_number, original_file_name, mime_type,
                  file_size_bytes, latitude, longitude, location_accuracy_m, created_at
           FROM patient_archive_record_pages
           WHERE record_id IN (${ids.map(() => "?").join(",")})
           ORDER BY record_id, page_number`,
          ...ids
        )
      : [];
    const pagesByRecord = new Map<string, RecordRow[]>();
    for (const page of pages) {
      const key = String(page.record_id);
      pagesByRecord.set(key, [...(pagesByRecord.get(key) || []), page]);
    }
    return NextResponse.json({ records: records.map((record) => ({
      ...record,
      record_id: String(record.record_id),
      doctor_name: record.current_doctor_name || record.doctor_name || null,
      pages: (pagesByRecord.get(String(record.record_id)) || []).map((page) => ({
        ...page,
        latitude: nullableNumber(page.latitude),
        longitude: nullableNumber(page.longitude),
        location_accuracy_m: nullableNumber(page.location_accuracy_m),
        image_path: `/patient/records/${record.record_id}/pages/${page.page_number}`,
      })),
    })) });
  } catch (error) {
    console.error("List patient archive records error:", error);
    return NextResponse.json({ error: "Unable to load records." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let recordId: string | null = null;
  const uploadedKeys: string[] = [];
  try {
    const owner = await getOwner(req);
    if (!owner) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(req.headers.get("content-type") || "").includes("multipart/form-data")) {
      return NextResponse.json({ error: "Image upload must use multipart form data." }, { status: 415 });
    }
    const form = await req.formData();
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    const title = String(form.get("title") || "").trim().slice(0, 100);
    const category = String(form.get("category") || "OTHER").trim().toUpperCase();
    const forLabel = String(form.get("for_label") || "Self").trim().slice(0, 50);
    const relationshipLabel = String(form.get("relationship_label") || "").trim().slice(0, 50) || null;
    const note = String(form.get("note") || "").trim().slice(0, 500) || null;
    const rawDoctorId = String(form.get("doctor_id") || "").trim();
    const doctorId = rawDoctorId ? Number(rawDoctorId) : null;
    const latitude = form.get("latitude") == null || form.get("latitude") === "" ? null : Number(form.get("latitude"));
    const longitude = form.get("longitude") == null || form.get("longitude") === "" ? null : Number(form.get("longitude"));
    const accuracy = form.get("location_accuracy_m") == null || form.get("location_accuracy_m") === "" ? null : Number(form.get("location_accuracy_m"));

    if (!files.length || files.length > MAX_PAGES) return NextResponse.json({ error: `Choose between 1 and ${MAX_PAGES} image pages.` }, { status: 400 });
    if (!forLabel) return NextResponse.json({ error: "Choose who this record is for." }, { status: 400 });
    if (!["PRESCRIPTION", "LAB_REPORT", "IMAGING", "OTHER"].includes(category)) return NextResponse.json({ error: "Choose a valid record type." }, { status: 400 });
    if (doctorId !== null && (!Number.isInteger(doctorId) || doctorId <= 0)) return NextResponse.json({ error: "Choose a valid doctor." }, { status: 400 });
    if ((latitude === null) !== (longitude === null) || (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude! < -180 || longitude! > 180))) {
      return NextResponse.json({ error: "Location coordinates are invalid." }, { status: 400 });
    }
    if (doctorId !== null) {
      const doctorRows = await prisma.$queryRawUnsafe<RecordRow[]>("SELECT doctor_id, doctor_name FROM doctors WHERE doctor_id = ? AND admin_id = ? LIMIT 1", doctorId, owner.adminId);
      if (!doctorRows.length) return NextResponse.json({ error: "That doctor is unavailable for this account." }, { status: 400 });
    }
    for (const file of files) {
      if (!ALLOWED_TYPES.has(file.type.toLowerCase())) return NextResponse.json({ error: "Use a JPG, PNG, WEBP, HEIC, or HEIF image." }, { status: 400 });
      if (file.size > MAX_BYTES) return NextResponse.json({ error: "Each image must be 8 MB or smaller." }, { status: 400 });
    }

    const clientUploadId = String(form.get("client_upload_id") || "").trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientUploadId)) {
      return NextResponse.json({ error: "Upload reference is invalid." }, { status: 400 });
    }
    const existing = await prisma.$queryRawUnsafe<RecordRow[]>("SELECT record_id FROM patient_archive_records WHERE record_id = ? AND owner_patient_id = ? LIMIT 1", clientUploadId, owner.patientId);
    if (existing.length) return NextResponse.json({ record_id: clientUploadId, already_saved: true }, { status: 200 });
    recordId = clientUploadId;
    const doctorName = doctorId === null ? null : await prisma.$queryRawUnsafe<RecordRow[]>("SELECT doctor_name FROM doctors WHERE doctor_id = ? LIMIT 1", doctorId).then((rows) => String(rows[0]?.doctor_name || ""));
    await prisma.$executeRawUnsafe(
      `INSERT INTO patient_archive_records
       (record_id, owner_patient_id, category, title, for_label, relationship_label, doctor_id, doctor_name, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      recordId, owner.patientId, category, title || null, forLabel, relationshipLabel, doctorId, doctorName, note
    );

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const extension = ({ "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" } as Record<string, string>)[file.type.toLowerCase()];
      const key = `patient-records/${owner.patientId}/${recordId}/page-${index + 1}.${extension}`;
      const result = await uploadBufferToS3({ key, buffer: Buffer.from(await file.arrayBuffer()), contentType: file.type });
      uploadedKeys.push(result.key);
      await prisma.$executeRawUnsafe(
        `INSERT INTO patient_archive_record_pages
         (record_id, page_number, storage_key, file_url, original_file_name, mime_type, file_size_bytes, latitude, longitude, location_accuracy_m, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        recordId, index + 1, result.key, result.url, file.name.slice(0, 255), file.type, file.size, latitude, longitude, accuracy
      );
    }
    return NextResponse.json({ record_id: recordId }, { status: 201 });
  } catch (error) {
    await Promise.allSettled(uploadedKeys.map((key) => deleteObjectFromS3(key)));
    if (recordId) await prisma.$executeRawUnsafe("DELETE FROM patient_archive_records WHERE record_id = ?", recordId).catch(() => undefined);
    console.error("Create patient archive record error:", error);
    return NextResponse.json({ error: "Upload failed. Your saved draft can be retried." }, { status: 500 });
  }
}
