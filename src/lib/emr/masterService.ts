import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import {
  buildPrefixSearchPattern,
  normalizeDisplayName,
  normalizeMasterName,
} from "@/lib/emr/normalization";
import type {
  EmrMasterItem,
  EmrMasterStatus,
  EmrMasterType,
  EmrNamedItemPayload,
} from "@/lib/emr/types";

type MasterTableConfig = {
  table: string;
  labelColumn: string;
  normalizedColumn: string;
  defaultStatus: EmrMasterStatus;
  allowDetails: boolean;
};

type MasterRow = {
  id: number;
  name: string;
  normalized_name: string;
  status: EmrMasterStatus;
  created_by_doctor_id: number | null;
  usage_count: number;
  type?: string | null;
  strength?: string | null;
  salt_composition?: string | null;
  company?: string | null;
  created_at: Date;
  updated_at: Date;
};

const MASTER_TABLES: Record<EmrMasterType, MasterTableConfig> = {
  medicine: {
    table: "medicines_master",
    labelColumn: "name",
    normalizedColumn: "normalized_name",
    defaultStatus: "approved",
    allowDetails: true,
  },
  complaint: {
    table: "complaints_master",
    labelColumn: "name",
    normalizedColumn: "normalized_name",
    defaultStatus: "approved",
    allowDetails: false,
  },
  diagnosis: {
    table: "diagnosis_master",
    labelColumn: "name",
    normalizedColumn: "normalized_name",
    defaultStatus: "approved",
    allowDetails: false,
  },
  test: {
    table: "tests_master",
    labelColumn: "name",
    normalizedColumn: "normalized_name",
    defaultStatus: "approved",
    allowDetails: false,
  },
  advice: {
    table: "advice_master",
    labelColumn: "name",
    normalizedColumn: "normalized_name",
    defaultStatus: "approved",
    allowDetails: false,
  },
};

function getMasterTable(type: EmrMasterType) {
  return MASTER_TABLES[type];
}

function getMasterTableSql(type: EmrMasterType) {
  return Prisma.raw(getMasterTable(type).table);
}

