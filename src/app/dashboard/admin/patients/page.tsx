"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Users, Search, Stethoscope, ChevronDown, ChevronRight, CalendarDays } from "lucide-react";

/* ───────────── Types ───────────── */
interface Patient {
    patient_id: number;
    full_name: string;
    phone: string | null;
    age: number | null;
    gender: string | null;
    doctor_id: number | null;
    doctor_name: string | null;
    appointment_count: number;
    registered_at: string | null;
}

interface DoctorGroup {
    doctor_id: number | null;
    doctor_name: string;
    patients: Patient[];
}

/* ───────────── Page ───────────── */
export default function AdminPatientsPage() {
    const router = useRouter();
    const [, setUser] = useState<{ name: string; role: string } | null>(null);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());

    const fetchData = useCallback(async () => {
        try {
            const meRes = await fetch("/api/auth/me");
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            if (meData.user.role !== "SUPER_ADMIN" && meData.user.role !== "ADMIN") { router.push("/login"); return; }
            setUser(meData.user);
            const patientsRes = await fetch("/api/patients");
            if (patientsRes.ok) {
                const data = await patientsRes.json();
                setPatients(data.patients);
            }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    /* ── Search filter (min 3 chars) ── */
    const filteredPatients = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (q.length < 3) return patients;
        return patients.filter((pt) => {
            const fields = [
                pt.full_name,
                pt.phone,
                pt.doctor_name,
                pt.gender,
                pt.age?.toString(),
                pt.appointment_count?.toString(),
            ].filter(Boolean).map(f => (f as string).toLowerCase());
            return fields.some(f => f.includes(q));
        });
    }, [patients, search]);

    /* ── Group by doctor ── */
    const doctorGroups = useMemo((): DoctorGroup[] => {
        const map = new Map<string, DoctorGroup>();
        for (const pt of filteredPatients) {
            const key = pt.doctor_id ? String(pt.doctor_id) : "unassigned";
            if (!map.has(key)) {
                map.set(key, {
                    doctor_id: pt.doctor_id,
                    doctor_name: pt.doctor_name || "Unassigned",
                    patients: [],
                });
            }
            map.get(key)!.patients.push(pt);
        }
        // Sort: named doctors first alphabetically, unassigned last
        return Array.from(map.values()).sort((a, b) => {
            if (a.doctor_id === null) return 1;
            if (b.doctor_id === null) return -1;
            return a.doctor_name.localeCompare(b.doctor_name);
        });
    }, [filteredPatients]);

    /* ── Expand all by default on first load / when search changes ── */
    useEffect(() => {
        setExpandedDocs(new Set(doctorGroups.map(g => String(g.doctor_id ?? "unassigned"))));
    }, [doctorGroups]);

    const toggleDoc = (key: string) => {
        setExpandedDocs((prev) => {
            const copy = new Set(prev);
            if (copy.has(key)) copy.delete(key);
            else copy.add(key);
            return copy;
        });
    };

    const formatDate = (iso: string | null) => {
        if (!iso) return "—";
        const d = new Date(iso);
        return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    };

    /* ── Loading ── */
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

    /* ── Render ── */
    return (
        <div className="w-full">
            {/* Header */}
            <motion.div className="mb-6" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">All Patients</h1>
                <p className="text-gray-500 mt-1 text-sm">Patients grouped by their registered doctor</p>
            </motion.div>

            {/* Search Bar */}
            <motion.div className="mb-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <div className="relative w-full max-w-md">
                    <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search patients, doctors, phone… (min 3 chars)"
                        className="input-field w-full"
                        style={{ paddingLeft: "2.75rem" }}
                    />
                    {search.length > 0 && search.length < 3 && (
                        <p className="text-[11px] text-orange-500 mt-1 ml-1">Type at least 3 characters to search</p>
                    )}
                </div>
                {search.length >= 3 && (
                    <p className="text-xs text-gray-400 mt-2 ml-1">
                        Found <span className="font-semibold text-indigo-600">{filteredPatients.length}</span> patient{filteredPatients.length !== 1 ? "s" : ""} matching &quot;{search}&quot;
                    </p>
                )}
            </motion.div>


            {/* Doctor Groups */}
            {doctorGroups.length === 0 ? (
                <motion.div className="glass-card p-12 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Users size={40} className="text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">
                        {search.length >= 3 ? "No patients match your search" : "No patients registered yet"}
                    </p>
                </motion.div>
            ) : (
                <div className="space-y-4">
                    {doctorGroups.map((group, gi) => {
                        const key = String(group.doctor_id ?? "unassigned");
                        const isOpen = expandedDocs.has(key);
                        return (
                            <motion.div
                                key={key}
                                className="glass-card overflow-hidden"
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 + gi * 0.04 }}
                            >
                                {/* Doctor Header */}
                                <button
                                    onClick={() => toggleDoc(key)}
                                    className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-gray-50/60 sm:px-6"
                                >
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shrink-0">
                                        {group.doctor_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-base font-bold text-gray-900">
                                            {group.doctor_id ? `Dr. ${group.doctor_name}` : "Unassigned Patients"}
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {group.patients.length} patient{group.patients.length !== 1 ? "s" : ""}
                                            {" · "}
                                            {group.patients.reduce((s, p) => s + p.appointment_count, 0)} appointment{group.patients.reduce((s, p) => s + p.appointment_count, 0) !== 1 ? "s" : ""}
                                        </p>
                                    </div>
                                    <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.2 }}>
                                        <ChevronDown size={18} className="text-gray-400" />
                                    </motion.div>
                                </button>

                                {/* Patients Table */}
                                <AnimatePresence initial={false}>
                                    {isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="overflow-x-auto border-t border-gray-100">
                                                <table className="data-table">
                                                    <thead>
                                                        <tr>
                                                            <th>Patient Name</th>
                                                            <th>Phone</th>
                                                            <th>Age</th>
                                                            <th>Gender</th>
                                                            <th>Registered</th>
                                                            <th>Appointments</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {group.patients.map((pt, pi) => (
                                                            <motion.tr
                                                                key={pt.patient_id}
                                                                initial={{ opacity: 0, x: -8 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                transition={{ delay: pi * 0.03 }}
                                                            >
                                                                <td>
                                                                    <div className="flex items-center gap-2.5">
                                                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-sky-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                                                                            {pt.full_name?.charAt(0)?.toUpperCase()}
                                                                        </div>
                                                                        <span className="text-gray-800 font-medium text-sm">{pt.full_name || "—"}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="text-gray-500 text-sm">{pt.phone || "—"}</td>
                                                                <td className="text-gray-600 text-sm">{pt.age || "—"}</td>
                                                                <td>
                                                                    {pt.gender ? (
                                                                        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md ${pt.gender.toLowerCase() === "male"
                                                                            ? "text-blue-600 bg-blue-50 border border-blue-200"
                                                                            : pt.gender.toLowerCase() === "female"
                                                                                ? "text-pink-600 bg-pink-50 border border-pink-200"
                                                                                : "text-gray-600 bg-gray-50 border border-gray-200"
                                                                            }`}>
                                                                            {pt.gender}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-400 text-sm">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="text-gray-500 text-sm">{formatDate(pt.registered_at)}</td>
                                                                <td>
                                                                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-md px-2 py-0.5">
                                                                        <CalendarDays size={11} /> {pt.appointment_count}
                                                                    </span>
                                                                </td>
                                                            </motion.tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
