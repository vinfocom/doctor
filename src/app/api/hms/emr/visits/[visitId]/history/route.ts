import { NextRequest, NextResponse } from "next/server";
import {
  getHmsEmrAccessErrorResponse,
  resolveHmsDoctorVisitEmrScope,
} from "@/lib/hms-emr";
import { listPrescriptionHistory } from "@/lib/emr/prescriptionService";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ visitId: string }>;
};

function groupHistoryByDate(items: Awaited<ReturnType<typeof listPrescriptionHistory>>) {
  const groups = new Map<string, { date: string; items: typeof items }>();

  items.forEach((item) => {
    const dateKey = item.visit_date.slice(0, 10);
    if (!groups.has(dateKey)) {
      groups.set(dateKey, { date: dateKey, items: [] });
    }
    groups.get(dateKey)?.items.push(item);
  });

  return Array.from(groups.values());
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { visitId } = await context.params;
    const scope = await resolveHmsDoctorVisitEmrScope(req, visitId);
    const history = await listPrescriptionHistory(scope.visit.doctor_id, scope.visit.patient_id);

    return NextResponse.json({ history: groupHistoryByDate(history) }, { status: 200 });
  } catch (error) {
    const response = getHmsEmrAccessErrorResponse(error);
    return NextResponse.json(response.body, { status: response.status });
  }
}
