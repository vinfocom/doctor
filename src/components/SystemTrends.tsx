"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { motion } from "motion/react";
import { TrendingUp, Users, CalendarDays, Globe, Stethoscope } from "lucide-react";

type Period = "daily" | "weekly" | "monthly" | "yearly";

interface TrendsData {
    period: Period;
    doctorsGrowth: { label: string; count: number }[];
    patientsPerDoctor: { doctor: string; patients: number }[];
    appointmentTrend: { label: string; count: number }[];
    appointmentsPerDoctor: { doctor: string; appointments: number }[];
    systemDistribution: { name: string; value: number }[];
}

const COLORS = ["#4f46e5", "#0891b2", "#7c3aed", "#059669", "#d946ef", "#f59e0b"];
const PIE_COLORS = ["#10b981", "#f59e0b", "#f43f5e"];

const TooltipStyle = {
    backgroundColor: "rgba(255,255,255,0.97)",
    border: "1px solid #e2e8f0",
    borderRadius: "0.75rem",
    fontSize: "0.8rem",
    color: "#0f172a",
    boxShadow: "0 4px 15px rgba(0,0,0,0.08)",
};

const PERIODS: { key: Period; label: string; desc: string }[] = [
    { key: "daily", label: "Daily", desc: "Last 30 days" },
    { key: "weekly", label: "Weekly", desc: "Last 12 weeks" },
    { key: "monthly", label: "Monthly", desc: "Last 12 months" },
    { key: "yearly", label: "Yearly", desc: "All time" },
];

const chartCard = "glass-card p-6 flex flex-col gap-2";
const chartTitle = (icon: React.ReactNode, t: string, sub: string) => (
    <p className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
        {icon} {t} <span className="text-gray-400 font-normal">{sub}</span>
    </p>
);

export default function SystemTrends() {
    const [period, setPeriod] = useState<Period>("monthly");
    const [data, setData] = useState<TrendsData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchTrends = useCallback(async (p: Period) => {
        setLoading(true);
        try {
            const res = await fetch(`/api/dashboard/trends?period=${p}`);
            if (res.ok) setData(await res.json());
        } catch { /* ignore */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchTrends(period); }, [period, fetchTrends]);

    const periodDesc = PERIODS.find(p => p.key === period)?.desc || "";

    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
        >
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-indigo-500 to-violet-500 flex-shrink-0" />
                <h2 className="text-xl font-bold text-gray-900">Overall Trends</h2>

                {/* Period Selector */}
                <div className="ml-auto flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                    {PERIODS.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setPeriod(key)}
                            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ${period === key
                                ? "bg-white text-indigo-600 shadow-sm border border-indigo-100"
                                : "text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <span className="text-xs text-gray-400 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1 font-medium">
                    {periodDesc}
                </span>
            </div>

            {/* Loading shimmer */}
            {loading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`${chartCard} h-[300px]`}>
                            <div className="w-32 h-4 bg-gray-100 rounded animate-pulse mb-4" />
                            <div className="flex-1 bg-gray-50 rounded-xl animate-pulse" />
                        </div>
                    ))}
                </div>
            ) : !data ? (
                <div className="glass-card p-10 text-center text-gray-400">Failed to load trends data.</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                    {/* 1. Doctors Growth */}
                    <motion.div className={chartCard} key={`dg-${period}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                        {chartTitle(<TrendingUp size={14} className="text-indigo-500" />, "Doctors Growth", `(${periodDesc})`)}
                        {data.doctorsGrowth.length === 0 ? <Empty label="No doctor registrations in this period" /> : (
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={data.doctorsGrowth} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#94a3b8" }} interval="preserveStartEnd" />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                    <Tooltip contentStyle={TooltipStyle} />
                                    <Line type="monotone" dataKey="count" name="New Doctors" stroke="#4f46e5" strokeWidth={2.5}
                                        dot={{ r: 4, fill: "#4f46e5", strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </motion.div>

                    {/* 2. Patients per Doctor */}
                    <motion.div className={chartCard} key={`ppd-${period}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.05 }}>
                        {chartTitle(<Users size={14} className="text-cyan-600" />, "Patients per Doctor", `(${periodDesc})`)}
                        {data.patientsPerDoctor.length === 0 ? <Empty label="No patients assigned yet" /> : (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={data.patientsPerDoctor} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="doctor" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={0} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                    <Tooltip contentStyle={TooltipStyle} />
                                    <Bar dataKey="patients" name="Patients" radius={[6, 6, 0, 0]}>
                                        {data.patientsPerDoctor.map((_, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </motion.div>

                    {/* 3. Appointment Trend */}
                    <motion.div className={chartCard} key={`at-${period}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.1 }}>
                        {chartTitle(<CalendarDays size={14} className="text-cyan-500" />, "Appointment Trend", `(${periodDesc})`)}
                        {data.appointmentTrend.length === 0 ? <Empty label="No appointments in this period" /> : (
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={data.appointmentTrend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} interval="preserveStartEnd" />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                    <Tooltip contentStyle={TooltipStyle} />
                                    <Line type="monotone" dataKey="count" name="Appointments" stroke="#0891b2" strokeWidth={2.5}
                                        dot={false} activeDot={{ r: 5 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        )}
                    </motion.div>

                    {/* 4. Appointments per Doctor */}
                    <motion.div className={chartCard} key={`apd-${period}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.12 }}>
                        {chartTitle(<Stethoscope size={14} className="text-purple-500" />, "Appointments per Doctor", `(${periodDesc})`)}
                        {data.appointmentsPerDoctor.length === 0 ? <Empty label="No appointments yet" /> : (
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={data.appointmentsPerDoctor} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="doctor" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={0} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                                    <Tooltip contentStyle={TooltipStyle} />
                                    <Bar dataKey="appointments" name="Appointments" radius={[6, 6, 0, 0]}>
                                        {data.appointmentsPerDoctor.map((_, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </motion.div>

                    {/* 5. System Distribution */}
                    <motion.div className={chartCard} key={`sd-${period}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.15 }}>
                        {chartTitle(<Globe size={14} className="text-violet-500" />, "System Distribution", "(total)")}
                        <div className="flex items-center gap-4">
                            <ResponsiveContainer width="60%" height={220}>
                                <PieChart>
                                    <Pie data={data.systemDistribution} cx="50%" cy="50%"
                                        innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                                        {data.systemDistribution.map((_, i) => (
                                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={TooltipStyle} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex flex-col gap-3 flex-1">
                                {data.systemDistribution.map((item, i) => (
                                    <div key={item.name} className="flex items-center gap-2">
                                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                                        <div>
                                            <p className="text-xs text-gray-500">{item.name}</p>
                                            <p className="text-base font-bold text-gray-800">{item.value.toLocaleString()}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                </div>
            )}
        </motion.div>
    );
}

function Empty({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-center h-[220px] text-gray-400 text-sm">{label}</div>
    );
}
