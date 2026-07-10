import ExcelJS from "exceljs";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import { collapseSpaces, normalizeDisplayName, normalizeMasterName } from "@/lib/emr/normalization";

const MEDICINE_TYPE_OPTIONS = [
  "TAB",
  "CAP",
  "CHEW",
  "ODT",
  "EFF",
  "DISP",
  "TAB-ER",
  "TAB-DR",
  "TAB-EC",
  "TAB-SL",
  "TAB-BUCC",
  "TAB-VAG",
  "CAP-ER",
  "CAP-DR",
  "CAP-SR",
  "POWD",
  "GRAN",
  "PELLET",
  "CRYS",
  "SOLN",
  "SUSP",
  "SYR",
  "ELIX",
  "LIQ",
  "EMUL",
  "LOTN",
  "LINI",
  "CRM",
  "OINT",
  "GEL",
  "PASTE",
  "FOAM",
  "FILM",
  "PATCH",
  "AER",
  "INH",
  "NEB",
  "SPRAY",
  "NAS-SP",
  "GTT",
  "OP-SOLN",
  "OT-SOLN",
  "TOP-SOLN",
  "TINC",
  "SHAMP",
  "SOAP",
  "WASH",
  "ENEMA",
  "DOUCHE",
  "SUPP",
  "SWAB",
  "STICK",
  "INJ",
  "SOLR",
  "IMPL",
  "IRRIG",
  "DIAL",
  "GAS",
  "KIT",
  "CONC",
] as const;

const STRENGTH_UNIT_OPTIONS = [
  "MG",
  "MCG",
  "G",
  "KG",
  "NG",
  "PG",
  "IU",
  "KIU",
  "MIU",
  "U",
  "MILLION",
  "BILLION",
  "CFU",
  "MILLION CFU",
  "BILLION CFU",
  "mEq",
  "mmol",
  "mol",
  "%",
  "%W/W",
  "%W/V",
  "%V/V",
  "MG/ML",
  "MCG/ML",
  "G/ML",
  "MG/G",
  "MCG/G",
  "G/G",
  "MG/L",
  "MCG/L",
  "G/L",
  "MG/5ML",
  "MCG/5ML",
  "G/5ML",
  "MG/15ML",
  "MCG/15ML",
  "MG/TAB",
  "MCG/TAB",
  "G/TAB",
  "MG/CAP",
  "MCG/CAP",
  "G/CAP",
  "MG/PATCH",
  "MCG/PATCH",
  "MG/ACT",
  "MCG/ACT",
  "MG/DOSE",
  "MCG/DOSE",
  "MG/PUFF",
  "MCG/PUFF",
  "MG/SPRAY",
  "MCG/SPRAY",
  "MG/DROP",
  "MCG/DROP",
  "MG/HR",
  "MCG/HR",
  "MG/KG",
  "MCG/KG",
  "MG/KG/DAY",
  "MCG/KG/DAY",
  "MG/M²",
  "MCG/M²",
  "MG/M²/DAY",
  "U/ML",
  "IU/ML",
  "mEq/L",
  "mmol/L",
  "OSM/L",
] as const;

const TYPE_LOOKUP = new Map(
  MEDICINE_TYPE_OPTIONS.map((type) => [type.toUpperCase(), type])
);

const UNIT_LOOKUP = new Map(
  STRENGTH_UNIT_OPTIONS.map((unit) => [unit.toUpperCase(), unit])
);

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "medicine name", "medicine_name", "medicine"],
  type: ["type", "medicine type", "medicine_type"],
  strength_value: ["strength value", "strength_value", "strength", "strength value/unit"],
  strength_unit: ["strength unit", "strength_unit", "unit"],
  salt_composition: [
    "salt composition",
    "salt_composition",
    "salt",
    "composition",
  ],
  company: ["company", "company name", "company_name", "manufacturer"],
};

export type MedicineImportStatus =
  | "will_import"
  | "already_exists"
  | "duplicate_in_file"
  | "invalid"
  | "needs_review";

