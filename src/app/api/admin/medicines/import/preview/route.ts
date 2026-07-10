import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import { generateMedicineImportPreview } from "@/lib/admin/medicineImport";

function isAdminRole(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function POST(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session || !isAdminRole(session.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const uploaded = formData.get("file");

    if (!(uploaded instanceof File)) {
      return NextResponse.json(
        { error: "Please upload an .xlsx or .csv file." },
        { status: 400 }
      );
    }

    const lowerName = uploaded.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".csv")) {
      return NextResponse.json(
        { error: "Only .xlsx and .csv files are supported." },
        { status: 400 }
      );
    }

    const preview = await generateMedicineImportPreview(uploaded);
    return NextResponse.json({ preview });
  } catch (error) {
    console.error("Medicine import preview error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not generate the preview. Please retry.",
      },
      { status: 500 }
    );
  }
}
