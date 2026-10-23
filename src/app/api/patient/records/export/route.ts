import { ZipArchive } from "archiver";
import { PassThrough, Readable } from "node:stream";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  generatePatientEmrPrescriptionPdf,
  getEmrAccessErrorResponse,
  getPrintablePrescriptionData,
  listPatientFinalizedPrescriptionsForDoctor,
} from "@/lib/emr";
import { getS3Client, getS3Config } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ExportOptions = {
  includeSaved: boolean;
  includeDoctorPrescriptions: boolean;
  allDoctors: boolean;
  doctorIds: number[];
  includePersonal: boolean;
  person: string;
  category: string;
  startDate: string | null;
  endDate: string | null;
};
type Row = Record<string, unknown>;
type ExportFile = { name: string; bytes: Buffer; type: "pdf" };

const safeName = (value: unknown, fallback: string) => {
  const name = String(value || fallback)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_\.]+|[_\.]+$/g, "")
    .slice(0, 100);
  return name || fallback;
};

const MAX_EXPORT_FILES = 100;
const MAX_IMAGE_BYTES = 48 * 1024 * 1024;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;

async function mapInBatches<T, U>(items: T[], batchSize: number, mapper: (item: T) => Promise<U>) {
  const output: U[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    output.push(...await Promise.all(items.slice(index, index + batchSize).map(mapper)));
  }
  return output;
}

const validDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

function validateOptions(value: unknown): ExportOptions | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ExportOptions>;
  if (typeof input.includeSaved !== "boolean" || typeof input.includeDoctorPrescriptions !== "boolean" ||
      typeof input.allDoctors !== "boolean" || typeof input.includePersonal !== "boolean" ||
      typeof input.person !== "string" || typeof input.category !== "string" || !Array.isArray(input.doctorIds)) return null;
  if (!input.includeSaved && !input.includeDoctorPrescriptions) return null;
  if (input.doctorIds.length > 100 || input.doctorIds.some((id) => !Number.isInteger(id) || Number(id) <= 0)) return null;
  if (!input.allDoctors && input.doctorIds.length === 0 && !input.includePersonal && input.includeDoctorPrescriptions) return null;
  if (input.startDate !== null && input.startDate !== undefined && !validDate(input.startDate)) return null;
  if (input.endDate !== null && input.endDate !== undefined && !validDate(input.endDate)) return null;
  if (input.startDate && input.endDate && input.startDate > input.endDate) return null;
  if (!["ALL", "SELF", "OTHER"].includes(input.person) && !input.person.startsWith("RELATION:")) return null;
  if (!["ALL", "PRESCRIPTION", "LAB_REPORT", "IMAGING", "OTHER"].includes(input.category)) return null;
  return {
    includeSaved: input.includeSaved,
    includeDoctorPrescriptions: input.includeDoctorPrescriptions,
    allDoctors: input.allDoctors,
    doctorIds: input.doctorIds.map(Number),
    includePersonal: input.includePersonal,
    person: input.person,
    category: input.category,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
  };
}

