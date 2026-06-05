"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Eye,
  FileImage,
  GripVertical,
  Info,
  Loader2,
  Plus,
  Save,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import type {
  EmrLayoutCustomField,
  EmrLayoutMarginConfig,
  EmrPrintPaperPreset,
  EmrLayoutSectionKey,
  EmrLayoutSettings,
} from "@/lib/emr";

type ScopeClinic = {
  clinic_id: number;
  clinic_name: string | null;
};

type ScopeDoctor = {
  doctor_id: number;
  doctor_name: string | null;
} | null;

type LayoutSettingsResponse = {
  settings: EmrLayoutSettings;
  defaults: EmrLayoutSettings;
  scope: {
    doctor: ScopeDoctor;
    clinics: ScopeClinic[];
  };
};

type Props = {
  role: "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
  doctorId?: number;
  title: string;
  subtitle: string;
};

const SECTION_LABELS: Record<EmrLayoutSectionKey, string> = {
  vitals: "Vitals",
  complaints: "Complaints",
  diagnosis: "Diagnosis",
  examination_findings: "Examination Findings",
  investigation_findings: "Investigation Findings",
  past_medical_history: "Past Medical History",
  family_history: "Family History",
  surgical_history: "Surgical History",
  treatment_history: "Treatment History",
  allergies: "Allergies",
  personal_social_history: "Personal / Social History",
  medicines: "Medicines",
  advice: "Advice",
  tests: "Tests Requested",
  next_visit: "Next Visit",
};

const MARGIN_KEYS = ["top", "right", "bottom", "left"] as const;
const RESERVED_SPACE_KEYS = [
  "header_space",
  "footer_space",
  "left_strip_space",
  "right_strip_space",
] as const;

const PAPER_PRESET_OPTIONS: Array<{
  value: EmrPrintPaperPreset;
  label: string;
}> = [
  { value: "blank_a4", label: "Blank A4 / Content Only" },
  { value: "header_footer", label: "Header + Footer" },
  { value: "header_left_strip", label: "Header + Left Strip" },
  { value: "header_right_strip", label: "Header + Right Strip" },
  { value: "header_footer_left_strip", label: "Header + Footer + Left Strip" },
  { value: "header_footer_right_strip", label: "Header + Footer + Right Strip" },
  { value: "header_footer_left_right_strip", label: "Header + Footer + Left + Right Strip" },
  { value: "header_only", label: "Header Only" },
  { value: "custom", label: "Custom" },
];

const FONT_FAMILY_OPTIONS = [
  { value: "Georgia, serif", label: "Georgia" },
  { value: "\"Times New Roman\", serif", label: "Times New Roman" },
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "Helvetica, sans-serif", label: "Helvetica" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Tahoma, sans-serif", label: "Tahoma" },
  { value: "\"Trebuchet MS\", sans-serif", label: "Trebuchet MS" },
  { value: "\"Courier New\", monospace", label: "Courier New" },
];

const PRESCRIPTION_VALIDITY_UNIT_OPTIONS = [
  { value: "day", label: "Days" },
  { value: "week", label: "Weeks" },
  { value: "month", label: "Months" },
  { value: "year", label: "Years" },
] as const;

function InfoHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full text-gray-400 hover:text-indigo-600"
    >
      <Info size={14} />
    </span>
  );
}

