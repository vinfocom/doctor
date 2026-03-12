"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Stethoscope, Users, CalendarDays } from "lucide-react";
import SystemTrends from "@/components/SystemTrends";

interface DashboardStats {
    totalDoctors: number;
    totalPatients: number;
    totalAppointments: number;
    pendingAppointments: number;
    completedAppointments: number;
}

export default function AdminDashboard() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const [stats, setStats] = useState<DashboardStats | null>(null);
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
        { label: "Total Doctors", value: stats?.totalDoctors || 0, icon: <Stethoscope size={24} className="text-indigo-600" />, gradient: "from-indigo-100 to-violet-100" },
        { label: "Total Patients", value: stats?.totalPatients || 0, icon: <Users size={24} className="text-cyan-600" />, gradient: "from-cyan-100 to-sky-100" },
        { label: "Total Appointments", value: stats?.totalAppointments || 0, icon: <CalendarDays size={24} className="text-emerald-600" />, gradient: "from-emerald-100 to-green-100" },
    ];

    return (
        <div className="w-full">
            <motion.div className="mb-10" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
                <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
                <p className="text-gray-500 mt-1 text-sm">System overview and management</p>
            </motion.div>

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
        </div>
    );
}
