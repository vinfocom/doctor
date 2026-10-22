import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { getS3Client, getS3Config } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ recordId: string; pageNumber: string }> };
type PageRow = { storage_key: string; mime_type: string | null };

export async function GET(req: Request, context: Context) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "PATIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const patientId = Number(session.patientId ?? session.userId);
    if (!Number.isInteger(patientId) || patientId <= 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { recordId, pageNumber: rawPageNumber } = await context.params;
    const pageNumber = Number(rawPageNumber);
    if (!/^[0-9a-f-]{36}$/i.test(recordId) || !Number.isInteger(pageNumber) || pageNumber <= 0) {
      return NextResponse.json({ error: "Record image not found." }, { status: 404 });
    }
    const rows = await prisma.$queryRawUnsafe<PageRow[]>(
      `SELECT p.storage_key, p.mime_type
       FROM patient_archive_record_pages p
       INNER JOIN patient_archive_records r ON r.record_id = p.record_id
       WHERE r.record_id = ? AND r.owner_patient_id = ? AND p.page_number = ?
       LIMIT 1`,
      recordId, patientId, pageNumber
    );
    if (!rows[0]) return NextResponse.json({ error: "Record image not found." }, { status: 404 });

    const { bucket } = getS3Config();
    const object = await getS3Client().send(new GetObjectCommand({ Bucket: bucket, Key: rows[0].storage_key }));
    if (!object.Body) return NextResponse.json({ error: "Record image not found." }, { status: 404 });
    const bytes = await object.Body.transformToByteArray();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": rows[0].mime_type || object.ContentType || "application/octet-stream",
        "Cache-Control": "private, no-store",
        "Content-Length": String(bytes.byteLength),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Read patient archive page error:", error);
    return NextResponse.json({ error: "Unable to load this image." }, { status: 500 });
  }
}
