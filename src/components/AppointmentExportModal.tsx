"use client";

import React, { useEffect, useMemo, useState } from "react";

type ExportPreset = "ONE_DAY" | "ONE_WEEK" | "ONE_MONTH" | "CUSTOM";
type ExportFormat = "pdf" | "excel";

const toISTYMD = (date: Date) => {
    const shifted = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    const year = shifted.getUTCFullYear();
    const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const day = String(shifted.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
};

const addDays = (base: Date, days: number) => {
    const next = new Date(base);
    next.setDate(next.getDate() + days);
    return next;
};

const buildFilename = (format: ExportFormat, from: string, to: string) => {
    const safeFrom = from.replaceAll("-", "");
    const safeTo = to.replaceAll("-", "");
    const ext = format === "pdf" ? "pdf" : "xlsx";
    return `appointments_${safeFrom}_${safeTo}.${ext}`;
};

const parseFilename = (contentDisposition: string | null) => {
    if (!contentDisposition) return "";
    const match = /filename="([^"]+)"/i.exec(contentDisposition);
    return match?.[1] || "";
};

interface AppointmentExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface HospitalDoctorOption {
    doctor_id: number;
    doctor_name?: string | null;
}

export default function AppointmentExportModal({ isOpen, onClose }: AppointmentExportModalProps) {
    const [preset, setPreset] = useState<ExportPreset>("ONE_DAY");
    const [format, setFormat] = useState<ExportFormat>("pdf");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [doctorOptions, setDoctorOptions] = useState<HospitalDoctorOption[]>([]);
    const [showDoctorSelector, setShowDoctorSelector] = useState(false);
    const [selectedDoctorIds, setSelectedDoctorIds] = useState<number[]>([]);

    useEffect(() => {
        if (!isOpen) return;

        let cancelled = false;

        const loadDoctors = async () => {
            try {
                const meRes = await fetch("/api/auth/me", { cache: "no-store" });
                if (!meRes.ok) return;
                const meData = await meRes.json();
                const assignedDoctorIds = Array.isArray(meData?.user?.assigned_doctor_ids)
                    ? meData.user.assigned_doctor_ids.map(Number).filter((value: number) => Number.isFinite(value))
                    : [];
                const isHospitalStaff = meData?.user?.role === "CLINIC_STAFF" && assignedDoctorIds.length > 1;

                if (!isHospitalStaff) {
                    if (!cancelled) {
                        setDoctorOptions([]);
                        setShowDoctorSelector(false);
                        setSelectedDoctorIds([]);
                    }
                    return;
                }

                const clinicsRes = await fetch("/api/clinics", { cache: "no-store" });
                if (!clinicsRes.ok) return;
                const clinicsData = await clinicsRes.json();
                const apiDoctors = Array.isArray(clinicsData?.doctors) ? clinicsData.doctors : [];
                const doctorsById = new Map<number, HospitalDoctorOption>();

                apiDoctors.forEach((doctor: HospitalDoctorOption) => {
                    doctorsById.set(Number(doctor.doctor_id), doctor);
                });

                const orderedDoctors = assignedDoctorIds
                    .map((doctorId: number) => doctorsById.get(Number(doctorId)) || { doctor_id: Number(doctorId) })
                    .filter((doctor: HospitalDoctorOption) => Number.isFinite(Number(doctor.doctor_id)));

                if (!cancelled) {
                    setDoctorOptions(orderedDoctors);
                    setShowDoctorSelector(orderedDoctors.length > 1);
                    setSelectedDoctorIds([]);
                }
            } catch (loadError) {
                console.error("Failed to load export doctors", loadError);
            }
        };

        void loadDoctors();

        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    const dateRange = useMemo(() => {
        const today = new Date();
        if (preset === "ONE_DAY") {
            const day = toISTYMD(today);
            return { from: day, to: day };
        }
        if (preset === "ONE_WEEK") {
            const to = toISTYMD(today);
            const from = toISTYMD(addDays(today, -6));
            return { from, to };
        }
        if (preset === "ONE_MONTH") {
            const to = toISTYMD(today);
            const from = toISTYMD(addDays(today, -29));
            return { from, to };
        }
        return { from: customFrom, to: customTo || customFrom };
    }, [preset, customFrom, customTo]);

    if (!isOpen) return null;

    const handleDownload = async () => {
        setError("");
        if (preset === "CUSTOM" && !customFrom) {
            setError("Please select a From date.");
            return;
        }
        if (preset === "CUSTOM" && customTo && customTo < customFrom) {
            setError("To date cannot be earlier than From date.");
            return;
        }

        const { from, to } = dateRange;
        if (!from || !to) {
            setError("Please choose a valid date range.");
            return;
        }

        setSubmitting(true);
        try {
            const params = new URLSearchParams({
                dateFrom: from,
                dateTo: to,
                format,
            });
            if (showDoctorSelector && selectedDoctorIds.length > 0) {
                selectedDoctorIds.forEach((doctorId) => {
                    params.append("doctorId", String(doctorId));
                });
            }
            const res = await fetch(`/api/appointments/export?${params.toString()}`);
            if (!res.ok) {
                setError("Failed to generate export. Please try again.");
                return;
            }

            const blob = await res.blob();
            const serverFilename = parseFilename(res.headers.get("Content-Disposition"));
            const filename = serverFilename || buildFilename(format, from, to);
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            onClose();
        } catch {
            setError("Something went wrong while downloading.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
                <div className="border-b border-gray-100 p-6">
                    <h2 className="text-xl font-bold text-gray-800">Download Appointments</h2>
                </div>

                <div className="space-y-5 p-6">
                    {showDoctorSelector && (
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-2">Doctor</label>
                            <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-2">
                                <div className="space-y-2">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDoctorIds([])}
                                        className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ${
                                            selectedDoctorIds.length === 0
                                                ? "bg-indigo-600 text-white"
                                                : "bg-white text-gray-700 hover:bg-indigo-50"
                                        }`}
                                    >
                                        <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                                            selectedDoctorIds.length === 0
                                                ? "border-white bg-white text-indigo-600"
                                                : "border-gray-300 bg-white text-transparent"
                                        }`}>
                                            ✓
                                        </span>
                                        All Associated Doctors
                                    </button>
                                    {doctorOptions.map((doctor) => {
                                        const rawName = String(doctor.doctor_name || "").trim();
                                        const label = rawName
                                            ? (/^dr\.?\s/i.test(rawName) ? rawName : `Dr. ${rawName}`)
                                            : `Doctor ${doctor.doctor_id}`;
                                        const checked = selectedDoctorIds.includes(Number(doctor.doctor_id));

                                        return (
                                            <button
                                                key={doctor.doctor_id}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedDoctorIds((prev) => {
                                                        const doctorId = Number(doctor.doctor_id);
                                                        if (prev.includes(doctorId)) {
                                                            return prev.filter((item) => item !== doctorId);
                                                        }
                                                        return [...prev, doctorId];
                                                    });
                                                }}
                                                className={`flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors ${
                                                    checked
                                                        ? "bg-indigo-600 text-white"
                                                        : "bg-white text-gray-700 hover:bg-indigo-50"
                                                }`}
                                            >
                                                <span className={`flex h-4 w-4 items-center justify-center rounded border text-[10px] ${
                                                    checked
                                                        ? "border-white bg-white text-indigo-600"
                                                        : "border-gray-300 bg-white text-transparent"
                                                }`}>
                                                    ✓
                                                </span>
                                                <span className="truncate">{label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">Timeframe</label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: "ONE_DAY", label: "1 Day" },
                                { value: "ONE_WEEK", label: "1 Week" },
                                { value: "ONE_MONTH", label: "1 Month" },
                                { value: "CUSTOM", label: "Custom Range" },
                            ].map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => setPreset(item.value as ExportPreset)}
                                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${preset === item.value
                                        ? "bg-indigo-600 text-white"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                        }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                        {preset === "CUSTOM" && (
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                                    <input
                                        type="date"
                                        value={customFrom}
                                        onChange={(e) => setCustomFrom(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                                    <input
                                        type="date"
                                        value={customTo}
                                        min={customFrom || undefined}
                                        onChange={(e) => setCustomTo(e.target.value)}
                                        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-gray-500 mb-2">Format</label>
                        <div className="flex gap-2">
                            {[
                                { value: "pdf", label: "PDF" },
                                { value: "excel", label: "Excel" },
                            ].map((item) => (
                                <button
                                    key={item.value}
                                    type="button"
                                    onClick={() => setFormat(item.value as ExportFormat)}
                                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${format === item.value
                                        ? "bg-indigo-600 text-white"
                                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                        }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                            {error}
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={submitting}
                            className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                        >
                            {submitting ? "Preparing..." : "Download"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
