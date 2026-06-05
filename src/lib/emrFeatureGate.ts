import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { isMissingPrismaTable } from "@/lib/prismaErrors";

const DOCTOR_EMR_SETTINGS_TABLE = "doctor_emr_settings";

type EmrSettingsRow = {
  doctor_id: number;
  emr_prescription_enabled: boolean | number;
};

type RawExecutor = {
  $executeRaw: typeof prisma.$executeRaw;
};

export class EmrFeatureAccessError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isMissingDoctorEmrSettingsTable = (error: unknown) =>
  isMissingPrismaTable(error, DOCTOR_EMR_SETTINGS_TABLE) ||
  String(error ?? "").includes(DOCTOR_EMR_SETTINGS_TABLE);

const toEnabledBoolean = (value: boolean | number | null | undefined) =>
  value === true || value === 1;

export async function getDoctorEmrEnabledMap(doctorIds: number[]) {
  const uniqueDoctorIds = Array.from(
    new Set(
      doctorIds.filter((doctorId) => Number.isInteger(doctorId) && doctorId > 0)
    )
  );
  const result = new Map<number, boolean>();

  if (uniqueDoctorIds.length === 0) {
    return result;
  }

  try {
    const rows = await prisma.$queryRaw<EmrSettingsRow[]>(
      Prisma.sql`
        SELECT doctor_id, emr_prescription_enabled
        FROM doctor_emr_settings
        WHERE doctor_id IN (${Prisma.join(uniqueDoctorIds)})
      `
    );

    rows.forEach((row) => {
      result.set(row.doctor_id, toEnabledBoolean(row.emr_prescription_enabled));
    });

    return result;
  } catch (error) {
    if (isMissingDoctorEmrSettingsTable(error)) {
      return result;
    }

    throw error;
  }
}

export async function getDoctorEmrEnabled(doctorId: number) {
  const enabledMap = await getDoctorEmrEnabledMap([doctorId]);
  return enabledMap.get(doctorId) ?? false;
}

export async function upsertDoctorEmrEnabled(
  executor: RawExecutor,
  doctorId: number,
  enabled: boolean
) {
  try {
    await executor.$executeRaw(
      Prisma.sql`
        INSERT INTO doctor_emr_settings (
          doctor_id,
          emr_prescription_enabled,
          created_at,
          updated_at
        )
        VALUES (
          ${doctorId},
          ${enabled ? 1 : 0},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON DUPLICATE KEY UPDATE
          emr_prescription_enabled = VALUES(emr_prescription_enabled),
          updated_at = CURRENT_TIMESTAMP
      `
    );
  } catch (error) {
    if (isMissingDoctorEmrSettingsTable(error)) {
      throw new EmrFeatureAccessError(
        409,
        "EMR doctor settings table is not available yet. Please create the EMR tables before using this toggle."
      );
    }

    throw error;
  }
}

export async function assertDoctorEmrPadEnabled(doctorId: number) {
  const enabled = await getDoctorEmrEnabled(doctorId);
  if (!enabled) {
    throw new EmrFeatureAccessError(
      403,
      "EMR Prescription Pad is disabled for this doctor."
    );
  }
}

export function getEmrFeatureErrorResponse(error: unknown) {
  if (error instanceof EmrFeatureAccessError) {
    return {
      status: error.status,
      body: { error: error.message },
    };
  }

  return {
    status: 500,
    body: {
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error),
    },
  };
}
