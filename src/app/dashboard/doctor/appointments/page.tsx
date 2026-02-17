"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

interface Appointment {
    appointment_id: number;
    created_at: string;
    status: string;
    patient: { full_name: string; phone: string } | null;
    slot: { slot_date: string; slot_time: string } | null;
}

export default function DoctorAppointmentsPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string } | null>(null);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const [meRes, aptRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/appointments")]);
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            if (meData.user.role !== "DOCTOR") { router.push("/login"); return; }
            setUser(meData.user);
            if (aptRes.ok) { const data = await aptRes.json(); setAppointments(data || []); }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleStatusUpdate = async (appointmentId: number, status: string) => {
        const res = await fetch("/api/appointments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ appointmentId, status }) });
        if (res.ok) setAppointments(appointments.map((a) => a.appointment_id === appointmentId ? { ...a, status } : a));
    };

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
            <motion.div className="mb-10" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-3xl font-bold text-gray-900">My Appointments</h1>
                <p className="text-gray-500 mt-1 text-sm">Manage your patient appointments</p>
            </motion.div>

            <motion.div className="glass-card p-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                {appointments.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-4xl mb-3">📋</p>
                        <p className="text-gray-400">No appointments yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead><tr><th>Patient</th><th>Phone</th><th>Date & Time</th><th>Status</th><th>Actions</th></tr></thead>
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
                                        <td className="text-gray-500">{apt.patient?.phone || "N/A"}</td>
                                        <td className="text-gray-500">
                                            {apt.slot?.slot_date
                                                ? new Date(apt.slot.slot_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                                : "N/A"}{" "}
                                            {apt.slot?.slot_time
                                                ? new Date(apt.slot.slot_time).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
                                                : ""}
                                        </td>
                                        <td><span className={`badge badge-${apt.status.toLowerCase()}`}>{apt.status}</span></td>
                                        <td>
                                            <div className="flex gap-2">
                                                {apt.status === "PENDING" && (
                                                    <>
                                                        <motion.button onClick={() => handleStatusUpdate(apt.appointment_id, "CONFIRMED")} className="text-xs text-emerald-600 hover:bg-emerald-50 px-2 py-1 rounded-lg font-medium transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>Confirm</motion.button>
                                                        <motion.button onClick={() => handleStatusUpdate(apt.appointment_id, "CANCELLED")} className="text-xs text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg font-medium transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>Cancel</motion.button>
                                                    </>
                                                )}
                                                {apt.status === "CONFIRMED" && (
                                                    <motion.button onClick={() => handleStatusUpdate(apt.appointment_id, "COMPLETED")} className="text-xs text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg font-medium transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>Complete</motion.button>
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
