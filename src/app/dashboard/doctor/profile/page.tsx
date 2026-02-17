
"use client";
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "@/components/ui/GlassCard";
import { User, Phone, MessageCircle, Activity, Loader2, Save } from "lucide-react";

interface DoctorProfile {
    doctor_id: number;
    doctor_name: string;
    phone: string;
    whatsapp_number: string;
    status: string;
}

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
            const res = await fetch("/api/doctors/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(profile),
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
        <div className="w-full max-w-4xl mx-auto">
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

            <motion.form
                onSubmit={handleUpdate}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <GlassCard className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <User className="w-4 h-4 text-indigo-500" />
                                Full Name
                            </label>
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
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-emerald-500" />
                                Status
                            </label>
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
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <Phone className="w-4 h-4 text-blue-500" />
                                Phone Number
                            </label>
                            <input
                                type="tel"
                                value={profile?.phone || ""}
                                onChange={(e) => setProfile(prev => prev ? { ...prev, phone: e.target.value } : null)}
                                className="input-field"
                                placeholder="+1 234 567 890"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                <MessageCircle className="w-4 h-4 text-green-500" />
                                WhatsApp Number
                            </label>
                            <input
                                type="tel"
                                value={profile?.whatsapp_number || ""}
                                onChange={(e) => setProfile(prev => prev ? { ...prev, whatsapp_number: e.target.value } : null)}
                                className="input-field"
                                placeholder="+1 234 567 890"
                            />
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn-primary flex items-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </GlassCard>
            </motion.form>
        </div>
    );
}