async function recordPdf(pages: Row[]) {
  const pdf = await PDFDocument.create();
  const { bucket } = getS3Config();
  const imageData = await Promise.all(pages.map(async (page) => {
    const key = String(page.storage_key || "");
    const mime = String(page.mime_type || "").toLowerCase();
    if (!key || !["image/jpeg", "image/jpg", "image/png"].includes(mime)) {
      throw new Error("A saved record page has an unsupported image format.");
    }
    const object = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!object.Body) throw new Error("A saved record page could not be downloaded.");
    return { mime, bytes: Buffer.from(await object.Body.transformToByteArray()) };
  }));
  for (const { mime, bytes } of imageData) {
    const image = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const maxWidth = 595.28;
    const maxHeight = 841.89;
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    const pdfPage = pdf.addPage([maxWidth, maxHeight]);
    pdfPage.drawImage(image, { x: (maxWidth - width) / 2, y: (maxHeight - height) / 2, width, height });
  }
  return Buffer.from(await pdf.save());
}

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "PATIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const patientId = Number(session.patientId ?? session.userId);
    if (!Number.isInteger(patientId) || patientId <= 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const options = validateOptions(await req.json().catch(() => null));
    if (!options) return NextResponse.json({ error: "Choose valid export options." }, { status: 400 });
    const files: ExportFile[] = [];

    if (options.includeSaved) {
      const clauses = ["r.owner_patient_id = ?"];
      const args: unknown[] = [patientId];
      if (options.startDate) { clauses.push("r.created_at >= ?"); args.push(`${options.startDate} 00:00:00`); }
      if (options.endDate) { clauses.push("r.created_at < DATE_ADD(?, INTERVAL 1 DAY)"); args.push(`${options.endDate} 00:00:00`); }
      if (options.category !== "ALL") { clauses.push("r.category = ?"); args.push(options.category); }
      if (options.person === "SELF") clauses.push("LOWER(TRIM(r.for_label)) = 'self'");
      else if (options.person === "OTHER") clauses.push("LOWER(TRIM(r.for_label)) <> 'self'");
      else if (options.person.startsWith("RELATION:")) { clauses.push("LOWER(TRIM(r.relationship_label)) = ?"); args.push(options.person.slice("RELATION:".length).trim().toLowerCase()); }
      if (options.allDoctors && !options.includePersonal) {
        clauses.push("r.doctor_id IS NOT NULL");
      } else if (!options.allDoctors) {
        const doctorParts: string[] = [];
        if (options.includePersonal) doctorParts.push("r.doctor_id IS NULL");
        if (options.doctorIds.length) { doctorParts.push(`r.doctor_id IN (${options.doctorIds.map(() => "?").join(",")})`); args.push(...options.doctorIds); }
        clauses.push(doctorParts.length ? `(${doctorParts.join(" OR ")})` : "1 = 0");
      }

      const records = await prisma.$queryRawUnsafe<Row[]>(
        `SELECT r.record_id, r.category, r.title, r.for_label, r.relationship_label,
                r.doctor_id, COALESCE(d.doctor_name, r.doctor_name) AS doctor_name, r.created_at,
                p.page_number, p.storage_key, p.mime_type, p.file_size_bytes
         FROM patient_archive_records r
         LEFT JOIN doctors d ON d.doctor_id = r.doctor_id
         INNER JOIN patient_archive_record_pages p ON p.record_id = r.record_id
         WHERE ${clauses.join(" AND ")}
         ORDER BY r.created_at DESC, r.record_id, p.page_number`,
        ...args
      );
      const grouped = new Map<string, Row[]>();
      for (const row of records) {
        const key = String(row.record_id);
        grouped.set(key, [...(grouped.get(key) || []), row]);
      }
      if (grouped.size > MAX_EXPORT_FILES) return NextResponse.json({ error: "This export contains too many records. Narrow the date range and try again." }, { status: 413 });
      const imageBytes = records.reduce((sum, row) => sum + Math.max(0, Number(row.file_size_bytes) || 0), 0);
      if (imageBytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "This export is over 48 MB. Narrow the date range to download it in smaller parts." }, { status: 413 });
      const groupedRecords = [...grouped.values()];
      const pdfRecords = await mapInBatches(groupedRecords, 3, async (pages) => {
        const first = pages[0];
        const title = safeName(first.title || first.category, "Health_record");
        const date = new Date(String(first.created_at)).toISOString().slice(0, 10);
        const person = safeName(first.for_label === "Self" ? "Self" : first.relationship_label || first.for_label, "Record");
        const pdf = await recordPdf(pages);
        return { name: `${title}_${person}_${date}.pdf`, bytes: pdf, type: "pdf" as const };
      });
      files.push(...pdfRecords);
      if (files.reduce((total, file) => total + file.bytes.length, 0) > MAX_EXPORT_BYTES) {
        return NextResponse.json({ error: "This export is too large. Narrow the date range to download it in smaller parts." }, { status: 413 });
      }
    }

    if (options.includeDoctorPrescriptions && (options.allDoctors || options.doctorIds.length)) {
      const ids = options.allDoctors ? null : options.doctorIds;
      const doctorRows = ids ? ids.map((doctor_id) => ({ doctor_id })) : await prisma.$queryRawUnsafe<Row[]>(
        `SELECT DISTINCT doctor_id FROM prescriptions WHERE patient_id = ? AND status = 'final' AND is_deleted = 0`, patientId
      ).then((rows) => rows.map((row) => ({ doctor_id: Number(row.doctor_id) })));
      const histories = await mapInBatches(doctorRows, 5, ({ doctor_id }) =>
        listPatientFinalizedPrescriptionsForDoctor({ patientId, doctorId: doctor_id })
      );
      const selected = histories.flat().filter((item) => {
        const value = item.finalized_at || item.visit_date;
        const date = value.slice(0, 10);
        return (!options.startDate || date >= options.startDate) && (!options.endDate || date <= options.endDate);
      });
      if (selected.length + files.length > MAX_EXPORT_FILES) return NextResponse.json({ error: "This export contains too many records. Narrow the date range and try again." }, { status: 413 });
      const emrFiles = await mapInBatches(selected, 3, async (item) => {
        const printable = await getPrintablePrescriptionData({ prescriptionId: item.prescription_id, doctorId: item.doctor_id });
        if (!printable || printable.prescription.patient_id !== patientId || printable.prescription.doctor_id !== item.doctor_id) {
          throw new Error(`Prescription ${item.prescription_no} is no longer available.`);
        }
        const bytes = Buffer.from(await generatePatientEmrPrescriptionPdf(printable));
        const date = (item.finalized_at || item.visit_date).slice(0, 10);
        const prescriptionNo = safeName(item.prescription_no || `Prescription_${item.prescription_id}`, "Prescription");
        const doctorName = safeName(item.doctor_name || "Doctor", "Doctor");
        return { name: `${prescriptionNo}_${doctorName}_${date}.pdf`, bytes, type: "pdf" as const };
      });
      files.push(...emrFiles);
      if (files.reduce((total, file) => total + file.bytes.length, 0) > MAX_EXPORT_BYTES) {
        return NextResponse.json({ error: "This export is too large. Narrow the date range to download it in smaller parts." }, { status: 413 });
      }
    }

    if (files.length === 0) return NextResponse.json({ error: "No records matched these filters." }, { status: 404 });
    const collisionNames = new Map<string, number>();
    for (const file of files) {
      const baseName = file.name;
      const count = (collisionNames.get(baseName) || 0) + 1;
      collisionNames.set(baseName, count);
      if (count > 1) file.name = `${baseName.replace(/\.pdf$/i, "")}_${count}.pdf`;
    }
    const labelDate = options.startDate && options.endDate
      ? `${options.startDate}_to_${options.endDate}`
      : options.startDate ? `from_${options.startDate}` : options.endDate ? `through_${options.endDate}` : "all_time";

    if (files.length === 1) {
      return new NextResponse(new Uint8Array(files[0].bytes), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${files[0].name}"`,
          "Content-Length": String(files[0].bytes.length),
          "Cache-Control": "private, no-store",
        },
      });
    }

    const archive = new ZipArchive({ zlib: { level: 1 } });
    const output = new PassThrough();
    archive.on("error", (error: Error) => output.destroy(error));
    archive.on("warning", (error: Error) => output.destroy(error));
    archive.pipe(output);
    for (const file of files) archive.append(file.bytes, { name: file.name });
    void archive.finalize().catch((error: Error) => output.destroy(error));
    const zipStream = Readable.toWeb(output) as ReadableStream<Uint8Array>;
    return new Response(zipStream, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Dapto_Records_${labelDate}.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const emrError = getEmrAccessErrorResponse(error);
    if (emrError.status !== 500) return NextResponse.json(emrError.body, { status: emrError.status });
    console.error("Export patient records error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create this records download." }, { status: 500 });
  }
}
