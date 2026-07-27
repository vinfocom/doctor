import ExcelJS from "exceljs";
import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/prisma";
import {
  collapseSpaces,
  normalizeDisplayName,
  normalizeMasterName,
} from "@/lib/emr/normalization";

const HEADER_ALIASES: Record<string, string[]> = {
  name: ["name", "diagnosis name", "diagnosis_name", "diagnosis", "dx"],
};

export type DiagnosisImportStatus =
  | "will_import"
  | "already_exists"
  | "duplicate_in_file"
  | "invalid"
  | "needs_review";

export type DiagnosisImportRow = {
  row_number: number;
  name: string;
  normalized_name: string;
  status: DiagnosisImportStatus;
  reasons: string[];
  source: {
    raw_name: string;
  };
};

export type DiagnosisImportSummary = {
  total_rows: number;
  will_import: number;
  already_exists: number;
  duplicate_in_file: number;
  invalid: number;
  needs_review: number;
};

export type DiagnosisImportPreview = {
  file_name: string;
  generated_at: string;
  summary: DiagnosisImportSummary;
  rows: DiagnosisImportRow[];
  groups: Record<DiagnosisImportStatus, DiagnosisImportRow[]>;
};

type ParsedSheetRow = {
  row_number: number;
  values: Record<string, string>;
};

type ExistingDiagnosisRow = {
  id: number;
  name: string;
  normalized_name: string;
  status: "pending" | "approved" | "rejected";
};

type ImportableDiagnosisRow = Pick<DiagnosisImportRow, "name" | "normalized_name">;

function sanitizeHeader(value: unknown) {
  return normalizeDisplayName(String(value ?? ""))
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeNameForStorage(value: unknown) {
  return collapseSpaces(String(value ?? "").trim()).toUpperCase();
}

function normalizeOptionalText(value: unknown) {
  const trimmed = collapseSpaces(String(value ?? "").trim());
  return trimmed || "";
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
    },
  }));
}

async function loadExistingDiagnosisByNormalizedNames(normalizedNames: string[]) {
  const existing = new Map<string, ExistingDiagnosisRow>();
  const batchSize = 500;

  for (let index = 0; index < normalizedNames.length; index += batchSize) {
    const batch = normalizedNames.slice(index, index + batchSize);
    if (batch.length === 0) continue;

    const rows = await prisma.$queryRaw<ExistingDiagnosisRow[]>(
      Prisma.sql`
        SELECT id, name, normalized_name, status
        FROM diagnosis_master
        WHERE normalized_name IN (${Prisma.join(batch)})
      `
    );

    rows.forEach((row) => {
      existing.set(row.normalized_name, row);
    });
  }

  return existing;
}