function mapMasterRow(row: MasterRow): EmrMasterItem {
  return {
    id: row.id,
    name: row.name,
    normalized_name: row.normalized_name,
    status: row.status,
    created_by_doctor_id: row.created_by_doctor_id,
    usage_count: row.usage_count,
    type: row.type ?? null,
    strength: row.strength ?? null,
    salt_composition: row.salt_composition ?? null,
    company: row.company ?? null,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export function getDefaultMasterStatus(type: EmrMasterType): EmrMasterStatus {
  return getMasterTable(type).defaultStatus;
}

export async function findMasterItemByNormalizedName(
  type: EmrMasterType,
  normalizedName: string
) {
  const rows = await prisma.$queryRaw<MasterRow[]>(
    Prisma.sql`
      SELECT *
      FROM ${getMasterTableSql(type)}
      WHERE normalized_name = ${normalizedName}
      LIMIT 1
    `
  );

  return rows[0] ? mapMasterRow(rows[0]) : null;
}

export async function getMasterItemById(type: EmrMasterType, id: number) {
  const rows = await prisma.$queryRaw<MasterRow[]>(
    Prisma.sql`
      SELECT *
      FROM ${getMasterTableSql(type)}
      WHERE id = ${id}
      LIMIT 1
    `
  );

  return rows[0] ? mapMasterRow(rows[0]) : null;
}

export async function createOrGetMasterItem(input: {
  type: EmrMasterType;
  doctorId: number;
  name: string;
  status?: EmrMasterStatus;
  medicineDetails?: {
    type?: string | null;
    strength?: string | null;
    salt_composition?: string | null;
    company?: string | null;
  };
}) {
  const config = getMasterTable(input.type);
  const name = normalizeDisplayName(input.name);
  const normalizedName = normalizeMasterName(name);

  if (!name || !normalizedName) {
    throw new Error("Master item name is required");
  }

  const existing = await findMasterItemByNormalizedName(input.type, normalizedName);
  if (existing) {
    return existing;
  }

  const status = input.status ?? config.defaultStatus;
  const details = input.medicineDetails ?? {};

  try {
    const insertColumns = config.allowDetails
      ? Prisma.sql`
          name,
          normalized_name,
          status,
          created_by_doctor_id,
          usage_count,
          type,
          strength,
          salt_composition,
          company,
          created_at,
          updated_at
        `
      : Prisma.sql`
          name,
          normalized_name,
          status,
          created_by_doctor_id,
          usage_count,
          created_at,
          updated_at
        `;
    const insertValues = config.allowDetails
      ? Prisma.sql`
          ${name},
          ${normalizedName},
          ${status},
          ${input.doctorId},
          0,
          ${details.type ?? null},
          ${details.strength ?? null},
          ${details.salt_composition ?? null},
          ${details.company ?? null},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        `
      : Prisma.sql`
          ${name},
          ${normalizedName},
          ${status},
          ${input.doctorId},
          0,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        `;

    await prisma.$executeRaw(
      Prisma.sql`
        INSERT INTO ${getMasterTableSql(input.type)} (
          ${insertColumns}
        )
        VALUES (
          ${insertValues}
        )
      `
    );
  } catch {
    const duplicate = await findMasterItemByNormalizedName(input.type, normalizedName);
    if (duplicate) {
      return duplicate;
    }
    throw new Error("Failed to create master item");
  }

  const created = await findMasterItemByNormalizedName(input.type, normalizedName);
  if (!created) {
    throw new Error("Failed to load created master item");
  }

  return created;
}

export async function updateMasterItemStatus(input: {
  type: EmrMasterType;
  id: number;
  status: Exclude<EmrMasterStatus, "pending">;
}) {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE ${getMasterTableSql(input.type)}
      SET
        status = ${input.status},
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.id}
    `
  );

  return getMasterItemById(input.type, input.id);
}

export async function incrementMasterUsageCount(type: EmrMasterType, id: number) {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE ${getMasterTableSql(type)}
      SET usage_count = usage_count + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${id}
    `
  );
}

export async function listMasterItemsByPrefix(input: {
  type: EmrMasterType;
  doctorId: number;
  query: string;
  limit?: number;
}) {
  const pattern = buildPrefixSearchPattern(input.query);
  if (!pattern) return [];

  const rows = await prisma.$queryRaw<MasterRow[]>(
    Prisma.sql`
      SELECT *
      FROM ${getMasterTableSql(input.type)}
      WHERE ${Prisma.raw(getMasterTable(input.type).labelColumn)} LIKE ${pattern}
        AND (
          status = 'approved'
          OR (status = 'pending' AND created_by_doctor_id = ${input.doctorId})
        )
      ORDER BY usage_count DESC, name ASC
      LIMIT ${Math.min(Math.max(input.limit ?? 10, 1), 20)}
    `
  );

  return rows.map(mapMasterRow);
}

export async function listVisibleMasterItemsForDoctor(input: {
  type: EmrMasterType;
  doctorId: number;
  limit?: number;
}) {
  const limitSql =
    typeof input.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
      ? Prisma.sql`LIMIT ${Math.min(Math.max(Math.floor(input.limit), 1), 2000)}`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<MasterRow[]>(
    Prisma.sql`
      SELECT *
      FROM ${getMasterTableSql(input.type)}
      WHERE (
        status = 'approved'
        OR (status = 'pending' AND created_by_doctor_id = ${input.doctorId})
      )
      ORDER BY usage_count DESC, name ASC
      ${limitSql}
    `
  );

  return rows.map(mapMasterRow);
}

export function buildPrescriptionNamedItem(
  item: EmrNamedItemPayload,
  fallbackSortOrder: number
) {
  const name = normalizeDisplayName(item.name);
  const normalized_name = item.normalized_name || normalizeMasterName(name);

  return {
    id: item.id ?? null,
    name,
    normalized_name,
    notes: item.notes?.trim() || null,
    sort_order: item.sort_order ?? fallbackSortOrder,
  };
}
