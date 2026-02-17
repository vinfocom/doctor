"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Calendar, Clock, Activity, Loader2 } from "lucide-react";
import { StatCard } from "@/components/ui/StatCard";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumTable } from "@/components/ui/PremiumTable";

interface DoctorStats {
    totalAppointments: number;
    todayAppointments: number;
    pendingAppointments: number;
}

interface RecentAppointment {
    appointment_id: number;
    created_at: string;
    status: string;
    patient: { full_name: string; phone: string } | null;
    slot: { slot_date: string; slot_time: string } | null;
}

export default function DoctorDashboard() {
    const router = useRouter();
    // User name for welcome message - could be fetched or passed down, 
    // but for now we'll keep a simple local state or fetch it if 'user' was used for more than just the name.
    // actually, let's keep the user state for the "Welcome Back" message for now to minimize disruption,
    // but we acknowledge the sidebar is gone.
    const [user, setUser] = useState({ name: "Doctor" });
    const [stats, setStats] = useState<DoctorStats | null>(null);
    const [recentAppointments, setRecentAppointments] = useState<RecentAppointment[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            // Fetch Doctor Profile
            const doctorRes = await fetch("/api/doctors/me");
            let doctorId = 1; // Default fallback

            if (doctorRes.ok) {
                const doctorData = await doctorRes.json();
                setUser({ name: doctorData.doctor.doctor_name });
                doctorId = doctorData.doctor.doctor_id;
            }

            const res = await fetch(`/api/appointments?doctorId=${doctorId}`);
            if (res.ok) {
                const data: RecentAppointment[] = await res.json();
                // Sort by date desc (newest first)
                const sortedData = data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

                const total = sortedData.length;
                const pending = sortedData.filter(a => a.status === 'PENDING').length;
                const today = sortedData.filter(a => {
                    if (!a.slot?.slot_date) return false;
                    const d = new Date(a.slot.slot_date);
                    const now = new Date();
                    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }).length;

                setStats({
                    totalAppointments: total,
                    pendingAppointments: pending,
                    todayAppointments: today
                });
                setRecentAppointments(sortedData.slice(0, 5));
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
        { label: "Total Appointments", value: stats?.totalAppointments || 0, icon: Calendar, color: "#4f46e5" },
        { label: "Today's Visits", value: stats?.todayAppointments || 0, icon: Activity, color: "#0891b2" },
        { label: "Pending Requests", value: stats?.pendingAppointments || 0, icon: Clock, color: "#d97706" },
    ];

    const columns = [
        {
            header: "Patient",
            accessorKey: (item: RecentAppointment) => (
                <div>
                    <div className="font-medium text-gray-900">{item.patient?.full_name || "Unknown"}</div>
                    <div className="text-xs text-gray-400">{item.patient?.phone}</div>
                </div>
            )
        },
        {
            header: "Date",
            accessorKey: (item: RecentAppointment) => (
                <span className="text-gray-600">
                    {item.slot?.slot_date ? new Date(item.slot.slot_date).toLocaleDateString() : 'N/A'}
                </span>
            )
        },
        {
            header: "Status",
            accessorKey: (item: RecentAppointment) => {
                const colors: Record<string, string> = {
                    PENDING: "bg-amber-50 text-amber-600 border-amber-200",
                    CONFIRMED: "bg-emerald-50 text-emerald-600 border-emerald-200",
                    CANCELLED: "bg-red-50 text-red-600 border-red-200",
                    COMPLETED: "bg-indigo-50 text-indigo-600 border-indigo-200",
                };
                const statusColor = colors[item.status] || "bg-gray-50 text-gray-600";
                return (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
                        {item.status}
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

            <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
                    Welcome Back, Dr. {user.name}
                </h1>
                <p className="text-gray-500 mt-2 text-lg">Here&apos;s your practice overview for today.</p>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {statCards.map((card, i) => (
                    <motion.div
                        key={card.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.4 }}
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

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.5 }}
            >
                <GlassCard className="p-0 overflow-hidden border border-white/20 shadow-xl bg-white/40 backdrop-blur-md">
                    <div className="flex items-center justify-between p-6 border-b border-gray-100/50">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-indigo-500" />
                            Recent Appointments
                        </h2>
                        <button
                            className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all hover:shadow-md"
                            onClick={() => router.push('/dashboard/doctor/appointments')}
                        >
                            View All
                        </button>
                    </div>
                    <div className="p-2">
                        <PremiumTable
                            columns={columns}
                            data={recentAppointments}
                        />
                    </div>
                </GlassCard>
            </motion.div>
        </div>
    );
}