function buildSummary(rows: DiagnosisImportRow[]): DiagnosisImportSummary {
  return rows.reduce<DiagnosisImportSummary>(
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

function groupRowsByStatus(rows: DiagnosisImportRow[]) {
  return rows.reduce<Record<DiagnosisImportStatus, DiagnosisImportRow[]>>(
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

function createBaseRow(parsedRow: ParsedSheetRow): DiagnosisImportRow {
  const rawName = normalizeOptionalText(parsedRow.values.name);
  const name = normalizeNameForStorage(rawName);
  const normalizedName = normalizeMasterName(name);

  const reasons: string[] = [];
  let status: DiagnosisImportStatus = "will_import";

  if (!rawName) {
    status = "invalid";
    reasons.push("Diagnosis name is blank.");
  } else if (!normalizedName) {
    status = "invalid";
    reasons.push("Diagnosis name could not be normalized.");
  } else if (name.length > 255) {
    status = "invalid";
    reasons.push("Diagnosis name exceeds the 255 character limit.");
  }

  return {
    row_number: parsedRow.row_number,
    name,
    normalized_name: normalizedName,
    status,
    reasons,
    source: {
      raw_name: rawName,
    },
  };
}

function classifyRows(
  rows: DiagnosisImportRow[],
  existingByNormalizedName: Map<string, ExistingDiagnosisRow>
) {
  const rowsByNormalized = new Map<string, DiagnosisImportRow[]>();

  rows.forEach((row) => {
    if (!row.normalized_name) return;
    const current = rowsByNormalized.get(row.normalized_name) ?? [];
    current.push(row);
    rowsByNormalized.set(row.normalized_name, current);
  });

  rowsByNormalized.forEach((groupRows) => {
    if (groupRows.length <= 1) return;

    const distinctNames = new Set(groupRows.map((row) => row.name));
    if (distinctNames.size > 1) {
      const allRowNumbers = groupRows.map((row) => row.row_number).join(", ");
      groupRows.forEach((row) => {
        if (row.status === "invalid") return;
        row.status = "needs_review";
        row.reasons.push(`Normalization collision with rows ${allRowNumbers}.`);
      });
      return;
    }

    const [firstRow, ...restRows] = groupRows.sort(
      (left, right) => left.row_number - right.row_number
    );
    restRows.forEach((row) => {
      if (row.status === "invalid" || row.status === "needs_review") return;
      row.status = "duplicate_in_file";
      row.reasons.push(`Duplicate of row ${firstRow.row_number} in the uploaded file.`);
    });
  });

  rows.forEach((row) => {
    if (row.status === "invalid" || row.status === "needs_review") return;

    const existing = existingByNormalizedName.get(row.normalized_name);
    if (!existing) return;

    if (existing.status === "approved") {
      row.status = "already_exists";
      row.reasons.push(
        `Already exists in database as approved diagnosis "${existing.name}" (ID ${existing.id}).`
      );
      return;
    }

    row.status = "needs_review";
    row.reasons.push(
      `Matches existing ${existing.status} diagnosis "${existing.name}" (ID ${existing.id}).`
    );
  });

  return rows.sort((left, right) => left.row_number - right.row_number);
}

export async function generateDiagnosisImportPreview(
  file: File
): Promise<DiagnosisImportPreview> {
  const parsedRows = await parseSpreadsheetFile(file);
  const baseRows = parsedRows.map(createBaseRow);
  const normalizedNames = Array.from(
    new Set(baseRows.map((row) => row.normalized_name).filter(Boolean))
  );
  const existingByNormalizedName = await loadExistingDiagnosisByNormalizedNames(
    normalizedNames
  );
  const rows = classifyRows(baseRows, existingByNormalizedName);

  return {
    file_name: file.name,
    generated_at: new Date().toISOString(),
    summary: buildSummary(rows),
    rows,
    groups: groupRowsByStatus(rows),
  };
}

export async function importDiagnosisRows(input: {
  rows: ImportableDiagnosisRow[];
  chunkSize?: number;
}) {
  const dedupedRowsMap = new Map<string, ImportableDiagnosisRow>();

  input.rows.forEach((row) => {
    const name = normalizeNameForStorage(row.name);
    const normalizedName = normalizeMasterName(row.normalized_name || name);
    if (!name || !normalizedName || dedupedRowsMap.has(normalizedName)) return;

    dedupedRowsMap.set(normalizedName, {
      name,
      normalized_name: normalizedName,
    });
  });

  const dedupedRows = Array.from(dedupedRowsMap.values());
  const existingBeforeImport = await loadExistingDiagnosisByNormalizedNames(
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
      chunk.map(
        (row) => Prisma.sql`(
          ${row.name},
          ${row.normalized_name},
          ${"approved"},
          ${null},
          ${0},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )`
      )
    );

    const affected = await prisma.$executeRaw(
      Prisma.sql`
        INSERT IGNORE INTO diagnosis_master (
          name,
          normalized_name,
          status,
          created_by_doctor_id,
          usage_count,
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

export async function buildDiagnosisImportReportWorkbook(
  preview: DiagnosisImportPreview
) {
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

  const sheetConfigs: Array<[string, DiagnosisImportStatus]> = [
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
      { header: "Name", key: "name", width: 36 },
      { header: "Normalized Name", key: "normalized_name", width: 28 },
      { header: "Status", key: "status", width: 18 },
      { header: "Reasons", key: "reasons", width: 72 },
      { header: "Raw Name", key: "raw_name", width: 36 },
    ];

    preview.groups[status].forEach((row) => {
      sheet.addRow({
        row_number: row.row_number,
        name: row.name,
        normalized_name: row.normalized_name,
        status: row.status,
        reasons: row.reasons.join(" | "),
        raw_name: row.source.raw_name,
      });
    });
  });

  return workbook;
}
