"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
    MapPin, Plus, Trash2, Clock, Calendar, AlertTriangle,
    Sun, Sunset, Moon, Pencil, ChevronDown, ChevronUp
} from "lucide-react";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { formatTime, convertTo12Hour } from "@/lib/timeUtils";

interface ScheduleItem {
    schedule_id?: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration?: number;
    clinic_id: number;
    clinic_name?: string;
    effective_from?: string;
    effective_to?: string;
}

interface Clinic {
    clinic_id: number;
    clinic_name: string;
}

// Keep day ids aligned with backend: Sunday=0 ... Saturday=6
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Period helper ──────────────────────────────────────────────────────────
function getHour(timeStr: string): number {
    const t = formatTime(timeStr); // normalises AM/PM → 24h string
    const h = parseInt(t.split(":")[0], 10);
    return isNaN(h) ? 0 : h;
}

function getPeriod(timeStr: string): "morning" | "afternoon" | "evening" {
    const h = getHour(timeStr);
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
}

const PERIODS = [
    {
        key: "morning" as const,
        label: "Morning",
        range: "12 AM – 11:59 AM",
        Icon: Sun,
        color: "text-amber-600",
        dotColor: "bg-amber-400",
        border: "border-amber-200",
        headerBg: "bg-amber-50",
        rowHover: "hover:bg-amber-50/60",
        badge: "bg-amber-100 text-amber-700",
        timeBg: "bg-amber-50 text-amber-700",
    },
    {
        key: "afternoon" as const,
        label: "Afternoon",
        range: "12 PM – 4:59 PM",
        Icon: Sunset,
        color: "text-orange-600",
        dotColor: "bg-orange-400",
        border: "border-orange-200",
        headerBg: "bg-orange-50",
        rowHover: "hover:bg-orange-50/60",
        badge: "bg-orange-100 text-orange-700",
        timeBg: "bg-orange-50 text-orange-700",
    },
    {
        key: "evening" as const,
        label: "Evening / Night",
        range: "5 PM onwards",
        Icon: Moon,
        color: "text-indigo-600",
        dotColor: "bg-indigo-400",
        border: "border-indigo-200",
        headerBg: "bg-indigo-50",
        rowHover: "hover:bg-indigo-50/60",
        badge: "bg-indigo-100 text-indigo-700",
        timeBg: "bg-indigo-50 text-indigo-700",
    },
] as const;

// ─── Group schedules by period ───────────────────────────────────────────────
function groupByPeriod(items: ScheduleItem[]) {
    const groups: Record<"morning" | "afternoon" | "evening", ScheduleItem[]> = {
        morning: [], afternoon: [], evening: []
    };
    items.forEach(s => groups[getPeriod(s.start_time)].push(s));
    // Sort each group by day_of_week then start_time
    (Object.keys(groups) as Array<keyof typeof groups>).forEach(k => {
        groups[k].sort((a, b) =>
            a.day_of_week !== b.day_of_week
                ? a.day_of_week - b.day_of_week
                : a.start_time.localeCompare(b.start_time)
        );
    });
    return groups;
}

