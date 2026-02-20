"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";

interface Patient {
    patient_id: number;
    full_name: string;
    age: number;
    gender: string;
    phone: string;
    reason: string | null;
    patient_type: string | null;
}

export default function DoctorPatientsPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string } | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const [meRes, patRes] = await Promise.all([fetch("/api/auth/me"), fetch("/api/patients")]);
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            if (meData.user.role !== "DOCTOR") { router.push("/login"); return; }
            setUser(meData.user);

            if (patRes.ok) {
                const data = await patRes.json();
                setPatients(data.patients || []);
            }
        } catch (error) {
            console.error("Failed to fetch data:", error);
            // Non-critical if we just can't fetch patients, don't necessarily log out unless meRes fails
        } finally {
            setLoading(false);
        }
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
            <div className="flex justify-between items-center mb-10">
                <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                    <h1 className="text-3xl font-bold text-gray-900">My Patients</h1>
                    <p className="text-gray-500 mt-1 text-sm">View details of your patients</p>
                </motion.div>
                {/* Future implementation: Add Patient Modal */}
                {/* 
                <motion.button ...>
                    Add Patient
                </motion.button> 
                */}
            </div>

            <motion.div className="glass-card p-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                {patients.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-4xl mb-3">👥</p>
                        <p className="text-gray-400">No patients found</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Patient</th>
                                    <th>Age/Gender</th>
                                    <th>Phone</th>
                                    <th>Reason</th>
                                    <th>Type</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patients.map((pat, i) => (
                                    <motion.tr key={pat.patient_id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }}>
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                                                    {pat.full_name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <span className="text-gray-800 font-medium">{pat.full_name || "N/A"}</span>
                                            </div>
                                        </td>
                                        <td className="text-gray-500">
                                            {pat.age ? `${pat.age} yrs` : "N/A"}{" • "}
                                            {pat.gender ? (pat.gender.charAt(0).toUpperCase() + pat.gender.slice(1).toLowerCase()) : "N/A"}
                                        </td>
                                        <td className="text-gray-500">{pat.phone || "N/A"}</td>
                                        <td className="text-gray-500 truncate max-w-xs" title={pat.reason || ""}>{pat.reason || "N/A"}</td>
                                        <td>
                                            {pat.patient_type ? (
                                                <span className={`badge badge-${pat.patient_type.toLowerCase().replace(/\s+/g, '-')}`}>
                                                    {pat.patient_type}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 italic text-sm">Not specified</span>
                                            )}
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
