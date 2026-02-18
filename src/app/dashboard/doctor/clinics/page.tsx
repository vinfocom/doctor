"use client";

import { useState, useEffect, useMemo } from "react";
import {
    Plus, Trash2, MapPin, Phone, Building2, Pencil,
    Search, Filter, Calendar, Clock, ChevronDown, ChevronUp
} from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { formatTime } from "@/lib/timeUtils";
import { Button } from "@/components/ui/moving-border";

interface Clinic {
    clinic_id: number;
    clinic_name: string;
    location: string;
    phone: string;
    status: string;
}

export default function ClinicsPage() {
    const [clinics, setClinics] = useState<Clinic[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showForm, setShowForm] = useState(false);

    // UI State
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
    const [expandedScheduleId, setExpandedScheduleId] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        clinic_name: "",
        location: "",
        phone: "",
        status: "ACTIVE",
        schedule: [] as { day_of_week: number; start_time: string; end_time: string; slot_duration: number }[]
    });
    const [scheduleForm, setScheduleForm] = useState({
        days: [] as number[],
        start_time: "09:00",
        end_time: "17:00",
        slot_duration: 30
    });

    const daysOfWeek = [
        { id: 1, label: "Mon" },
        { id: 2, label: "Tue" },
        { id: 3, label: "Wed" },
        { id: 4, label: "Thu" },
        { id: 5, label: "Fri" },
        { id: 6, label: "Sat" },
        { id: 0, label: "Sun" },
    ];

    const [editingClinicId, setEditingClinicId] = useState<number | null>(null);
    const [clinicSchedules, setClinicSchedules] = useState<Record<number, any[]>>({});

    useEffect(() => {
        fetchClinics();
    }, []);

    const fetchClinics = async () => {
        try {
            const res = await fetch("/api/clinics");
            if (res.ok) {
                const data = await res.json();
                setClinics(data.clinics || []);
                // Fetch schedules for all clinics to display in expanded view
                data.clinics.forEach((clinic: Clinic) => fetchSchedule(clinic.clinic_id));
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

    const fetchSchedule = async (clinicId: number) => {
        try {
            const res = await fetch(`/api/schedule?clinicId=${clinicId}`);
            if (res.ok) {
                const data = await res.json();
                setClinicSchedules(prev => ({
                    ...prev,
                    [clinicId]: data.schedules || []
                }));
            }
        } catch (e) {
            console.error(`Failed to fetch schedule for clinic ${clinicId}`, e);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
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
            [name]: name === 'slot_duration' ? Number(value) : value
        }));
    };

    const handleEditClinic = async (clinic: Clinic) => {
        setEditingClinicId(clinic.clinic_id);
        setFormData({
            clinic_name: clinic.clinic_name,
            location: clinic.location,
            phone: clinic.phone || "",
            status: clinic.status || "ACTIVE",
            schedule: []
        });

        // Use cached schedule if available, or fetch
        const schedules = clinicSchedules[clinic.clinic_id] || [];

        if (schedules.length > 0) {
            const first = schedules[0];
            const days = schedules.map((s: any) => s.day_of_week);

            // Safely handle time parsing
            const parseTime = (time: string | null | undefined) => formatTime(time);

            setScheduleForm({
                days: days,
                start_time: parseTime(first.start_time),
                end_time: parseTime(first.end_time),
                slot_duration: Number(first.slot_duration) || 30
            });
        } else {
            // Need to fetch if not cached (fallback)
            try {
                const res = await fetch(`/api/schedule?clinicId=${clinic.clinic_id}`);
                if (res.ok) {
                    const data = await res.json();
                    const fetchedSchedules = data.schedules || [];
                    if (fetchedSchedules.length > 0) {
                        const first = fetchedSchedules[0];
                        const days = fetchedSchedules.map((s: any) => s.day_of_week);
                        const parseTime = (time: string | null | undefined) => formatTime(time);

                        setScheduleForm({
                            days: days,
                            start_time: parseTime(first.start_time),
                            end_time: parseTime(first.end_time),
                            slot_duration: Number(first.slot_duration) || 30
                        });
                    } else {
                        setScheduleForm({ days: [], start_time: "09:00", end_time: "17:00", slot_duration: 30 });
                    }
                }
            } catch (e) {
                console.error("Failed to fetch clinic schedule", e);
                setScheduleForm({ days: [], start_time: "09:00", end_time: "17:00", slot_duration: 30 });
            }
        }

        setShowForm(true);
        setError("");
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        const payload = {
            ...formData,
            schedule: scheduleForm.days.map(day => ({
                day_of_week: day,
                start_time: scheduleForm.start_time,
                end_time: scheduleForm.end_time,
                slot_duration: scheduleForm.slot_duration
            }))
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
                setFormData({ clinic_name: "", location: "", phone: "", status: "ACTIVE", schedule: [] });
                setScheduleForm({ days: [], start_time: "09:00", end_time: "17:00", slot_duration: 30 });
                setShowForm(false);
                setEditingClinicId(null);
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

            if (res.ok) {
                fetchClinics();
            } else {
                const data = await res.json();
                setError(data.error || "Failed to delete clinic");
            }
        } catch {
            setError("An error occurred while deleting clinic");
        }
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

    const stats = useMemo(() => {
        return {
            total: clinics.length,
            active: clinics.filter(c => c.status === "ACTIVE").length,
            inactive: clinics.filter(c => c.status === "INACTIVE").length
        };
    }, [clinics]);

    const toggleScheduleExpand = (clinicId: number) => {
        setExpandedScheduleId(prev => prev === clinicId ? null : clinicId);
    };

    const getDayName = (dayId: number) => daysOfWeek.find(d => d.id === dayId)?.label || "Unknown";

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">
                        Clinic Management
                    </h1>
                    <p className="text-gray-500 mt-2">Manage your practice locations and schedules.</p>
                </div>
                <PremiumButton onClick={() => {
                    setEditingClinicId(null);
                    setFormData({ clinic_name: "", location: "", phone: "", status: "ACTIVE", schedule: [] });
                    setScheduleForm({ days: [], start_time: "09:00", end_time: "17:00", slot_duration: 30 });
                    setShowForm(!showForm);
                }} icon={Plus}>
                    {showForm && !editingClinicId ? "Close Form" : "Add New Clinic"}
                </PremiumButton>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: "Total Clinics", value: stats.total, color: "bg-indigo-50 text-indigo-600", icon: Building2 },
                    { label: "Active Locations", value: stats.active, color: "bg-emerald-50 text-emerald-600", icon: MapPin },
                    { label: "Inactive", value: stats.inactive, color: "bg-gray-50 text-gray-600", icon: Trash2 },
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
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search clinics..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="input-field pl-10"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value as any)}
                        className="input-field w-auto"
                    >
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

            {showForm && (
                <GlassCard className="mb-8 border-l-4 border-l-indigo-500 animate-in slide-in-from-top-4 duration-300">
                    <h2 className="text-xl font-semibold mb-6 text-gray-900 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-indigo-500" />
                        {editingClinicId ? "Edit Clinic Details" : "Add New Clinic"}
                    </h2>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Clinic Name</label>
                                <input
                                    type="text"
                                    name="clinic_name"
                                    value={formData.clinic_name}
                                    onChange={handleInputChange}
                                    required
                                    className="input-field"
                                    placeholder="e.g. City Health Center"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Phone Number</label>
                                <input
                                    type="text"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleInputChange}
                                    className="input-field"
                                    placeholder="e.g. +1 234 567 890"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Location</label>
                                <div className="relative">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        name="location"
                                        value={formData.location}
                                        onChange={handleInputChange}
                                        required
                                        className="input-field pl-10"
                                        placeholder="Full address of the clinic"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Status</label>
                                <select
                                    name="status"
                                    value={formData.status}
                                    onChange={handleInputChange}
                                    className="input-field"
                                >
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-4 border-t border-gray-100 pt-6 bg-gray-50/50 -mx-6 px-6 pb-4">
                            <div className="flex items-center gap-2 mb-2">
                                <Calendar className="w-5 h-5 text-indigo-500" />
                                <h3 className="text-lg font-medium text-gray-900">
                                    {editingClinicId ? "Update Schedule" : "Initial Schedule"}
                                </h3>
                            </div>
                            <p className="text-sm text-gray-500 mb-4">Set your weekly availability for this clinic.</p>

                            <div className="space-y-3">
                                <label className="text-sm font-medium text-gray-600">Available Days</label>
                                <div className="flex flex-wrap gap-2">
                                    {daysOfWeek.map(day => (
                                        <button
                                            key={day.id}
                                            type="button"
                                            onClick={() => handleDayToggle(day.id)}
                                            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border shadow-sm ${scheduleForm.days.includes(day.id)
                                                ? "bg-indigo-600 text-white border-indigo-600 shadow-indigo-200"
                                                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:shadow-md"
                                                }`}
                                        >
                                            {day.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                        <Clock className="w-4 h-4" /> Start Time
                                    </label>
                                    <input
                                        type="time"
                                        name="start_time"
                                        value={scheduleForm.start_time}
                                        onChange={handleScheduleChange}
                                        className="input-field"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                                        <Clock className="w-4 h-4" /> End Time
                                    </label>
                                    <input
                                        type="time"
                                        name="end_time"
                                        value={scheduleForm.end_time}
                                        onChange={handleScheduleChange}
                                        className="input-field"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-600">Slot Duration (mins)</label>
                                    <input
                                        type="number"
                                        name="slot_duration"
                                        value={scheduleForm.slot_duration}
                                        onChange={handleScheduleChange}
                                        min="5"
                                        step="5"
                                        className="input-field"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <Button className="bg-transparent text-black">Add Schedule</Button>
                            </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <PremiumButton type="button" variant="ghost" onClick={() => {
                                setShowForm(false);
                                setEditingClinicId(null);
                                setFormData({ clinic_name: "", location: "", phone: "", status: "ACTIVE", schedule: [] });
                                setScheduleForm({ days: [], start_time: "09:00", end_time: "17:00", slot_duration: 30 });
                            }}>
                                Cancel
                            </PremiumButton>
                            <PremiumButton type="submit">
                                {editingClinicId ? "Update Clinic" : "Save Clinic"}
                            </PremiumButton>
                        </div>
                    </form>
                </GlassCard>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredClinics.map((clinic) => (
                    <GlassCard key={clinic.clinic_id} className="group relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                        <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                            <button
                                onClick={() => handleEditClinic(clinic)}
                                className="p-2 bg-white/80 backdrop-blur text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shadow-sm"
                                title="Edit clinic"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handleDelete(clinic.clinic_id)}
                                className="p-2 bg-white/80 backdrop-blur text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors shadow-sm"
                                title="Delete clinic"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
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
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${clinic.status === "ACTIVE"
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                        : "bg-gray-50 text-gray-600 border-gray-200"
                                        }`}>
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
                        </div>

                        {/* Collapsible Schedule View */}
                        <div className="mt-4 pt-2 border-t border-gray-100/50">
                            <button
                                onClick={() => toggleScheduleExpand(clinic.clinic_id)}
                                className="w-full flex items-center justify-between text-xs font-medium text-gray-400 hover:text-indigo-600 transition-colors"
                            >
                                <span>View Schedule</span>
                                {expandedScheduleId === clinic.clinic_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </button>

                            {expandedScheduleId === clinic.clinic_id && (
                                <div className="mt-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
                                    {(clinicSchedules[clinic.clinic_id]?.length || 0) > 0 ? (
                                        clinicSchedules[clinic.clinic_id].map((sch, i) => (
                                            <div key={i} className="flex justify-between items-center text-xs bg-gray-50 p-2 rounded-lg">
                                                <span className="font-medium text-gray-700">{getDayName(sch.day_of_week)}</span>
                                                <span className="text-gray-500">
                                                    {formatTime(sch.start_time)} - {formatTime(sch.end_time)}
                                                </span>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-xs text-gray-400 italic text-center py-2">No schedule set</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </GlassCard>
                ))}

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