export type MedicineImportRow = {
  row_number: number;
  name: string;
  normalized_name: string;
  type: string | null;
  strength: string | null;
  salt_composition: string | null;
  company: string | null;
  status: MedicineImportStatus;
  reasons: string[];
  source: {
    raw_name: string;
    raw_type: string;
    raw_strength_value: string;
    raw_strength_unit: string;
    raw_salt_composition: string;
    raw_company: string;
  };
};

export type MedicineImportSummary = {
  total_rows: number;
  will_import: number;
  already_exists: number;
  duplicate_in_file: number;
  invalid: number;
  needs_review: number;
};

export type MedicineImportPreview = {
  file_name: string;
  generated_at: string;
  summary: MedicineImportSummary;
  rows: MedicineImportRow[];
  groups: Record<MedicineImportStatus, MedicineImportRow[]>;
};

type ParsedSheetRow = {
  row_number: number;
  values: Record<string, string>;
};

type ExistingMedicineRow = {
  id: number;
  name: string;
  normalized_name: string;
};

type ImportableMedicineRow = Pick<
  MedicineImportRow,
  "name" | "normalized_name" | "type" | "strength" | "salt_composition" | "company"
>;

function sanitizeHeader(value: unknown) {
  return normalizeDisplayName(String(value ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeNameForStorage(value: unknown) {
  return collapseSpaces(String(value ?? "").trim()).toUpperCase();
}

function normalizeOptionalUpper(value: unknown) {
  const trimmed = collapseSpaces(String(value ?? "").trim());
  return trimmed ? trimmed.toUpperCase() : "";
}

function normalizeOptionalText(value: unknown) {
  const trimmed = collapseSpaces(String(value ?? "").trim());
  return trimmed || "";
}

function composeStrength(value: string, unit: string) {
  const trimmedValue = normalizeOptionalText(value);
  const trimmedUnit = normalizeOptionalText(unit);

  if (!trimmedValue && !trimmedUnit) {
    return "";
  }

  return [trimmedValue, trimmedUnit].filter(Boolean).join(" ");
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

function parseCsv(content: string) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines
    .filter((line, index) => index === 0 || line.trim() !== "")
    .map((line) => parseCsvLine(line).map((cell) => cell.trim()));
}

function resolveHeaderIndexMap(headers: string[]) {
  const map: Record<string, number> = {};

  Object.entries(HEADER_ALIASES).forEach(([canonicalKey, aliases]) => {
    const headerIndex = headers.findIndex((header) => aliases.includes(header));
    if (headerIndex >= 0) {
      map[canonicalKey] = headerIndex;
    }
  });

  return map;
}

function getCellValue(cells: string[], index: number | undefined) {
  if (index === undefined || index < 0 || index >= cells.length) return "";
  return cells[index] ?? "";
}

async function parseSpreadsheetFile(file: File): Promise<ParsedSheetRow[]> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  const lowerName = file.name.toLowerCase();

  let rows: string[][] = [];

  if (lowerName.endsWith(".csv")) {
    rows = parseCsv(Buffer.from(uint8Array).toString("utf8"));
  } else {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(uint8Array) as never);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error("The uploaded workbook does not contain any worksheet.");
    }

    rows = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values)
        ? row.values.slice(1).map((value) => normalizeOptionalText(value))
        : [];
      rows.push(values);
    });
  }

  if (rows.length === 0) {
    throw new Error("The uploaded file is empty.");
  }

  const normalizedHeaders = rows[0].map((value) => sanitizeHeader(value));
  const headerIndexMap = resolveHeaderIndexMap(normalizedHeaders);

  if (headerIndexMap.name === undefined) {
    throw new Error("The file must contain a 'name' column.");
  }

  return rows.slice(1).map((cells, index) => ({
    row_number: index + 2,
    values: {
      name: getCellValue(cells, headerIndexMap.name),
      type: getCellValue(cells, headerIndexMap.type),
      strength_value: getCellValue(cells, headerIndexMap.strength_value),
      strength_unit: getCellValue(cells, headerIndexMap.strength_unit),
      salt_composition: getCellValue(cells, headerIndexMap.salt_composition),
      company: getCellValue(cells, headerIndexMap.company),
    },
  }));
}

