"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCcw,
  Search,
  Upload,
  XCircle,
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { PremiumTable } from "@/components/ui/PremiumTable";

type MedicineImportStatus =
  | "will_import"
  | "already_exists"
  | "duplicate_in_file"
  | "invalid"
  | "needs_review";

type MedicineImportRow = {
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

type MedicineImportSummary = {
  total_rows: number;
  will_import: number;
  already_exists: number;
  duplicate_in_file: number;
  invalid: number;
  needs_review: number;
};

type MedicineImportPreview = {
  file_name: string;
  generated_at: string;
  summary: MedicineImportSummary;
  rows: MedicineImportRow[];
  groups: Record<MedicineImportStatus, MedicineImportRow[]>;
};

type ImportResult = {
  requested_count: number;
  eligible_count: number;
  inserted_count: number;
  skipped_existing_count: number;
};

const TAB_CONFIG: Array<{
  key: MedicineImportStatus;
  label: string;
  tone: string;
}> = [
  { key: "will_import", label: "Will Import", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { key: "already_exists", label: "Already Exists", tone: "bg-sky-50 text-sky-700 border-sky-200" },
  { key: "duplicate_in_file", label: "Duplicate In File", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "invalid", label: "Invalid", tone: "bg-rose-50 text-rose-700 border-rose-200" },
  { key: "needs_review", label: "Needs Review", tone: "bg-orange-50 text-orange-700 border-orange-200" },
];

function formatStatusLabel(status: MedicineImportStatus) {
  return TAB_CONFIG.find((item) => item.key === status)?.label ?? status;
}

export default function AdminMedicineImportPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MedicineImportPreview | null>(null);
  const [activeTab, setActiveTab] = useState<MedicineImportStatus>("will_import");
  const [search, setSearch] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const currentTabRows = useMemo(() => {
    const baseRows = preview?.groups[activeTab] ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return baseRows;

    return baseRows.filter((row) =>
      [
        row.name,
        row.normalized_name,
        row.type ?? "",
        row.strength ?? "",
        row.salt_composition ?? "",
        row.company ?? "",
        row.reasons.join(" "),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [activeTab, preview, search]);

  const summaryCards = useMemo(
    () =>
      preview
        ? [
            {
              label: "Total Rows",
              value: preview.summary.total_rows,
              tone: "text-gray-900",
              icon: <FileSpreadsheet className="h-5 w-5 text-indigo-600" />,
            },
            {
              label: "Will Import",
              value: preview.summary.will_import,
              tone: "text-emerald-700",
              icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
            },
            {
              label: "Already Exists",
              value: preview.summary.already_exists,
              tone: "text-sky-700",
              icon: <RefreshCcw className="h-5 w-5 text-sky-600" />,
            },
            {
              label: "Duplicate In File",
              value: preview.summary.duplicate_in_file,
              tone: "text-amber-700",
              icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
            },
            {
              label: "Invalid",
              value: preview.summary.invalid,
              tone: "text-rose-700",
              icon: <XCircle className="h-5 w-5 text-rose-600" />,
            },
            {
              label: "Needs Review",
              value: preview.summary.needs_review,
              tone: "text-orange-700",
              icon: <AlertTriangle className="h-5 w-5 text-orange-600" />,
            },
          ]
        : [],
    [preview]
  );

  const tableColumns = [
    {
      header: "Row / Name",
      accessorKey: (row: MedicineImportRow) => (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            Row {row.row_number}
          </div>
          <div className="font-semibold text-gray-900">{row.name || "—"}</div>
          <div className="text-xs text-gray-500">{row.normalized_name || "—"}</div>
        </div>
      ),
    },
    {
      header: "Details",
      accessorKey: (row: MedicineImportRow) => (
        <div className="space-y-1">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Type</span>
            <div className="text-sm text-gray-700">{row.type || "—"}</div>
          </div>
          <div>
            <span className="text-xs font-medium uppercase tracking-wide text-gray-400">Strength</span>
            <div className="text-sm text-gray-700">{row.strength || "—"}</div>
          </div>
        </div>
      ),
    },
    {
      header: "Salt / Company",
      accessorKey: (row: MedicineImportRow) => (
        <div className="space-y-1">
          <div className="text-sm text-gray-700">{row.salt_composition || "—"}</div>
          <div className="text-xs text-gray-500">{row.company || "—"}</div>
        </div>
      ),
    },
    {
      header: "Status",
      accessorKey: (row: MedicineImportRow) => {
        const tone =
          TAB_CONFIG.find((item) => item.key === row.status)?.tone ??
          "bg-gray-50 text-gray-700 border-gray-200";
        return (
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
            {formatStatusLabel(row.status)}
          </span>
        );
      },
    },
    {
      header: "Reason",
      accessorKey: (row: MedicineImportRow) => (
        <div className="max-w-md text-sm text-gray-700">
          {row.reasons.length > 0 ? row.reasons.join(" ") : "Ready to import."}
        </div>
      ),
    },
  ];

  const handleGeneratePreview = async () => {
    if (!selectedFile) {
      setError("Please choose an .xlsx or .csv file first.");
      return;
    }

    setLoadingPreview(true);
    setError("");
    setSuccessMessage("");
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await fetch("/api/admin/medicines/import/preview", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as {
        preview?: MedicineImportPreview;
        error?: string;
      };

      if (!response.ok || !data.preview) {
        throw new Error(data.error || "Could not generate preview.");
      }

      setPreview(data.preview);
      setActiveTab("will_import");
      setSearch("");
      setSuccessMessage("Preview generated. No medicines have been inserted yet.");
    } catch (fetchError) {
      setPreview(null);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "Could not generate preview."
      );
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!preview) return;

    setDownloadingReport(true);
    setError("");

    try {
      const response = await fetch("/api/admin/medicines/import/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ preview }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Could not download report.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${preview.file_name.replace(/\.[^.]+$/, "") || "medicine_import"}_preview_report.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : "Could not download report."
      );
    } finally {
      setDownloadingReport(false);
    }
  };

  const handleImport = async () => {
    if (!preview || preview.groups.will_import.length === 0) {
      setShowConfirmModal(false);
      return;
    }

    setImporting(true);
    setError("");

    try {
      const response = await fetch("/api/admin/medicines/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: preview.groups.will_import.map((row) => ({
            name: row.name,
            normalized_name: row.normalized_name,
            type: row.type,
            strength: row.strength,
            salt_composition: row.salt_composition,
            company: row.company,
          })),
        }),
      });

      const data = (await response.json()) as {
        result?: ImportResult;
        error?: string;
      };

      if (!response.ok || !data.result) {
        throw new Error(data.error || "Could not import medicines.");
      }

      setImportResult(data.result);
      setSuccessMessage(
        `Import completed. ${data.result.inserted_count} new medicines were inserted.`
      );
      setShowConfirmModal(false);
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Could not import medicines."
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            Medicine Bulk Import
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-gray-600 sm:text-base">
            Upload a medicine `.xlsx` or `.csv`, generate a read-only preview, review invalid or duplicate rows,
            and import only the rows marked as <span className="font-semibold text-emerald-700">Will Import</span>.
          </p>
        </div>
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
          <div className="font-semibold">Preview is read-only</div>
          <div>No database rows are inserted until you confirm the final import.</div>
        </div>
      </div>

      <GlassCard className="space-y-5 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex-1">
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              1. Upload the `.xlsx` or `.csv`
            </label>
            <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
              <input
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => {
                  const nextFile = event.target.files?.[0] ?? null;
                  setSelectedFile(nextFile);
                  setPreview(null);
                  setImportResult(null);
                  setSuccessMessage("");
                  setError("");
                }}
                className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-xl file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-indigo-700"
              />
              <p className="mt-3 text-xs text-gray-500">
                Required column: <span className="font-semibold">name</span>. Optional columns:
                <span className="font-semibold"> type, strength value, strength unit, salt composition, company</span>.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <PremiumButton
              variant="primary"
              className="bg-slate-900 text-white shadow-lg shadow-slate-900/25 hover:bg-slate-800 hover:shadow-slate-900/35"
              onClick={handleGeneratePreview}
              isLoading={loadingPreview}
              icon={Upload}
            >
              2. Generate Preview
            </PremiumButton>
            <PremiumButton
              variant="primary"
              className="bg-green-700 text-white shadow-lg shadow-green-900/25 hover:bg-green-600 hover:shadow-green-900/35"
              onClick={() => setShowConfirmModal(true)}
              disabled={!preview || preview.summary.will_import === 0 || importResult !== null}
              icon={CheckCircle2}
            >
              3. Import Valid Rows
            </PremiumButton>
          </div>
        </div>

        {selectedFile ? (
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
            Selected file: <span className="font-semibold text-gray-900">{selectedFile.name}</span>
          </div>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        {importResult ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Requested</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{importResult.requested_count}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Eligible</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{importResult.eligible_count}</div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Inserted</div>
              <div className="mt-1 text-2xl font-bold text-emerald-700">{importResult.inserted_count}</div>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-sky-600">Skipped Existing</div>
              <div className="mt-1 text-2xl font-bold text-sky-700">{importResult.skipped_existing_count}</div>
            </div>
          </div>
        ) : null}
      </GlassCard>

      {preview ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {summaryCards.map((card) => (
              <GlassCard key={card.label} className="p-5" hoverEffect={false}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {card.label}
                    </div>
                    <div className={`mt-2 text-3xl font-bold ${card.tone}`}>{card.value}</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 p-3">{card.icon}</div>
                </div>
              </GlassCard>
            ))}
          </div>

          <GlassCard className="space-y-5 p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Preview Results</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Generated from <span className="font-semibold">{preview.file_name}</span> on{" "}
                  {new Date(preview.generated_at).toLocaleString("en-IN", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search preview rows"
                    className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm text-gray-700 outline-none transition focus:border-indigo-400 sm:w-72"
                  />
                </div>
                <PremiumButton
                  variant="primary"
                  className="bg-slate-900 text-white shadow-lg shadow-slate-900/25 hover:bg-slate-800 hover:shadow-slate-900/35"
                  onClick={handleDownloadReport}
                  isLoading={downloadingReport}
                  icon={Download}
                >
                  Download Report
                </PremiumButton>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {TAB_CONFIG.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? `${tab.tone} shadow-sm`
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900"
                  }`}
                >
                  {tab.label} ({preview.summary[tab.key]})
                </button>
              ))}
            </div>

            <PremiumTable columns={tableColumns} data={currentTabRows} />
          </GlassCard>
        </>
      ) : null}

      {showConfirmModal && preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-amber-50 p-3 text-amber-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Confirm Medicine Import</h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  This will insert <span className="font-semibold text-gray-900">{preview.summary.will_import}</span>{" "}
                  new medicines into the master table. Rows marked as <span className="font-semibold">Needs Review</span>,
                  <span className="font-semibold"> Invalid</span>, <span className="font-semibold">Duplicate In File</span>,
                  and <span className="font-semibold">Already Exists</span> will not be imported.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              Final safety check: the backend will validate again during import, so rows that became duplicates after preview will still be skipped safely.
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <PremiumButton
                variant="ghost"
                onClick={() => setShowConfirmModal(false)}
                disabled={importing}
              >
                Cancel
              </PremiumButton>
              <PremiumButton
                variant="success"
                onClick={handleImport}
                isLoading={importing}
                icon={CheckCircle2}
              >
                Confirm Import
              </PremiumButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
