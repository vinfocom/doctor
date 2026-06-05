import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  assertRateLimit,
  buildDoctorRateLimitKey,
  getEmrAccessErrorResponse,
  getRateLimitErrorResponse,
  getRequestIp,
  validateDoctorEmrFeatureAccess,
} from "@/lib/emr";
import { recordPrescriptionAuditSafe } from "@/lib/emr/auditService";
import {
  createOrGetMasterItem,
  getDefaultMasterStatus,
} from "@/lib/emr/masterService";
import { invalidateMasterSuggestionCache } from "@/lib/emr/suggestionService";
import { getDoctorSafeErrorMessage, logEmrOperationalError } from "@/lib/emr";
import { resolveMasterKind } from "@/app/api/emr/master/_shared";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const doctorScope = await validateDoctorEmrFeatureAccess({ session });
    const { kind } = await params;
    const masterType = resolveMasterKind(kind);

    if (!masterType) {
      return NextResponse.json(
        { error: "Unknown master type" },
        { status: 404 }
      );
    }

    const body = (await req.json()) as {
      name?: string;
      type?: string | null;
      strength?: string | null;
      salt_composition?: string | null;
      company?: string | null;
    };

    const name = String(body.name || "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    await assertRateLimit({
      key: buildDoctorRateLimitKey({
        scope: `master-add:${masterType}`,
        doctorId: doctorScope.doctorId,
        ip: getRequestIp(req),
      }),
      limit: 20,
      windowMs: 5 * 60 * 1000,
    });

    const item = await createOrGetMasterItem({
      type: masterType,
      doctorId: doctorScope.doctorId,
      status: getDefaultMasterStatus(masterType),
      name,
      medicineDetails:
        masterType === "medicine"
          ? {
              type: body.type ?? null,
              strength: body.strength ?? null,
              salt_composition: body.salt_composition ?? null,
              company: body.company ?? null,
            }
          : undefined,
    });

    await invalidateMasterSuggestionCache(masterType, item.name);
    await recordPrescriptionAuditSafe({
      action: "added new master item",
      doctorId: doctorScope.doctorId,
      entityType: `${masterType}_master`,
      entityId: item.id,
      newValue: item,
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    const rateLimitResponse = getRateLimitErrorResponse(error);
    if (rateLimitResponse) {
      return NextResponse.json(rateLimitResponse.body, {
        status: rateLimitResponse.status,
        headers: rateLimitResponse.headers,
      });
    }

    const accessResponse = getEmrAccessErrorResponse(error);
    if (accessResponse.status !== 500) {
      return NextResponse.json(accessResponse.body, {
        status: accessResponse.status,
      });
    }

    logEmrOperationalError("emr-master-add", error, { kind: await params });
    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(
          error,
          "Failed to add item. Please try again."
        ),
      },
      { status: 500 }
    );
  }
}
