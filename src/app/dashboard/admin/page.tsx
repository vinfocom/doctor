"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { CalendarDays, Download, Loader2, RefreshCw, Search, Stethoscope, Users, X } from "lucide-react";
import SystemTrends from "@/components/SystemTrends";

interface DashboardStats {
    totalDoctors: number;
    totalPatients: number;
    totalAppointments: number;
    pendingAppointments: number;
    completedAppointments: number;
}

type DoctorTypeFilter = "all" | "cms" | "hms";

type ExportDoctor = {
    doctor_id: number;
    doctor_name: string;
    specialization: string;
    status: string;
    clinic_count: number;
    num_clinics: number;
    doctor_type: "CMS" | "HMS";
    hospital_names: string;
};

function todayYmd() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export default function AdminDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [exportOpen, setExportOpen] = useState(false);
    const [exportDoctors, setExportDoctors] = useState<ExportDoctor[]>([]);
    const [exportDoctorsLoading, setExportDoctorsLoading] = useState(false);
    const [exportGenerating, setExportGenerating] = useState(false);
    const [exportDoctorType, setExportDoctorType] = useState<DoctorTypeFilter>("all");
    const [exportSearch, setExportSearch] = useState("");
    const [exportFromDate, setExportFromDate] = useState(todayYmd);
    const [exportToDate, setExportToDate] = useState(todayYmd);
    const [selectedDoctorIds, setSelectedDoctorIds] = useState<Set<number>>(new Set());
    const [exportError, setExportError] = useState("");
    const [exportSuccess, setExportSuccess] = useState("");

    const fetchData = useCallback(async () => {
        try {
            const [meRes, dashRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/dashboard")]);
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            if (meData.user.role !== "SUPER_ADMIN" && meData.user.role !== "ADMIN") { router.push("/login"); return; }
            setUser(meData.user);
            if (dashRes.ok) {
                const dashData = await dashRes.json();
                setStats(dashData.stats);
            }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const filteredExportDoctors = useMemo(() => {
        const query = exportSearch.trim().toLowerCase();
        return exportDoctors.filter((doctor) => {
            const matchesType =
                exportDoctorType === "all" ||
                (exportDoctorType === "cms" && doctor.doctor_type === "CMS") ||
                (exportDoctorType === "hms" && doctor.doctor_type === "HMS");
            const matchesSearch =
                !query ||
                doctor.doctor_name.toLowerCase().includes(query) ||
                String(doctor.doctor_id).includes(query) ||
                doctor.specialization.toLowerCase().includes(query) ||
                doctor.hospital_names.toLowerCase().includes(query);

            return matchesType && matchesSearch;
        });
    }, [exportDoctorType, exportDoctors, exportSearch]);
    const visibleSelectedCount = filteredExportDoctors.filter((doctor) => selectedDoctorIds.has(doctor.doctor_id)).length;
    const allVisibleSelected = filteredExportDoctors.length > 0 && visibleSelectedCount === filteredExportDoctors.length;

    const loadExportDoctors = useCallback(async () => {
        setExportDoctorsLoading(true);
        setExportError("");

        try {
            const response = await fetch("/api/admin/doctor-stats/doctors", { cache: "no-store" });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setExportError(data.error || "Unable to load doctors for export.");
                return;
            }

            const doctors = Array.isArray(data.doctors) ? data.doctors : [];
            setExportDoctors(doctors);
            setSelectedDoctorIds(new Set(doctors.map((doctor: ExportDoctor) => doctor.doctor_id)));
        } catch {
            setExportError("Unable to load doctors for export. Check your connection and try again.");
        } finally {
            setExportDoctorsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (exportOpen && exportDoctors.length === 0) {
            void loadExportDoctors();
        }
    }, [exportDoctors.length, exportOpen, loadExportDoctors]);

    useEffect(() => {
        if (!exportOpen || exportDoctors.length === 0) return;
        const nextSelected = exportDoctors
            .filter((doctor) =>
                exportDoctorType === "all" ||
                (exportDoctorType === "cms" && doctor.doctor_type === "CMS") ||
                (exportDoctorType === "hms" && doctor.doctor_type === "HMS")
            )
            .map((doctor) => doctor.doctor_id);
        setSelectedDoctorIds(new Set(nextSelected));
    }, [exportDoctorType, exportDoctors, exportOpen]);

    const toggleVisibleDoctors = () => {
        setSelectedDoctorIds((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
                filteredExportDoctors.forEach((doctor) => next.delete(doctor.doctor_id));
            } else {
                filteredExportDoctors.forEach((doctor) => next.add(doctor.doctor_id));
            }
            return next;
        });
    };

    const toggleDoctor = (doctorId: number) => {
        setSelectedDoctorIds((prev) => {
            const next = new Set(prev);
            if (next.has(doctorId)) next.delete(doctorId);
            else next.add(doctorId);
            return next;
        });
    };

    const downloadDoctorStats = async () => {
        const includedDoctorIds = exportDoctors
            .filter((doctor) =>
                selectedDoctorIds.has(doctor.doctor_id) &&
                (exportDoctorType === "all" ||
                    (exportDoctorType === "cms" && doctor.doctor_type === "CMS") ||
                    (exportDoctorType === "hms" && doctor.doctor_type === "HMS"))
            )
            .map((doctor) => doctor.doctor_id);

        if (includedDoctorIds.length === 0) {
            setExportError("Select at least one doctor for the report.");
            return;
        }
        if (!exportFromDate || !exportToDate) {
            setExportError("Select both from date and to date.");
            return;
        }

        setExportGenerating(true);
        setExportError("");
        setExportSuccess("");

        try {
            const params = new URLSearchParams({
                doctor_type: exportDoctorType,
                from_date: exportFromDate,
                to_date: exportToDate,
                doctor_ids: includedDoctorIds.join(","),
            });
            const response = await fetch(`/api/admin/doctor-stats/export?${params.toString()}`, {
                cache: "no-store",
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setExportError(data.error || "Unable to generate doctor stats report.");
                return;
            }

            const blob = await response.blob();
            const contentDisposition = response.headers.get("Content-Disposition") || "";
            const filenameMatch = contentDisposition.match(/filename="([^"]+)"/);
            const filename = filenameMatch?.[1] || `doctor-stats-${exportFromDate}-to-${exportToDate}.xlsx`;
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            setExportSuccess("Doctor stats Excel report downloaded.");
            setExportOpen(false);
        } catch {
            setExportError("Unable to generate doctor stats report. Check your connection and try again.");
        } finally {
            setExportGenerating(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
                    <svg className="animate-spin h-10 w-10 text-indigo-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                </motion.div>
            </div>
        );
    }

    const statCards = [
        { label: "Total Doctors", value: stats?.totalDoctors || 0, icon: <Stethoscope size={24} className="text-indigo-600" />, gradient: "from-indigo-100 to-violet-100" },
        { label: "Total Patients", value: stats?.totalPatients || 0, icon: <Users size={24} className="text-cyan-600" />, gradient: "from-cyan-100 to-sky-100" },
        { label: "Total Appointments", value: stats?.totalAppointments || 0, icon: <CalendarDays size={24} className="text-emerald-600" />, gradient: "from-emerald-100 to-green-100" },
    ];

    return (
        <div className="w-full">
            <motion.div className="mb-10" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                        <p className="text-gray-500 mt-1 text-sm">System overview and management</p>
                    </div>
                    {user?.role === "SUPER_ADMIN" && (
                        <button
                            type="button"
                            onClick={() => setExportOpen(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-black"
                        >
                            <Download size={16} />
                            Doctor Stats
                        </button>
                    )}
                </div>
            </motion.div>

            {exportError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {exportError}
                </div>
            )}
            {exportSuccess && (
                <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
                    {exportSuccess}
                </div>
            )}

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
                {statCards.map((card, i) => (
                    <motion.div
                        key={card.label}
                        className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 p-7 flex flex-col gap-4"
                        style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                        whileHover={{ y: -4, boxShadow: "0 12px 28px rgba(79,70,229,0.1)" }}
                    >
                        {/* Background accent */}
                        <div className={`absolute top-0 right-0 w-28 h-28 rounded-bl-[5rem] bg-gradient-to-br ${card.gradient} opacity-60`} />

                        {/* Icon */}
                        <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center z-10`}>
                            {card.icon}
                        </div>

                        {/* Value */}
                        <div className="z-10">
                            <p className="text-5xl font-extrabold text-gray-900 tracking-tight">{card.value.toLocaleString()}</p>
                            <p className="text-base text-gray-500 mt-2 font-medium">{card.label}</p>
                        </div>

                        {/* Bottom accent line */}
                        <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${card.gradient}`} />
                    </motion.div>
                ))}
            </div>

            {/* Overall Trends — SUPER_ADMIN only */}
            {user?.role === "SUPER_ADMIN" && (
                <SystemTrends />
            )}

            {exportOpen && (
                <DoctorStatsExportModal
                    doctors={filteredExportDoctors}
                    allVisibleSelected={allVisibleSelected}
                    visibleSelectedCount={visibleSelectedCount}
                    selectedDoctorIds={selectedDoctorIds}
                    doctorType={exportDoctorType}
                    search={exportSearch}
                    fromDate={exportFromDate}
                    toDate={exportToDate}
                    loadingDoctors={exportDoctorsLoading}
                    generating={exportGenerating}
                    onClose={() => {
                        if (!exportGenerating) setExportOpen(false);
                    }}
                    onDoctorTypeChange={setExportDoctorType}
                    onSearchChange={setExportSearch}
                    onFromDateChange={setExportFromDate}
                    onToDateChange={setExportToDate}
                    onToggleVisible={toggleVisibleDoctors}
                    onToggleDoctor={toggleDoctor}
                    onDownload={() => void downloadDoctorStats()}
                    onRefreshDoctors={() => void loadExportDoctors()}
                />
            )}
        </div>
    );
}

function DoctorStatsExportModal({
    doctors,
    allVisibleSelected,
    visibleSelectedCount,
    selectedDoctorIds,
    doctorType,
    search,
    fromDate,
    toDate,
    loadingDoctors,
    generating,
    onClose,
    onDoctorTypeChange,
    onSearchChange,
    onFromDateChange,
    onToDateChange,
    onToggleVisible,
    onToggleDoctor,
    onDownload,
    onRefreshDoctors,
}: {
    doctors: ExportDoctor[];
    allVisibleSelected: boolean;
    visibleSelectedCount: number;
    selectedDoctorIds: Set<number>;
    doctorType: DoctorTypeFilter;
    search: string;
    fromDate: string;
    toDate: string;
    loadingDoctors: boolean;
    generating: boolean;
    onClose: () => void;
    onDoctorTypeChange: (value: DoctorTypeFilter) => void;
    onSearchChange: (value: string) => void;
    onFromDateChange: (value: string) => void;
    onToDateChange: (value: string) => void;
    onToggleVisible: () => void;
    onToggleDoctor: (doctorId: number) => void;
    onDownload: () => void;
    onRefreshDoctors: () => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6">
            <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
                    <div>
                        <h2 className="text-base font-semibold text-gray-950">Download Doctor Stats</h2>
                        <p className="mt-1 text-xs text-gray-500">Numbers-only Excel report with EMR and SMS status.</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={generating}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                        <X size={16} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                    <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
                        <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">Doctor Type</label>
                            <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-gray-200 text-sm">
                                {([
                                    ["all", "All"],
                                    ["cms", "CMS"],
                                    ["hms", "HMS"],
                                ] as const).map(([value, label]) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => onDoctorTypeChange(value)}
                                        className={`px-3 py-2 font-semibold ${doctorType === value ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <DateField label="From" value={fromDate} onChange={onFromDateChange} />
                            <DateField label="To" value={toDate} onChange={onToDateChange} />
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative min-w-0 flex-1">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="search"
                                value={search}
                                onChange={(event) => onSearchChange(event.target.value)}
                                placeholder="Search doctor, ID, specialization"
                                className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                            />
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={onRefreshDoctors}
                                disabled={loadingDoctors || generating}
                                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                <RefreshCw size={15} className={loadingDoctors ? "animate-spin" : ""} />
                                Refresh
                            </button>
                            <button
                                type="button"
                                onClick={onToggleVisible}
                                disabled={loadingDoctors || doctors.length === 0 || generating}
                                className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                                {allVisibleSelected ? "Deselect shown" : "Select shown"}
                            </button>
                        </div>
                    </div>

                    <div className="mt-3 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                            <span>Doctors</span>
                            <span>{visibleSelectedCount} of {doctors.length} shown selected</span>
                        </div>

                        {loadingDoctors ? (
                            <div className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500">
                                <Loader2 size={16} className="animate-spin" />
                                Loading doctors
                            </div>
                        ) : doctors.length === 0 ? (
                            <div className="px-4 py-6 text-sm text-gray-500">No doctors found for this filter.</div>
                        ) : (
                            <div className="max-h-72 overflow-y-auto">
                                {doctors.map((doctor) => {
                                    const checked = selectedDoctorIds.has(doctor.doctor_id);
                                    return (
                                        <label
                                            key={doctor.doctor_id}
                                            className="flex cursor-pointer items-start gap-3 border-t border-gray-100 px-3 py-3 first:border-t-0 hover:bg-gray-50"
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={() => onToggleDoctor(doctor.doctor_id)}
                                                disabled={generating}
                                                className="mt-1 h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-sm font-semibold text-gray-950">
                                                    {doctor.doctor_name}
                                                </span>
                                                <span className="mt-0.5 block text-xs text-gray-500">
                                                    ID {doctor.doctor_id} / {doctor.doctor_type} / Clinics {doctor.clinic_count}
                                                    {doctor.specialization ? ` / ${doctor.specialization}` : ""}
                                                </span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs text-gray-500">
                        Excel includes summary, doctor-wise stats, and daily stats only.
                    </p>
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={generating}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onDownload}
                            disabled={generating || loadingDoctors || visibleSelectedCount === 0 || !fromDate || !toDate}
                            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {generating ? "Generating Excel" : "Download Excel"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
            <input
                type="date"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
            />
        </div>
    );
}