async function loadExistingMedicinesByNormalizedNames(normalizedNames: string[]) {
  const existing = new Map<string, ExistingMedicineRow>();
  const batchSize = 500;

  for (let index = 0; index < normalizedNames.length; index += batchSize) {
    const batch = normalizedNames.slice(index, index + batchSize);
    if (batch.length === 0) continue;

    const rows = await prisma.$queryRaw<ExistingMedicineRow[]>(
      Prisma.sql`
        SELECT id, name, normalized_name
        FROM medicines_master
        WHERE normalized_name IN (${Prisma.join(batch)})
      `
    );

    rows.forEach((row) => {
      existing.set(row.normalized_name, row);
    });
  }

  return existing;
}

function buildSummary(rows: MedicineImportRow[]): MedicineImportSummary {
  return rows.reduce<MedicineImportSummary>(
    (summary, row) => {
      summary.total_rows += 1;
      summary[row.status] += 1;
      return summary;
    },
    {
      total_rows: 0,
      will_import: 0,
      already_exists: 0,
      duplicate_in_file: 0,
      invalid: 0,
      needs_review: 0,
    }
  );
}

function groupRowsByStatus(rows: MedicineImportRow[]) {
  return rows.reduce<Record<MedicineImportStatus, MedicineImportRow[]>>(
    (groups, row) => {
      groups[row.status].push(row);
      return groups;
    },
    {
      will_import: [],
      already_exists: [],
      duplicate_in_file: [],
      invalid: [],
      needs_review: [],
    }
  );
}

function createBaseRow(parsedRow: ParsedSheetRow): MedicineImportRow {
  const rawName = normalizeOptionalText(parsedRow.values.name);
  const rawType = normalizeOptionalText(parsedRow.values.type);
  const rawStrengthValue = normalizeOptionalText(parsedRow.values.strength_value);
  const rawStrengthUnit = normalizeOptionalText(parsedRow.values.strength_unit);
  const rawSaltComposition = normalizeOptionalText(parsedRow.values.salt_composition);
  const rawCompany = normalizeOptionalText(parsedRow.values.company);

  const name = normalizeNameForStorage(rawName);
  const normalizedName = normalizeMasterName(name);
  const type = normalizeOptionalUpper(rawType);
  const strengthUnit =
    rawStrengthUnit && UNIT_LOOKUP.has(rawStrengthUnit.toUpperCase())
      ? UNIT_LOOKUP.get(rawStrengthUnit.toUpperCase()) || rawStrengthUnit
      : normalizeOptionalText(rawStrengthUnit);
  const strength = composeStrength(rawStrengthValue, strengthUnit);
  const saltComposition = normalizeOptionalUpper(rawSaltComposition);
  const company = normalizeOptionalUpper(rawCompany);

  const reasons: string[] = [];
  let status: MedicineImportStatus = "will_import";

  if (!rawName) {
    status = "invalid";
    reasons.push("Medicine name is blank.");
  } else if (!normalizedName) {
    status = "invalid";
    reasons.push("Medicine name could not be normalized.");
  }

  if (status === "will_import" && rawType && !TYPE_LOOKUP.has(type)) {
    status = "needs_review";
    reasons.push(`Unknown type "${rawType}".`);
  }

  if (
    status === "will_import" &&
    ((rawStrengthValue && !rawStrengthUnit) || (!rawStrengthValue && rawStrengthUnit))
  ) {
    status = "needs_review";
    reasons.push("Strength value and strength unit must both be filled or both be blank.");
  }

  if (status === "will_import" && rawStrengthUnit && !UNIT_LOOKUP.has(rawStrengthUnit.toUpperCase())) {
    status = "needs_review";
    reasons.push(`Unknown strength unit "${rawStrengthUnit}".`);
  }

  return {
    row_number: parsedRow.row_number,
    name,
    normalized_name: normalizedName,
    type: type || null,
    strength: strength || null,
    salt_composition: saltComposition || null,
    company: company || null,
    status,
    reasons,
    source: {
      raw_name: rawName,
      raw_type: rawType,
      raw_strength_value: rawStrengthValue,
      raw_strength_unit: rawStrengthUnit,
      raw_salt_composition: rawSaltComposition,
      raw_company: rawCompany,
    },
  };
}

