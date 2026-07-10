import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import { importMedicineRows } from "@/lib/admin/medicineImport";

function isAdminRole(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session || !isAdminRole(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as {
      rows?: Array<{
        name: string;
        normalized_name: string;
        type?: string | null;
        strength?: string | null;
        salt_composition?: string | null;
        company?: string | null;
      }>;
    };

    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json(
        { error: "No importable rows were provided." },
        { status: 400 }
      );
    }

    const result = await importMedicineRows({
      rows: body.rows.map((row) => ({
        name: row.name,
        normalized_name: row.normalized_name,
        type: row.type ?? null,
        strength: row.strength ?? null,
        salt_composition: row.salt_composition ?? null,
        company: row.company ?? null,
      })),
    });
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Medicine import error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not import medicines right now. Please retry.",
      },
      { status: 500 }
    );
  }
}
