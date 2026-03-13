"use client";

import { useState, useEffect, useMemo } from "react";
import { PremiumTable } from "@/components/ui/PremiumTable";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Loader2, RefreshCcw, Search, Filter } from "lucide-react";

interface Appointment {
    appointment_id: number;
    patient: {
        full_name: string;
        phone: string;
    } | null;
    doctor: {
        doctor_name: string;
    } | null;
    clinic: {
        clinic_name: string;
    } | null;
    status: string;
    created_at: string;
    appointment_date: string | null;
    start_time: string | null;
}

const STATUS_LABELS: Record<string, string> = {
    BOOKED: "Booked",
    PENDING: "Not Visited",
    CONFIRMED: "Confirmed",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
};

type DatePreset = "ALL" | "TODAY" | "TOMORROW" | "YESTERDAY" | "CUSTOM";

const toYMD = (date: Date) => {
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

export default function AppointmentsPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [datePreset, setDatePreset] = useState<DatePreset>("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");

    useEffect(() => {
        fetchAppointments();
    }, [datePreset, statusFilter, customFrom, customTo]);

    const fetchAppointments = async () => {
        setLoading(true);
        setError("");
        try {
            const params = new URLSearchParams();
            if (statusFilter !== "ALL") {
                params.set("status", statusFilter);
            }

            const now = new Date();
            if (datePreset === "TODAY") {
                const today = toYMD(now);
                params.set("dateFrom", today);
                params.set("dateTo", today);
            } else if (datePreset === "TOMORROW") {
                const tomorrow = toYMD(addDays(now, 1));
                params.set("dateFrom", tomorrow);
                params.set("dateTo", tomorrow);
            } else if (datePreset === "YESTERDAY") {
                const yesterday = toYMD(addDays(now, -1));
                params.set("dateFrom", yesterday);
                params.set("dateTo", yesterday);
            } else if (customFrom) {
                params.set("dateFrom", customFrom);
                params.set("dateTo", customTo || customFrom);
            }

            const res = await fetch(`/api/appointments${params.toString() ? `?${params.toString()}` : ""}`);
            if (res.ok) {
                const data = await res.json();
                setAppointments(data || []);
            } else {
                setError("Failed to fetch appointments");
            }
        } catch {
            setError("An error occurred while fetching appointments");
        } finally {
            setLoading(false);
        }
    };

    const filtered = useMemo(() => {
        if (!search.trim()) return appointments;
        const q = search.toLowerCase().trim();
        return appointments.filter((a) => {
            return (
                a.patient?.full_name?.toLowerCase().includes(q) ||
                a.patient?.phone?.toLowerCase().includes(q) ||
                a.doctor?.doctor_name?.toLowerCase().includes(q) ||
                a.clinic?.clinic_name?.toLowerCase().includes(q) ||
                a.status?.toLowerCase().includes(q)
            );
        });
    }, [appointments, search]);

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "N/A";
        try {
            const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00+05:30`);
            return d.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                timeZone: "Asia/Kolkata",
            });
        } catch {
            return "N/A";
        }
    };

    const formatTime = (timeStr: string | null) => {
        if (!timeStr) return "N/A";
        try {
            const t = new Date(timeStr);
            if (Number.isNaN(t.getTime())) {
                // Could be "HH:MM:SS" string
                const parts = String(timeStr).split(":");
                if (parts.length >= 2) {
                    const h = parseInt(parts[0]);
                    const m = parseInt(parts[1]);
                    const ampm = h >= 12 ? "PM" : "AM";
                    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
                }
                return "N/A";
            }
            const h = t.getUTCHours();
            const m = t.getUTCMinutes();
            const ampm = h >= 12 ? "PM" : "AM";
            return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
        } catch {
            return "N/A";
        }
    };

    const columns = [
        {
            header: "Patient",
            accessorKey: (item: Appointment) => (
                <div>
                    <div className="font-medium text-gray-900">{item.patient?.full_name || "Unknown"}</div>
                    <div className="text-xs text-gray-400">{item.patient?.phone}</div>
                </div>
            ),
        },
        {
            header: "Doctor / Clinic",
            accessorKey: (item: Appointment) => (
                <div>
                    <div className="font-medium text-indigo-600">{item.doctor?.doctor_name || "—"}</div>
                    <div className="text-xs text-gray-400">{item.clinic?.clinic_name || "—"}</div>
                </div>
            ),
        },
        {
            header: "Date & Time",
            accessorKey: (item: Appointment) => (
                <div className="flex flex-col">
                    <span className="text-gray-700 font-medium">{formatDate(item.appointment_date)}</span>
                    <span className="text-xs text-gray-400">{formatTime(item.start_time)}</span>
                </div>
            ),
        },
        {
            header: "Status",
            accessorKey: (item: Appointment) => {
                const colors: Record<string, string> = {
                    BOOKED: "bg-indigo-50 text-indigo-600 border-indigo-200",
                    PENDING: "bg-amber-50 text-amber-600 border-amber-200",
                    CONFIRMED: "bg-emerald-50 text-emerald-600 border-emerald-200",
                    CANCELLED: "bg-red-50 text-red-600 border-red-200",
                    COMPLETED: "bg-green-50 text-green-600 border-green-200",
                };
                const statusColor = colors[item.status] || "bg-gray-50 text-gray-500 border-gray-200";
                return (
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusColor}`}>
                        {STATUS_LABELS[item.status] || item.status}
                    </span>
                );
            },
        },
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Appointments</h1>
                    <p className="text-gray-500 mt-2">View and manage patient appointments.</p>
                </div>
                <div className="flex gap-3 items-center">
                    {/* Search — inline style overrides .input-field padding shorthand */}
                    <div className="relative flex items-center">
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search patients, doctors…"
                            className="input-field w-64"
                            style={{ paddingLeft: "2.25rem", paddingRight: "0.75rem" }}
                        />
                    </div>
                    <PremiumButton variant="secondary" onClick={fetchAppointments} icon={RefreshCcw}>
                        Refresh
                    </PremiumButton>
                </div>
            </div>

            <GlassCard className="p-5">
                <div className="flex items-center gap-2 mb-4">
                    <Filter className="w-4 h-4 text-indigo-600" />
                    <h2 className="text-sm font-semibold text-gray-800">Filters</h2>
                </div>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex-1 flex flex-col gap-4">
                        <div className="flex flex-wrap gap-2">
                            {(["ALL", "TODAY", "TOMORROW", "YESTERDAY", "CUSTOM"] as DatePreset[]).map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setDatePreset(preset)}
                                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                                        datePreset === preset
                                            ? "bg-indigo-600 text-white"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                    }`}
                                >
                                    {preset === "ALL"
                                        ? "All Time"
                                        : preset === "TODAY"
                                            ? "Today"
                                            : preset === "TOMORROW"
                                                ? "Tomorrow"
                                                : preset === "YESTERDAY"
                                                    ? "Yesterday"
                                                    : "Custom Range"}
                                </button>
                            ))}
                        </div>
                        {datePreset === "CUSTOM" && (
                            <div className="flex flex-col gap-3 sm:flex-row">
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
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-[180px]">
                            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                            <select
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                            >
                                <option value="ALL">All Statuses</option>
                                <option value="BOOKED">Booked</option>
                                <option value="PENDING">Not Visited</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="CANCELLED">Cancelled</option>
                            </select>
                        </div>
                        <PremiumButton
                            variant="secondary"
                            onClick={() => {
                                setDatePreset("ALL");
                                setStatusFilter("ALL");
                                setCustomFrom("");
                                setCustomTo("");
                            }}
                            icon={RefreshCcw}
                        >
                            Reset
                        </PremiumButton>
                    </div>
                </div>
            </GlassCard>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm">
                    {error}
                </div>
            )}

            <GlassCard className="p-0 overflow-hidden border-0 bg-transparent shadow-none">
                {loading ? (
                    <div className="py-20 flex justify-center">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    </div>
                ) : (
                    <>
                        {search.trim() && (
                            <div className="text-sm text-gray-500 mb-3 px-1">
                                Showing <span className="font-semibold text-indigo-600">{filtered.length}</span> result{filtered.length !== 1 ? "s" : ""} for &quot;<span className="font-medium">{search}</span>&quot;
                            </div>
                        )}
                        <PremiumTable columns={columns} data={filtered} />
                    </>
                )}
            </GlassCard>
        </div>
    );
}
