"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check, UserX, CalendarSync, Trash2, X, Filter, RotateCcw, Stethoscope, User, Download } from "lucide-react";
import AppointmentExportModal from "@/components/AppointmentExportModal";

interface Appointment {
    appointment_id: number;
    created_at: string;
    status: string;
    cancelled_by?: string | null;
    rescheduled_by?: string | null;
    patient: { full_name: string; phone: string; symptoms?: string; booking_id?: number | null } | null;
    clinic?: { clinic_id: number; clinic_name: string } | null;
    appointment_date: string;
    start_time: string;
    end_time: string;
    doctor_id: number;
}

import AppointmentModal from "./AppointmentModal";
import { formatTime, convertTo12Hour } from "@/lib/timeUtils";

// Format a date string (YYYY-MM-DD or ISO) as a human-readable date in IST.
// Using '+05:30' ensures the date is interpreted as IST midnight regardless of server tz.
const toISTDateStr = (value: string) => {
    if (!value) return 'N/A';
    // If it's a date-only string, append IST offset so it's not treated as UTC midnight
    const iso = value.includes('T') ? value : `${value.slice(0, 10)}T00:00:00+05:30`;
    return new Date(iso).toLocaleDateString('en-IN', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Kolkata',
    });
};

const toISTDateInput = (value: string) => {
    if (!value) return '';
    const iso = value.includes('T') ? value : `${value.slice(0, 10)}T00:00:00+05:30`;
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const STATUS_LABELS: Record<string, string> = {
    BOOKED: "Booked",
    CANCELLED: "Cancelled",
    COMPLETED: "Completed",
    PENDING: "Not Visited",
};

const getAppointmentStatusLabel = (appointment: Pick<Appointment, "status" | "cancelled_by">) => {
    if (appointment.status === "CANCELLED") {
        if (appointment.cancelled_by === "DOCTOR") return "Cancelled by doctor";
        if (appointment.cancelled_by === "PATIENT") return "Cancelled by patient";
    }

    return STATUS_LABELS[appointment.status] || appointment.status;
};

const getStatusTone = (appointment: Pick<Appointment, "status" | "cancelled_by">) => {
    if (appointment.status === "CANCELLED") {
        if (appointment.cancelled_by === "DOCTOR") {
            return {
                wrapper: "border border-rose-200 bg-rose-50 text-rose-700",
                iconWrap: "text-rose-600",
                Icon: Stethoscope,
            };
        }

        if (appointment.cancelled_by === "PATIENT") {
            return {
                wrapper: "border border-orange-200 bg-orange-50 text-orange-700",
                iconWrap: "text-orange-600",
                Icon: User,
            };
        }

        return {
            wrapper: "border border-red-200 bg-red-50 text-red-700",
            iconWrap: "text-red-600",
            Icon: X,
        };
    }

    if (appointment.status === "COMPLETED") {
        return {
            wrapper: "border border-emerald-200 bg-emerald-50 text-emerald-700",
            iconWrap: "text-emerald-600",
            Icon: Check,
        };
    }

    if (appointment.status === "PENDING") {
        return {
            wrapper: "border border-amber-200 bg-amber-50 text-amber-700",
            iconWrap: "text-amber-600",
            Icon: UserX,
        };
    }

    return {
        wrapper: "border border-indigo-200 bg-indigo-50 text-indigo-700",
        iconWrap: "text-indigo-600",
        Icon: Check,
    };
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

export default function DoctorAppointmentsPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string } | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteAppointment, setDeleteAppointment] = useState<Appointment | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [datePreset, setDatePreset] = useState<DatePreset>("ALL");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [isExportOpen, setIsExportOpen] = useState(false);

    const [userRole, setUserRole] = useState<string>("DOCTOR");
    const [staffRole, setStaffRole] = useState<string>("");

    const fetchData = useCallback(async () => {
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
                if (customTo) {
                    params.set("dateTo", customTo);
                } else {
                    params.set("dateTo", customFrom);
                }
            }

            const query = params.toString();
            const appointmentsUrl = query ? `/api/appointments?${query}` : "/api/appointments";
            const [meRes, aptRes] = await Promise.all([fetch("/api/auth/me"), fetch(appointmentsUrl)]);
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            // Allow both DOCTOR and CLINIC_STAFF
            if (meData.user.role !== "DOCTOR" && meData.user.role !== "CLINIC_STAFF") { router.push("/login"); return; }
            setUser(meData.user);
            setUserRole(meData.user.role);
            setStaffRole(meData.user.staff_role || "");
            if (aptRes.ok) { const data = await aptRes.json(); setAppointments(data || []); }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router, datePreset, customFrom, customTo, statusFilter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleStatusUpdate = async (appointmentId: number, status: string) => {
        const body: Record<string, unknown> = { appointmentId, status };
        if (status === 'CANCELLED') body.cancelled_by = 'DOCTOR';
        const res = await fetch("/api/appointments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) setAppointments(appointments.map((a) => a.appointment_id === appointmentId ? { ...a, status, ...(status === 'CANCELLED' ? { cancelled_by: 'DOCTOR' } : {}) } : a));
    };

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                    <svg className="animate-spin h-10 w-10 text-indigo-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-10">
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="text-3xl font-bold text-gray-900">Appointments</h1>
                    <p className="text-gray-500 mt-1 text-sm">
                        {userRole === "CLINIC_STAFF" ? "Viewing clinic appointments" : "Manage your patient appointments"}
                    </p>
                </motion.div>
                {/* Only DOCTOR or HAVE_ACCESS staff can add appointments */}
                <div className="flex items-center gap-3">
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsExportOpen(true)}
                        className="px-3 py-2 border border-gray-200 text-gray-700 rounded-lg shadow-sm font-medium flex items-center justify-center hover:bg-gray-50 transition-colors"
                        aria-label="Download"
                    >
                        <Download size={16} />
                    </motion.button>
                    {(userRole === "DOCTOR" || (userRole === "CLINIC_STAFF" && staffRole === "HAVE_ACCESS")) && (
                        <motion.button
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsModalOpen(true)}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow-lg shadow-indigo-200 font-medium flex items-center gap-2 hover:bg-indigo-700 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            Add Appointment
                        </motion.button>
                    )}
                </div>
            </div>

            <motion.div
                className="glass-card p-5 mb-6"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="flex items-center gap-2 mb-4">
                    <Filter size={16} className="text-indigo-600" />
                    <h2 className="text-sm font-semibold text-gray-800">Filters</h2>
                </div>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex flex-col gap-4 flex-1">
                        <div className="flex flex-wrap gap-2">
                            {(["ALL", "TODAY", "TOMORROW", "YESTERDAY", "CUSTOM"] as DatePreset[]).map((preset) => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setDatePreset(preset)}
                                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${datePreset === preset
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
                                <option value="ALL">All Status</option>
                                <option value="BOOKED">Booked</option>
                                <option value="PENDING">Not Visited</option>
                                <option value="COMPLETED">Visited</option>
                                <option value="CANCELLED">Cancelled</option>
                            </select>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setDatePreset("ALL");
                                setStatusFilter("ALL");
                                setCustomFrom("");
                                setCustomTo("");
                            }}
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                        >
                            <RotateCcw size={14} />
                            Reset
                        </button>
                    </div>
                </div>
            </motion.div>

            <AppointmentModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => { fetchData(); }}
            />
            <AppointmentExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
            <AppointmentModal
                isOpen={Boolean(rescheduleAppointment)}
                onClose={() => setRescheduleAppointment(null)}
                onSuccess={() => {
                    setRescheduleAppointment(null);
                    fetchData();
                }}
                mode="reschedule"
                initialValues={rescheduleAppointment ? {
                    appointmentId: rescheduleAppointment.appointment_id,
                    patient_phone: rescheduleAppointment.patient?.phone || '',
                    patient_name: rescheduleAppointment.patient?.full_name || '',
                    clinic_id: rescheduleAppointment.clinic?.clinic_id ? String(rescheduleAppointment.clinic.clinic_id) : '',
                    date: toISTDateInput(rescheduleAppointment.appointment_date),
                    time: formatTime(rescheduleAppointment.start_time),
                } : undefined}
            />
            {deleteAppointment && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl"
                    >
                        <div className="border-b border-gray-100 p-6">
                            <h2 className="text-xl font-bold text-gray-800">Delete Appointment</h2>
                            <p className="mt-2 text-sm text-gray-500">
                                Are you sure you want to delete the appointment for{" "}
                                <span className="font-semibold text-gray-700">
                                    {deleteAppointment.patient?.full_name || "this patient"}
                                </span>
                                ?
                            </p>
                        </div>
                        <div className="bg-gray-50 px-6 py-4 text-sm text-gray-600">
                            <div>
                                Date: {deleteAppointment.appointment_date ? toISTDateStr(deleteAppointment.appointment_date) : "N/A"}
                            </div>
                            <div>
                                Time: {deleteAppointment.start_time ? convertTo12Hour(formatTime(deleteAppointment.start_time)) : "N/A"}
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 p-6">
                            <button
                                type="button"
                                onClick={() => setDeleteAppointment(null)}
                                disabled={deleting}
                                className="rounded-lg px-4 py-2 text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={async () => {
                                    setDeleting(true);
                                    const res = await fetch(`/api/appointments?appointmentId=${deleteAppointment.appointment_id}`, { method: "DELETE" });
                                    if (res.ok) {
                                        setAppointments(appointments.filter((a) => a.appointment_id !== deleteAppointment.appointment_id));
                                        setDeleteAppointment(null);
                                    }
                                    setDeleting(false);
                                }}
                                disabled={deleting}
                                className="rounded-lg bg-red-600 px-5 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                            >
                                {deleting ? "Deleting..." : "Delete"}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            <motion.div className="glass-card p-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                {appointments.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-4xl mb-3">📋</p>
                        <p className="text-gray-400">No appointments yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead><tr><th>Patient</th><th>Appointment No.</th><th>Phone</th><th>Date & Time</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                {appointments.map((apt, i) => (
                                    <motion.tr key={apt.appointment_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center text-xs font-bold text-white">
                                                    {apt.patient?.full_name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <span className="text-gray-800 font-medium">{apt.patient?.full_name || "N/A"}</span>
                                            </div>
                                        </td>
                                        <td className="text-gray-500 font-medium">
                                            {apt.patient?.booking_id ?? apt.appointment_id}
                                        </td>
                                        <td className="text-gray-500">{apt.patient?.phone || "N/A"}</td>
                                        <td className="text-gray-500">
                                            {apt.appointment_date
                                                ? toISTDateStr(apt.appointment_date)
                                                : "N/A"}{" "}
                                            {apt.start_time
                                                ? convertTo12Hour(formatTime(apt.start_time))
                                                : ""}
                                        </td>
                                        <td>
                                            {(() => {
                                                const tone = getStatusTone(apt);
                                                const StatusIcon = tone.Icon;

                                                return (
                                                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${tone.wrapper}`}>
                                                        <StatusIcon size={14} className={tone.iconWrap} />
                                                        {getAppointmentStatusLabel(apt)}
                                                    </span>
                                                );
                                            })()}
                                        </td>
                                        <td>
                                            <div className="flex gap-2">
                                                {/* Only show action buttons for DOCTOR or HAVE_ACCESS staff */}
                                                {(userRole === "DOCTOR" || staffRole === "HAVE_ACCESS") && (
                                                    <>
                                                        {apt.status !== "COMPLETED" && apt.status !== "CANCELLED" && apt.status !== "PENDING" && (
                                                            <>
                                                                <motion.button onClick={() => handleStatusUpdate(apt.appointment_id, "COMPLETED")} className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} title="Complete" aria-label="Complete">
                                                                    <Check size={16} />
                                                                </motion.button>
                                                                <motion.button onClick={() => handleStatusUpdate(apt.appointment_id, "PENDING")} className="text-amber-600 hover:bg-amber-50 p-2 rounded-lg transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} title="Not Visited" aria-label="Not Visited">
                                                                    <UserX size={16} />
                                                                </motion.button>
                                                                <motion.button onClick={() => handleStatusUpdate(apt.appointment_id, "CANCELLED")} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} title="Cancel" aria-label="Cancel">
                                                                    <X size={16} />
                                                                </motion.button>
                                                            </>
                                                        )}
                                                        <motion.button onClick={() => setRescheduleAppointment(apt)} className="text-amber-600 hover:bg-amber-50 p-2 rounded-lg transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} title="Reschedule" aria-label="Reschedule">
                                                            <CalendarSync size={16} />
                                                        </motion.button>
                                                    </>
                                                )}
                                                {/* Only DOCTOR or HAVE_ACCESS staff can delete */}
                                                {(userRole === "DOCTOR" || staffRole === "HAVE_ACCESS") && (
                                                    <motion.button
                                                        onClick={() => setDeleteAppointment(apt)}
                                                        className="text-gray-500 hover:bg-gray-100 p-2 rounded-lg transition-colors"
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        title="Delete"
                                                        aria-label="Delete"
                                                    >
                                                        <Trash2 size={16} />
                                                    </motion.button>
                                                )}
                                                {/* VIEWER staff only see status badge, no actions */}
                                                {userRole === "CLINIC_STAFF" && staffRole !== "HAVE_ACCESS" && (
                                                    <span className="text-xs text-gray-400 italic">View only</span>
                                                )}
                                            </div>
                                        </td>

                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
