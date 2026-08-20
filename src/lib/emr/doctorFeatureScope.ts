import prisma from "@/lib/prisma";
import { getHmsSessionFromRequest } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { validateDoctorEmrFeatureAccess } from "@/lib/emr/access";
import type { JWTPayload } from "@/lib/jwt";

export type EmrDoctorFeatureScope = {
  doctorId: number;
  source: "legacy" | "hms";
};

export async function resolveEmrDoctorFeatureScope(input: {
  req: Request;
  legacySession: JWTPayload | null;
}): Promise<EmrDoctorFeatureScope> {
  try {
    const legacyScope = await validateDoctorEmrFeatureAccess({
      session: input.legacySession,
    });
    return { doctorId: legacyScope.doctorId, source: "legacy" };
  } catch {
    const hmsSession = await getHmsSessionFromRequest(input.req);
    if (!hmsSession || hmsSession.hospitalContext.role !== "DOCTOR") {
      throw new Error("Only doctors can access EMR master data.");
    }

    const enabled = await isHmsFeatureEnabled(hmsSession.hospitalContext, "emr_module");
    if (!enabled) {
      throw new Error("EMR is disabled for this hospital.");
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ doctor_id: number }>>(
      `
      SELECT d.doctor_id
      FROM doctors d
      INNER JOIN hospital_doctors hd
        ON hd.doctor_id = d.doctor_id
      WHERE d.user_id = ?
        AND d.admin_id = ?
        AND hd.hospital_id = ?
      LIMIT 1
      `,
      hmsSession.hospitalContext.userId,
      hmsSession.hospitalContext.adminId,
      hmsSession.hospitalContext.hospitalId
    );

    const doctorId = Number(rows[0]?.doctor_id || 0);
    if (!doctorId) {
      throw new Error("HMS doctor profile was not found.");
    }

    return { doctorId, source: "hms" };
  }
}
