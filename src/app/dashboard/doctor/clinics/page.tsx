"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
    Plus, Trash2, MapPin, Phone, Building2, Pencil,
    Search, Filter, Calendar, Clock, ChevronDown, ChevronUp,
    Sun, Sunset, Moon, Check, X, QrCode
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { formatTime, convertTo12Hour, convertTo24Hour } from "@/lib/timeUtils";
import { Button } from "@/components/ui/moving-border";

interface Clinic {
    clinic_id: number;
    clinic_name: string;
    location: string;
    phone: string;
    status: string;
    doctor_id: number;
    barcode_url?: string | null;
}

interface ScheduleEntry {
    schedule_id: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration: number;
}

interface ScheduleFormState {
    days: number[];
    start_time: string;
    end_time: string;
    slot_duration: number;
}

const DAYS = [
    { id: 0, label: "Sun" },
    { id: 1, label: "Mon" },
    { id: 2, label: "Tue" },
    { id: 3, label: "Wed" },
    { id: 4, label: "Thu" },
    { id: 5, label: "Fri" },
    { id: 6, label: "Sat" },
    
];

function getHour(timeStr: string): number {
    const t24 = formatTime(timeStr); // converts AM/PM to 24h string
    const h = parseInt(t24.split(":")[0], 10);
    return isNaN(h) ? 0 : h;
}

function getPeriod(timeStr: string): "morning" | "afternoon" | "evening" {
    const h = getHour(timeStr);
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
}

const PERIODS = [
    { key: "morning", label: "Morning", range: "12 AM – 11:59 AM", Icon: Sun, color: "text-amber-500", bgColor: "bg-amber-50 border-amber-200" },
    { key: "afternoon", label: "Afternoon", range: "12 PM – 4:59 PM", Icon: Sunset, color: "text-orange-500", bgColor: "bg-orange-50 border-orange-200" },
    { key: "evening", label: "Evening / Night", range: "5 PM onwards", Icon: Moon, color: "text-indigo-500", bgColor: "bg-indigo-50 border-indigo-200" },
] as const;

