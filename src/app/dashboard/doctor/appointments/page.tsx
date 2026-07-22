"use client";
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Check, UserX, CalendarSync, Trash2, X, Filter, RotateCcw, Stethoscope, User, Download, ChevronDown, Upload, ImagePlus, ZoomIn, ZoomOut, FileText, Search } from "lucide-react";
import AppointmentExportModal from "@/components/AppointmentExportModal";
import DoctorPrescriptionModal, { type PrescriptionModalTarget } from "@/components/DoctorPrescriptionModal";

interface Appointment {
    appointment_id: number;
    booking_id?: number | null;
    booked_for?: 'SELF' | 'OTHER' | null;
    created_at: string;
    status: string;
    cancelled_by?: string | null;
    rescheduled_by?: string | null;
    patient: { patient_id?: number; full_name: string; phone: string; symptoms?: string; booking_id?: number | null } | null;
    clinic?: { clinic_id: number; clinic_name: string } | null;
    doctor?: { doctor_id: number; doctor_name?: string | null } | null;
    appointment_date: string;
    start_time: string;
    end_time: string;
    doctor_id: number;
}

interface HospitalDoctorOption {
    doctor_id: number;
    doctor_name?: string | null;
}

interface PrescriptionPageItem {
    prescription_page_id: number;
    page_number: number;
    storage_key: string;
    file_url: string;
    mime_type: string | null;
    original_file_name: string | null;
    file_size_bytes: number | null;
    width: number | null;
    height: number | null;
    created_at: string;
}

interface PrescriptionRecordItem {
    prescription_id: number;
    patient_id: number;
    doctor_id: number;
    clinic_id: number | null;
    appointment_id: number | null;
    uploaded_by_role: "PATIENT" | "DOCTOR" | "STAFF";
    uploaded_by_user_id: number | null;
    uploaded_by_patient_id: number | null;
    note: string | null;
    page_count: number;
    status: "ACTIVE" | "ARCHIVED" | "DELETED";
    created_at: string;
    updated_at: string;
    pages: PrescriptionPageItem[];
    uploaded_by_user?: {
        user_id: number;
        name?: string | null;
        email?: string | null;
    } | null;
    uploaded_by_patient?: {
        patient_id: number;
        full_name?: string | null;
        phone?: string | null;
    } | null;
}

import AppointmentModal, { type AppointmentModalInitialValues } from "./AppointmentModal";
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
    COMPLETED: "Visited",
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

const parseAppointmentStart = (appointment: Pick<Appointment, "appointment_date" | "start_time">) => {
    const datePart = String(appointment.appointment_date || "").slice(0, 10);
    const rawTime = String(appointment.start_time || "").trim();
    if (!datePart || !rawTime) return null;

    const plainTimeMatch = rawTime.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    let hh = "";
    let mm = "";

    if (plainTimeMatch) {
        hh = String(Number(plainTimeMatch[1])).padStart(2, "0");
        mm = String(Number(plainTimeMatch[2])).padStart(2, "0");
    } else {
        const timeDate = new Date(rawTime);
        if (Number.isNaN(timeDate.getTime())) return null;
        hh = String(timeDate.getUTCHours()).padStart(2, "0");
        mm = String(timeDate.getUTCMinutes()).padStart(2, "0");
    }

    const result = new Date(`${datePart}T${hh}:${mm}:00+05:30`);
    return Number.isNaN(result.getTime()) ? null : result;
};

