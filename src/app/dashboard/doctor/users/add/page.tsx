"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ArrowLeft, Shield, Clock, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface ClinicOption {
    clinic_id: number;
    clinic_name: string;
}

export default function AddUserPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [clinics, setClinics] = useState<ClinicOption[]>([]);
    const [showPassword, setShowPassword] = useState(false);

    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
        role: "Have Access",
        status: "ACTIVE",
        clinic_id: "",
        is_limited: false,
        valid_from: "",
        valid_to: "",
        doctor_whatsapp_number: ""
    });

    useEffect(() => {
        const fetchClinics = async () => {
            try {
                const res = await fetch("/api/clinics");
                if (res.ok) {
                    const data = await res.json();
                    setClinics(data.clinics || []);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchClinics();
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const backendRole = formData.role.toUpperCase().replace(" ", "_");

        try {
            const res = await fetch("/api/doctor/staff", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...formData,
                    role: backendRole,
                })
            });

            if (res.ok) {
                router.push("/dashboard/doctor/users");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to create user");
            }
        } catch (error) {
            console.error(error);
            alert("Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
            {/* Header */}
            <div className="flex items-start gap-4">
                <Link href="/dashboard/doctor/users" className="p-2 bg-white rounded-xl shadow-sm border border-gray-100 text-gray-500 hover:text-purple-600 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-gray-800">Add New User</h1>
                    <p className="text-gray-500 text-sm">Configure and add a new user to your system</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Information */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6"
                >
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Shield className="text-purple-500 w-5 h-5" /> Basic Information
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">User Name <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                name="username"
                                required
                                value={formData.username}
                                onChange={handleChange}
                                placeholder="e.g., john_doe"
                                className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            />
                            <p className="text-xs text-gray-400">Only letters, numbers, underscore (_), dot (.), and hyphen (-) allowed</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Email <span className="text-red-500">*</span></label>
                            <input
                                type="email"
                                name="email"
                                required
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="e.g., user@example.com"
                                className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Password <span className="text-red-500">*</span></label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    name="password"
                                    required
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="********"
                                    className="w-full px-4 py-2 pr-10 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-600 transition-colors"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Role <span className="text-red-500">*</span></label>
                            <select
                                name="role"
                                value={formData.role}
                                onChange={handleChange}
                                className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            >
                                <option value="Have Access">Have Access</option>
                                <option value="Viewer">Viewer</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Status <span className="text-red-500">*</span></label>
                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                                className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            >
                                <option value="ACTIVE">Active</option>
                                <option value="INACTIVE">Inactive</option>
                            </select>
                            <p className="text-xs text-gray-400">Set user account status</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Assign to Clinic</label>
                            <select
                                name="clinic_id"
                                value={formData.clinic_id}
                                onChange={handleChange}
                                className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            >
                                <option value="">All Clinics</option>
                                {clinics.map((clinic) => (
                                    <option key={clinic.clinic_id} value={clinic.clinic_id}>
                                        {clinic.clinic_name}
                                    </option>
                                ))}
                            </select>
                            <p className="text-xs text-gray-400">Select which clinic this staff can access</p>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-700">Doctor WhatsApp Number</label>
                            <input
                                type="tel"
                                name="doctor_whatsapp_number"
                                value={formData.doctor_whatsapp_number}
                                onChange={handleChange}
                                placeholder="+91 98765 43210"
                                className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            />
                            <p className="text-xs text-gray-400">This number will be stored in the doctor WhatsApp list.</p>
                        </div>
                    </div>
                </motion.div>

                {/* Access Restrictions */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-6"
                >
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Clock className="text-purple-500 w-5 h-5" /> Access Restrictions
                    </h2>

                    <div className="space-y-6">
                        <div className="space-y-2 max-w-md">
                            <label className="text-sm font-medium text-gray-700">Limited Time Access</label>
                            <select
                                name="is_limited"
                                value={formData.is_limited ? "true" : "false"}
                                onChange={(e) => setFormData(p => ({ ...p, is_limited: e.target.value === "true" }))}
                                className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                            >
                                <option value="false">No</option>
                                <option value="true">Yes</option>
                            </select>
                            <p className="text-xs text-gray-400">If Yes, user can log in only between selected dates.</p>
                        </div>

                        <AnimatePresence>
                            {formData.is_limited && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-hidden"
                                >
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">From Date <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            name="valid_from"
                                            required={formData.is_limited}
                                            value={formData.valid_from}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-700">To Date <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            name="valid_to"
                                            required={formData.is_limited}
                                            value={formData.valid_to}
                                            onChange={handleChange}
                                            className="w-full px-4 py-2 bg-gray-50/50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </motion.div>

                <div className="flex flex-col-reverse gap-4 pb-10 sm:flex-row sm:justify-end">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="rounded-xl border border-gray-200 px-6 py-2 text-gray-600 transition-colors hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-primary flex min-h-11 items-center justify-center rounded-xl bg-purple-600 px-8 py-2 text-white shadow-md hover:bg-purple-700 sm:min-w-[140px]"
                    >
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                </svg>
                                Creating...
                            </span>
                        ) : "Create User"}
                    </button>
                </div>
            </form>
        </div>
    );
}
