"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { MapPin, Plus, Trash2, Clock, Calendar, AlertTriangle } from "lucide-react";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { GlassCard } from "@/components/ui/GlassCard";

interface ScheduleItem {
    schedule_id?: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    clinic_id: number;
    clinic_name?: string;
    effective_from?: string;
    effective_to?: string;
}

interface Clinic {
    clinic_id: number;
    clinic_name: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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
                    start_time: String(s.start_time).includes("T") ? String(s.start_time).split("T")[1].slice(0, 5) : String(s.start_time).slice(0, 5),
                    end_time: String(s.end_time).includes("T") ? String(s.end_time).split("T")[1].slice(0, 5) : String(s.end_time).slice(0, 5),
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
            slot_duration: 30,
            durationValue: 1,
            durationUnit: "Years"
        });
        setShowAddModal(true);
        setMessage(null);
    };

    const handleDeleteSchedule = async (id: number) => {
        if (!confirm("Are you sure you want to delete this schedule?")) return;
        try {
            const res = await fetch(`/api/schedule?scheduleId=${id}`, { method: "DELETE" });
            if (res.ok) {
                fetchSchedules();
            } else {
                alert("Failed to delete schedule");
            }
        } catch (e) {
            console.error(e);
            alert("Error deleting schedule");
        }
    };

    const handleSaveSchedule = async () => {
        if (!user?.doctor_id || !scheduleForm.clinic_id || scheduleForm.days.length === 0) {
            setMessage({ type: "error", text: "Please fill all fields" });
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
            } else if (scheduleForm.durationUnit === "Days") {
                effectiveToDate.setDate(effectiveToDate.getDate() + durationValue);
            }
            const effectiveTo = effectiveToDate.toISOString().split('T')[0];

            let schedulesPayload = [];
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
                restDays.forEach(d => {
                    schedulesPayload.push({
                        day_of_week: Number(d),
                        start_time: scheduleForm.start_time,
                        end_time: scheduleForm.end_time,
                        slot_duration: Number(scheduleForm.slot_duration),
                        effective_to: effectiveTo
                    });
                });
            } else {
                schedulesPayload = scheduleForm.days.map(day => ({
                    day_of_week: Number(day),
                    start_time: scheduleForm.start_time,
                    end_time: scheduleForm.end_time,
                    slot_duration: Number(scheduleForm.slot_duration),
                    effective_to: effectiveTo
                }));
            }

            const res = await fetch("/api/schedule", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clinicId: Number(scheduleForm.clinic_id),
                    doctorId: user.doctor_id,
                    schedules: schedulesPayload
                })
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: "success", text: editingScheduleId ? "Schedule updated successfully" : "Schedule added successfully" });
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

    const groupedSchedules = schedules.reduce((acc, curr) => {
        const clinicName = curr.clinic_name || "Unknown";
        if (!acc[clinicName]) acc[clinicName] = [];
        acc[clinicName].push(curr);
        return acc;
    }, {} as Record<string, ScheduleItem[]>);

    const handleDayToggle = (dayIndex: string) => {
        setScheduleForm(prev => {
            const days = prev.days.includes(dayIndex)
                ? prev.days.filter(d => d !== dayIndex)
                : [...prev.days, dayIndex];
            return { ...prev, days };
        });
    };

    if (loading) return <div className="p-10 text-center">Loading...</div>;

    return (
        <div className="w-full">
            <motion.div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Manage Schedule</h1>
                    <p className="text-gray-500 mt-1 text-sm">View and manage your consultation hours</p>
                </div>
                <PremiumButton onClick={() => {
                    setEditingScheduleId(null);
                    setScheduleForm({ clinic_id: clinics[0]?.clinic_id ? String(clinics[0].clinic_id) : "", days: [], start_time: "09:00", end_time: "17:00", slot_duration: 30, durationValue: 1, durationUnit: "Years" });
                    setShowAddModal(true);
                }} icon={Plus}>
                    Add Schedule
                </PremiumButton>
            </motion.div>

            <AnimatePresence>
                {message && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className={`mb-6 px-4 py-3 rounded-xl border ${message.type === "success" ? "bg-green-50 border-green-200 text-green-600" : "bg-red-50 border-red-200 text-red-600"}`}>
                        {message.type === "error" && <AlertTriangle className="inline w-4 h-4 mr-2 mb-0.5" />}
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            {Object.keys(groupedSchedules).length === 0 ? (
                <div className="text-center py-16 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                    <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-700">No Schedules Found</h3>
                    <p className="text-gray-400 mt-2">Add your first clinic schedule to get started.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {Object.entries(groupedSchedules).map(([clinicName, items]) => (
                        <div key={clinicName} className="space-y-4">
                            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
                                <MapPin className="w-5 h-5 text-indigo-500" />
                                {clinicName}
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                <AnimatePresence mode="popLayout">
                                    {items.sort((a, b) => a.day_of_week - b.day_of_week).map((item) => (
                                        <motion.div
                                            key={item.schedule_id}
                                            layout
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                            transition={{ duration: 0.2 }}
                                        >
                                            <GlassCard className="flex flex-col gap-3 group relative h-full hover:shadow-lg transition-shadow duration-300 border border-white/40 bg-white/60">
                                                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                                    <button
                                                        onClick={() => handleEditSchedule(item)}
                                                        className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                        title="Edit Schedule"
                                                    >
                                                        <Clock className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteSchedule(Number(item.schedule_id))}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Delete Schedule"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="flex justify-between items-start">
                                                    <span className="font-bold text-lg text-gray-900">{DAYS[item.day_of_week]}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <Clock className="w-4 h-4" />
                                                    <span>{item.start_time} - {item.end_time}</span>
                                                </div>
                                            </GlassCard>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Schedule Modal — lives outside the ternary so it renders even when no schedules exist */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full shadow-2xl">
                            <h3 className="text-xl font-bold mb-6">{editingScheduleId ? "Edit Schedule" : "Add New Schedule"}</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
                                    <select
                                        className="input-field"
                                        value={scheduleForm.clinic_id}
                                        onChange={(e) => setScheduleForm({ ...scheduleForm, clinic_id: e.target.value })}
                                        disabled={!!editingScheduleId}
                                    >
                                        <option value="">Select a Clinic</option>
                                        {clinics.map(c => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Days</label>
                                    <div className="flex flex-wrap gap-2">
                                        {DAYS.map((d, i) => (
                                            <button
                                                key={i}
                                                type="button"
                                                onClick={() => handleDayToggle(String(i))}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${scheduleForm.days.includes(String(i))
                                                    ? "bg-indigo-600 text-white border-indigo-600"
                                                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                                                    }`}
                                            >
                                                {d.slice(0, 3)}
                                            </button>
                                        ))}
                                    </div>
                                    {scheduleForm.days.length === 0 && <p className="text-xs text-red-500 mt-1">Select at least one day</p>}
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                        <input
                                            type="time"
                                            className="input-field"
                                            value={scheduleForm.start_time}
                                            onChange={(e) => setScheduleForm({ ...scheduleForm, start_time: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                        <input
                                            type="time"
                                            className="input-field"
                                            value={scheduleForm.end_time}
                                            onChange={(e) => setScheduleForm({ ...scheduleForm, end_time: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Validity Period</label>
                                    <div className="flex gap-4">
                                        <div className="w-1/3">
                                            <input
                                                type="number"
                                                min="1"
                                                className="input-field"
                                                value={scheduleForm.durationValue}
                                                onChange={(e) => setScheduleForm({ ...scheduleForm, durationValue: parseInt(e.target.value) || 1 })}
                                            />
                                        </div>
                                        <div className="w-2/3">
                                            <select
                                                className="input-field"
                                                value={scheduleForm.durationUnit}
                                                onChange={(e) => setScheduleForm({ ...scheduleForm, durationUnit: e.target.value })}
                                            >
                                                <option value="Days">Days</option>
                                                <option value="Months">Months</option>
                                                <option value="Years">Years</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-8">
                                <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
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