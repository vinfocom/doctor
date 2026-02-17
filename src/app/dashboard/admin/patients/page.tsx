"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

interface Patient {
    patient_id: number;
    full_name: string;
    phone: string | null;
    age: number | null;
    gender: string | null;
    admin_id: number | null;
}

export default function AdminPatientsPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const meRes = await fetch("/api/auth/me");
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            if (meData.user.role !== "SUPER_ADMIN" && meData.user.role !== "ADMIN") { router.push("/login"); return; }
            setUser(meData.user);
            const patientsRes = await fetch("/api/patients");
            if (patientsRes.ok) { const data = await patientsRes.json(); setPatients(data.patients); }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

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
                <h1 className="text-3xl font-bold text-gray-900">All Patients</h1>
                <p className="text-gray-500 mt-1 text-sm">View all registered patients</p>
            </motion.div>

            <motion.div className="glass-card p-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                {patients.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-4xl mb-3">🧑‍🤝‍🧑</p>
                        <p className="text-gray-400">No patients registered yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead><tr><th>Name</th><th>Phone</th><th>Age</th><th>Gender</th></tr></thead>
                            <tbody>
                                {patients.map((pt, i) => (
                                    <motion.tr
                                        key={pt.patient_id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.3 + i * 0.05 }}
                                    >
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center text-xs font-bold text-white">
                                                    {pt.full_name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <span className="text-gray-800 font-medium">{pt.full_name}</span>
                                            </div>
                                        </td>
                                        <td className="text-gray-500">{pt.phone || "—"}</td>
                                        <td className="text-gray-600">{pt.age || "—"}</td>
                                        <td className="text-gray-600">{pt.gender || "—"}</td>
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