function classifyRows(rows: MedicineImportRow[], existingByNormalizedName: Map<string, ExistingMedicineRow>) {
  const rowsByNormalized = new Map<string, MedicineImportRow[]>();

  rows.forEach((row) => {
    if (!row.normalized_name) return;
    const current = rowsByNormalized.get(row.normalized_name) ?? [];
    current.push(row);
    rowsByNormalized.set(row.normalized_name, current);
  });

  rowsByNormalized.forEach((groupRows) => {
    if (groupRows.length <= 1) return;

    const distinctNames = new Set(groupRows.map((row) => row.name));
    const distinctSignatures = new Set(
      groupRows.map((row) =>
        [
          row.name,
          row.type ?? "",
          row.strength ?? "",
          row.salt_composition ?? "",
          row.company ?? "",
        ].join("|")
      )
    );

    if (distinctNames.size > 1) {
      const allRowNumbers = groupRows.map((row) => row.row_number).join(", ");
      groupRows.forEach((row) => {
        if (row.status === "invalid") return;
        row.status = "needs_review";
        row.reasons.push(
          `Normalization collision with rows ${allRowNumbers}.`
        );
      });
      return;
    }

    if (distinctSignatures.size >= 1) {
      const [firstRow, ...restRows] = groupRows.sort((left, right) => left.row_number - right.row_number);
      restRows.forEach((row) => {
        if (row.status === "invalid" || row.status === "needs_review") return;
        row.status = "duplicate_in_file";
        row.reasons.push(`Duplicate of row ${firstRow.row_number} in the uploaded file.`);
      });
    }
  });

  rows.forEach((row) => {
    if (row.status === "invalid" || row.status === "needs_review") return;

    const existing = existingByNormalizedName.get(row.normalized_name);
    if (existing) {
      row.status = "already_exists";
      row.reasons.push(
        `Already exists in database as "${existing.name}" (ID ${existing.id}).`
      );
    }
  });

  return rows.sort((left, right) => left.row_number - right.row_number);
}

export async function generateMedicineImportPreview(file: File): Promise<MedicineImportPreview> {
  const parsedRows = await parseSpreadsheetFile(file);
  const baseRows = parsedRows.map(createBaseRow);
  const normalizedNames = Array.from(
    new Set(
      baseRows
        .map((row) => row.normalized_name)
        .filter((value) => Boolean(value))
    )
  );
  const existingByNormalizedName = await loadExistingMedicinesByNormalizedNames(normalizedNames);
  const rows = classifyRows(baseRows, existingByNormalizedName);

  return {
    file_name: file.name,
    generated_at: new Date().toISOString(),
    summary: buildSummary(rows),
    rows,
    groups: groupRowsByStatus(rows),
  };
}

export async function importMedicineRows(input: {
  rows: ImportableMedicineRow[];
  chunkSize?: number;
}) {
  const dedupedRowsMap = new Map<string, ImportableMedicineRow>();

  input.rows.forEach((row) => {
    const name = normalizeNameForStorage(row.name);
    const normalizedName = normalizeMasterName(row.normalized_name || name);
    if (!name || !normalizedName || dedupedRowsMap.has(normalizedName)) return;

    dedupedRowsMap.set(normalizedName, {
      name,
      normalized_name: normalizedName,
      type: row.type ? normalizeOptionalUpper(row.type) : null,
      strength: row.strength ? normalizeOptionalText(row.strength) : null,
      salt_composition: row.salt_composition ? normalizeOptionalUpper(row.salt_composition) : null,
      company: row.company ? normalizeOptionalUpper(row.company) : null,
    });
  });

  const dedupedRows = Array.from(dedupedRowsMap.values());
  const existingBeforeImport = await loadExistingMedicinesByNormalizedNames(
    dedupedRows.map((row) => row.normalized_name)
  );
  const rowsToInsert = dedupedRows.filter(
    (row) => !existingBeforeImport.has(row.normalized_name)
  );

  const chunkSize = Math.min(Math.max(input.chunkSize ?? 500, 1), 1000);
  let insertedCount = 0;

  for (let index = 0; index < rowsToInsert.length; index += chunkSize) {
    const chunk = rowsToInsert.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;

    const valuesSql = Prisma.join(
      chunk.map((row) => Prisma.sql`(
        ${row.name},
        ${row.normalized_name},
        ${"approved"},
        ${null},
        ${0},
        ${row.type},
        ${row.strength},
        ${row.salt_composition},
        ${row.company},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )`)
    );

    const affected = await prisma.$executeRaw(
      Prisma.sql`
        INSERT IGNORE INTO medicines_master (
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
        )
        VALUES ${valuesSql}
      `
    );

    insertedCount += Number(affected || 0);
  }

  return {
    requested_count: dedupedRows.length,
    eligible_count: rowsToInsert.length,
    inserted_count: insertedCount,
    skipped_existing_count: dedupedRows.length - insertedCount,
  };
}

