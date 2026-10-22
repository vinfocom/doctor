import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { deleteObjectFromS3 } from "@/lib/s3";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ recordId: string }> };
type PageRow = { storage_key: string };

export async function DELETE(req: Request, context: Context) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || session.role !== "PATIENT") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const patientId = Number(session.patientId ?? session.userId);
    if (!Number.isInteger(patientId) || patientId <= 0) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { recordId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(recordId)) return NextResponse.json({ error: "Record not found." }, { status: 404 });

    const rows = await prisma.$queryRawUnsafe<PageRow[]>(
      `SELECT p.storage_key
       FROM patient_archive_records r
       LEFT JOIN patient_archive_record_pages p ON p.record_id = r.record_id
       WHERE r.record_id = ? AND r.owner_patient_id = ?`,
      recordId, patientId
    );
    if (!rows.length) return NextResponse.json({ error: "Record not found." }, { status: 404 });

    await Promise.all(rows.filter((row) => row.storage_key).map((row) => deleteObjectFromS3(row.storage_key)));
    await prisma.$executeRawUnsafe(
      "DELETE FROM patient_archive_records WHERE record_id = ? AND owner_patient_id = ?",
      recordId, patientId
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete patient archive record error:", error);
    return NextResponse.json({ error: "Could not delete this record. Please try again." }, { status: 500 });
  }
}
