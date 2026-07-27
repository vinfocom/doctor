import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import { importDiagnosisRows } from "@/lib/admin/diagnosisImport";

function isSuperAdmin(role?: string | null) {
  return role === "SUPER_ADMIN";
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session || !isSuperAdmin(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      rows?: Array<{
        name: string;
        normalized_name: string;
      }>;
    };

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json(
        { error: "No importable rows were provided." },
        { status: 400 }
      );
    }

    const result = await importDiagnosisRows({
      rows: body.rows.map((row) => ({
        name: row.name,
        normalized_name: row.normalized_name,
      })),
    });

    return NextResponse.json({ result });
  } catch (error) {
    console.error("Diagnosis import error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import diagnosis rows right now. Please retry.",
      },
      { status: 500 }
    );
  }
}
