"use client";
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { Shield, UserPlus } from "lucide-react";


interface Doctor {
    doctor_id: number;
    doctor_name: string;
    specialization: string | null;
    phone: string | null;
    admin_id: number | null;
}

interface User {
    user_id: number;
    name: string;
    email: string;
    role: "DOCTOR" | "ADMIN" | "SUPER_ADMIN";
}

export default function AdminDoctorsPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
        role: "DOCTOR",
        phone: "", // for doctors
        whatsapp_number: "" // for doctors
    });
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [submitting, setSubmitting] = useState(false);


    const fetchData = useCallback(async () => {
        try {
            const meRes = await fetch("/api/auth/me");
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            if (meData.user.role !== "SUPER_ADMIN" && meData.user.role !== "ADMIN") { router.push("/login"); return; }
            setUser(meData.user);
            const docRes = await fetch("/api/doctors");
            if (docRes.ok) { const data = await docRes.json(); setDoctors(data.doctors); }
        } catch { router.push("/login"); } finally { setLoading(false); }
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleDelete = async (doctorId: number) => {
        if (!confirm("Are you sure you want to delete this doctor?")) return;
        const res = await fetch(`/api/doctors?id=${doctorId}`, { method: "DELETE" });
        if (res.ok) setDoctors(doctors.filter((d) => d.doctor_id !== doctorId));
    };

     const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            setFormData({ ...formData, [e.target.name]: e.target.value });
        };
    
        const handleSubmit = async (e: React.FormEvent) => {
            e.preventDefault();
            setSubmitting(true);
            setError("");
            setSuccess("");
    
            try {
                const payload = {
                    name: formData.name,
                    email: formData.email,
                    password: formData.password,
                    role: formData.role,
                    specific_details: formData.role === "DOCTOR" ? {
                        phone: formData.phone,
                        whatsapp_number: formData.whatsapp_number
                    } : undefined
                };
    
                const res = await fetch("/api/users", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
    
                const data = await res.json();
                if (res.ok) {
                    setSuccess("User created successfully!");
                    setFormData({ name: "", email: "", password: "", role: "DOCTOR", phone: "", whatsapp_number: "" });
                    setShowForm(false);
                } else {
                    setError(data.error || "Failed to create user");
                }
            } catch (err) {
                setError("An error occurred");
            } finally {
                setSubmitting(false);
            }
        };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
                    <svg className="animate-spin h-10 w-10 text-indigo-500" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                </motion.div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <motion.div className="mb-10" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                <h1 className="text-3xl font-bold text-gray-900">Manage Doctors</h1>
                <p className="text-gray-500 mt-1 text-sm">View and manage all registered doctors</p>
            </motion.div>
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">User Management</h1>
                    <p className="text-gray-500 mt-2">Create and manage access for Doctors and Admins.</p>
                </div>
                <PremiumButton onClick={() => setShowForm(!showForm)} icon={UserPlus}>
                    Create New Doctor
                </PremiumButton>
            </div>

            <motion.div className="glass-card p-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                {doctors.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-4xl mb-3">👨‍⚕️</p>
                        <p className="text-gray-400">No doctors registered yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead><tr><th>Name</th><th>Phone</th><th>Specialization</th><th>Actions</th></tr></thead>
                            <tbody>
                                {doctors.map((doc, i) => (
                                    <motion.tr
                                        key={doc.doctor_id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: 0.3 + i * 0.05 }}
                                    >
                                        <td>
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                                                    {doc.doctor_name?.charAt(0)?.toUpperCase()}
                                                </div>
                                                <span className="text-gray-800 font-medium">Dr. {doc.doctor_name}</span>
                                            </div>
                                        </td>
                                        <td className="text-gray-500">{doc.phone || "—"}</td>
                                        <td><span className="badge badge-confirmed">{doc.specialization || "—"}</span></td>
                                        <td>
                                            <motion.button
                                                onClick={() => handleDelete(doc.doctor_id)}
                                                className="text-xs text-red-500 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors font-medium"
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                            >
                                                Delete
                                            </motion.button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>

            {showForm && (
                            <GlassCard className="animate-in fade-in slide-in-from-top-4">
                                <h2 className="text-xl font-semibold mb-6 text-gray-900 flex items-center gap-2">
                                    <Shield className="w-5 h-5 text-indigo-500" />
                                    Create New Account
                                </h2>
                                <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700">Full Name</label>
                                            <input
                                                type="text"
                                                name="name"
                                                value={formData.name}
                                                onChange={handleInputChange}
                                                required
                                                className="input-field"
                                                placeholder="John Doe"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700">Role</label>
                                            <select
                                                name="role"
                                                value={formData.role}
                                                onChange={handleInputChange}
                                                className="input-field"
                                            >
                                                <option value="DOCTOR">Doctor</option>
                                                <option value="ADMIN">Clinic Admin</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700">Email Address</label>
                                            <input
                                                type="email"
                                                name="email"
                                                value={formData.email}
                                                onChange={handleInputChange}
                                                required
                                                className="input-field"
                                                placeholder="doctor@example.com"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-700">Password</label>
                                            <input
                                                type="password"
                                                name="password"
                                                value={formData.password}
                                                onChange={handleInputChange}
                                                required
                                                className="input-field"
                                                placeholder="••••••••"
                                            />
                                        </div>
            
                                        {formData.role === "DOCTOR" && (
                                            <>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-gray-700">Phone Number</label>
                                                    <input
                                                        type="tel"
                                                        name="phone"
                                                        value={formData.phone}
                                                        onChange={handleInputChange}
                                                        className="input-field"
                                                        placeholder="+1 234 567 8900"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-sm font-medium text-gray-700">WhatsApp Number</label>
                                                    <input
                                                        type="tel"
                                                        name="whatsapp_number"
                                                        value={formData.whatsapp_number}
                                                        onChange={handleInputChange}
                                                        className="input-field"
                                                        placeholder="+1 234 567 8900"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
            
                                    <div className="flex justify-end gap-3 pt-4">
                                        <PremiumButton type="button" variant="ghost" onClick={() => setShowForm(false)}>
                                            Cancel
                                        </PremiumButton>
                                        <PremiumButton type="submit" isLoading={submitting}>
                                            Create Account
                                        </PremiumButton>
                                    </div>
                                </form>
                            </GlassCard>
                        )}
        </div>
    );
}
