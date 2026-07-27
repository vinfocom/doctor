import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  buildDiagnosisImportReportWorkbook,
  type DiagnosisImportPreview,
} from "@/lib/admin/diagnosisImport";

function isSuperAdmin(role?: string | null) {
  return role === "SUPER_ADMIN";
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session || !isSuperAdmin(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { preview?: DiagnosisImportPreview };
    if (!body.preview) {
      return NextResponse.json(
        { error: "Preview data is required to build the report." },
        { status: 400 }
      );
    }

    const workbook = await buildDiagnosisImportReportWorkbook(body.preview);
    const buffer = await workbook.xlsx.writeBuffer();
    const safeBaseName =
      body.preview.file_name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "_") ||
      "diagnosis_import";
    const fileName = `${safeBaseName}_preview_report.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Diagnosis import report error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not generate the report right now. Please retry.",
      },
      { status: 500 }
    );
  }
}