export default function DoctorSchedulePage() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; doctor_id?: number } | null>(null);
    const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
    const [clinics, setClinics] = useState<Clinic[]>([]);
    const [loading, setLoading] = useState(true);
    const [guiLoading, setGuiLoading] = useState(false);

    const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [scheduleForm, setScheduleForm] = useState({
        clinic_id: "",
        days: [] as string[],
        start_time: "09:00",
        end_time: "17:00",
        slot_duration: 30,
        durationValue: 1,
        durationUnit: "Years"
    });

    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Collapsed periods per clinic
    const [collapsedPeriods, setCollapsedPeriods] = useState<Record<string, boolean>>({});
    const togglePeriod = (clinicName: string, period: string) => {
        const key = `${clinicName}__${period}`;
        setCollapsedPeriods(prev => ({ ...prev, [key]: !prev[key] }));
    };
    const isPeriodCollapsed = (clinicName: string, period: string) =>
        !!collapsedPeriods[`${clinicName}__${period}`];

    const fetchData = useCallback(async () => {
        try {
            const authRes = await fetch("/api/auth/me");
            if (!authRes.ok) { router.push("/login"); return; }

            const doctorRes = await fetch("/api/doctors/me");
            if (!doctorRes.ok) return;
            const doctorData = await doctorRes.json();
            const doctorId = doctorData.doctor.doctor_id;
            setUser({ name: doctorData.doctor.doctor_name, doctor_id: doctorId });

            const clinicsRes = await fetch("/api/clinics");
            if (clinicsRes.ok) {
                const clinicsData = await clinicsRes.json();
                setClinics(clinicsData.clinics || []);
            }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router]);

    const fetchSchedules = useCallback(async () => {
        if (!user?.doctor_id) return;
        try {
            const res = await fetch(`/api/schedule?doctorId=${user.doctor_id}`);
            if (res.ok) {
                const data = await res.json();
                const processed = (data.schedules || []).map((s: any) => ({
                    ...s,
                    start_time: formatTime(s.start_time),
                    end_time: formatTime(s.end_time),
                    clinic_name: s.clinic?.clinic_name || "Unknown Clinic"
                }));
                setSchedules(processed);
            }
        } catch (e) { console.error(e); }
    }, [user?.doctor_id]);

    useEffect(() => { fetchData(); }, [fetchData]);
    useEffect(() => { if (!loading) fetchSchedules(); }, [loading, fetchSchedules]);

    const handleEditSchedule = (schedule: ScheduleItem) => {
        setEditingScheduleId(schedule.schedule_id || null);
        setScheduleForm({
            clinic_id: String(schedule.clinic_id),
            days: [String(schedule.day_of_week)],
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            slot_duration: schedule.slot_duration || 30,
            durationValue: 1,
            durationUnit: "Years"
        });
        setShowAddModal(true);
        setMessage(null);
    };

    const handleDeleteSchedule = async (id: number) => {
        if (!confirm("Are you sure you want to delete this schedule slot?")) return;
        try {
            const res = await fetch(`/api/schedule?scheduleId=${id}`, { method: "DELETE" });
            if (res.ok) { fetchSchedules(); }
            else { alert("Failed to delete schedule"); }
        } catch { alert("Error deleting schedule"); }
    };

    const handleSaveSchedule = async () => {
        if (!user?.doctor_id || !scheduleForm.clinic_id || scheduleForm.days.length === 0) {
            setMessage({ type: "error", text: "Please fill all required fields" });
            return;
        }
        if (scheduleForm.start_time >= scheduleForm.end_time) {
            setMessage({ type: "error", text: "Start time must be before end time" });
            return;
        }

        setGuiLoading(true);
        setMessage(null);

        try {
            const durationValue = Number(scheduleForm.durationValue) || 1;
            const effectiveToDate = new Date();
            if (scheduleForm.durationUnit === "Years") {
                effectiveToDate.setFullYear(effectiveToDate.getFullYear() + durationValue);
            } else if (scheduleForm.durationUnit === "Months") {
                effectiveToDate.setMonth(effectiveToDate.getMonth() + durationValue);
            } else {
                effectiveToDate.setDate(effectiveToDate.getDate() + durationValue);
            }
            const effectiveTo = effectiveToDate.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

            let schedulesPayload: any[] = [];
            if (editingScheduleId) {
                const [firstDay, ...restDays] = scheduleForm.days;
                schedulesPayload.push({
                    schedule_id: editingScheduleId,
                    day_of_week: Number(firstDay),
                    start_time: scheduleForm.start_time,
                    end_time: scheduleForm.end_time,
                    slot_duration: Number(scheduleForm.slot_duration),
                    effective_to: effectiveTo
                });
                restDays.forEach(d => schedulesPayload.push({
                    day_of_week: Number(d),
                    start_time: scheduleForm.start_time,
                    end_time: scheduleForm.end_time,
                    slot_duration: Number(scheduleForm.slot_duration),
                    effective_to: effectiveTo
                }));
            } else {
                schedulesPayload = scheduleForm.days.map(day => ({
                    day_of_week: Number(day),
                    start_time: scheduleForm.start_time,
                    end_time: scheduleForm.end_time,
                    slot_duration: Number(scheduleForm.slot_duration),
                    effective_to: effectiveTo
                }));
            }

            // Convert to 12h for DB
            const finalSchedules = schedulesPayload.map(s => ({
                ...s,
                start_time: convertTo12Hour(s.start_time),
                end_time: convertTo12Hour(s.end_time)
            }));

            const res = await fetch("/api/schedule", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clinicId: Number(scheduleForm.clinic_id),
                    doctorId: user.doctor_id,
                    schedules: finalSchedules
                })
            });

            const data = await res.json();
            if (res.ok) {
                setMessage({ type: "success", text: editingScheduleId ? "Schedule updated!" : "Schedule added!" });
                setShowAddModal(false);
                fetchSchedules();
                setEditingScheduleId(null);
            } else {
                setMessage({ type: "error", text: data.error || "Failed to save schedule" });
            }
        } catch {
            setMessage({ type: "error", text: "An error occurred" });
        } finally {
            setGuiLoading(false);
        }
    };

    const handleDayToggle = (dayIndex: string) => {
        setScheduleForm(prev => {
            const days = prev.days.includes(dayIndex)
                ? prev.days.filter(d => d !== dayIndex)
                : [...prev.days, dayIndex];
            return { ...prev, days };
        });
    };

    // Group schedules → clinic → period
    const groupedByClinics = schedules.reduce((acc, s) => {
        const name = s.clinic_name || "Unknown";
        if (!acc[name]) acc[name] = [];
        acc[name].push(s);
        return acc;
    }, {} as Record<string, ScheduleItem[]>);

    const totalSlots = schedules.length;
    const periodCounts = {
        morning: schedules.filter(s => getPeriod(s.start_time) === "morning").length,
        afternoon: schedules.filter(s => getPeriod(s.start_time) === "afternoon").length,
        evening: schedules.filter(s => getPeriod(s.start_time) === "evening").length,
    };

    if (loading) return <div className="p-10 text-center">Loading...</div>;

    return (
        <div className="w-full space-y-8">
            {/* Header */}
            <motion.div className="flex flex-col md:flex-row md:items-center justify-between gap-4"
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Manage Schedule</h1>
                    <p className="text-gray-500 mt-1 text-sm">View and manage your consultation hours across all clinics</p>
                </div>
                <PremiumButton onClick={() => {
                    setEditingScheduleId(null);
                    setScheduleForm({
                        clinic_id: clinics[0]?.clinic_id ? String(clinics[0].clinic_id) : "",
                        days: [], start_time: "09:00", end_time: "17:00",
                        slot_duration: 30, durationValue: 1, durationUnit: "Years"
                    });
                    setShowAddModal(true);
                }} icon={Plus}>
                    Add Schedule
                </PremiumButton>
            </motion.div>

            {/* Summary stat chips */}
            {totalSlots > 0 && (
                <motion.div className="flex flex-wrap gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1 } }}>
                    <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full shadow-sm text-sm font-medium text-gray-700">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span>{totalSlots} total slot{totalSlots > 1 ? "s" : ""}</span>
                    </div>
                    {periodCounts.morning > 0 && (
                        <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-50 border border-amber-200 rounded-full text-sm font-medium text-amber-700">
                            <Sun className="w-4 h-4" /> {periodCounts.morning} Morning
                        </div>
                    )}
                    {periodCounts.afternoon > 0 && (
                        <div className="flex items-center gap-1.5 px-4 py-2 bg-orange-50 border border-orange-200 rounded-full text-sm font-medium text-orange-700">
                            <Sunset className="w-4 h-4" /> {periodCounts.afternoon} Afternoon
                        </div>
                    )}
                    {periodCounts.evening > 0 && (
                        <div className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-full text-sm font-medium text-indigo-700">
                            <Moon className="w-4 h-4" /> {periodCounts.evening} Evening/Night
                        </div>
                    )}
                </motion.div>
            )}

            <AnimatePresence>
                {message && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className={`px-4 py-3 rounded-xl border ${message.type === "success" ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-600"}`}>
                        {message.type === "error" && <AlertTriangle className="inline w-4 h-4 mr-2 mb-0.5" />}
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Empty state ── */}
            {Object.keys(groupedByClinics).length === 0 ? (
                <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-700">No Schedules Yet</h3>
                    <p className="text-gray-400 mt-2">Add your first clinic schedule to get started.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {Object.entries(groupedByClinics).map(([clinicName, clinicItems]) => {
                        const periodGroups = groupByPeriod(clinicItems);

                        return (
                            <motion.div key={clinicName}
                                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                                className="space-y-4">

                                {/* Clinic header */}
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-100">
                                        <MapPin className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">{clinicName}</h2>
                                        <p className="text-xs text-gray-400">{clinicItems.length} slot{clinicItems.length > 1 ? "s" : ""} across {Object.values(periodGroups).filter(g => g.length > 0).length} period{Object.values(periodGroups).filter(g => g.length > 0).length > 1 ? "s" : ""}</p>
                                    </div>
                                </div>

                                {/* Period sections */}
                                <div className="space-y-3 pl-2 border-l-2 border-indigo-100 ml-4">
                                    {PERIODS.map(({ key, label, range, Icon, color, dotColor, border, headerBg, rowHover, badge, timeBg }) => {
                                        const items = periodGroups[key];
                                        if (items.length === 0) return null;
                                        const collapsed = isPeriodCollapsed(clinicName, key);

                                        return (
                                            <GlassCard key={key} className={`overflow-hidden border ${border} p-0`}>
                                                {/* Period header row */}
                                                <button
                                                    type="button"
                                                    onClick={() => togglePeriod(clinicName, key)}
                                                    className={`w-full flex items-center gap-3 px-5 py-3.5 ${headerBg} hover:brightness-95 transition-all`}>
                                                    <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
                                                    <Icon className={`w-4 h-4 ${color} shrink-0`} />
                                                    <span className={`font-semibold text-sm ${color}`}>{label}</span>
                                                    <span className="text-xs text-gray-400 hidden sm:inline">({range})</span>
                                                    <span className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${badge}`}>
                                                        {items.length} slot{items.length > 1 ? "s" : ""}
                                                    </span>
                                                    <span className="ml-auto text-gray-400">
                                                        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                                    </span>
                                                </button>

                                                {/* Schedule rows */}
                                                <AnimatePresence initial={false}>
                                                    {!collapsed && (
                                                        <motion.div
                                                            key="content"
                                                            initial={{ height: 0, opacity: 0 }}
                                                            animate={{ height: "auto", opacity: 1 }}
                                                            exit={{ height: 0, opacity: 0 }}
                                                            transition={{ duration: 0.2 }}>
                                                            <div className="divide-y divide-gray-100/70 bg-white/80">
                                                                {items.map((item, idx) => (
                                                                    <motion.div
                                                                        key={item.schedule_id || idx}
                                                                        layout
                                                                        initial={{ opacity: 0 }}
                                                                        animate={{ opacity: 1 }}
                                                                        exit={{ opacity: 0 }}
                                                                        className={`flex items-center gap-4 px-5 py-3 group/row ${rowHover} transition-colors`}>

                                                                        {/* Day badge */}
                                                                        <span className={`w-10 shrink-0 text-center text-xs font-bold py-1 rounded-lg border ${badge}`}>
                                                                            {DAYS_SHORT[item.day_of_week]}
                                                                        </span>

                                                                        {/* Time range */}
                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                            <Clock className={`w-3.5 h-3.5 shrink-0 ${color}`} />
                                                                            <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-lg ${timeBg}`}>
                                                                                {convertTo12Hour(item.start_time)}
                                                                            </span>
                                                                            <span className="text-gray-400 text-xs">→</span>
                                                                            <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-lg ${timeBg}`}>
                                                                                {convertTo12Hour(item.end_time)}
                                                                            </span>
                                                                        </div>

                                                                        {/* Slot duration */}
                                                                        {item.slot_duration && (
                                                                            <span className="text-xs text-gray-400 hidden md:inline whitespace-nowrap">
                                                                                {item.slot_duration} min/slot
                                                                            </span>
                                                                        )}

                                                                        {/* Full day name (hidden on mobile) */}
                                                                        <span className="text-xs text-gray-400 hidden lg:inline w-20 shrink-0">
                                                                            {DAYS[item.day_of_week]}
                                                                        </span>

                                                                        {/* Actions */}
                                                                        <div className="flex gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                                                                            <button
                                                                                onClick={() => handleEditSchedule(item)}
                                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                                                                                title="Edit slot">
                                                                                <Pencil className="w-3.5 h-3.5" />
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleDeleteSchedule(Number(item.schedule_id))}
                                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                                                title="Delete slot">
                                                                                <Trash2 className="w-3.5 h-3.5" />
                                                                            </button>
                                                                        </div>
                                                                    </motion.div>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </GlassCard>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}

            {/* ══════════════════════════════════════
                Add / Edit Schedule Modal
            ══════════════════════════════════════ */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-indigo-500" />
                                {editingScheduleId ? "Edit Schedule Slot" : "Add New Schedule"}
                            </h3>

                            <div className="space-y-4">
                                {/* Clinic */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
                                    <select className="input-field" value={scheduleForm.clinic_id}
                                        onChange={e => setScheduleForm({ ...scheduleForm, clinic_id: e.target.value })}
                                        disabled={!!editingScheduleId}>
                                        <option value="">Select a Clinic</option>
                                        {clinics.map(c => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
                                    </select>
                                </div>

                                {/* Days */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Day(s)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {DAYS.map((d, i) => (
                                            <button key={i} type="button" onClick={() => handleDayToggle(String(i))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border
                                                    ${scheduleForm.days.includes(String(i))
                                                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                                                        : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
                                                {d.slice(0, 3)}
                                            </button>
                                        ))}
                                    </div>
                                    {scheduleForm.days.length === 0 && <p className="text-xs text-red-500 mt-1">Select at least one day</p>}
                                </div>

                                {/* Times */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                        <input type="time" className="input-field" value={scheduleForm.start_time}
                                            onChange={e => setScheduleForm({ ...scheduleForm, start_time: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                        <input type="time" className="input-field" value={scheduleForm.end_time}
                                            onChange={e => setScheduleForm({ ...scheduleForm, end_time: e.target.value })} />
                                    </div>
                                </div>

                                {/* Slot duration */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Slot Duration (mins)</label>
                                    <input type="number" min={5} step={5} className="input-field" value={scheduleForm.slot_duration}
                                        onChange={e => setScheduleForm({ ...scheduleForm, slot_duration: Number(e.target.value) || 30 })} />
                                </div>

                                {/* Period preview badge */}
                                {scheduleForm.start_time && (
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>This slot falls in:</span>
                                        {(() => {
                                            const p = getPeriod(scheduleForm.start_time);
                                            const period = PERIODS.find(x => x.key === p)!;
                                            return (
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold ${period.badge}`}>
                                                    <period.Icon className="w-3 h-3" /> {period.label}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                )}

                                </div>

                            {message && showAddModal && (
                                <div className={`mt-4 px-3 py-2 rounded-lg text-sm ${message.type === "error" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
                                    {message.text}
                                </div>
                            )}

                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                                <button onClick={() => { setShowAddModal(false); setMessage(null); }}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors text-sm">
                                    Cancel
                                </button>
                                <PremiumButton onClick={handleSaveSchedule} isLoading={guiLoading}>
                                    {editingScheduleId ? "Update Schedule" : "Save Schedule"}
                                </PremiumButton>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
