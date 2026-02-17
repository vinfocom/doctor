
"use client";
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "@/components/ui/GlassCard";
import { User, Phone, MessageCircle, Activity, Loader2, Save, MapPin, Building2, Clock } from "lucide-react";
import Link from "next/link";

interface Schedule {
    day_of_week: number;
    start_time: string;
    end_time: string;
}

interface Clinic {
    clinic_id: number;
    clinic_name: string;
    location: string;
    phone: string;
    status: string;
    schedules: Schedule[];
}

interface DoctorProfile {
    doctor_id: number;
    doctor_name: string;
    phone: string;
    whatsapp_number: string;
    status: string;
    clinics: Clinic[];
}

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DoctorProfilePage() {
    const [profile, setProfile] = useState<DoctorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        fetchProfile();
    }, []);

    const fetchProfile = async () => {
        try {
            const res = await fetch("/api/doctors/me");
            if (res.ok) {
                const data = await res.json();
                setProfile(data.doctor);
            }
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            // Remove clinics from payload before sending
            const { clinics, ...profileData } = profile || {};

            const res = await fetch("/api/doctors/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(profileData),
            });

            if (res.ok) {
                setMessage({ type: "success", text: "Profile updated successfully" });
                setTimeout(() => setMessage(null), 3000);
            } else {
                setMessage({ type: "error", text: "Failed to update profile" });
            }
        } catch (error) {
            console.error("Error updating profile:", error);
            setMessage({ type: "error", text: "An error occurred" });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto p-4 space-y-8">
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
                <h1 className="text-3xl font-bold gradient-text">My Profile</h1>
                <p className="text-gray-500 mt-1">Manage your personal and professional details</p>
            </motion.div>

            <AnimatePresence>
                {message && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: "auto" }}
                        exit={{ opacity: 0, y: -20, height: 0 }}
                        className={`mb-6 px-4 py-3 rounded-xl border ${message.type === "success"
                            ? "bg-green-50 border-green-200 text-green-600"
                            : "bg-red-50 border-red-200 text-red-600"
                            }`}
                    >
                        {message.text}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Profile Form */}
                <motion.div className="lg:col-span-1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
                    <form onSubmit={handleUpdate}>
                        <GlassCard className="space-y-6 sticky top-8">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                                <User className="w-5 h-5 text-indigo-500" />
                                Personal Details
                            </h2>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Full Name</label>
                                    <input
                                        type="text"
                                        value={profile?.doctor_name || ""}
                                        onChange={(e) => setProfile(prev => prev ? { ...prev, doctor_name: e.target.value } : null)}
                                        className="input-field"
                                        placeholder="Dr. John Doe"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Status</label>
                                    <select
                                        value={profile?.status || "ACTIVE"}
                                        onChange={(e) => setProfile(prev => prev ? { ...prev, status: e.target.value } : null)}
                                        className="input-field"
                                    >
                                        <option value="ACTIVE">Active</option>
                                        <option value="INACTIVE">Inactive</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">Phone</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                        <input
                                            type="tel"
                                            value={profile?.phone || ""}
                                            onChange={(e) => setProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                            className="input-field pl-10"
                                            placeholder="+1 234 567 890"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">WhatsApp</label>
                                    <div className="relative">
                                        <MessageCircle className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                        <input
                                            type="tel"
                                            value={profile?.whatsapp_number || ""}
                                            onChange={(e) => setProfile(prev => prev ? { ...prev, whatsapp_number: e.target.value } : null)}
                                            className="input-field pl-10"
                                            placeholder="+1 234 567 890"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full btn-primary flex items-center justify-center gap-2 mt-4"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </GlassCard>
                    </form>
                </motion.div>

                {/* Clinics List */}
                <motion.div className="lg:col-span-2 space-y-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-2xl font-bold text-gray-800">My Clinics</h2>
                        <Link href="/dashboard/doctor/clinics">
                            <button className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">Manage Clinics &rarr;</button>
                        </Link>
                    </div>

                    {profile?.clinics && profile.clinics.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {profile.clinics.map((clinic, index) => (
                                <GlassCard key={clinic.clinic_id} className="relative group">
                                    <div className="absolute top-4 right-4">
                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${clinic.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                                            {clinic.status}
                                        </span>
                                    </div>
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                                            <Building2 className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-lg text-gray-900">{clinic.clinic_name}</h3>
                                            <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                                                <MapPin className="w-3 h-3" />
                                                <span>{clinic.location}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-gray-100 pt-4 mt-4">
                                        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Schedule</h4>
                                        <div className="space-y-2">
                                            {clinic.schedules && clinic.schedules.length > 0 ? (
                                                clinic.schedules.map((sch, i) => (
                                                    <div key={i} className="flex justify-between items-center text-sm">
                                                        <span className="font-medium text-gray-700 w-8">{dayNames[sch.day_of_week === 0 ? 0 : sch.day_of_week] || dayNames[sch.day_of_week % 7]}</span>
                                                        <div className="flex items-center gap-1 text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                                                            <Clock className="w-3 h-3" />
                                                            <span>
                                                                {new Date(sch.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -
                                                                {new Date(sch.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))
                                            ) : (
                                                <p className="text-sm text-gray-400 italic">No schedule set</p>
                                            )}
                                        </div>
                                    </div>
                                </GlassCard>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-gray-300">
                            <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                            <h3 className="text-lg font-medium text-gray-900">No Clinics Found</h3>
                            <p className="text-gray-500 mt-1 mb-4">You haven't added any clinics yet.</p>
                            <Link href="/dashboard/doctor/clinics">
                                <button className="btn-primary">Add a Clinic</button>
                            </Link>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
