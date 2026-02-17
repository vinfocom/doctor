
"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, MapPin, Phone, Building2 } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { motion, AnimatePresence } from "motion/react";

interface Clinic {
    clinic_id: number;
    clinic_name: string;
    location: string;
    phone: string;
    status: string;
    admin?: { user: { name: string } };
}

export default function AdminClinicsPage() {
    const [clinics, setClinics] = useState<Clinic[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showForm, setShowForm] = useState(false);
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const [formData, setFormData] = useState({
        clinic_name: "",
        location: "",
        phone: ""
    });

    useEffect(() => {
        fetchUser();
        fetchClinics();
    }, []);

    const fetchUser = async () => {
        try {
            const res = await fetch("/api/auth/me");
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            }
        } catch (e) { console.error(e); }
    };

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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        try {
            const res = await fetch("/api/clinics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(formData),
            });

            if (res.ok) {
                setFormData({ clinic_name: "", location: "", phone: "" });
                setShowForm(false);
                fetchClinics();
            } else {
                const data = await res.json();
                setError(data.error || "Failed to create clinic");
            }
        } catch {
            setError("An error occurred while creating clinic");
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

    // Determine sidebar role from user or default to ADMIN if user not loaded yet
    const sidebarRole = (user?.role === "SUPER_ADMIN" || user?.role === "ADMIN") ? user.role : "ADMIN";

    return (
        <div className="w-full">
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold gradient-text">
                            Clinic Management
                        </h1>
                        <p className="text-gray-500 mt-2">Manage clinic locations and details.</p>
                    </div>
                    <PremiumButton onClick={() => setShowForm(!showForm)} icon={Plus}>
                        Add New Clinic
                    </PremiumButton>
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm overflow-hidden">
                            {error}
                        </motion.div>
                    )}
                </AnimatePresence>

                <AnimatePresence>
                    {showForm && (
                        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
                            <GlassCard className="mb-8">
                                <h2 className="text-xl font-semibold mb-6 text-gray-900 flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-indigo-500" />
                                    Add New Clinic
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
                                    <div className="flex justify-end gap-3 pt-4">
                                        <PremiumButton type="button" variant="ghost" onClick={() => setShowForm(false)}>
                                            Cancel
                                        </PremiumButton>
                                        <PremiumButton type="submit">
                                            Save Clinic
                                        </PremiumButton>
                                    </div>
                                </form>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {clinics.map((clinic) => (
                        <GlassCard key={clinic.clinic_id} className="group relative">
                            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={() => handleDelete(clinic.clinic_id)}
                                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
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
                                    <span className="inline-flex items-center px-2 py-1 mt-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200">
                                        {clinic.status}
                                    </span>
                                    {clinic.admin && (
                                        <p className="text-xs text-gray-400 mt-1">Admin: {clinic.admin.user.name}</p>
                                    )}
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
                                Get started by adding your first clinic location.
                            </p>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}