export default function DoctorAppointmentsPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string } | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteAppointment, setDeleteAppointment] = useState<Appointment | null>(null);
    const [deleting, setDeleting] = useState(false);
    const [datePreset, setDatePreset] = useState<DatePreset>("TODAY");
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [prescriptionTarget, setPrescriptionTarget] = useState<PrescriptionModalTarget | null>(null);

    const [userRole, setUserRole] = useState<string>("DOCTOR");
    const [staffRole, setStaffRole] = useState<string>("");
    const [assignedDoctorCount, setAssignedDoctorCount] = useState(0);
    const [hospitalDoctors, setHospitalDoctors] = useState<HospitalDoctorOption[]>([]);
    const [selectedDoctorFilter, setSelectedDoctorFilter] = useState<string>("ALL");
    const [emrPadEnabled, setEmrPadEnabled] = useState(false);

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
            if (debouncedSearchTerm.trim()) {
                params.set("search", debouncedSearchTerm.trim());
            }

            const query = params.toString();
            const cacheBust = `_ts=${Date.now()}`;
            const appointmentsUrl = query
                ? `/api/appointments?${query}&${cacheBust}`
                : `/api/appointments?${cacheBust}`;
            const [meRes, aptRes] = await Promise.all([
                fetch("/api/auth/me", { cache: "no-store" }),
                fetch(appointmentsUrl, { cache: "no-store" }),
            ]);
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            // Allow both DOCTOR and CLINIC_STAFF
            if (meData.user.role !== "DOCTOR" && meData.user.role !== "CLINIC_STAFF") { router.push("/login"); return; }
            setUser(meData.user);
            setUserRole(meData.user.role);
            setStaffRole(meData.user.staff_role || "");
            setAssignedDoctorCount(Array.isArray(meData.user.assigned_doctor_ids) ? meData.user.assigned_doctor_ids.length : 0);
            setEmrPadEnabled(Boolean(meData.user.emr_prescription_enabled));
            if (aptRes.ok) { const data = await aptRes.json(); setAppointments(data || []); }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router, datePreset, customFrom, customTo, statusFilter, debouncedSearchTerm]);

    useEffect(() => {
        const timeout = window.setTimeout(() => {
            setDebouncedSearchTerm(searchTerm.trim());
        }, 250);

        return () => window.clearTimeout(timeout);
    }, [searchTerm]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (userRole !== "CLINIC_STAFF" || assignedDoctorCount <= 1) {
            setHospitalDoctors([]);
            setSelectedDoctorFilter("ALL");
            return;
        }

        let cancelled = false;

        const loadHospitalDoctors = async () => {
            try {
                const res = await fetch("/api/clinics", { cache: "no-store" });
                if (!res.ok) return;

                const data = await res.json();
                const doctors = Array.isArray(data.doctors) ? data.doctors : [];
                if (!cancelled) {
                    setHospitalDoctors(doctors);
                }
            } catch (error) {
                console.error("Failed to load hospital doctors", error);
            }
        };

        void loadHospitalDoctors();

        return () => {
            cancelled = true;
        };
    }, [assignedDoctorCount, userRole]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            if (document.visibilityState !== "visible") return;
            fetchData();
        }, 15000);

        const handleVisibilityOrFocus = () => {
            if (document.visibilityState !== "visible") return;
            fetchData();
        };

        window.addEventListener("focus", handleVisibilityOrFocus);
        document.addEventListener("visibilitychange", handleVisibilityOrFocus);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", handleVisibilityOrFocus);
            document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
        };
    }, [fetchData]);

    const sortedAppointments = useMemo(() => {
        return [...appointments].sort((a, b) => {
            const aStart = parseAppointmentStart(a);
            const bStart = parseAppointmentStart(b);
            const aTs = aStart ? aStart.getTime() : Number.MAX_SAFE_INTEGER;
            const bTs = bStart ? bStart.getTime() : Number.MAX_SAFE_INTEGER;

            if (aTs !== bTs) return aTs - bTs;

            const aBooking = Number(a.booking_id ?? a.appointment_id ?? Number.MAX_SAFE_INTEGER);
            const bBooking = Number(b.booking_id ?? b.appointment_id ?? Number.MAX_SAFE_INTEGER);
            if (aBooking !== bBooking) return aBooking - bBooking;

            return a.appointment_id - b.appointment_id;
        });
    }, [appointments]);

    const filteredAppointments = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        if (!query) {
            return sortedAppointments;
        }

        const normalizedQueryPhone = query.replace(/\D/g, "");

        return sortedAppointments.filter((appointment) => {
            const normalizedName = String(appointment.patient?.full_name || "").toLowerCase();
            const normalizedPhone = String(appointment.patient?.phone || "").replace(/\D/g, "");

            return (
                normalizedName.includes(query) ||
                (normalizedQueryPhone.length > 0 && normalizedPhone.includes(normalizedQueryPhone))
            );
        });
    }, [searchTerm, sortedAppointments]);

    const isHospitalStaffView = userRole === "CLINIC_STAFF" && assignedDoctorCount > 1;

    const doctorChips = useMemo(() => {
        if (!isHospitalStaffView) return [];

        const counts = new Map<number, number>();
        filteredAppointments.forEach((appointment) => {
            const doctorId = Number(appointment.doctor_id);
            counts.set(doctorId, (counts.get(doctorId) || 0) + 1);
        });

        const doctorsById = new Map<number, HospitalDoctorOption>();
        hospitalDoctors.forEach((doctor) => {
            doctorsById.set(Number(doctor.doctor_id), doctor);
        });

        filteredAppointments.forEach((appointment) => {
            if (!doctorsById.has(Number(appointment.doctor_id))) {
                doctorsById.set(Number(appointment.doctor_id), {
                    doctor_id: appointment.doctor_id,
                    doctor_name: appointment.doctor?.doctor_name || null,
                });
            }
        });

        return Array.from(doctorsById.values())
            .map((doctor) => {
                const rawName = String(doctor.doctor_name || "").trim();
                return {
                    doctor_id: Number(doctor.doctor_id),
                    count: counts.get(Number(doctor.doctor_id)) || 0,
                    label: rawName
                        ? (/^dr\.?\s/i.test(rawName) ? rawName : `Dr. ${rawName}`)
                        : `Doctor ${doctor.doctor_id}`,
                };
            })
            .sort((left, right) => {
                const leftActive = left.count > 0 ? 1 : 0;
                const rightActive = right.count > 0 ? 1 : 0;
                if (leftActive !== rightActive) return rightActive - leftActive;
                if (left.count !== right.count) return right.count - left.count;
                return left.label.localeCompare(right.label);
            });
    }, [filteredAppointments, hospitalDoctors, isHospitalStaffView]);

    const visibleAppointments = useMemo(() => {
        if (!isHospitalStaffView || selectedDoctorFilter === "ALL") {
            return filteredAppointments;
        }

        const selectedDoctorId = Number(selectedDoctorFilter);
        return filteredAppointments.filter((appointment) => Number(appointment.doctor_id) === selectedDoctorId);
    }, [filteredAppointments, isHospitalStaffView, selectedDoctorFilter]);

    useEffect(() => {
        if (!isHospitalStaffView) return;
        if (selectedDoctorFilter === "ALL") return;
        if (doctorChips.some((doctor) => String(doctor.doctor_id) === selectedDoctorFilter)) return;
        setSelectedDoctorFilter("ALL");
    }, [doctorChips, isHospitalStaffView, selectedDoctorFilter]);

    const groupedAppointments = useMemo(() => {
        const groups = new Map<string, { name: string; appointments: Appointment[] }>();
        const groupByDoctor = userRole === "CLINIC_STAFF" && assignedDoctorCount > 1;

        visibleAppointments.forEach((apt) => {
            const doctorNameRaw = apt.doctor?.doctor_name?.trim() || "";
            const doctorName = doctorNameRaw
                ? (/^dr\.?\s/i.test(doctorNameRaw) ? doctorNameRaw : `Dr. ${doctorNameRaw}`)
                : `Doctor ${apt.doctor_id}`;
            const clinicName = apt.clinic?.clinic_name?.trim() || "Unknown Clinic";
            const groupName = groupByDoctor ? doctorName : clinicName;
            const key = groupByDoctor
                ? `doctor-${apt.doctor_id}`
                : apt.clinic?.clinic_id
                    ? `clinic-${apt.clinic.clinic_id}`
                    : `clinic-${clinicName}`;
            if (!groups.has(key)) {
                groups.set(key, { name: groupName, appointments: [] });
            }
            groups.get(key)?.appointments.push(apt);
        });
        return Array.from(groups.values());
    }, [assignedDoctorCount, userRole, visibleAppointments]);

    const handleStatusUpdate = async (appointmentId: number, status: string) => {
        const body: Record<string, unknown> = { appointmentId, status };
        if (status === 'CANCELLED') body.cancelled_by = 'DOCTOR';
        const res = await fetch("/api/appointments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) setAppointments(appointments.map((a) => a.appointment_id === appointmentId ? { ...a, status, ...(status === 'CANCELLED' ? { cancelled_by: 'DOCTOR' } : {}) } : a));
    };

    const openPrescriptionHistory = useCallback((apt: Appointment) => {
        if (!apt.patient?.patient_id) {
            return;
        }
        setPrescriptionTarget({
            patientId: apt.patient.patient_id,
            doctorId: apt.doctor_id,
            patientName: apt.patient?.full_name || "Patient",
            clinicId: apt.clinic?.clinic_id ?? null,
            appointmentId: apt.appointment_id,
        });
    }, []);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [rescheduleAppointment, setRescheduleAppointment] = useState<Appointment | null>(null);
    const showFlatDoctorView = isHospitalStaffView && selectedDoctorFilter !== "ALL";
    const rescheduleInitialValues = useMemo<AppointmentModalInitialValues | undefined>(() => {
        if (!rescheduleAppointment) return undefined;

        return {
            appointmentId: rescheduleAppointment.appointment_id,
            patient_phone: rescheduleAppointment.patient?.phone || '',
            patient_name: rescheduleAppointment.patient?.full_name || '',
            clinic_id: rescheduleAppointment.clinic?.clinic_id ? String(rescheduleAppointment.clinic.clinic_id) : '',
            date: toISTDateInput(rescheduleAppointment.appointment_date),
            time: formatTime(rescheduleAppointment.start_time),
            booking_for: rescheduleAppointment.booked_for === 'OTHER' ? 'OTHER' : 'SELF',
        };
    }, [rescheduleAppointment]);

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

    const renderAppointmentTable = (items: Appointment[]) => (
        <div className="overflow-x-auto">
            <table className="data-table">
                <thead><tr><th>Patient</th><th>Appointment No.</th><th>Phone</th><th>Date & Time</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                    {items.map((apt, i) => (
                        <motion.tr key={apt.appointment_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.03 }}>
                            <td>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center text-xs font-bold text-white">
                                        {apt.patient?.full_name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => openPrescriptionHistory(apt)}
                                        className="text-left text-indigo-700 hover:text-indigo-900 hover:underline font-medium"
                                    >
                                        {apt.patient?.full_name || "N/A"}
                                    </button>
                                </div>
                            </td>
                            <td className="text-gray-500 font-medium">
                                {apt.booking_id ?? apt.appointment_id}
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
                                <div className="flex flex-wrap gap-2">
                                    {(userRole === "DOCTOR" || staffRole === "HAVE_ACCESS") && (
                                        <>
                                            {userRole === "DOCTOR" && (
                                                emrPadEnabled ? (
                                                <motion.button
                                                    onClick={() => {
                                                        if (!apt.patient?.patient_id) return;
                                                        window.open(
                                                            `/dashboard/doctor/appointments/${apt.appointment_id}/pad`,
                                                            "_blank",
                                                            "noopener,noreferrer"
                                                        );
                                                    }}
                                                    disabled={!apt.patient?.patient_id}
                                                    className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors ${
                                                        apt.patient?.patient_id
                                                            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                            : "cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400"
                                                    }`}
                                                    whileHover={apt.patient?.patient_id ? { scale: 1.03 } : undefined}
                                                    whileTap={apt.patient?.patient_id ? { scale: 0.97 } : undefined}
                                                    title={
                                                        !apt.patient?.patient_id
                                                            ? "Patient context is required to open the EMR pad"
                                                            : "View EMR Pad"
                                                    }
                                                    aria-label="View EMR Pad"
                                                >
                                                    <Stethoscope size={14} />
                                                    View Pad
                                                </motion.button>
                                                ) : null
                                            )}
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
    );

    return (
        <div className="w-full">
            <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Appointments</h1>
                    <p className="text-gray-500 mt-1 text-sm">
                        {userRole === "CLINIC_STAFF"
                            ? assignedDoctorCount > 1
                                ? "Viewing assigned hospital doctor appointments"
                                : "Viewing clinic appointments"
                            : "Manage your patient appointments"}
                    </p>
                </motion.div>
                {/* Only DOCTOR or HAVE_ACCESS staff can add appointments */}
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="w-full sm:max-w-sm"
                    >
                        <div className="relative">
                            <Search
                                size={16}
                                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(event) => setSearchTerm(event.target.value)}
                                placeholder="Search by patient name or phone"
                                className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-11 pr-11 text-sm text-gray-700 outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                            />
                            {searchTerm ? (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                    aria-label="Clear appointment search"
                                    title="Clear"
                                >
                                    <X size={15} />
                                </button>
                            ) : null}
                        </div>
                    </motion.div>
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsExportOpen(true)}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
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
                            className="inline-flex shrink-0 whitespace-nowrap items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white shadow-lg shadow-indigo-200 transition-colors hover:bg-indigo-700"
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
                className="glass-card mb-6 p-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
            >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-3 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                                <Filter size={16} />
                            </span>
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
                        <div className="w-full sm:min-w-[180px]">
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
                                setDatePreset("TODAY");
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
                initialValues={rescheduleInitialValues}
            />
            <DoctorPrescriptionModal
                isOpen={Boolean(prescriptionTarget)}
                onClose={() => setPrescriptionTarget(null)}
                target={prescriptionTarget}
                allowUpload={userRole === "DOCTOR" || staffRole === "HAVE_ACCESS"}
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
                        <div className="flex flex-col-reverse gap-3 p-6 sm:flex-row sm:justify-end">
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
                {isHospitalStaffView && doctorChips.length > 0 ? (
                    <div className="mb-6 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h2 className="text-sm font-semibold text-gray-800">Doctors</h2>
                                <p className="mt-1 text-xs text-gray-500">Choose a doctor to narrow the visible appointments.</p>
                            </div>
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                                {visibleAppointments.length} visible
                            </span>
                        </div>
                        <div className="-mx-1 overflow-x-auto pb-1">
                            <div className="flex min-w-max gap-2 px-1">
                                <button
                                    type="button"
                                    onClick={() => setSelectedDoctorFilter("ALL")}
                                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                                        selectedDoctorFilter === "ALL"
                                            ? "border-indigo-600 bg-indigo-600 text-white"
                                            : "border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-indigo-50"
                                    }`}
                                >
                                    <span>All Doctors</span>
                                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                                        selectedDoctorFilter === "ALL"
                                            ? "bg-white/20 text-white"
                                            : "bg-gray-100 text-gray-600"
                                    }`}>
                                        {filteredAppointments.length}
                                    </span>
                                </button>
                                {doctorChips.map((doctor) => (
                                    <button
                                        key={doctor.doctor_id}
                                        type="button"
                                        onClick={() => setSelectedDoctorFilter(String(doctor.doctor_id))}
                                        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                                            selectedDoctorFilter === String(doctor.doctor_id)
                                                ? "border-indigo-600 bg-indigo-600 text-white"
                                                : "border-gray-200 bg-white text-gray-700 hover:border-indigo-200 hover:bg-indigo-50"
                                        }`}
                                    >
                                        <span className="whitespace-nowrap">{doctor.label}</span>
                                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                                            selectedDoctorFilter === String(doctor.doctor_id)
                                                ? "bg-white/20 text-white"
                                                : doctor.count > 0
                                                    ? "bg-emerald-100 text-emerald-700"
                                                    : "bg-gray-100 text-gray-500"
                                        }`}>
                                            {doctor.count}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : null}

                {appointments.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-gray-400">No appointments yet</p>
                    </div>
                ) : groupedAppointments.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-lg font-semibold text-gray-700">No matching appointments</p>
                        <p className="mt-2 text-sm text-gray-400">Try searching by another name or phone number.</p>
                    </div>
                ) : showFlatDoctorView ? (
                    <div className="rounded-xl border border-gray-200 bg-white/70 px-5 pb-5 pt-3 shadow-sm">
                        {renderAppointmentTable(visibleAppointments)}
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {groupedAppointments.map((group, gi) => (
                            <motion.div
                                key={`${group.name}-${gi}`}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 + gi * 0.05 }}
                                className="border border-gray-200 rounded-xl bg-white/70 shadow-sm"
                            >
                                <details className="group">
                                    <summary className="details-summary-reset cursor-pointer px-5 py-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-700 flex items-center justify-center font-bold">
                                                    {group.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className="truncate text-base font-medium text-gray-900">{group.name}</div>
                                            </div>
                                            <div className="flex items-center gap-3 self-start sm:self-auto">
                                                <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                                                    {group.appointments.length} appointment{group.appointments.length !== 1 ? "s" : ""}
                                                </span>
                                                <ChevronDown size={16} className="text-gray-400 transition-transform group-open:rotate-180" />
                                            </div>
                                        </div>
                                    </summary>
                                    <div className="border-t border-gray-100 px-5 pb-5 pt-3">
                                        {renderAppointmentTable(group.appointments)}
                                    </div>
                                </details>
                            </motion.div>
                        ))}
                    </div>
                )}
            </motion.div>
        </div>
    );
}