function FieldLabel({
  label,
  hint,
  className = "",
}: {
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium text-gray-500 ${className}`.trim()}>
      {label}
      {hint ? <InfoHint text={hint} /> : null}
    </span>
  );
}

const PAPER_PRESET_SPACES: Record<
  Exclude<EmrPrintPaperPreset, "custom">,
  Pick<
    EmrLayoutMarginConfig,
    "header_space" | "footer_space" | "left_strip_space" | "right_strip_space"
  >
> = {
  blank_a4: {
    header_space: "0mm",
    footer_space: "0mm",
    left_strip_space: "0mm",
    right_strip_space: "0mm",
  },
  header_footer: {
    header_space: "28mm",
    footer_space: "18mm",
    left_strip_space: "0mm",
    right_strip_space: "0mm",
  },
  header_left_strip: {
    header_space: "28mm",
    footer_space: "0mm",
    left_strip_space: "18mm",
    right_strip_space: "0mm",
  },
  header_right_strip: {
    header_space: "28mm",
    footer_space: "0mm",
    left_strip_space: "0mm",
    right_strip_space: "18mm",
  },
  header_footer_left_strip: {
    header_space: "28mm",
    footer_space: "18mm",
    left_strip_space: "18mm",
    right_strip_space: "0mm",
  },
  header_footer_right_strip: {
    header_space: "28mm",
    footer_space: "18mm",
    left_strip_space: "0mm",
    right_strip_space: "18mm",
  },
  header_footer_left_right_strip: {
    header_space: "28mm",
    footer_space: "18mm",
    left_strip_space: "18mm",
    right_strip_space: "18mm",
  },
  header_only: {
    header_space: "28mm",
    footer_space: "0mm",
    left_strip_space: "0mm",
    right_strip_space: "0mm",
  },
};

function hasVisibleSpace(value: string | null | undefined) {
  if (!value) return false;
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0;
}

function buildQuery(doctorId?: number, clinicId?: number | null) {
  const params = new URLSearchParams();
  if (doctorId) params.set("doctorId", String(doctorId));
  if (clinicId) params.set("clinicId", String(clinicId));
  return params.toString();
}

function cloneSettings(settings: EmrLayoutSettings): EmrLayoutSettings {
  return JSON.parse(JSON.stringify(settings)) as EmrLayoutSettings;
}

function buildCustomFieldKey(label: string, fallback: string) {
  const normalized = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");

  return normalized || fallback;
}

function normalizeCustomFieldLabel(label: string, fallback: string) {
  const normalized = label.trim().toUpperCase();
  return normalized || fallback;
}

function AssetField({
  label,
  value,
  accept,
  uploadPath,
  uploadType,
  onChange,
}: {
  label: string;
  value: string | null;
  accept: string;
  uploadPath: string;
  uploadType?: string;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    if (uploadType) {
      formData.append("type", uploadType);
    }

    setUploading(true);
    setError("");

    try {
      const res = await fetch(uploadPath, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Upload failed");
      }
      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  return (
    <div className="space-y-2 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">Used in print/PDF-ready prescription view</p>
        </div>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            Remove
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-indigo-700 hover:bg-indigo-50"
          >
            <Eye size={14} />
            Preview uploaded asset
          </a>
        ) : (
          <span className="text-sm text-gray-400">No asset uploaded yet</span>
        )}
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
          {uploading ? "Uploading..." : value ? "Replace" : "Upload"}
        </button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleUpload(file);
          }
        }}
      />
    </div>
  );
}

type PreprintedGuideMargins = {
  headerSpaceMm: number;
  footerSpaceMm: number;
  leftStripSpaceMm: number;
  rightStripSpaceMm: number;
};

type GuideSide = "header" | "footer" | "left" | "right";

function roundDetectedMm(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const rounded = Math.round(value * 2) / 2;
  return rounded < 2 ? 0 : rounded;
}

function mmLabel(value: number) {
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}mm`;
}

function buildGuideMargins(
  source?: Partial<PreprintedGuideMargins> | null
): PreprintedGuideMargins {
  return {
    headerSpaceMm: roundDetectedMm(source?.headerSpaceMm ?? 0),
    footerSpaceMm: roundDetectedMm(source?.footerSpaceMm ?? 0),
    leftStripSpaceMm: roundDetectedMm(source?.leftStripSpaceMm ?? 0),
    rightStripSpaceMm: roundDetectedMm(source?.rightStripSpaceMm ?? 0),
  };
}

function suggestPaperPresetFromMargins(margins: PreprintedGuideMargins): EmrPrintPaperPreset {
  const hasHeader = margins.headerSpaceMm > 0;
  const hasFooter = margins.footerSpaceMm > 0;
  const hasLeft = margins.leftStripSpaceMm > 0;
  const hasRight = margins.rightStripSpaceMm > 0;

  if (hasHeader && hasFooter && hasLeft && hasRight) {
    return "header_footer_left_right_strip";
  }
  if (hasHeader && hasFooter && hasLeft) {
    return "header_footer_left_strip";
  }
  if (hasHeader && hasFooter && hasRight) {
    return "header_footer_right_strip";
  }
  if (hasHeader && hasLeft) {
    return "header_left_strip";
  }
  if (hasHeader && hasRight) {
    return "header_right_strip";
  }
  if (hasHeader && hasFooter) {
    return "header_footer";
  }
  if (hasHeader) {
    return "header_only";
  }

  return "blank_a4";
}

function PreprintedScanCalibrationField({
  value,
  uploadPath,
  uploadType,
  onChange,
  onApplyGuideMargins,
}: {
  value: string | null;
  uploadPath: string;
  uploadType?: string;
  onChange: (url: string | null) => void;
  onApplyGuideMargins: (margins: PreprintedGuideMargins) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [guideMargins, setGuideMargins] = useState<PreprintedGuideMargins>(
    buildGuideMargins()
  );
  const guideMarginsRef = useRef<PreprintedGuideMargins>(buildGuideMargins());
  const [activeGuide, setActiveGuide] = useState<GuideSide | null>(null);

  useEffect(() => {
    if (!value) {
      setGuideMargins(buildGuideMargins());
      guideMarginsRef.current = buildGuideMargins();
      setError("");
    }
  }, [value]);

  useEffect(() => {
    if (!activeGuide) return;

    const handleMouseMove = (event: MouseEvent) => {
      const previewElement = previewRef.current;
      if (!previewElement) return;

      const rect = previewElement.getBoundingClientRect();
      const maxVerticalMm = 297 * 0.45;
      const maxHorizontalMm = 210 * 0.45;
      let nextGuides = guideMarginsRef.current;

      if (activeGuide === "header" || activeGuide === "footer") {
        const relativeY =
          activeGuide === "header"
            ? event.clientY - rect.top
            : rect.bottom - event.clientY;
        const nextMm = roundDetectedMm(
          Math.min(
            maxVerticalMm,
            Math.max(0, (relativeY / Math.max(rect.height, 1)) * 297)
          )
        );
        nextGuides = buildGuideMargins({
          ...guideMarginsRef.current,
          [activeGuide === "header" ? "headerSpaceMm" : "footerSpaceMm"]: nextMm,
        });
      } else {
        const relativeX =
          activeGuide === "left"
            ? event.clientX - rect.left
            : rect.right - event.clientX;
        const nextMm = roundDetectedMm(
          Math.min(
            maxHorizontalMm,
            Math.max(0, (relativeX / Math.max(rect.width, 1)) * 210)
          )
        );
        nextGuides = buildGuideMargins({
          ...guideMarginsRef.current,
          [activeGuide === "left" ? "leftStripSpaceMm" : "rightStripSpaceMm"]: nextMm,
        });
      }

      guideMarginsRef.current = nextGuides;
      setGuideMargins(nextGuides);
    };

    const handleMouseUp = () => {
      onApplyGuideMargins(guideMarginsRef.current);
      setActiveGuide(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp, { once: true });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [activeGuide, onApplyGuideMargins]);

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    if (uploadType) {
      formData.append("type", uploadType);
    }

    setUploading(true);
    setError("");

    try {
      const response = await fetch(uploadPath, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error || "Upload failed");
      }

      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const overlayStyles = {
    header: { height: `${(guideMargins.headerSpaceMm / 297) * 100}%` },
    footer: { height: `${(guideMargins.footerSpaceMm / 297) * 100}%` },
    left: { width: `${(guideMargins.leftStripSpaceMm / 210) * 100}%` },
    right: { width: `${(guideMargins.rightStripSpaceMm / 210) * 100}%` },
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
            Preprinted A4 Scan Calibration
            <InfoHint text="Upload a clean full-page A4 scan of the prescription sheet, then drag the top, bottom, left, and right guides to match the printed areas. The guide values are converted into mm." />
          </p>
          <p className="text-xs text-gray-500">
            Upload a straight PNG or JPG scan, then drag the four guide lines to set the reserved print areas.
          </p>
          <p className="text-xs text-gray-500">
            Recommended upload: PNG or JPG, portrait A4 ratio. Best: 2480 x 3508 px (300 DPI). Minimum: 1240 x 1754 px.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {value ? (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
            >
              Remove scan
            </button>
          ) : null}
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
            {uploading ? "Uploading..." : value ? "Replace scan" : "Upload scan"}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleUpload(file);
          }
        }}
      />

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {value ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-3">
            <div
              ref={previewRef}
              className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50"
            >
              <img
                src={value}
                alt="Uploaded prescription scan"
                className="block w-full"
              />
              <div className="pointer-events-none absolute inset-0">
                {guideMargins.headerSpaceMm > 0 ? (
                  <div
                    className="absolute inset-x-0 top-0 border-b border-cyan-500 bg-cyan-400/20"
                    style={overlayStyles.header}
                  />
                ) : null}
                {guideMargins.footerSpaceMm > 0 ? (
                  <div
                    className="absolute inset-x-0 bottom-0 border-t border-emerald-500 bg-emerald-400/20"
                    style={overlayStyles.footer}
                  />
                ) : null}
                {guideMargins.leftStripSpaceMm > 0 ? (
                  <div
                    className="absolute inset-y-0 left-0 border-r border-violet-500 bg-violet-400/20"
                    style={overlayStyles.left}
                  />
                ) : null}
                {guideMargins.rightStripSpaceMm > 0 ? (
                  <div
                    className="absolute inset-y-0 right-0 border-l border-amber-500 bg-amber-400/20"
                    style={overlayStyles.right}
                  />
                ) : null}
              </div>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setActiveGuide("header");
                }}
                className="absolute inset-x-0 z-10 h-4 -translate-y-1/2 cursor-row-resize"
                style={{ top: `${(guideMargins.headerSpaceMm / 297) * 100}%` }}
                aria-label="Drag header guide"
                title="Drag header guide"
              >
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-cyan-600" />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-cyan-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  H {mmLabel(guideMargins.headerSpaceMm)}
                </span>
              </button>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setActiveGuide("footer");
                }}
                className="absolute inset-x-0 z-10 h-4 translate-y-1/2 cursor-row-resize"
                style={{ bottom: `${(guideMargins.footerSpaceMm / 297) * 100}%` }}
                aria-label="Drag footer guide"
                title="Drag footer guide"
              >
                <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-600" />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  F {mmLabel(guideMargins.footerSpaceMm)}
                </span>
              </button>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setActiveGuide("left");
                }}
                className="absolute inset-y-0 z-10 w-4 -translate-x-1/2 cursor-col-resize"
                style={{ left: `${(guideMargins.leftStripSpaceMm / 210) * 100}%` }}
                aria-label="Drag left guide"
                title="Drag left guide"
              >
                <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-violet-600" />
                <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  L {mmLabel(guideMargins.leftStripSpaceMm)}
                </span>
              </button>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  setActiveGuide("right");
                }}
                className="absolute inset-y-0 z-10 w-4 translate-x-1/2 cursor-col-resize"
                style={{ right: `${(guideMargins.rightStripSpaceMm / 210) * 100}%` }}
                aria-label="Drag right guide"
                title="Drag right guide"
              >
                <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-amber-600" />
                <span className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  R {mmLabel(guideMargins.rightStripSpaceMm)}
                </span>
              </button>
            </div>
            <p className="text-xs text-gray-500">
              The colored overlays show the current reserved print areas. Drag any guide line to set the mm values manually.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Current guide values</p>
            <dl className="mt-3 space-y-2 text-sm text-gray-700">
              <div className="flex items-center justify-between gap-3">
                <dt>Header</dt>
                <dd>{mmLabel(guideMargins.headerSpaceMm)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Footer</dt>
                <dd>{mmLabel(guideMargins.footerSpaceMm)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Left strip</dt>
                <dd>{mmLabel(guideMargins.leftStripSpaceMm)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt>Right strip</dt>
                <dd>{mmLabel(guideMargins.rightStripSpaceMm)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-2 text-xs uppercase tracking-wide text-gray-500">
                <dt>Guide preset</dt>
                <dd>
                  {PAPER_PRESET_OPTIONS.find(
                    (option) =>
                      option.value === suggestPaperPresetFromMargins(guideMargins)
                  )?.label ?? suggestPaperPresetFromMargins(guideMargins)}
                </dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => onApplyGuideMargins(guideMargins)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              <Check size={14} />
              Apply current guide values
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CustomFieldEditorCard({
  draftField,
  index,
  onChange,
  onRemove,
}: {
  draftField: EmrLayoutCustomField;
  index: number;
  onChange: (field: EmrLayoutCustomField) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="grid gap-3">
        <label className="space-y-1">
          <FieldLabel
            label="Field label"
            hint="Heading shown for this custom field in the prescription."
          />
          <input
            type="text"
            value={draftField.field_label}
            onChange={(event) =>
              {
                const nextLabel = normalizeCustomFieldLabel(
                  event.target.value,
                  `CUSTOM FIELD ${index + 1}`
                );
                onChange({
                  ...draftField,
                  field_label: nextLabel,
                  field_key: buildCustomFieldKey(nextLabel, `custom_field_${index + 1}`),
                });
              }
            }
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="space-y-1">
          <FieldLabel
            label="Field type"
            hint="Choose how this field should be filled."
          />
          <select
            value={draftField.field_type}
            onChange={(event) =>
              onChange({
                ...draftField,
                field_type: event.target.value as EmrLayoutCustomField["field_type"],
              })
            }
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          >
            <option value="text">Text</option>
            <option value="textarea">Textarea</option>
            <option value="number">Number</option>
            <option value="date">Date</option>
            <option value="checkbox">Checkbox</option>
          </select>
        </label>
        <label className="space-y-1">
          <FieldLabel
            label="Placeholder"
            hint="Helper text shown before anything is entered."
          />
          <input
            type="text"
            value={draftField.placeholder ?? ""}
            onChange={(event) =>
              onChange({
                ...draftField,
                placeholder: event.target.value,
              })
            }
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1">
          <FieldLabel
            label="Default value"
            hint="Optional starting value for this field."
          />
          <input
            type="text"
            value={draftField.default_value ?? ""}
            onChange={(event) =>
              onChange({
                ...draftField,
                default_value: event.target.value,
              })
            }
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draftField.is_required !== false}
              onChange={(event) =>
                onChange({
                  ...draftField,
                  is_required: event.target.checked,
                })
              }
            />
            Required
            <InfoHint text="Marks this field as required." />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draftField.show_in_pad !== false}
              onChange={(event) =>
                onChange({
                  ...draftField,
                  show_in_pad: event.target.checked,
                })
              }
            />
            Show in pad
            <InfoHint text="Shows this field in the prescription writing screen." />
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={draftField.show_in_print !== false}
              onChange={(event) =>
                onChange({
                  ...draftField,
                  show_in_print: event.target.checked,
                })
              }
            />
            Show in print
            <InfoHint text="Shows this field in summary and print when it has data." />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
          >
            <Trash2 size={14} />
            Remove field
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EmrLayoutSettingsForm({
  role,
  doctorId,
  title,
  subtitle,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scopeDoctor, setScopeDoctor] = useState<ScopeDoctor>(null);
  const [scopeClinics, setScopeClinics] = useState<ScopeClinic[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState<number | null>(null);
  const [draggingSection, setDraggingSection] = useState<EmrLayoutSectionKey | null>(null);
  const [settings, setSettings] = useState<EmrLayoutSettings | null>(null);
  const [defaults, setDefaults] = useState<EmrLayoutSettings | null>(null);
  const [customFieldDrafts, setCustomFieldDrafts] = useState<EmrLayoutCustomField[]>([]);

  const uploadPath = role === "DOCTOR" ? "/api/doctors/upload" : "/api/upload";
  const uploadType = role === "DOCTOR" ? "document" : undefined;

  const fetchSettings = useCallback(async (clinicId?: number | null) => {
    setLoading(true);
    setError("");

    try {
      const query = buildQuery(doctorId, clinicId);
      const res = await fetch(
        `/api/emr/layout-settings${query ? `?${query}` : ""}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as LayoutSettingsResponse & { error?: string };

      if (!res.ok) {
        throw new Error(data.error || "Failed to load layout settings");
      }

      setSettings(cloneSettings(data.settings));
      setCustomFieldDrafts(cloneSettings(data.settings).custom_fields);
      setDefaults(data.defaults);
      setScopeDoctor(data.scope.doctor);
      setScopeClinics(data.scope.clinics);
      setSelectedClinicId(data.settings.clinic_id ?? clinicId ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load layout settings");
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    void fetchSettings(null);
  }, [fetchSettings]);

  useEffect(() => {
    if (!settings) return;
    setCustomFieldDrafts(settings.custom_fields);
  }, [settings?.id, settings?.updated_at]);

  const visibleSections = useMemo(() => {
    if (!settings) return [];
    return settings.section_order_json.filter(
      (section) => settings.section_visibility_json[section]
    );
  }, [settings]);

  const printableSections = useMemo(() => {
    if (!settings) return [];
    return settings.section_order_json.filter(
      (section) => settings.print_visibility_json[section]
    );
  }, [settings]);

  const updateSharedPrintConfig = useCallback(
    (
      key: keyof EmrLayoutMarginConfig,
      value: EmrLayoutMarginConfig[keyof EmrLayoutMarginConfig]
    ) => {
      setSettings((current) =>
        current
          ? {
              ...current,
              page_margin_json: {
                ...current.page_margin_json,
                [key]: value,
              },
              pdf_margin_json: {
                ...current.pdf_margin_json,
                [key]: value,
              },
            }
          : current
      );
    },
    []
  );

  const setPreprintedScanUrl = useCallback((url: string | null) => {
    setSettings((current) =>
      current
        ? {
            ...current,
            page_margin_json: {
              ...current.page_margin_json,
              preprinted_scan_url: url,
            },
          }
        : current
    );
  }, []);

  const applyGuideMargins = useCallback((margins: PreprintedGuideMargins) => {
    const nextPreset = suggestPaperPresetFromMargins(margins);
    setSettings((current) => {
      if (!current) return current;

      return {
        ...current,
        page_margin_json: {
          ...current.page_margin_json,
          unit: "mm",
          paper_preset: nextPreset,
          header_space: mmLabel(margins.headerSpaceMm),
          footer_space: mmLabel(margins.footerSpaceMm),
          left_strip_space: mmLabel(margins.leftStripSpaceMm),
          right_strip_space: mmLabel(margins.rightStripSpaceMm),
        },
        pdf_margin_json: {
          ...current.pdf_margin_json,
          unit: "mm",
          paper_preset: nextPreset,
          header_space: mmLabel(margins.headerSpaceMm),
          footer_space: mmLabel(margins.footerSpaceMm),
          left_strip_space: mmLabel(margins.leftStripSpaceMm),
          right_strip_space: mmLabel(margins.rightStripSpaceMm),
        },
      };
    });
  }, []);

  const applyPaperPreset = useCallback((preset: EmrPrintPaperPreset) => {
    setSettings((current) => {
      if (!current) return current;

      const reservedSpaces =
        preset === "custom" ? {} : PAPER_PRESET_SPACES[preset];

      return {
        ...current,
        page_margin_json: {
          ...current.page_margin_json,
          unit: "mm",
          paper_preset: preset,
          ...reservedSpaces,
        },
        pdf_margin_json: {
          ...current.pdf_margin_json,
          unit: "mm",
          paper_preset: preset,
          ...reservedSpaces,
        },
      };
    });
  }, []);

  const reorderSections = useCallback(
    (source: EmrLayoutSectionKey, target: EmrLayoutSectionKey) => {
      if (source === target) return;

      setSettings((current) => {
        if (!current) return current;

        const next = [...current.section_order_json];
        const sourceIndex = next.indexOf(source);
        const targetIndex = next.indexOf(target);

        if (sourceIndex === -1 || targetIndex === -1) {
          return current;
        }

        next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, source);

        return { ...current, section_order_json: next };
      });
    },
    []
  );

  if (loading && !settings) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 text-sm text-gray-600 shadow-sm">
          Loading layout settings...
        </div>
      </div>
    );
  }

  if (!settings || !defaults) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-700">
        {error || "Failed to load layout settings"}
      </div>
    );
  }

  const printPlacement = settings.page_margin_json;
  const fontFamilyOptions = FONT_FAMILY_OPTIONS.some(
    (option) => option.value === (settings.font_family ?? "")
  )
    ? FONT_FAMILY_OPTIONS
    : settings.font_family
      ? [{ value: settings.font_family, label: settings.font_family }, ...FONT_FAMILY_OPTIONS]
      : FONT_FAMILY_OPTIONS;
  const previewHasHeaderSpace =
    hasVisibleSpace(printPlacement.header_space) ||
    (printPlacement.show_header_image !== false && Boolean(settings.header_image_url)) ||
    (printPlacement.show_clinic_logo !== false && Boolean(settings.clinic_logo_url));
  const previewHasFooterSpace =
    hasVisibleSpace(printPlacement.footer_space) ||
    (printPlacement.show_footer_image !== false && Boolean(settings.footer_image_url)) ||
    (printPlacement.show_signature !== false && Boolean(settings.doctor_signature_url));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="rounded-3xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
              <Settings2 size={14} />
              EMR Layout Settings
            </div>
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-600">{subtitle}</p>
            {scopeDoctor ? (
              <p className="text-xs text-gray-500">
                Doctor scope: <span className="font-semibold">{scopeDoctor.doctor_name || `Doctor #${scopeDoctor.doctor_id}`}</span>
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {scopeClinics.length > 0 ? (
              <select
                value={selectedClinicId ?? ""}
                onChange={(event) => {
                  const nextClinicId = event.target.value ? Number(event.target.value) : null;
                  setSelectedClinicId(nextClinicId);
                  void fetchSettings(nextClinicId);
                }}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <option value="">Doctor default layout</option>
                {scopeClinics.map((clinic) => (
                  <option key={clinic.clinic_id} value={clinic.clinic_id}>
                    {clinic.clinic_name || `Clinic #${clinic.clinic_id}`}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                try {
                  setSaving(true);
                  setMessage("");
                  setError("");
                  const query = buildQuery(doctorId, selectedClinicId);
                  const res = await fetch(
                    `/api/emr/layout-settings${query ? `?${query}` : ""}`,
                    {
                      method: "PUT",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        clinicId: selectedClinicId,
                        section_order_json: settings.section_order_json,
                        section_visibility_json: settings.section_visibility_json,
                        print_visibility_json: settings.print_visibility_json,
                        custom_fields_json: customFieldDrafts,
                        page_margin_json: settings.page_margin_json,
                        pdf_margin_json: settings.pdf_margin_json,
                        font_family: settings.font_family,
                        font_size: settings.font_size,
                        header_image_url: settings.header_image_url,
                        footer_image_url: settings.footer_image_url,
                        clinic_logo_url: settings.clinic_logo_url,
                        doctor_signature_url: settings.doctor_signature_url,
                        header_height: settings.header_height,
                        footer_height: settings.footer_height,
                        custom_fields: customFieldDrafts,
                      }),
                    }
                  );
                  const data = (await res.json()) as { settings?: EmrLayoutSettings; error?: string };
                  if (!res.ok || !data.settings) {
                    throw new Error(data.error || "Failed to save layout settings");
                  }

                  setSettings(cloneSettings(data.settings));
                  setCustomFieldDrafts(cloneSettings(data.settings).custom_fields);
                  setMessage("Layout settings saved");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed to save layout settings");
                } finally {
                  setSaving(false);
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              {saving ? "Saving..." : "Save Layout"}
            </button>
          </div>
        </div>
        {message ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Section Order And Visibility
            </h2>
            <div className="mt-4 space-y-3">
              {settings.section_order_json.map((section) => (
                <div
                  key={section}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={() => {
                    if (draggingSection) {
                      reorderSections(draggingSection, section);
                    }
                    setDraggingSection(null);
                  }}
                  onDragEnd={() => setDraggingSection(null)}
                  className={`flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:flex-row md:items-center md:justify-between ${
                    draggingSection === section ? "opacity-60" : ""
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        setDraggingSection(section);
                      }}
                      onDragEnd={() => setDraggingSection(null)}
                      className="mt-0.5 inline-flex cursor-grab items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-400 active:cursor-grabbing"
                      aria-label={`Drag to reorder ${SECTION_LABELS[section]}`}
                      title={`Drag to reorder ${SECTION_LABELS[section]}`}
                    >
                      <GripVertical size={14} />
                    </span>
                    <div>
                    <p className="font-semibold text-gray-900">{SECTION_LABELS[section]}</p>
                    <p className="text-xs text-gray-500">
                      Visible in pad: {settings.section_visibility_json[section] ? "Yes" : "No"} | Visible in print: {settings.print_visibility_json[section] ? "Yes" : "No"}
                    </p>
                  </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={settings.section_visibility_json[section]}
                        onChange={(event) =>
                          setSettings((current) =>
                            current
                              ? {
                                  ...current,
                                  section_visibility_json: {
                                    ...current.section_visibility_json,
                                    [section]: event.target.checked,
                                  },
                                }
                              : current
                          )
                        }
                      />
                      Show in pad
                    </label>
                    <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={settings.print_visibility_json[section]}
                        onChange={(event) =>
                          setSettings((current) =>
                            current
                              ? {
                                  ...current,
                                  print_visibility_json: {
                                    ...current.print_visibility_json,
                                    [section]: event.target.checked,
                                  },
                                }
                              : current
                          )
                        }
                      />
                      Show in print
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Typography And Margins
            </h2>
            <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <label className="space-y-1 xl:col-span-2">
                  <FieldLabel
                    label="Prescription paper type"
                    hint="Pick the printed A4 paper style you already use. The reserved header, footer, and side-strip blank areas will be set up for you."
                  />
                  <select
                    value={printPlacement.paper_preset ?? "blank_a4"}
                    onChange={(event) =>
                      applyPaperPreset(event.target.value as EmrPrintPaperPreset)
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    {PAPER_PRESET_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <FieldLabel
                    label="X offset"
                    hint="Horizontal print correction for preprinted paper. Positive values move content right. Negative values move content left. If you type only a number like 2, it will be saved as 2mm."
                  />
                  <input
                    type="text"
                    value={printPlacement.offset_x ?? ""}
                    onChange={(event) =>
                      updateSharedPrintConfig("offset_x", event.target.value)
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    placeholder="0mm"
                  />
                </label>
                <label className="space-y-1">
                  <FieldLabel
                    label="Y offset"
                    hint="Vertical print correction for preprinted paper. Positive values move content down. Negative values move content up. Number-only entries are saved as mm."
                  />
                  <input
                    type="text"
                    value={printPlacement.offset_y ?? ""}
                    onChange={(event) =>
                      updateSharedPrintConfig("offset_y", event.target.value)
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    placeholder="0mm"
                  />
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {RESERVED_SPACE_KEYS.map((key) => (
                  <label key={key} className="space-y-1">
                    <FieldLabel
                      label={key.replaceAll("_", " ")}
                      className="capitalize"
                      hint={
                        key === "header_space"
                          ? "Blank top area already occupied by preprinted paper. Increase this if the printed content starts inside the paper header. Number-only entries are saved as mm."
                          : key === "footer_space"
                            ? "Blank bottom area already occupied by preprinted paper footer. Number-only entries are saved as mm."
                            : key === "left_strip_space"
                              ? "Blank area on the left edge for a preprinted strip. Number-only entries are saved as mm."
                              : "Blank area on the right edge for a preprinted strip. Number-only entries are saved as mm."
                      }
                    />
                    <input
                      type="text"
                      value={printPlacement[key] ?? ""}
                      onChange={(event) =>
                        updateSharedPrintConfig(key, event.target.value)
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="0mm"
                    />
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs text-gray-500">
                A4 only. Paper size is fixed at 210 mm x 297 mm. Preprinted-paper calibration uses mm. Normal page/PDF margins and header/footer height support both px and mm.
              </p>
            </div>
            <div className="mt-4">
              <PreprintedScanCalibrationField
                value={printPlacement.preprinted_scan_url ?? null}
                uploadPath={uploadPath}
                uploadType={uploadType}
                onChange={setPreprintedScanUrl}
                onApplyGuideMargins={applyGuideMargins}
              />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <FieldLabel
                  label="Font family"
                  hint="Choose the print font for the prescription content. This affects the final and print views, not the old image-prescription flow."
                />
                <select
                  value={settings.font_family ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current ? { ...current, font_family: event.target.value } : current
                    )
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  {fontFamilyOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <FieldLabel
                  label="Font size"
                  hint="Print text size. Keep values like 12px, 13px, or 14px for readable A4 output."
                />
                <input
                  type="text"
                  value={settings.font_size ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current ? { ...current, font_size: event.target.value } : current
                    )
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="14px"
                />
              </label>
            </div>
            <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-4">
                <div className="space-y-1">
                  <FieldLabel
                    label="Prescription number on print"
                    hint="Shows the doctor-specific prescription number in print view and final print only."
                  />
                  <p className="text-xs text-gray-500">
                    Turn this on to print the doctor-specific RX number in the prescription header.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.page_margin_json.show_prescription_number === true}
                    onChange={(event) =>
                      updateSharedPrintConfig(
                        "show_prescription_number",
                        event.target.checked
                      )
                    }
                  />
                  Show on print
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <FieldLabel
                    label="Prescription validity note"
                    hint="Shows a small print-only line at the bottom of the prescription: 'This prescription is valid for one more visit till ...'. The date is calculated from the finalized date when available, otherwise the visit date."
                  />
                  <p className="text-xs text-gray-500">
                    Print view and print only. Stays inside the configured page margins and footer space.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={settings.page_margin_json.show_prescription_validity === true}
                    onChange={(event) =>
                      updateSharedPrintConfig(
                        "show_prescription_validity",
                        event.target.checked
                      )
                    }
                  />
                  Enable
                </label>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-[160px_180px]">
                <label className="space-y-1">
                  <FieldLabel
                    label="Validity number"
                    hint="How long the prescription remains valid for one more visit. Positive whole numbers only."
                  />
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={settings.page_margin_json.prescription_validity_value ?? ""}
                    onChange={(event) =>
                      updateSharedPrintConfig(
                        "prescription_validity_value",
                        event.target.value
                          ? Math.max(1, Math.floor(Number(event.target.value)))
                          : null
                      )
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    placeholder="1"
                  />
                </label>
                <label className="space-y-1">
                  <FieldLabel
                    label="Validity unit"
                    hint="The unit added to the finalized or visit date to calculate the validity-till date."
                  />
                  <select
                    value={settings.page_margin_json.prescription_validity_unit ?? "month"}
                    onChange={(event) =>
                      updateSharedPrintConfig(
                        "prescription_validity_unit",
                        event.target.value as NonNullable<EmrLayoutMarginConfig["prescription_validity_unit"]>
                      )
                    }
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    {PRESCRIPTION_VALIDITY_UNIT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="mt-5 grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <p className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                  Page margins
                  <InfoHint text="Main print-area margins for the print/PDF content area. Supports px or mm. For regular layouts the default is 24px." />
                </p>
                {MARGIN_KEYS.map((side) => (
                  <label key={`page-${side}`} className="block space-y-1">
                    <FieldLabel
                      label={side}
                      className="capitalize"
                      hint={`Main ${side} margin. Supports px or mm. If you enter only a number like 24, it will be saved as 24px.`}
                    />
                    <input
                      type="text"
                      value={settings.page_margin_json[side] ?? ""}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                page_margin_json: {
                                  ...current.page_margin_json,
                                  [side]: event.target.value,
                                },
                              }
                            : current
                        )
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="24px"
                    />
                  </label>
                ))}
              </div>
              <div className="space-y-3">
                <p className="inline-flex items-center gap-1 text-sm font-semibold text-gray-900">
                  PDF margins
                  <InfoHint text="Separate margin set reserved for future PDF generation. Supports px or mm. Default is 24px." />
                </p>
                {MARGIN_KEYS.map((side) => (
                  <label key={`pdf-${side}`} className="block space-y-1">
                    <FieldLabel
                      label={side}
                      className="capitalize"
                      hint={`PDF ${side} margin. Supports px or mm. If you enter only a number like 24, it will be saved as 24px.`}
                    />
                    <input
                      type="text"
                      value={settings.pdf_margin_json[side] ?? ""}
                      onChange={(event) =>
                        setSettings((current) =>
                          current
                            ? {
                                ...current,
                                pdf_margin_json: {
                                  ...current.pdf_margin_json,
                                  [side]: event.target.value,
                                },
                              }
                            : current
                        )
                      }
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      placeholder="24px"
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <FieldLabel
                  label="Header height"
                  hint="Height of the printed header asset block when you choose to print a digital header. Supports px or mm. Number-only entries are saved as px."
                />
                <input
                  type="text"
                  value={settings.header_height ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current ? { ...current, header_height: event.target.value } : current
                    )
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="96px"
                />
              </label>
              <label className="space-y-1">
                <FieldLabel
                  label="Footer height"
                  hint="Height of the printed footer asset block when you choose to print a digital footer. Supports px or mm. Number-only entries are saved as px."
                />
                <input
                  type="text"
                  value={settings.footer_height ?? ""}
                  onChange={(event) =>
                    setSettings((current) =>
                      current ? { ...current, footer_height: event.target.value } : current
                    )
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  placeholder="72px"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Custom Fields
              <InfoHint text="Use custom fields for extra sections such as EXAMINATION FINDINGS." />
            </h2>
            <p className="mt-2 text-xs text-gray-500">
              Edit the field details here. Changes will be saved when you click the main Save Layout button.
            </p>
            <div className="mt-4 space-y-4">
              {customFieldDrafts.map((field, index) => (
                <CustomFieldEditorCard
                  key={field.id ?? `custom-field-${index}`}
                  draftField={field}
                  index={index}
                  onChange={(nextField) =>
                    setCustomFieldDrafts((current) =>
                      current.map((item, currentIndex) =>
                        currentIndex === index ? nextField : item
                      )
                    )
                  }
                  onRemove={() =>
                    setCustomFieldDrafts((current) =>
                      current.filter((_, currentIndex) => currentIndex !== index)
                    )
                  }
                />
              ))}
              <button
                type="button"
                onClick={() =>
                  setCustomFieldDrafts((current) => [
                    ...current,
                    {
                      field_key: buildCustomFieldKey(
                        `CUSTOM FIELD ${current.length + 1}`,
                        `custom_field_${current.length + 1}`
                      ),
                      field_label: `CUSTOM FIELD ${current.length + 1}`,
                      field_type: "text",
                      placeholder: "",
                      default_value: "",
                      is_required: false,
                      show_in_pad: true,
                      show_in_print: true,
                      sort_order: current.length,
                    },
                  ])
                }
                className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
              >
                <Plus size={14} />
                Add custom field
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Header, Footer, Logo And Signature
              <InfoHint text="Upload brand assets here. You can still keep them saved but turn their printing on or off for preprinted A4 sheets." />
            </h2>
            <div className="mt-4 grid gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={printPlacement.show_header_image !== false}
                  onChange={(event) =>
                    updateSharedPrintConfig("show_header_image", event.target.checked)
                  }
                />
                Print header image
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={printPlacement.show_footer_image !== false}
                  onChange={(event) =>
                    updateSharedPrintConfig("show_footer_image", event.target.checked)
                  }
                />
                Print footer image
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={printPlacement.show_clinic_logo !== false}
                  onChange={(event) =>
                    updateSharedPrintConfig("show_clinic_logo", event.target.checked)
                  }
                />
                Print clinic logo
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={printPlacement.show_signature !== false}
                  onChange={(event) =>
                    updateSharedPrintConfig("show_signature", event.target.checked)
                  }
                />
                Print signature / stamp
              </label>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <AssetField
                label="Header image"
                value={settings.header_image_url}
                accept="image/*"
                uploadPath={uploadPath}
                uploadType={uploadType}
                onChange={(url) =>
                  setSettings((current) =>
                    current ? { ...current, header_image_url: url } : current
                  )
                }
              />
              <AssetField
                label="Footer image"
                value={settings.footer_image_url}
                accept="image/*"
                uploadPath={uploadPath}
                uploadType={uploadType}
                onChange={(url) =>
                  setSettings((current) =>
                    current ? { ...current, footer_image_url: url } : current
                  )
                }
              />
              <AssetField
                label="Clinic logo"
                value={settings.clinic_logo_url}
                accept="image/*"
                uploadPath={uploadPath}
                uploadType={uploadType}
                onChange={(url) =>
                  setSettings((current) =>
                    current ? { ...current, clinic_logo_url: url } : current
                  )
                }
              />
              <AssetField
                label="Doctor signature / stamp"
                value={settings.doctor_signature_url}
                accept="image/*"
                uploadPath={uploadPath}
                uploadType={uploadType}
                onChange={(url) =>
                  setSettings((current) =>
                    current ? { ...current, doctor_signature_url: url } : current
                  )
                }
              />
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Visit Pad Preview
            </h2>
            <div className="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5">
              <div className="space-y-3" style={{ fontFamily: settings.font_family || defaults.font_family || undefined, fontSize: settings.font_size || defaults.font_size || undefined }}>
                {visibleSections.map((section) => (
                  <div key={`pad-${section}`} className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-sm font-semibold text-gray-900">{SECTION_LABELS[section]}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      This section will appear in the doctor pad.
                    </p>
                  </div>
                ))}
                {customFieldDrafts.filter((field) => field.show_in_pad !== false).map((field) => (
                  <div key={`pad-custom-${field.field_key}`} className="rounded-xl border border-gray-200 bg-white p-3">
                    <p className="text-sm font-semibold text-gray-900">{field.field_label}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      Custom {field.field_type} field in pad
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Print / PDF Preview
            </h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
              <div
                className="space-y-4 bg-white"
                style={{
                  fontFamily: settings.font_family || defaults.font_family || undefined,
                  fontSize: settings.font_size || defaults.font_size || undefined,
                }}
              >
                {previewHasHeaderSpace ? (
                  <div
                    className="border-b border-dashed border-gray-200 bg-gray-50 px-5 py-3"
                    style={{
                      minHeight:
                        printPlacement.header_space ||
                        settings.header_height ||
                        defaults.header_height ||
                        undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <FileImage size={18} className="text-indigo-500" />
                        <p className="text-sm font-semibold text-gray-900">
                          Header / Top printable reserve
                        </p>
                      </div>
                      <span className="text-xs text-gray-500">
                        {printPlacement.header_space || "0mm"}
                      </span>
                    </div>
                  </div>
                ) : null}
                <div
                  className="space-y-4 bg-white p-5"
                  style={{
                    paddingTop: `calc(${settings.page_margin_json.top || defaults.page_margin_json.top || "12mm"} + ${printPlacement.offset_y || "0mm"})`,
                    paddingRight: `calc(${settings.page_margin_json.right || defaults.page_margin_json.right || "12mm"} + ${printPlacement.right_strip_space || "0mm"})`,
                    paddingBottom:
                      settings.page_margin_json.bottom || defaults.page_margin_json.bottom || undefined,
                    paddingLeft: `calc(${settings.page_margin_json.left || defaults.page_margin_json.left || "12mm"} + ${printPlacement.left_strip_space || "0mm"} + ${printPlacement.offset_x || "0mm"})`,
                  }}
                >
                  <div className="flex gap-3">
                    {hasVisibleSpace(printPlacement.left_strip_space) ? (
                      <div className="w-12 shrink-0 rounded-xl border border-dashed border-gray-200 bg-indigo-50/50 px-2 py-3 text-center text-[11px] font-medium uppercase tracking-wide text-indigo-600">
                        Left strip
                      </div>
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-4">
                      {printableSections.map((section) => (
                        <div key={`print-${section}`} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <p className="text-sm font-semibold text-gray-900">{SECTION_LABELS[section]}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            This section will appear in the printed/PDF view.
                          </p>
                        </div>
                      ))}
                      {customFieldDrafts.filter((field) => field.show_in_print !== false).map((field) => (
                        <div key={`print-custom-${field.field_key}`} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <p className="text-sm font-semibold text-gray-900">{field.field_label}</p>
                          <p className="mt-1 text-xs text-gray-500">
                            Custom field in print/PDF view
                          </p>
                        </div>
                      ))}
                    </div>
                    {hasVisibleSpace(printPlacement.right_strip_space) ? (
                      <div className="w-12 shrink-0 rounded-xl border border-dashed border-gray-200 bg-indigo-50/50 px-2 py-3 text-center text-[11px] font-medium uppercase tracking-wide text-indigo-600">
                        Right strip
                      </div>
                    ) : null}
                  </div>
                </div>
                {previewHasFooterSpace ? (
                  <div
                    className="border-t border-dashed border-gray-200 bg-gray-50 px-5 py-3"
                    style={{
                      minHeight:
                        printPlacement.footer_space ||
                        settings.footer_height ||
                        defaults.footer_height ||
                        undefined,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">Footer / Bottom printable reserve</p>
                      <span className="text-xs text-gray-500">
                        {printPlacement.footer_space || "0mm"}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
