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
    const [guiLoading, setGuiLoading] = useState(false); // For modal actions

    const [editingScheduleId, setEditingScheduleId] = useState<number | null>(null);

    // Modal State
    const [showAddModal, setShowAddModal] = useState(false);
    const [newSchedule, setNewSchedule] = useState({
        clinic_id: "",
        day_of_week: "1",
        start_time: "09:00",
        end_time: "17:00"
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
                // Process time strings
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
        setNewSchedule({
            clinic_id: String(schedule.clinic_id),
            day_of_week: String(schedule.day_of_week),
            start_time: schedule.start_time,
            end_time: schedule.end_time
        });
        setShowAddModal(true);
        setMessage(null);
    };

    const handleSaveSchedule = async () => {
        if (!user?.doctor_id || !newSchedule.clinic_id) return;

        // Validation
        if (newSchedule.start_time >= newSchedule.end_time) {
            setMessage({ type: "error", text: "Start time must be before end time" });
            return;
        }

        setGuiLoading(true);
        setMessage(null);

        try {
            const payload = {
                clinicId: Number(newSchedule.clinic_id),
                doctorId: user.doctor_id,
                schedules: [{
                    schedule_id: editingScheduleId, // Include ID if editing
                    day_of_week: Number(newSchedule.day_of_week),
                    start_time: newSchedule.start_time,
                    end_time: newSchedule.end_time,
                }]
            };

            const res = await fetch("/api/schedule", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok) {
                setMessage({ type: "success", text: editingScheduleId ? "Schedule updated successfully" : "Schedule added successfully" });
                setShowAddModal(false);
                fetchSchedules();
                setEditingScheduleId(null);
                if (!editingScheduleId) {
                    // Reset form only if adding new, or maybe always reset? 
                    // Let's reset but keep clinic for convenience if adding multiple
                }
            } else {
                setMessage({ type: "error", text: data.error || "Failed to save schedule" });
            }
        } catch {
            setMessage({ type: "error", text: "An error occurred" });
        } finally {
            setGuiLoading(false);
        }
    };

    // Group schedules by Clinic
    const groupedSchedules = schedules.reduce((acc, curr) => {
        const clinicName = curr.clinic_name || "Unknown";
        if (!acc[clinicName]) acc[clinicName] = [];
        acc[clinicName].push(curr);
        return acc;
    }, {} as Record<string, ScheduleItem[]>);

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
                    setNewSchedule({ ...newSchedule, start_time: "09:00", end_time: "17:00" }); // Reset times but keep clinic/day maybe? Or full reset.
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
                                {items.sort((a, b) => a.day_of_week - b.day_of_week).map((item) => (
                                    <GlassCard key={item.schedule_id} className="flex flex-col gap-3 group">
                                        <div className="flex justify-between items-start">
                                            <span className="font-bold text-lg text-gray-900">{DAYS[item.day_of_week]}</span>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button
                                                    onClick={() => handleEditSchedule(item)}
                                                    className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                    title="Edit Schedule"
                                                >
                                                    <Clock className="w-4 h-4" />
                                                </button>
                                                {/* Future: Delete button */}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <Clock className="w-4 h-4" />
                                            <span>{item.start_time} - {item.end_time}</span>
                                        </div>
                                    </GlassCard>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add/Edit Schedule Modal */}
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
                                        value={newSchedule.clinic_id}
                                        onChange={(e) => setNewSchedule({ ...newSchedule, clinic_id: e.target.value })}
                                    >
                                        <option value="">Select a Clinic</option>
                                        {clinics.map(c => <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                                    <select
                                        className="input-field"
                                        value={newSchedule.day_of_week}
                                        onChange={(e) => setNewSchedule({ ...newSchedule, day_of_week: e.target.value })}
                                    >
                                        {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                                        <input
                                            type="time"
                                            className="input-field"
                                            value={newSchedule.start_time}
                                            onChange={(e) => setNewSchedule({ ...newSchedule, start_time: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                                        <input
                                            type="time"
                                            className="input-field"
                                            value={newSchedule.end_time}
                                            onChange={(e) => setNewSchedule({ ...newSchedule, end_time: e.target.value })}
                                        />
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
