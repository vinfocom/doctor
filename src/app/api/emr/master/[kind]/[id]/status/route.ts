import { NextRequest, NextResponse } from "next/server";
import {
  getEmrAccessErrorResponse,
  getDoctorSafeErrorMessage,
  logEmrOperationalError,
  validateAdminEmrReviewAccess,
} from "@/lib/emr";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  recordMasterReviewLogSafe,
  recordPrescriptionAuditSafe,
} from "@/lib/emr/auditService";
import {
  getMasterItemById,
  updateMasterItemStatus,
} from "@/lib/emr/masterService";
import { invalidateMasterSuggestionCache } from "@/lib/emr/suggestionService";
import { resolveMasterKind } from "@/app/api/emr/master/_shared";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ kind: string; id: string }>;
  }
) {
  try {
    const session = await getSessionFromRequest(req);
    const adminScope = await validateAdminEmrReviewAccess({ session });

    const { kind, id } = await params;
    const masterType = resolveMasterKind(kind);
    if (!masterType) {
      return NextResponse.json({ error: "Unknown master type" }, { status: 404 });
    }

    const masterId = Number(id);
    if (!Number.isInteger(masterId) || masterId <= 0) {
      return NextResponse.json({ error: "Invalid master item id" }, { status: 400 });
    }

    const body = (await req.json()) as { status?: "approved" | "rejected" };
    if (body.status !== "approved" && body.status !== "rejected") {
      return NextResponse.json(
        { error: "Status must be approved or rejected" },
        { status: 400 }
      );
    }

    const previous = await getMasterItemById(masterType, masterId);
    if (!previous) {
      return NextResponse.json({ error: "Master item not found" }, { status: 404 });
    }

    const existing = await updateMasterItemStatus({
      type: masterType,
      id: masterId,
      status: body.status,
    });

    if (!existing) {
      return NextResponse.json({ error: "Master item not found" }, { status: 404 });
    }

    await invalidateMasterSuggestionCache(masterType, existing.name);
    await recordMasterReviewLogSafe({
      masterType,
      masterId: existing.id,
      action: body.status,
      adminUserId: adminScope.adminUserId,
      oldValue: { status: previous.status, name: previous.name },
      newValue: { status: existing.status, name: existing.name },
    });
    if (existing.created_by_doctor_id) {
      await recordPrescriptionAuditSafe({
        action: `${body.status === "approved" ? "approved" : "rejected"} master item`,
        doctorId: existing.created_by_doctor_id,
        entityType: `${masterType}_master`,
        entityId: existing.id,
        oldValue: { status: previous.status },
        newValue: { status: body.status, id: existing.id, name: existing.name },
      });
    }

    return NextResponse.json({ item: existing }, { status: 200 });
  } catch (error) {
    const accessResponse = getEmrAccessErrorResponse(error);
    if (accessResponse.status !== 500) {
      return NextResponse.json(accessResponse.body, {
        status: accessResponse.status,
      });
    }

    logEmrOperationalError("emr-master-status-review", error);
    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(
          error,
          "Failed to update master item status."
        ),
      },
      { status: 500 }
    );
  }
}
