import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/request-auth";
import {
  getDoctorSafeErrorMessage,
  logEmrOperationalError,
} from "@/lib/emr";
import {
  assertRateLimit,
  buildDoctorRateLimitKey,
  getEmrAccessErrorResponse,
  getRateLimitErrorResponse,
  getRequestIp,
  validateDoctorEmrFeatureAccess,
} from "@/lib/emr";
import { getMasterSuggestions } from "@/lib/emr/suggestionService";
import { resolveSuggestionKind } from "@/app/api/suggestions/_shared";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ kind: string }> }
) {
  try {
    const session = await getSessionFromRequest(req);
    const doctorScope = await validateDoctorEmrFeatureAccess({ session });
    const { kind } = await params;
    const masterType = resolveSuggestionKind(kind);

    if (!masterType) {
      return NextResponse.json(
        { error: "Unknown suggestion type" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const query = (searchParams.get("q") || "").trim();
    const limit = Number(searchParams.get("limit") || "10");

    await assertRateLimit({
      key: buildDoctorRateLimitKey({
        scope: `suggestions:${masterType}`,
        doctorId: doctorScope.doctorId,
        ip: getRequestIp(req),
      }),
      limit: 60,
      windowMs: 60 * 1000,
    });

    const suggestions = await getMasterSuggestions({
      type: masterType,
      doctorId: doctorScope.doctorId,
      query,
      limit,
    });

    return NextResponse.json({
      suggestions,
      query,
    });
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

    logEmrOperationalError("emr-suggestions", error);
    return NextResponse.json(
      {
        error: getDoctorSafeErrorMessage(
          error,
          "Failed to load suggestions. Please try again."
        ),
      },
      { status: 500 }
    );
  }
}
