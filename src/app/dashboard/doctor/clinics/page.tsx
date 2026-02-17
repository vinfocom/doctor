"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, MapPin, Phone, Building2, Pencil } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";

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

    useEffect(() => {
        fetchClinics();
    }, []);

    const fetchClinics = async () => {
        try {
            const res = await fetch("/api/clinics");
            if (res.ok) {
                const data = await res.json();
                setClinics(data.clinics || []);
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

        try {
            const res = await fetch(`/api/schedule?clinicId=${clinic.clinic_id}`);
            if (res.ok) {
                const data = await res.json();
                const schedules = data.schedules || [];

                if (schedules.length > 0) {
                    const first = schedules[0];
                    const days = schedules.map((s: any) => s.day_of_week);

                    const parseTime = (time: string | null | undefined) => {
                        if (!time) return "09:00";
                        const timeStr = String(time);
                        return timeStr.includes("T") ? timeStr.split("T")[1].slice(0, 5) : timeStr.slice(0, 5);
                    };

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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">
                        Clinic Management
                    </h1>
                    <p className="text-gray-500 mt-2">Manage your clinic locations and details.</p>
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

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm">
                    {error}
                </div>
            )}

            {showForm && (
                <GlassCard className="mb-8">
                    <h2 className="text-xl font-semibold mb-6 text-gray-900 flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-indigo-500" />
                        {editingClinicId ? "Edit Clinic" : "Add New Clinic"}
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
                                <input
                                    type="text"
                                    name="location"
                                    value={formData.location}
                                    onChange={handleInputChange}
                                    required
                                    className="input-field"
                                    placeholder="Full address of the clinic"
                                />
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

                        {/* Schedule Section - Shows for both new and edit */}
                        <div className="space-y-4 border-t border-gray-100 pt-6">
                            <h3 className="text-lg font-medium text-gray-900">
                                {editingClinicId ? "Update Schedule" : "Initial Schedule"}
                            </h3>
                            <p className="text-sm text-gray-500">Set your availability for this clinic.</p>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-600">Available Days</label>
                                <div className="flex flex-wrap gap-2">
                                    {daysOfWeek.map(day => (
                                        <button
                                            key={day.id}
                                            type="button"
                                            onClick={() => handleDayToggle(day.id)}
                                            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${scheduleForm.days.includes(day.id)
                                                ? "bg-indigo-600 text-white border-indigo-600"
                                                : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
                                                }`}
                                        >
                                            {day.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-600">Start Time</label>
                                    <input
                                        type="time"
                                        name="start_time"
                                        value={scheduleForm.start_time}
                                        onChange={handleScheduleChange}
                                        className="input-field"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-600">End Time</label>
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
                        </div>

                        {/* Buttons */}
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
                {clinics.map((clinic) => (
                    <GlassCard key={clinic.clinic_id} className="group relative">
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                            <button
                                onClick={() => handleEditClinic(clinic)}
                                className="p-2 text-gray-400 hover:text-indigo-500 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Edit clinic"
                            >
                                <Pencil className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => handleDelete(clinic.clinic_id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                title="Delete clinic"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 rounded-xl bg-indigo-50 text-indigo-500 border border-indigo-100">
                                <Building2 className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">
                                    {clinic.clinic_name}
                                </h3>
                                <span className={`inline-flex items-center px-2 py-1 mt-1 rounded-md text-xs font-medium border ${
                                    clinic.status === "ACTIVE" 
                                        ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                        : "bg-gray-50 text-gray-600 border-gray-200"
                                }`}>
                                    {clinic.status}
                                </span>
                            </div>
                        </div>

                        <div className="space-y-3 pt-4 border-t border-gray-100">
                            <div className="flex items-start gap-3 text-gray-500">
                                <MapPin className="w-4 h-4 mt-1 text-gray-400 shrink-0" />
                                <span className="text-sm">{clinic.location}</span>
                            </div>
                            {clinic.phone && (
                                <div className="flex items-center gap-3 text-gray-500">
                                    <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                                    <span className="text-sm">{clinic.phone}</span>
                                </div>
                            )}
                        </div>
                    </GlassCard>
                ))}

                {clinics.length === 0 && !loading && (
                    <div className="col-span-full py-20 text-center">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-200">
                            <Building2 className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-600">No clinics found</h3>
                        <p className="text-gray-400 mt-2 max-w-sm mx-auto">
                            Get started by adding your first clinic location to manage appointments.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}