"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import DashboardSidebar from "@/components/DashboardSidebar";

interface DashboardStats {
    totalDoctors: number;
    totalPatients: number;
    totalAppointments: number;
    pendingAppointments: number;
    completedAppointments: number;
}

interface RecentAppointment {
    appointment_id: number;
    created_at: string;
    status: string;
    patient: { full_name: string; phone: string } | null;
    doctor: { doctor_name: string } | null;
    clinic: { clinic_name: string } | null;
    slot: { slot_date: string; slot_time: string } | null;
}

export default function AdminDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [recentAppointments, setRecentAppointments] = useState<RecentAppointment[]>([]);
    const [loading, setLoading] = useState(true);

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
                setRecentAppointments(dashData.recentAppointments || []);
            }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

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
        { label: "Total Doctors", value: stats?.totalDoctors || 0, icon: "👨‍⚕️", gradient: "from-indigo-100 to-violet-100" },
        { label: "Total Patients", value: stats?.totalPatients || 0, icon: "🧑‍🤝‍🧑", gradient: "from-cyan-100 to-sky-100" },
        { label: "Total Appointments", value: stats?.totalAppointments || 0, icon: "📅", gradient: "from-emerald-100 to-green-100" },
        { label: "Pending", value: stats?.pendingAppointments || 0, icon: "⏳", gradient: "from-amber-100 to-orange-100" },
        { label: "Completed", value: stats?.completedAppointments || 0, icon: "✅", gradient: "from-green-100 to-emerald-100" },
    ];

    return (
        <div className="w-full">
            <motion.div className="mb-10" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-gray-500 mt-1 text-sm">System overview and management</p>
            </motion.div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-10">
                {statCards.map((card, i) => (
                    <motion.div
                        key={card.label}
                        className="stat-card"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                        whileHover={{ y: -3 }}
                    >
                        <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center text-xl mb-4`}>
                            {card.icon}
                        </div>
                        <p className="text-3xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                        <p className="text-sm text-gray-500 mt-1">{card.label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Recent Appointments */}
            <motion.div
                className="glass-card p-7"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
            >
                <h2 className="text-lg font-semibold text-gray-900 mb-5">Recent Appointments</h2>
                {recentAppointments.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-4xl mb-3">📋</p>
                        <p className="text-gray-400">No appointments yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr><th>Patient</th><th>Doctor</th><th>Date</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {recentAppointments.map((apt, i) => (
                                    <motion.tr
                                        key={apt.appointment_id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.5 + i * 0.05 }}
                                    >
                                        <td className="text-gray-800 font-medium">{apt.patient?.full_name || "N/A"}</td>
                                        <td className="text-gray-600">{apt.doctor?.doctor_name || "N/A"}</td>
                                        <td className="text-gray-500">
                                            {apt.slot?.slot_date
                                                ? new Date(apt.slot.slot_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                                : new Date(apt.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                        </td>
                                        <td><span className={`badge badge-${apt.status.toLowerCase()}`}>{apt.status}</span></td>
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
