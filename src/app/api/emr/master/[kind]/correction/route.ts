import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  assertRateLimit,
  buildDoctorRateLimitKey,
  getDoctorSafeErrorMessage,
  getEmrAccessErrorResponse,
  getRateLimitErrorResponse,
  getRequestIp,
  logEmrOperationalError,
  validateDoctorEmrFeatureAccess,
} from "@/lib/emr";
import { getMasterCorrectionSuggestion } from "@/lib/emr/masterCorrectionService";
import { resolveMasterKind } from "@/app/api/emr/master/_shared";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const doctorScope = await validateDoctorEmrFeatureAccess({ session });
    const { kind } = await params;
    const masterType = resolveMasterKind(kind);

    if (
      masterType !== "complaint" &&
      masterType !== "diagnosis" &&
      masterType !== "advice"
    ) {
      return NextResponse.json(
        { error: "Correction suggestions are not available for this master type." },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const name = (searchParams.get("q") || "").trim();

    await assertRateLimit({
      key: buildDoctorRateLimitKey({
        scope: `master-correction:${masterType}`,
        doctorId: doctorScope.doctorId,
        ip: getRequestIp(req),
      }),
      limit: 30,
      windowMs: 60 * 1000,
    });

    const suggestion = await getMasterCorrectionSuggestion({
      type: masterType,
      doctorId: doctorScope.doctorId,
      name,
    });

    return NextResponse.json(suggestion);
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

    logEmrOperationalError("emr-master-correction", error, { kind: await params });
    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(
          error,
          "Failed to load spelling suggestion."
        ),
      },
      { status: 500 }
    );
  }
}