export default function ClinicsPage() {
    const [clinics, setClinics] = useState<Clinic[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showForm, setShowForm] = useState(false);

    // UI State
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
    const [expandedScheduleId, setExpandedScheduleId] = useState<number | null>(null);

    // Clinic form
    const [formData, setFormData] = useState({
        clinic_name: "",
        location: "",
        phone: "",
        status: "ACTIVE",
        barcode_url: "",
        schedule: [] as { day_of_week: number; start_time: string; end_time: string; slot_duration: number }[]
    });

    // Schedule block form (for add / inline edit)
    const [scheduleForm, setScheduleForm] = useState<ScheduleFormState>({
        days: [],
        start_time: "09:00",
        end_time: "17:00",
        slot_duration: 30
    });

    // Editing state
    const [editingClinicId, setEditingClinicId] = useState<number | null>(null);
    const [clinicSchedules, setClinicSchedules] = useState<Record<number, ScheduleEntry[]>>({});

    // Existing DB schedules shown inside the edit form
    const [existingSchedules, setExistingSchedules] = useState<ScheduleEntry[]>([]);

    // Inline-edit of an existing DB schedule
    const [editingSchedule, setEditingSchedule] = useState<ScheduleEntry | null>(null);
    // Editing a "new" (not yet saved) block index
    const [editingNewIdx, setEditingNewIdx] = useState<number | null>(null);

    const [savingSchedule, setSavingSchedule] = useState(false);
    const [deletingScheduleId, setDeletingScheduleId] = useState<number | null>(null);

    useEffect(() => {
        fetchClinics();
    }, []);

    const fetchClinics = async () => {
        try {
            const res = await fetch("/api/clinics");
            if (res.ok) {
                const data = await res.json();
                setClinics(data.clinics || []);
                data.clinics.forEach((c: Clinic) => fetchSchedule(c.clinic_id));
            } else {
                const data = await res.json();
                setError(data.error || "Failed to fetch clinics");
            }
        } catch {
            setError("An error occurred while fetching clinics");
        } finally {
            setLoading(false);
        }
    };

    const fetchSchedule = async (clinicId: number): Promise<ScheduleEntry[]> => {
        try {
            const res = await fetch(`/api/schedule?clinicId=${clinicId}`);
            if (res.ok) {
                const data = await res.json();
                const schedules = (data.schedules || []) as ScheduleEntry[];
                setClinicSchedules(prev => ({ ...prev, [clinicId]: schedules }));
                return schedules;
            }
        } catch (e) {
            console.error(`Failed to fetch schedule for clinic ${clinicId}`, e);
        }
        return [];
    };

    const resetScheduleForm = () => {
        setScheduleForm({ days: [], start_time: "09:00", end_time: "17:00", slot_duration: 30 });
        setEditingSchedule(null);
        setEditingNewIdx(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleDayToggle = (dayId: number) => {
        setScheduleForm(prev => {
            const days = prev.days.includes(dayId)
                ? prev.days.filter(d => d !== dayId)
                : [...prev.days, dayId];
            return { ...prev, days };
        });
    };

    const handleScheduleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setScheduleForm(prev => ({
            ...prev,
            [name]: name === "slot_duration" ? Number(value) : value
        }));
    };

    const handleEditClinic = async (clinic: Clinic) => {
        setEditingClinicId(clinic.clinic_id);
        setFormData({
            clinic_name: clinic.clinic_name,
            location: clinic.location,
            phone: clinic.phone || "",
            status: clinic.status || "ACTIVE",
            barcode_url: clinic.barcode_url || "",
            schedule: []
        });
        resetScheduleForm();

        // Fetch fresh schedules for this clinic
        const cached = clinicSchedules[clinic.clinic_id];
        let schedules: ScheduleEntry[] = cached || [];
        if (!cached) {
            schedules = await fetchSchedule(clinic.clinic_id);
        }
        setExistingSchedules([...schedules].sort((a, b) => a.day_of_week - b.day_of_week));

        setShowForm(true);
        setError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    // --- Inline edit of existing DB schedule ---
    const handleStartEditExisting = (sch: ScheduleEntry) => {
        setEditingSchedule(sch);
        setEditingNewIdx(null);
        setScheduleForm({
            days: [sch.day_of_week],
            start_time: formatTime(sch.start_time),
            end_time: formatTime(sch.end_time),
            slot_duration: Number(sch.slot_duration) || 30
        });
    };

    const handleSaveExistingSchedule = async () => {
        if (!editingSchedule) return;
        if (scheduleForm.days.length === 0) { alert("Please select a day"); return; }
        setSavingSchedule(true);
        try {
            const res = await fetch("/api/schedule", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clinicId: editingClinicId,
                    schedules: scheduleForm.days.map(day => ({
                        schedule_id: scheduleForm.days.length === 1 ? editingSchedule.schedule_id : undefined,
                        day_of_week: day,
                        start_time: convertTo12Hour(scheduleForm.start_time),
                        end_time: convertTo12Hour(scheduleForm.end_time),
                        slot_duration: scheduleForm.slot_duration,
                        effective_to: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
                    }))
                })
            });
            if (res.ok) {
                const refreshed = await fetchSchedule(editingClinicId!);
                setExistingSchedules([...refreshed].sort((a, b) => a.day_of_week - b.day_of_week));
                resetScheduleForm();
            } else {
                const d = await res.json();
                setError(d.error || "Failed to update schedule");
            }
        } catch {
            setError("Error updating schedule");
        } finally {
            setSavingSchedule(false);
        }
    };

    // --- Delete existing DB schedule ---
    const handleDeleteExistingSchedule = async (scheduleId: number) => {
        if (!confirm("Delete this schedule slot?")) return;
        setDeletingScheduleId(scheduleId);
        try {
            const res = await fetch(`/api/schedule?scheduleId=${scheduleId}`, { method: "DELETE" });
            if (res.ok) {
                const refreshed = await fetchSchedule(editingClinicId!);
                setExistingSchedules([...refreshed].sort((a, b) => a.day_of_week - b.day_of_week));
                if (editingSchedule?.schedule_id === scheduleId) resetScheduleForm();
            } else {
                const d = await res.json();
                setError(d.error || "Failed to delete schedule");
            }
        } catch {
            setError("Error deleting schedule");
        } finally {
            setDeletingScheduleId(null);
        }
    };

    // --- Inline edit of a "new" (unsaved) schedule block ---
    const handleStartEditNew = (idx: number) => {
        const sch = formData.schedule[idx];
        setEditingNewIdx(idx);
        setEditingSchedule(null);
        setScheduleForm({
            days: [sch.day_of_week],
            start_time: sch.start_time.includes(" ") ? convertTo24Hour(sch.start_time) : sch.start_time,
            end_time: sch.end_time.includes(" ") ? convertTo24Hour(sch.end_time) : sch.end_time,
            slot_duration: sch.slot_duration
        });
    };

    // --- Add or save new schedule block (not yet sent to DB) ---
    const handleAddOrUpdateNewBlock = () => {
        if (scheduleForm.days.length === 0) { alert("Please select at least one day"); return; }

        const newEntries = scheduleForm.days.map(day => ({
            day_of_week: day,
            start_time: convertTo12Hour(scheduleForm.start_time),
            end_time: convertTo12Hour(scheduleForm.end_time),
            slot_duration: scheduleForm.slot_duration
        }));

        if (editingNewIdx !== null) {
            // Replace the single entry being edited
            setFormData(prev => {
                const updated = [...prev.schedule];
                updated.splice(editingNewIdx, 1, ...newEntries);
                return { ...prev, schedule: updated };
            });
            setEditingNewIdx(null);
        } else {
            setFormData(prev => ({ ...prev, schedule: [...prev.schedule, ...newEntries] }));
        }
        resetScheduleForm();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const payload = {
            clinic_name: formData.clinic_name,
            location: formData.location,
            phone: formData.phone,
            status: formData.status,
            schedule: formData.schedule  // only new blocks
        };

        try {
            let res;
            if (editingClinicId) {
                res = await fetch(`/api/clinics/${editingClinicId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch("/api/clinics", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
            }

            if (res.ok) {
                setFormData({ clinic_name: "", location: "", phone: "", status: "ACTIVE", barcode_url: "", schedule: [] });
                resetScheduleForm();
                setShowForm(false);
                setEditingClinicId(null);
                setExistingSchedules([]);
                fetchClinics();
            } else {
                const data = await res.json();
                setError(data.error || "Failed to save clinic");
            }
        } catch {
            setError("An error occurred while saving clinic");
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this clinic?")) return;
        try {
            const res = await fetch(`/api/clinics/${id}`, { method: "DELETE" });
            if (res.ok) { fetchClinics(); }
            else { const d = await res.json(); setError(d.error || "Failed to delete clinic"); }
        } catch { setError("An error occurred while deleting clinic"); }
    };

    const handleGenerateBarcode = async (clinic: Clinic) => {
        try {
            const url = `https://msgbot.duckdns.org/qr/checkin?doctor_id=${clinic.doctor_id}&clinic_id=${clinic.clinic_id}`;
            await fetch(`/api/clinics/${clinic.clinic_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ barcode_url: url }) // this will update just barcode_url
            });
            window.open(url, "_blank");
            fetchClinics(); // Refresh state so button reflects success (if needed, though we just open url)
        } catch (e) {
            console.error("Error generating barcode", e);
        }
    };

    // Grouping helper
    const groupByPeriod = (schedules: { day_of_week: number; start_time: string; end_time: string; slot_duration: number; schedule_id?: number }[]) => {
        const groups: Record<"morning" | "afternoon" | "evening", typeof schedules> = { morning: [], afternoon: [], evening: [] };
        schedules.forEach(s => groups[getPeriod(s.start_time)].push(s));
        return groups;
    };

    // Computations
    const filteredClinics = useMemo(() => {
        return clinics.filter(clinic => {
            const matchesSearch = clinic.clinic_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                clinic.location.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesFilter = filterStatus === "ALL" || clinic.status === filterStatus;
            return matchesSearch && matchesFilter;
        });
    }, [clinics, searchTerm, filterStatus]);

    const stats = useMemo(() => ({
        total: clinics.length,
        active: clinics.filter(c => c.status === "ACTIVE").length,
        inactive: clinics.filter(c => c.status === "INACTIVE").length
    }), [clinics]);

    const toggleScheduleExpand = (clinicId: number) => {
        setExpandedScheduleId(prev => prev === clinicId ? null : clinicId);
    };

    const getDayName = (dayId: number) => DAYS.find(d => d.id === dayId)?.label || "?";

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    const isEditingAny = editingSchedule !== null || editingNewIdx !== null;
    const existingGroups = groupByPeriod(existingSchedules);
    const newGroups = groupByPeriod(formData.schedule.map((s, i) => ({ ...s, schedule_id: -(i + 1) })));

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">Clinic Management</h1>
                    <p className="text-gray-500 mt-2">Manage your practice locations and schedules.</p>
                </div>
                <PremiumButton onClick={() => {
                    setEditingClinicId(null);
                    setFormData({ clinic_name: "", location: "", phone: "", status: "ACTIVE", barcode_url: "", schedule: [] });
                    resetScheduleForm();
                    setExistingSchedules([]);
                    setShowForm(!showForm);
                }} icon={Plus}>
                    {showForm && !editingClinicId ? "Close Form" : "Add New Clinic"}
                </PremiumButton>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: "Total Clinics", value: stats.total, color: "bg-indigo-50 text-indigo-600", icon: Building2 },
                    { label: "Active Clinics", value: stats.active, color: "bg-emerald-50 text-emerald-600", icon: MapPin },
                    { label: "Inactive Clinics", value: stats.inactive, color: "bg-gray-50 text-gray-600", icon: Trash2 },
                ].map((stat, idx) => (
                    <GlassCard key={idx} className="flex items-center gap-4 p-4">
                        <div className={`p-3 rounded-xl ${stat.color}`}>
                            <stat.icon className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                            <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                        </div>
                    </GlassCard>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input type="text" placeholder="Search clinics..." value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)} className="input-field input-field-with-icon pr-4"
                        style={{ paddingLeft: "3rem" }} />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="input-field w-auto">
                        <option value="ALL">All Status</option>
                        <option value="ACTIVE">Active</option>
                        <option value="INACTIVE">Inactive</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm animate-in slide-in-from-top-2">
                    {error}
                </div>
            )}

            {/* ====== CLINIC FORM ====== */}
            {showForm && (
                <GlassCard className="mb-8 border-l-4 border-l-indigo-500 animate-in slide-in-from-top-4 duration-300">
                    <h2 className="text-xl font-semibold mb-6 text-gray-900 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-indigo-500" />
                        {editingClinicId ? "Edit Clinic" : "Add New Clinic"}
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Info */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Clinic Name</label>
                                <input type="text" name="clinic_name" value={formData.clinic_name}
                                    onChange={handleInputChange} required className="input-field"
                                    placeholder="e.g. City Health Center" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Phone Number</label>
                                <input type="text" name="phone" value={formData.phone}
                                    onChange={handleInputChange} className="input-field"
                                    placeholder="e.g. +1 234 567 890" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Location</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input type="text" name="location" value={formData.location}
                                        onChange={handleInputChange} required className="input-field"
                                        style={{ paddingLeft: '2.5rem' }}
                                        placeholder="Full address of the clinic" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Status</label>
                                <select name="status" value={formData.status} onChange={handleInputChange} className="input-field">
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                </select>
                            </div>
                        </div>

                        {/* ===== SCHEDULES SECTION ===== */}
                        <div className="border-t border-gray-100 pt-6 space-y-6">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-5 h-5 text-indigo-500" />
                                <h3 className="text-lg font-semibold text-gray-900">Schedule Management</h3>
                            </div>

                            {/* --- EXISTING DB SCHEDULES (only in edit mode) --- */}
                            {editingClinicId && (
                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-gray-700">
                                        Saved Schedules
                                        <span className="ml-2 text-xs text-gray-400">– edit or delete individual slots</span>
                                    </p>

                                    {existingSchedules.length === 0 ? (
                                        <p className="text-sm text-gray-400 italic">No schedules saved yet for this clinic.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {PERIODS.map(({ key, label, range, Icon, color, bgColor }) => {
                                                const items = existingGroups[key];
                                                if (items.length === 0) return null;
                                                return (
                                                    <div key={key} className={`rounded-xl border overflow-hidden ${bgColor}`}>
                                                        {/* Period header */}
                                                        <div className="flex items-center gap-2 px-4 py-2 border-b border-current border-opacity-20">
                                                            <Icon className={`w-4 h-4 ${color}`} />
                                                            <span className={`text-sm font-semibold ${color}`}>{label}</span>
                                                            <span className="text-xs text-gray-400 ml-1">({range})</span>
                                                            <span className="ml-auto text-xs text-gray-500">{items.length} slot{items.length > 1 ? "s" : ""}</span>
                                                        </div>
                                                        {/* Each schedule row */}
                                                        <div className="divide-y divide-gray-100/60 bg-white/70 backdrop-blur">
                                                            {(items as ScheduleEntry[]).map(sch => {
                                                                const isEditing = editingSchedule?.schedule_id === sch.schedule_id;
                                                                const isDeleting = deletingScheduleId === sch.schedule_id;
                                                                return (
                                                                    <div key={sch.schedule_id}
                                                                        className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isEditing ? "bg-indigo-50/80" : "hover:bg-gray-50/80"}`}>
                                                                        {/* Day badge */}
                                                                        <span className={`w-10 text-center py-0.5 rounded-md text-xs font-bold ${color} bg-white border`}>
                                                                            {getDayName(sch.day_of_week)}
                                                                        </span>
                                                                        <span className="flex-1 text-gray-700 font-medium">
                                                                            {convertTo12Hour(formatTime(sch.start_time))} – {convertTo12Hour(formatTime(sch.end_time))}
                                                                        </span>
                                                                        <span className="text-xs text-gray-400 whitespace-nowrap">
                                                                            {sch.slot_duration} min/slot
                                                                        </span>
                                                                        {/* Actions */}
                                                                        <div className="flex gap-1">
                                                                            <button type="button"
                                                                                onClick={() => isEditing ? resetScheduleForm() : handleStartEditExisting(sch)}
                                                                                className={`p-1.5 rounded-lg transition-colors ${isEditing
                                                                                    ? "bg-gray-200 text-gray-500 hover:bg-gray-300"
                                                                                    : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"}`}
                                                                                title={isEditing ? "Cancel edit" : "Edit schedule"}>
                                                                                {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                                                                            </button>
                                                                            <button type="button"
                                                                                onClick={() => handleDeleteExistingSchedule(sch.schedule_id)}
                                                                                disabled={isDeleting}
                                                                                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                                                                                title="Delete schedule">
                                                                                {isDeleting
                                                                                    ? <div className="w-3.5 h-3.5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                                                                                    : <Trash2 className="w-3.5 h-3.5" />}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* --- NEW BLOCKS (pending, not yet saved) --- */}
                            {formData.schedule.length > 0 && (
                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                                        New Schedules to Add
                                        <span className="text-xs text-gray-400">(will be saved on submit)</span>
                                    </p>
                                    <div className="space-y-3">
                                        {PERIODS.map(({ key, label, Icon, color, bgColor }) => {
                                            const items = newGroups[key];
                                            if (items.length === 0) return null;
                                            return (
                                                <div key={key} className={`rounded-xl border overflow-hidden ${bgColor}`}>
                                                    <div className="flex items-center gap-2 px-4 py-2 border-b border-current border-opacity-20">
                                                        <Icon className={`w-4 h-4 ${color}`} />
                                                        <span className={`text-sm font-semibold ${color}`}>{label}</span>
                                                        <span className="ml-auto text-xs text-gray-500">{items.length} new</span>
                                                    </div>
                                                    <div className="divide-y divide-gray-100/60 bg-white/70 backdrop-blur">
                                                        {items.map((sch) => {
                                                            // schedule_id is negative (-(idx+1)) for new blocks
                                                            const idx = -(sch.schedule_id as number) - 1;
                                                            const isEditing = editingNewIdx === idx;
                                                            return (
                                                                <div key={idx}
                                                                    className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${isEditing ? "bg-indigo-50/80" : "hover:bg-gray-50/80"}`}>
                                                                    <span className={`w-10 text-center py-0.5 rounded-md text-xs font-bold ${color} bg-white border`}>
                                                                        {getDayName(sch.day_of_week)}
                                                                    </span>
                                                                    <span className="flex-1 text-gray-700 font-medium">
                                                                        {sch.start_time} – {sch.end_time}
                                                                    </span>
                                                                    <span className="text-xs text-gray-400">{sch.slot_duration} min/slot</span>
                                                                    <div className="flex gap-1">
                                                                        <button type="button"
                                                                            onClick={() => isEditing ? resetScheduleForm() : handleStartEditNew(idx)}
                                                                            className={`p-1.5 rounded-lg transition-colors ${isEditing
                                                                                ? "bg-gray-200 text-gray-500 hover:bg-gray-300"
                                                                                : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"}`}
                                                                            title={isEditing ? "Cancel" : "Edit"}>
                                                                            {isEditing ? <X className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
                                                                        </button>
                                                                        <button type="button"
                                                                            onClick={() => setFormData(prev => ({ ...prev, schedule: prev.schedule.filter((_, i) => i !== idx) }))}
                                                                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                                            title="Remove">
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* --- SCHEDULE FORM (add new / inline edit) --- */}
                            <div className="bg-gray-50/70 rounded-2xl border border-gray-200 p-5 space-y-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <Clock className="w-4 h-4 text-indigo-500" />
                                    <h4 className="text-sm font-semibold text-gray-800">
                                        {editingSchedule ? `Editing saved slot – ${getDayName(editingSchedule.day_of_week)}`
                                            : editingNewIdx !== null ? "Editing new block"
                                                : "Add a Schedule Block"}
                                    </h4>
                                    {isEditingAny && (
                                        <button type="button" onClick={resetScheduleForm}
                                            className="ml-auto text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                                            <X className="w-3.5 h-3.5" /> Cancel
                                        </button>
                                    )}
                                </div>

                                {/* Day selector */}
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-gray-600">Available Day(s)</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {DAYS.map(day => (
                                            <button key={day.id} type="button"
                                                onClick={() => editingSchedule
                                                    ? setScheduleForm(prev => ({ ...prev, days: [day.id] }))   // single day for existing edit
                                                    : handleDayToggle(day.id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-150 border shadow-sm
                                                    ${scheduleForm.days.includes(day.id)
                                                        ? "bg-indigo-600 text-white border-indigo-600 shadow-indigo-200"
                                                        : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"}`}>
                                                {day.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-600">Start Time</label>
                                        <input type="time" name="start_time" value={scheduleForm.start_time}
                                            onChange={handleScheduleChange} className="input-field" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-600">End Time</label>
                                        <input type="time" name="end_time" value={scheduleForm.end_time}
                                            onChange={handleScheduleChange} className="input-field" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-medium text-gray-600">Slot Duration (mins)</label>
                                        <input type="number" name="slot_duration" value={scheduleForm.slot_duration}
                                            onChange={handleScheduleChange} min="5" step="5" className="input-field" />
                                    </div>
                                </div>

                                <div className="flex justify-end pt-1">
                                    {editingSchedule ? (
                                        <Button type="button" onClick={handleSaveExistingSchedule}
                                            disabled={savingSchedule}
                                            className="bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 flex items-center gap-2">
                                            {savingSchedule
                                                ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
                                                : <Check className="w-4 h-4" />}
                                            Save Changes
                                        </Button>
                                    ) : (
                                        <Button type="button" onClick={handleAddOrUpdateNewBlock}
                                            className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 flex items-center gap-2">
                                            <Plus className="w-4 h-4" />
                                            {editingNewIdx !== null ? "Update Block" : "Add Schedule Block"}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Form actions */}
                        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
                            <PremiumButton type="button" variant="ghost" onClick={() => {
                                setShowForm(false);
                                setEditingClinicId(null);
                                setExistingSchedules([]);
                                setFormData({ clinic_name: "", location: "", phone: "", status: "ACTIVE", barcode_url: "", schedule: [] });
                                resetScheduleForm();
                            }}>Cancel</PremiumButton>
                            <PremiumButton type="submit">
                                {editingClinicId ? "Update Clinic" : "Save Clinic"}
                            </PremiumButton>
                        </div>
                    </form>
                </GlassCard>
            )}

            {/* ====== CLINIC CARDS ====== */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClinics.map(clinic => {
                    const schedules = clinicSchedules[clinic.clinic_id] || [];
                    const groups = groupByPeriod(schedules);

                    return (
                        <GlassCard key={clinic.clinic_id} className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                                <button onClick={() => handleEditClinic(clinic)}
                                    className="p-2 bg-white/80 backdrop-blur text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shadow-sm"
                                    title="Edit clinic"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => handleDelete(clinic.clinic_id)}
                                    className="p-2 bg-white/80 backdrop-blur text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shadow-sm"
                                    title="Delete clinic"><Trash2 className="w-4 h-4" /></button>
                            </div>

                            <div className="flex items-start gap-4 mb-4">
                                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 text-indigo-600 border border-indigo-100 shadow-inner">
                                    <Building2 className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-lg font-bold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                                        {clinic.clinic_name}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
                                            ${clinic.status === "ACTIVE"
                                                ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                                : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                                            {clinic.status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 pt-4 border-t border-gray-100/50">
                                <div className="flex items-start gap-3 text-gray-500">
                                    <MapPin className="w-4 h-4 mt-1 text-indigo-400 shrink-0" />
                                    <span className="text-sm line-clamp-2">{clinic.location}</span>
                                </div>
                                {clinic.phone && (
                                    <div className="flex items-center gap-3 text-gray-500">
                                        <Phone className="w-4 h-4 text-indigo-400 shrink-0" />
                                        <span className="text-sm">{clinic.phone}</span>
                                    </div>
                                )}
                                <div className="flex items-center mt-2">
                                    <button
                                        onClick={() => handleGenerateBarcode(clinic)}
                                        className="inline-flex items-center justify-center w-full gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold text-sm rounded-lg transition-colors border border-indigo-200"
                                    >
                                        <QrCode className="w-4 h-4" />
                                        Generate Bar Code
                                    </button>
                                </div>
                            </div>

                            {/* Collapsible Schedule View – grouped by period */}
                            <div className="mt-4 pt-2 border-t border-gray-100/50">
                                <button onClick={() => toggleScheduleExpand(clinic.clinic_id)}
                                    className="w-full flex items-center justify-between text-xs font-medium text-gray-400 hover:text-indigo-600 transition-colors">
                                    <span>View Schedule {schedules.length > 0 ? `(${schedules.length} slots)` : ""}</span>
                                    {expandedScheduleId === clinic.clinic_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>

                                {expandedScheduleId === clinic.clinic_id && (
                                    <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                        {schedules.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic text-center py-2">No schedule set</p>
                                        ) : (
                                            PERIODS.map(({ key, label, Icon, color, bgColor }) => {
                                                const items = groups[key];
                                                if (items.length === 0) return null;
                                                return (
                                                    <div key={key} className={`rounded-lg border text-xs overflow-hidden ${bgColor}`}>
                                                        <div className={`flex items-center gap-1.5 px-3 py-1.5 font-semibold ${color}`}>
                                                            <Icon className="w-3 h-3" />
                                                            {label}
                                                        </div>
                                                        <div className="bg-white/70 divide-y divide-gray-100/50">
                                                            {(items as ScheduleEntry[]).map((sch, i) => (
                                                                <div key={i} className="flex justify-between items-center px-3 py-1.5">
                                                                    <span className={`font-semibold ${color}`}>{getDayName(sch.day_of_week)}</span>
                                                                    <span className="text-gray-500">
                                                                        {convertTo12Hour(formatTime(sch.start_time))} – {convertTo12Hour(formatTime(sch.end_time))}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                )}
                            </div>
                        </GlassCard>
                    );
                })}

                {filteredClinics.length === 0 && !loading && (
                    <div className="col-span-full py-20 text-center animate-in fade-in zoom-in duration-300">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-200 shadow-sm">
                            <Building2 className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-600">No clinics found</h3>
                        <p className="text-gray-400 mt-2 max-w-sm mx-auto">
                            {searchTerm ? "Try adjusting your search or filters." : "Get started by adding your first clinic location."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
