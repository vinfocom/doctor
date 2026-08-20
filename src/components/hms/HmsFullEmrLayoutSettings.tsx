"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import EmrLayoutSettingsForm from "@/components/emr/EmrLayoutSettingsForm";
import { HmsLabelWithInfo } from "@/components/hms/HmsInfoHint";

type Doctor = {
  doctor_id: number;
  doctor_name: string | null;
  room_no: string | null;
};

type TargetType = "ALL_DOCTORS" | "SPECIFIC_DOCTOR" | "DOCTOR_GROUP";

type LayoutRecord = {
  layout_name: string;
  description: string | null;
  is_active: boolean;
  header_config_json?: {
    reception_header?: {
      show_mobile_no?: boolean;
      show_fee?: boolean;
      show_room_no?: boolean;
      title_font_size_px?: number;
      body_font_size_px?: number;
    };
  };
  assignment?: {
    target_type: TargetType | string | null;
    doctor_ids: number[];
  } | null;
};

function formatDoctorName(name: string | null | undefined) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "Doctor";
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

export default function HmsFullEmrLayoutSettings({
  listEndpoint,
  settingsEndpoint,
  title,
  subtitle,
}: {
  listEndpoint: string;
  settingsEndpoint: string;
  title: string;
  subtitle: string;
}) {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [doctorError, setDoctorError] = useState("");
  const [layoutName, setLayoutName] = useState("Default HMS Layout");
  const [description, setDescription] = useState("");
  const [targetType, setTargetType] = useState<TargetType>("ALL_DOCTORS");
  const [doctorIds, setDoctorIds] = useState<number[]>([]);
  const [receptionShowMobileNo, setReceptionShowMobileNo] = useState(true);
  const [receptionShowFee, setReceptionShowFee] = useState(true);
  const [receptionShowRoomNo, setReceptionShowRoomNo] = useState(true);
  const [receptionTitleFontSize, setReceptionTitleFontSize] = useState(16);
  const [receptionBodyFontSize, setReceptionBodyFontSize] = useState(12);

  const previewDoctorId = useMemo(() => {
    if (targetType === "ALL_DOCTORS") return undefined;
    return doctorIds[0];
  }, [doctorIds, targetType]);

  const loadDoctors = useCallback(async () => {
    setLoadingDoctors(true);
    setDoctorError("");
    try {
      const response = await fetch(listEndpoint, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDoctorError(data.error || "Unable to load doctors.");
        return;
      }
      setDoctors(Array.isArray(data.doctors) ? data.doctors : []);
      const layouts = Array.isArray(data.layouts) ? data.layouts as LayoutRecord[] : [];
      const activeAllDoctorsLayout = layouts.find((layout) =>
        layout.is_active && layout.assignment?.target_type === "ALL_DOCTORS"
      );
      if (activeAllDoctorsLayout) {
        setLayoutName(activeAllDoctorsLayout.layout_name || "Default HMS Layout");
        setDescription(activeAllDoctorsLayout.description || "");
        setTargetType("ALL_DOCTORS");
        setDoctorIds([]);
        const receptionHeader = activeAllDoctorsLayout.header_config_json?.reception_header || {};
        setReceptionShowMobileNo(receptionHeader.show_mobile_no !== false);
        setReceptionShowFee(receptionHeader.show_fee !== false);
        setReceptionShowRoomNo(receptionHeader.show_room_no !== false);
        setReceptionTitleFontSize(Number(receptionHeader.title_font_size_px) || 16);
        setReceptionBodyFontSize(Number(receptionHeader.body_font_size_px) || 12);
      }
    } catch {
      setDoctorError("Unable to load doctors. Check your connection and try again.");
    } finally {
      setLoadingDoctors(false);
    }
  }, [listEndpoint]);

  useEffect(() => {
    void loadDoctors();
  }, [loadDoctors]);

  const toggleDoctor = (doctorId: number) => {
    setDoctorIds((current) => {
      if (targetType === "SPECIFIC_DOCTOR") {
        return current.includes(doctorId) ? [] : [doctorId];
      }
      return current.includes(doctorId)
        ? current.filter((id) => id !== doctorId)
        : [...current, doctorId];
    });
  };

  const headerAddon = (
    <div className="rounded-2xl border border-black bg-white p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
        <label className="space-y-1">
          <span className="text-xs font-medium text-black">Layout Name</span>
          <input
            type="text"
            value={layoutName}
            onChange={(event) => setLayoutName(event.target.value)}
            className="w-full rounded-lg border border-black bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-black">
            <HmsLabelWithInfo
              label="Applies To"
              info="Doctor-specific layouts win over group layouts. Group layouts win over All Doctors."
            />
          </span>
          <select
            value={targetType}
            onChange={(event) => {
              setTargetType(event.target.value as TargetType);
              setDoctorIds([]);
            }}
            className="w-full rounded-lg border border-black bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
          >
            <option value="ALL_DOCTORS">All Doctors</option>
            <option value="SPECIFIC_DOCTOR">One Doctor</option>
            <option value="DOCTOR_GROUP">Doctor Group</option>
          </select>
        </label>
      </div>
      <label className="mt-3 block space-y-1">
        <span className="text-xs font-medium text-black">Description</span>
        <input
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          className="w-full rounded-lg border border-black bg-white px-3 py-2 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
        />
      </label>

      {targetType !== "ALL_DOCTORS" ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-black">Doctors</p>
          {loadingDoctors ? (
            <div className="flex items-center gap-2 rounded-lg border border-black bg-white px-3 py-3 text-sm text-black">
              <Loader2 size={15} className="animate-spin" />
              Loading doctors
            </div>
          ) : doctorError ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5" />
              {doctorError}
            </div>
          ) : (
            <div className="grid max-h-48 gap-2 overflow-y-auto rounded-lg border border-black bg-white p-2 sm:grid-cols-2">
              {doctors.map((doctor) => {
                const active = doctorIds.includes(doctor.doctor_id);
                return (
                  <button
                    key={doctor.doctor_id}
                    type="button"
                    onClick={() => toggleDoctor(doctor.doctor_id)}
                    className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                      active ? "bg-black text-white" : "text-black hover:bg-black hover:text-white"
                    }`}
                  >
                    <span>{formatDoctorName(doctor.doctor_name)}</span>
                    <span>{doctor.room_no || "-"}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Toggle label="Reception Header Mobile" checked={receptionShowMobileNo} onChange={setReceptionShowMobileNo} />
        <Toggle label="Reception Header Fee" checked={receptionShowFee} onChange={setReceptionShowFee} />
        <Toggle label="Reception Header Room" checked={receptionShowRoomNo} onChange={setReceptionShowRoomNo} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <NumberField
          label="Header Title Size"
          value={receptionTitleFontSize}
          min={12}
          max={28}
          onChange={setReceptionTitleFontSize}
        />
        <NumberField
          label="Header Text Size"
          value={receptionBodyFontSize}
          min={9}
          max={18}
          onChange={setReceptionBodyFontSize}
        />
      </div>
    </div>
  );

  return (
    <div className="hms-emr-layout-theme">
      <style jsx global>{`
        .hms-emr-layout-theme :where(.text-gray-400, .text-gray-500, .text-gray-600, .text-gray-700, .text-gray-800, .text-gray-900, .text-gray-950, .text-indigo-500, .text-indigo-600, .text-indigo-700) {
          color: #000 !important;
        }
        .hms-emr-layout-theme :where(.border-gray-100, .border-gray-200, .border-gray-300, .border-indigo-100, .border-indigo-200, .border-dashed) {
          border-color: #000 !important;
        }
        .hms-emr-layout-theme :where(.bg-gray-50, .bg-indigo-50, .bg-indigo-50\\/50, .bg-indigo-50\\/60) {
          background-color: #fff !important;
        }
        .hms-emr-layout-theme :where(.bg-cyan-600, .bg-emerald-600, .bg-violet-600, .bg-amber-600, .bg-indigo-600) {
          background-color: #000 !important;
        }
      `}</style>
      <EmrLayoutSettingsForm
        key={`${targetType}-${previewDoctorId || "all"}`}
        role="ADMIN"
        doctorId={previewDoctorId}
        title={title}
        subtitle={subtitle}
        apiBasePath={settingsEndpoint}
        theme="hms"
        hideClinicSelector
        uploadPathOverride="/api/upload"
        headerAddon={headerAddon}
        extraSavePayload={{
          layout_name: layoutName,
          description,
          target_type: targetType,
          doctor_ids: targetType === "ALL_DOCTORS" ? [] : doctorIds,
          reception_show_mobile_no: receptionShowMobileNo,
          reception_show_fee: receptionShowFee,
          reception_show_room_no: receptionShowRoomNo,
          reception_title_font_size_px: receptionTitleFontSize,
          reception_body_font_size_px: receptionBodyFontSize,
        }}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block rounded-lg border border-black bg-white px-3 py-2">
      <span className="text-xs font-semibold text-black">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full rounded-md border border-black px-2 py-1 text-sm text-black outline-none focus:border-black focus:ring-2 focus:ring-black/10"
      />
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-black bg-white px-3 py-2">
      <span className="text-xs font-semibold text-black">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 accent-black" />
    </label>
  );
}
