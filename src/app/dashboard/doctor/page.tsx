"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Calendar, Activity, Loader2, XCircle, CheckCircle2, Clock, UserX, MonitorPlay, Stethoscope } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumTable } from "@/components/ui/PremiumTable";

interface DoctorStats {
    bookedAppointments: number;
    cancelledAppointments: number;
    completedAppointments: number;
    notVisitedAppointments: number;
}

interface Appointment {
    appointment_id: number;
    booking_id?: number | null;
    appointment_date: string | null;
    start_time: string | null;
    status: string;
    doctor_id: number;
    patient: { full_name: string; phone: string; booking_id?: number | null } | null;
    clinic: { clinic_name: string } | null;
    doctor?: { doctor_id: number; doctor_name?: string | null } | null;
}

interface AssignedDoctor {
    doctor_id: number;
    doctor_name?: string | null;
    specialization?: string | null;
    education?: string | null;
    status?: string | null;
}

interface StaffClinic {
    clinic_id: number;
    clinic_name?: string | null;
    hospital_group_code?: string | null;
    location?: string | null;
    doctor_id?: number | null;
    doctor?: AssignedDoctor | null;
}

interface StaffContext {
    doctorId: number;
    clinicId: number | null;
}

function buildDoctorStats(appointments: Appointment[]): DoctorStats {
    return {
        bookedAppointments: appointments.filter((item) => item.status === "BOOKED").length,
        cancelledAppointments: appointments.filter((item) => item.status === "CANCELLED").length,
        completedAppointments: appointments.filter((item) => item.status === "COMPLETED").length,
        notVisitedAppointments: appointments.filter((item) => item.status === "PENDING").length,
    };
}

function formatDoctorName(doctor?: { doctor_id?: number; doctor_name?: string | null } | null): string {
    const rawName = String(doctor?.doctor_name || "").trim();
    if (rawName) {
        return /^dr\.?\s/i.test(rawName) ? rawName : `Dr. ${rawName}`;
    }
    return doctor?.doctor_id ? `Doctor #${doctor.doctor_id}` : "Doctor";
}

function getTodayYMDInIST(): string {
    const nowIST = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${nowIST.getUTCFullYear()}-${pad(nowIST.getUTCMonth() + 1)}-${pad(nowIST.getUTCDate())}`;
}

/** Format an appointment_date ISO string to a readable date in IST */
function formatAppointmentDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "N/A";
    // appointment_date is stored as DATE in MySQL → Prisma returns UTC midnight ISO string
    // Slice just the YYYY-MM-DD part to avoid timezone shift
    const ymd = String(dateStr).slice(0, 10);
    const [year, month, day] = ymd.split("-").map(Number);
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${months[month - 1]} ${year}`;
}

