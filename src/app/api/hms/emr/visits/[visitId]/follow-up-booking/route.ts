import { NextRequest, NextResponse } from "next/server";
import { resolveHmsDoctorVisitEmrScope, getHmsEmrAccessErrorResponse } from "@/lib/hms-emr";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ visitId: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { visitId } = await context.params;
    await resolveHmsDoctorVisitEmrScope(req, visitId);
    return NextResponse.json(
      { error: "Follow-up appointment booking is not available in HMS Phase 1." },
      { status: 400 }
    );
  } catch (error) {
    const response = getHmsEmrAccessErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
