"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Calendar, Activity, Loader2, XCircle, CheckCircle2, Clock, UserX } from "lucide-react";
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
    appointment_date: string | null;
    start_time: string | null;
    status: string;
    patient: { full_name: string; phone: string; booking_id?: number | null } | null;
    clinic: { clinic_name: string } | null;
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

    const fetchData = useCallback(async () => {
        try {
            // Always fetch current user info first to determine the role
            const meRes = await fetch("/api/auth/me");
            if (!meRes.ok) return;
            const meData = await meRes.json();
            const currentRole = meData.user?.role;
            setUserRole(currentRole);

            if (currentRole === "DOCTOR") {
                const doctorRes = await fetch("/api/doctors/me");
                if (doctorRes.ok) {
                    const doctorData = await doctorRes.json();
                    setUser({ name: doctorData.doctor.doctor_name || meData.user?.name || "Doctor" });
                }
            } else {
                // For CLINIC_STAFF use the name from users table
                setUser({ name: meData.user?.name || "Staff" });
            }

            // Role-based filtering is handled automatically by the API
            const res = await fetch("/api/appointments");
            if (res.ok) {
                const data: Appointment[] = await res.json();

                // Compute stats from DB status values
                const booked = data.filter(a => a.status === "BOOKED").length;
                const cancelled = data.filter(a => a.status === "CANCELLED").length;
                const completed = data.filter(a => a.status === "COMPLETED").length;
                // "Not Visited" = PENDING (patient didn't show / slot passed without completion)
                const notVisited = data.filter(a => a.status === "PENDING").length;

                setStats({ bookedAppointments: booked, cancelledAppointments: cancelled, completedAppointments: completed, notVisitedAppointments: notVisited });

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

    const statCards = [
        { label: "Total Booked", value: stats?.bookedAppointments ?? 0, icon: Calendar, color: "#4f46e5" },
        { label: "Total Cancelled", value: stats?.cancelledAppointments ?? 0, icon: XCircle, color: "#dc2626" },
        { label: "Total Completed", value: stats?.completedAppointments ?? 0, icon: CheckCircle2, color: "#059669" },
        { label: "Total Not Visited", value: stats?.notVisitedAppointments ?? 0, icon: UserX, color: "#d97706" },
    ];

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
            header: "Appt No.",
            accessorKey: (item: Appointment) => (
                <span className="text-gray-700 text-sm">{item.patient?.booking_id ?? "—"}</span>
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
        <div className="relative min-h-screen w-full p-8 max-w-7xl mx-auto space-y-8">
            {/* Background Gradients */}
            <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[100px]" />
            </div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                    {userRole === "CLINIC_STAFF" ? `Welcome, ${user.name}` : `Welcome Back, Dr. ${user.name}`}
                </h1>
                <p className="text-gray-500 mt-2 text-lg">
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
                    <div className="flex items-center justify-between p-6 border-b border-gray-100/50">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-indigo-500" />
                            Recent Appointments
                        </h2>
                        <button
                            className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all hover:shadow-md"
                            onClick={() => router.push("/dashboard/doctor/appointments")}
                        >
                            View All
                        </button>
                    </div>
                    <div className="p-2">
                        <PremiumTable columns={columns} data={recentAppointments} />
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}