/** Format a TIME value (stored as 1970-01-01T{HH:MM:SS}.000Z) to HH:MM AM/PM */
function formatAppointmentTime(timeStr: string | null | undefined): string {
    if (!timeStr) return "";
    // Prisma returns TIME as a full ISO string anchored to 1970-01-01
    const t = new Date(timeStr);
    let hours = t.getUTCHours();
    const minutes = t.getUTCMinutes();
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    return `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
    BOOKED: { label: "Booked", classes: "bg-indigo-50 text-indigo-700 border-indigo-200" },
    PENDING: { label: "Not Visited", classes: "bg-amber-50 text-amber-700 border-amber-200" },
    CONFIRMED: { label: "Confirmed", classes: "bg-blue-50 text-blue-700 border-blue-200" },
    CANCELLED: { label: "Cancelled", classes: "bg-red-50 text-red-600 border-red-200" },
    COMPLETED: { label: "Completed", classes: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export default function DoctorDashboard() {
    const router = useRouter();
    const [user, setUser] = useState({ name: "Doctor" });
    const [stats, setStats] = useState<DoctorStats | null>(null);
    const [recentAppointments, setRecentAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);

    const [userRole, setUserRole] = useState("DOCTOR");
    const [assignedDoctorIds, setAssignedDoctorIds] = useState<number[]>([]);
    const [staffDoctors, setStaffDoctors] = useState<AssignedDoctor[]>([]);
    const [staffClinics, setStaffClinics] = useState<StaffClinic[]>([]);
    const [selectedContext, setSelectedContext] = useState<StaffContext | null>(null);
    const [allAppointments, setAllAppointments] = useState<Appointment[]>([]);
    const [selectedOverviewDoctorId, setSelectedOverviewDoctorId] = useState<number | null>(null);

    const fetchData = useCallback(async () => {
        try {
            // Always fetch current user info first to determine the role
            const meRes = await fetch("/api/auth/me");
            if (!meRes.ok) return;
            const meData = await meRes.json();
            const currentRole = meData.user?.role;
            const nextAssignedDoctorIds: number[] = Array.isArray(meData.user?.assigned_doctor_ids)
                ? meData.user.assigned_doctor_ids.map(Number).filter((value: number) => Number.isFinite(value))
                : [];
            setUserRole(currentRole);
            setAssignedDoctorIds(nextAssignedDoctorIds);

            if (currentRole === "DOCTOR") {
                const doctorRes = await fetch("/api/doctors/me");
                if (doctorRes.ok) {
                    const doctorData = await doctorRes.json();
                    setUser({ name: doctorData.doctor.doctor_name || meData.user?.name || "Doctor" });
                }
            } else {
                // For CLINIC_STAFF use the name from users table
                setUser({ name: meData.user?.name || "Staff" });
                const clinicsRes = await fetch("/api/clinics");
                if (clinicsRes.ok) {
                    const clinicsData = await clinicsRes.json();
                    const clinics: StaffClinic[] = Array.isArray(clinicsData.clinics) ? clinicsData.clinics : [];
                    const doctorsFromApi: AssignedDoctor[] = Array.isArray(clinicsData.doctors) ? clinicsData.doctors : [];
                    const doctorsById = new Map<number, AssignedDoctor>();

                    doctorsFromApi.forEach((doctor) => {
                        doctorsById.set(Number(doctor.doctor_id), doctor);
                    });

                    clinics.forEach((clinic) => {
                        const doctor = clinic.doctor;
                        if (doctor?.doctor_id) {
                            doctorsById.set(Number(doctor.doctor_id), doctor);
                        }
                    });

                    const derivedDoctorIds = Array.from(doctorsById.keys());
                    const orderedIds = nextAssignedDoctorIds.length > 0 ? nextAssignedDoctorIds : derivedDoctorIds;
                    const orderedDoctors = orderedIds
                        .map((doctorId) => doctorsById.get(doctorId))
                        .filter((doctor): doctor is AssignedDoctor => Boolean(doctor));

                    setStaffDoctors(orderedDoctors);
                    setStaffClinics(clinics);
                    if (derivedDoctorIds.length > nextAssignedDoctorIds.length) {
                        setAssignedDoctorIds(derivedDoctorIds);
                    }

                    const firstDoctorId = orderedDoctors[0]?.doctor_id || orderedIds[0] || null;
                    const firstClinic = firstDoctorId
                        ? clinics.find((clinic) => Number(clinic.doctor_id || clinic.doctor?.doctor_id) === Number(firstDoctorId))
                        : null;

                    if (firstDoctorId) {
                        const nextContext = {
                            doctorId: Number(firstDoctorId),
                            clinicId: firstClinic?.clinic_id ? Number(firstClinic.clinic_id) : null,
                        };
                        setSelectedContext(nextContext);
                        localStorage.setItem("hospital_staff_context", JSON.stringify(nextContext));
                    }
                }
            }

            // Role-based filtering is handled automatically by the API
            const res = await fetch("/api/appointments");
            if (res.ok) {
                const data: Appointment[] = await res.json();
                setAllAppointments(data);

                setStats(buildDoctorStats(data));

                const todayYMD = getTodayYMDInIST();
                const normalizeYMD = (d: string | null) => (d ? d.slice(0, 10) : "");

                const todayAppointments = data
                    .filter(a => normalizeYMD(a.appointment_date) === todayYMD)
                    .sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

                const futureAppointments = data
                    .filter(a => {
                        const ymd = normalizeYMD(a.appointment_date);
                        return ymd && ymd > todayYMD;
                    })
                    .sort((a, b) => {
                        const da = normalizeYMD(a.appointment_date);
                        const db = normalizeYMD(b.appointment_date);
                        if (da !== db) return da.localeCompare(db);
                        return (a.start_time || "").localeCompare(b.start_time || "");
                    });

                const ordered = [...todayAppointments, ...futureAppointments];
                setRecentAppointments(ordered.slice(0, 6));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            </div>
        );
    }

    const isHospitalStaff = userRole === "CLINIC_STAFF" && (assignedDoctorIds.length > 1 || staffDoctors.length > 1);

    const handleSelectDoctor = (doctorId: number) => {
        const clinic = staffClinics.find((item) => Number(item.doctor_id || item.doctor?.doctor_id) === Number(doctorId));
        const nextContext = {
            doctorId,
            clinicId: clinic?.clinic_id ? Number(clinic.clinic_id) : null,
        };
        setSelectedContext(nextContext);
        localStorage.setItem("hospital_staff_context", JSON.stringify(nextContext));
    };

    const columns = [
        {
            header: "Patient",
            accessorKey: (item: Appointment) => (
                <div>
                    <div className="font-medium text-gray-900">{item.patient?.full_name || "Unknown"}</div>
                    <div className="text-xs text-gray-400">{item.patient?.phone || "—"}</div>
                </div>
            )
        },
        {
            header: "Appointment No.",
            accessorKey: (item: Appointment) => (
                <span className="text-gray-700 text-sm">{item.booking_id ?? "—"}</span>
            )
        },
        {
            header: "Date",
            accessorKey: (item: Appointment) => (
                <div>
                    <div className="text-gray-800 font-medium">{formatAppointmentDate(item.appointment_date)}</div>
                    {item.start_time && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {formatAppointmentTime(item.start_time)}
                        </div>
                    )}
                </div>
            )
        },
        {
            header: "Clinic",
            accessorKey: (item: Appointment) => (
                <span className="text-gray-600 text-sm">{item.clinic?.clinic_name || "—"}</span>
            )
        },
        {
            header: "Status",
            accessorKey: (item: Appointment) => {
                const cfg = STATUS_CONFIG[item.status] || { label: item.status, classes: "bg-gray-50 text-gray-600 border-gray-200" };
                return (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.classes}`}>
                        {cfg.label}
                    </span>
                );
            }
        }
    ];

    if (isHospitalStaff) {
        const selectedDoctor = staffDoctors.find((doctor) => Number(doctor.doctor_id) === Number(selectedOverviewDoctorId)) || null;
        const overviewAppointments = selectedOverviewDoctorId
            ? allAppointments.filter((appointment) => Number(appointment.doctor_id) === Number(selectedOverviewDoctorId))
            : allAppointments;
        const overviewStats = buildDoctorStats(overviewAppointments);
        const overviewRecentAppointments = [...overviewAppointments]
            .sort((left, right) => {
                const leftDate = String(left.appointment_date || "");
                const rightDate = String(right.appointment_date || "");
                if (leftDate !== rightDate) return rightDate.localeCompare(leftDate);
                return String(right.start_time || "").localeCompare(String(left.start_time || ""));
            })
            .slice(0, 4);
        const statCards = [
            { label: "Total Booked", value: overviewStats.bookedAppointments, icon: Calendar, color: "#4f46e5" },
            { label: "Total Cancelled", value: overviewStats.cancelledAppointments, icon: XCircle, color: "#dc2626" },
            { label: "Total Completed", value: overviewStats.completedAppointments, icon: CheckCircle2, color: "#059669" },
            { label: "Total Not Visited", value: overviewStats.notVisitedAppointments, icon: UserX, color: "#d97706" },
            { label: "Total Assigned Doctors", value: staffDoctors.length, icon: Stethoscope, color: "#0f766e" },
        ];
        const hospitalColumns = [
            {
                header: "Doctor",
                accessorKey: (item: Appointment) => (
                    <span className="text-sm font-medium text-gray-800">
                        {formatDoctorName(item.doctor || { doctor_id: item.doctor_id })}
                    </span>
                )
            },
            ...columns.slice(0, 3),
            columns[4],
        ];

        return (
            <div className="relative mx-auto min-h-screen w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
                <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
                    <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse" />
                    <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px]" />
                </div>

                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                    <p className="text-sm font-semibold uppercase tracking-[0.2em] text-indigo-500">Hospital Staff</p>
                    <h1 className="mt-2 text-3xl font-extrabold text-gray-900 sm:text-4xl">
                        Welcome, {user.name}
                    </h1>
                </motion.div>

                <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                    {statCards.map((card, index) => (
                        <motion.div
                            key={card.label}
                            initial={{ opacity: 0, y: 18 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: index * 0.05 }}
                        >
                            <StatCard title={card.label} value={card.value} icon={card.icon} color={card.color} />
                        </motion.div>
                    ))}
                </div>

                <div className="grid grid-cols-1 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
                    <GlassCard className="border border-white/20 bg-white/50 p-0 shadow-xl backdrop-blur-md">
                        <div className="border-b border-gray-100/70 px-4 py-3">
                            <h2 className="text-base font-bold text-gray-900">Assigned Doctors</h2>
                        </div>
                        <div className="h-[300px] overflow-y-auto">
                            <div className="divide-y divide-gray-100/80">
                                <button
                                    type="button"
                                    onClick={() => setSelectedOverviewDoctorId(null)}
                                    className={`flex h-[76px] w-full items-center justify-between gap-4 border-l-4 px-4 text-left transition ${selectedOverviewDoctorId === null ? "border-l-indigo-600 bg-indigo-50/80" : "border-l-transparent hover:bg-gray-50/80"}`}
                                >
                                    <div className="min-w-0">
                                        <div className="font-semibold text-gray-900">All Doctors</div>
                                        <p className="mt-1 text-xs text-gray-500">Combined</p>
                                    </div>
                                    <div className="text-right text-xs font-semibold text-gray-500">
                                        {staffDoctors.length} doctors
                                    </div>
                                </button>
                                {staffDoctors.map((doctor) => {
                                    const active = Number(selectedOverviewDoctorId) === Number(doctor.doctor_id);
                                    const clinicsForDoctor = staffClinics.filter((clinic) => Number(clinic.doctor_id || clinic.doctor?.doctor_id) === Number(doctor.doctor_id));
                                    const doctorAppointmentCount = allAppointments.filter((appointment) => Number(appointment.doctor_id) === Number(doctor.doctor_id)).length;

                                    return (
                                        <button
                                            key={doctor.doctor_id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedOverviewDoctorId(Number(doctor.doctor_id));
                                                handleSelectDoctor(Number(doctor.doctor_id));
                                            }}
                                            className={`flex h-[76px] w-full items-center justify-between gap-4 border-l-4 px-4 text-left transition ${active ? "border-l-indigo-600 bg-indigo-50/80" : "border-l-transparent hover:bg-gray-50/80"}`}
                                        >
                                            <div className="min-w-0">
                                                <div className="truncate font-semibold text-gray-900">
                                                    {formatDoctorName(doctor)}
                                                </div>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {clinicsForDoctor.length} clinic{clinicsForDoctor.length === 1 ? "" : "s"}
                                                </p>
                                            </div>
                                            <div className="text-right text-xs font-semibold text-gray-500">
                                                {doctorAppointmentCount}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="border-t border-gray-100/70 px-4 py-3">
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    type="button"
                                    onClick={() => router.push("/dashboard/doctor/appointments")}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-indigo-700"
                                >
                                    <Calendar className="h-4 w-4" />
                                    Appointments
                                </button>
                                <button
                                    type="button"
                                    onClick={() => router.push("/dashboard/doctor/live-hospital")}
                                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700"
                                >
                                    <MonitorPlay className="h-4 w-4" />
                                    Hospital TV
                                </button>
                            </div>
                        </div>
                    </GlassCard>

                    <div className="space-y-5">
                        <GlassCard className="border border-white/20 bg-white/50 p-0 shadow-xl backdrop-blur-md">
                            <div className="flex items-center justify-between border-b border-gray-100/70 px-4 py-3">
                                <div>
                                    <h2 className="text-base font-bold text-gray-900">
                                        {selectedDoctor ? formatDoctorName(selectedDoctor) : "All Assigned Doctors"}
                                    </h2>
                                </div>
                                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm">
                                    {overviewAppointments.length} appointment{overviewAppointments.length === 1 ? "" : "s"}
                                </div>
                            </div>
                            <div className="overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3">
                                    <h2 className="text-base font-bold text-gray-900">Recent Appointments</h2>
                                </div>
                            </div>
                            <div className="max-h-[360px] overflow-auto p-2">
                                {overviewRecentAppointments.length > 0 ? (
                                    <PremiumTable columns={hospitalColumns} data={overviewRecentAppointments} />
                                ) : (
                                    <div className="flex h-[220px] items-center justify-center text-sm text-gray-400">
                                        No appointments
                                    </div>
                                )}
                            </div>
                            <div className="border-t border-gray-100/70 px-4 py-3">
                                <button
                                    type="button"
                                    onClick={() => router.push("/dashboard/doctor/appointments")}
                                    className="rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-100"
                                >
                                    View All
                                </button>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            </div>
        );
    }

    const statCards = [
        { label: "Total Booked", value: stats?.bookedAppointments ?? 0, icon: Calendar, color: "#4f46e5" },
        { label: "Total Cancelled", value: stats?.cancelledAppointments ?? 0, icon: XCircle, color: "#dc2626" },
        { label: "Total Completed", value: stats?.completedAppointments ?? 0, icon: CheckCircle2, color: "#059669" },
        { label: "Total Not Visited", value: stats?.notVisitedAppointments ?? 0, icon: UserX, color: "#d97706" },
    ];

    const legacyColumns = [
        {
            header: "Patient",
            accessorKey: (item: Appointment) => (
                <div>
                    <div className="font-medium text-gray-900">{item.patient?.full_name || "Unknown"}</div>
                    <div className="text-xs text-gray-400">{item.patient?.phone || "—"}</div>
                </div>
            )
        },
        {
            header: "Appointment No.",
            accessorKey: (item: Appointment) => (
                <span className="text-gray-700 text-sm">{item.booking_id ?? "—"}</span>
            )
        },
        {
            header: "Date",
            accessorKey: (item: Appointment) => (
                <div>
                    <div className="text-gray-800 font-medium">{formatAppointmentDate(item.appointment_date)}</div>
                    {item.start_time && (
                        <div className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            {formatAppointmentTime(item.start_time)}
                        </div>
                    )}
                </div>
            )
        },
        {
            header: "Clinic",
            accessorKey: (item: Appointment) => (
                <span className="text-gray-600 text-sm">{item.clinic?.clinic_name || "—"}</span>
            )
        },
        {
            header: "Status",
            accessorKey: (item: Appointment) => {
                const cfg = STATUS_CONFIG[item.status] || { label: item.status, classes: "bg-gray-50 text-gray-600 border-gray-200" };
                return (
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.classes}`}>
                        {cfg.label}
                    </span>
                );
            }
        }
    ];

    return (
        <div className="relative mx-auto min-h-screen w-full max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
            {/* Background Gradients */}
            <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px]" />
            </div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 sm:text-4xl">
                    {userRole === "CLINIC_STAFF" ? `Welcome, ${user.name}` : `Welcome Back, Dr. ${user.name}`}
                </h1>
                <p className="mt-2 text-base text-gray-500 sm:text-lg">
                    {userRole === "CLINIC_STAFF" ? "Here's your clinic appointment overview." : "Here's your practice overview."}
                </p>
            </motion.div>

            {/* 4-column stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                {statCards.map((card, i) => (
                    <motion.div
                        key={card.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.4 }}
                    >
                        <StatCard
                            title={card.label}
                            value={card.value}
                            icon={card.icon}
                            color={card.color}
                        />
                    </motion.div>
                ))}
            </div>

            {/* Recent Appointments */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.5 }}>
                <GlassCard className="p-0 overflow-hidden border border-white/20 shadow-xl bg-white/40 backdrop-blur-md">
                    <div className="flex flex-col gap-3 border-b border-gray-100/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                        <h2 className="flex items-center gap-2 text-lg font-bold text-gray-800 sm:text-xl">
                            <Activity className="w-5 h-5 text-indigo-500" />
                            Recent Appointments
                        </h2>
                        <button
                            className="rounded-lg bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-600 transition-all hover:bg-indigo-100 hover:shadow-md sm:self-auto"
                            onClick={() => router.push("/dashboard/doctor/appointments")}
                        >
                            View All
                        </button>
                    </div>
                    <div className="p-2">
                        <PremiumTable columns={legacyColumns} data={recentAppointments} />
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}