export async function buildMedicineImportReportWorkbook(preview: MedicineImportPreview) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Dapto";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Metric", key: "metric", width: 30 },
    { header: "Value", key: "value", width: 18 },
  ];
  summarySheet.addRows([
    { metric: "File Name", value: preview.file_name },
    { metric: "Generated At", value: preview.generated_at },
    { metric: "Total Rows", value: preview.summary.total_rows },
    { metric: "Will Import", value: preview.summary.will_import },
    { metric: "Already Exists", value: preview.summary.already_exists },
    { metric: "Duplicate In File", value: preview.summary.duplicate_in_file },
    { metric: "Invalid", value: preview.summary.invalid },
    { metric: "Needs Review", value: preview.summary.needs_review },
  ]);

  const sheetConfigs: Array<[string, MedicineImportStatus]> = [
    ["Will Import", "will_import"],
    ["Already Exists", "already_exists"],
    ["Duplicate In File", "duplicate_in_file"],
    ["Invalid", "invalid"],
    ["Needs Review", "needs_review"],
  ];

  sheetConfigs.forEach(([sheetName, status]) => {
    const sheet = workbook.addWorksheet(sheetName);
    sheet.columns = [
      { header: "Row Number", key: "row_number", width: 12 },
      { header: "Name", key: "name", width: 28 },
      { header: "Normalized Name", key: "normalized_name", width: 24 },
      { header: "Type", key: "type", width: 16 },
      { header: "Strength", key: "strength", width: 18 },
      { header: "Salt Composition", key: "salt_composition", width: 48 },
      { header: "Company", key: "company", width: 28 },
      { header: "Status", key: "status", width: 18 },
      { header: "Reasons", key: "reasons", width: 64 },
      { header: "Raw Name", key: "raw_name", width: 28 },
      { header: "Raw Type", key: "raw_type", width: 18 },
      { header: "Raw Strength Value", key: "raw_strength_value", width: 20 },
      { header: "Raw Strength Unit", key: "raw_strength_unit", width: 20 },
      { header: "Raw Salt Composition", key: "raw_salt_composition", width: 48 },
      { header: "Raw Company", key: "raw_company", width: 28 },
    ];

    preview.groups[status].forEach((row) => {
      sheet.addRow({
        row_number: row.row_number,
        name: row.name,
        normalized_name: row.normalized_name,
        type: row.type,
        strength: row.strength,
        salt_composition: row.salt_composition,
        company: row.company,
        status: row.status,
        reasons: row.reasons.join(" | "),
        raw_name: row.source.raw_name,
        raw_type: row.source.raw_type,
        raw_strength_value: row.source.raw_strength_value,
        raw_strength_unit: row.source.raw_strength_unit,
        raw_salt_composition: row.source.raw_salt_composition,
        raw_company: row.source.raw_company,
      });
    });
  });

  return workbook;
}

export const medicineImportOptions = {
  typeOptions: [...MEDICINE_TYPE_OPTIONS],
  strengthUnitOptions: [...STRENGTH_UNIT_OPTIONS],
};
