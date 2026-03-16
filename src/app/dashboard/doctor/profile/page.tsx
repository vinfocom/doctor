
"use client";
import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "@/components/ui/GlassCard";
import {
    User, Phone, MessageCircle, Loader2, Save, MapPin, Building2, Clock,
    Plus, Trash2, Camera, FileText, QrCode, Hash, BadgeCheck, GraduationCap,
    Send, Upload, X, Eye, Shield
} from "lucide-react";
import Link from "next/link";
import { formatTime, convertTo12Hour } from "@/lib/timeUtils";
import Image from "next/image";

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
    barcode_url?: string | null;
}

interface DoctorWhatsappNumber {
    id?: number;
    whatsapp_number: string;
    is_primary: boolean;
}

interface DoctorProfile {
    doctor_id: number;
    doctor_name: string;
    phone: string;
    whatsapp_number: string;
    whatsapp_numbers?: DoctorWhatsappNumber[];
    status: string;
    clinics: Clinic[];
    // Extended fields
    chat_id?: string | null;
    specialization?: string | null;
    education?: string | null;
    address?: string | null;
    registration_no?: string | null;
    gst_number?: string | null;
    pan_number?: string | null;
    profile_pic_url?: string | null;
    document_url?: string | null;
    num_clinics?: number | null;
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type UploadType = "profile_pic" | "document";

async function uploadFile(file: File, type: UploadType): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", type);
    const res = await fetch("/api/doctors/upload", { method: "POST", body: fd });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
    }
    const data = await res.json();
    return data.url as string;
}

// ── small upload widget ──────────────────────────────────────────────────
function FileUploadWidget({
    label,
    value,
    uploadType,
    accept,
    icon: Icon,
    onUploaded,
}: {
    label: string;
    value?: string | null;
    uploadType: UploadType;
    accept: string;
    icon: React.ElementType;
    onUploaded: (url: string) => void;
}) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);
        setUploading(true);
        try {
            const url = await uploadFile(file, uploadType);
            onUploaded(url);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = "";
        }
    };

    const isImage = value && !value.endsWith(".pdf");

    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                <Icon className="w-4 h-4 text-indigo-500" />
                {label}
            </label>
            <div className="flex items-center gap-3">
                {value ? (
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        {isImage ? (
                            <a href={value} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1 truncate">
                                <Eye className="w-3.5 h-3.5 shrink-0" /> View file
                            </a>
                        ) : (
                            <a href={value} target="_blank" rel="noopener noreferrer"
                                className="text-xs text-indigo-600 hover:underline flex items-center gap-1 truncate">
                                <FileText className="w-3.5 h-3.5 shrink-0" /> View document
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={() => onUploaded("")}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                            title="Remove"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                ) : (
                    <span className="text-xs text-gray-400 italic flex-1">Not uploaded</span>
                )}
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    disabled={uploading}
                    className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                               bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-medium"
                >
                    {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    {uploading ? "Uploading…" : value ? "Replace" : "Upload"}
                </button>
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleChange} />
        </div>
    );
}

// ── main component ───────────────────────────────────────────────────────
export default function DoctorProfilePage() {
    const [profile, setProfile] = useState<DoctorProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const avatarRef = useRef<HTMLInputElement>(null);

    useEffect(() => { fetchProfile(); }, []);

    const fetchProfile = async () => {
        try {
            const res = await fetch("/api/doctors/me");
            if (res.ok) {
                const data = await res.json();
                const profileData = data.doctor;
                // Normalise whatsapp_numbers
                if (!profileData.whatsapp_numbers || profileData.whatsapp_numbers.length === 0) {
                    profileData.whatsapp_numbers = profileData.whatsapp_number
                        ? [{ whatsapp_number: profileData.whatsapp_number, is_primary: true }]
                        : [];
                }
                // chat_id is BigInt serialised as string
                if (profileData.chat_id) profileData.chat_id = String(profileData.chat_id);
                setProfile(profileData);
            }
        } catch (error) {
            console.error("Error fetching profile:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !profile) return;
        setAvatarUploading(true);
        try {
            const url = await uploadFile(file, "profile_pic");
            setProfile({ ...profile, profile_pic_url: url });
        } catch (err: any) {
            setMessage({ type: "error", text: err.message });
        } finally {
            setAvatarUploading(false);
            if (avatarRef.current) avatarRef.current.value = "";
        }
    };

    const setProp = <K extends keyof DoctorProfile>(key: K, value: DoctorProfile[K]) =>
        setProfile(prev => prev ? { ...prev, [key]: value } : null);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
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

            <form onSubmit={handleUpdate}>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* ── LEFT COLUMN ── */}
                    <motion.div className="lg:col-span-1 space-y-6" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>

                        {/* Avatar card */}
                        <GlassCard className="flex flex-col items-center gap-4">
                            <div className="relative">
                                <div className="w-28 h-28 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center overflow-hidden ring-4 ring-white shadow-lg">
                                    {profile?.profile_pic_url ? (
                                        <img src={profile.profile_pic_url} alt="Profile" className="w-full h-full object-cover" />
                                    ) : (
                                        <User className="w-12 h-12 text-white" />
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => avatarRef.current?.click()}
                                    disabled={avatarUploading}
                                    className="absolute bottom-0 right-0 p-2 bg-indigo-600 text-white rounded-full shadow-md hover:bg-indigo-700 transition-colors"
                                    title="Change photo"
                                >
                                    {avatarUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                                </button>
                                <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-gray-900 text-lg">{profile?.doctor_name || "—"}</p>
                                <p className="text-sm text-indigo-600">{profile?.specialization || "—"}</p>
                                <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${profile?.status === "ACTIVE"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-gray-100 text-gray-600"
                                    }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${profile?.status === "ACTIVE" ? "bg-emerald-500" : "bg-gray-400"}`} />
                                    {profile?.status || "—"}
                                </span>
                            </div>
                            {profile?.num_clinics !== undefined && profile.num_clinics !== null && (
                                <div className="w-full border-t border-gray-100 pt-3 text-center">
                                    <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Allowed Clinics</p>
                                    <p className="text-2xl font-bold text-indigo-600">{profile.num_clinics}</p>
                                </div>
                            )}
                        </GlassCard>

                        {/* Documents card */}
                        <GlassCard className="space-y-5">
                            <h2 className="text-base font-semibold flex items-center gap-2 text-gray-800">
                                <FileText className="w-4 h-4 text-indigo-500" /> Documents
                            </h2>
                            <FileUploadWidget
                                label="Education / Degree Document"
                                value={profile?.document_url}
                                uploadType="document"
                                accept="image/*,application/pdf"
                                icon={GraduationCap}
                                onUploaded={(url) => setProp("document_url", url)}
                            />
                        </GlassCard>
                    </motion.div>

                    {/* ── RIGHT COLUMN (form) ── */}
                    <motion.div className="lg:col-span-2 space-y-6" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>

                        {/* ── Personal Details ── */}
                        <GlassCard className="space-y-5">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <User className="w-5 h-5 text-indigo-500" /> Personal Details
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Full Name */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">Full Name <span className="text-red-500">*</span></label>
                                    <div className="relative">
                                        <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={profile?.doctor_name || ""}
                                            onChange={(e) => setProp("doctor_name", e.target.value)}
                                            className="input-field input-field-with-icon"
                                            style={{ paddingLeft: "3rem" }}
                                            placeholder="Dr. John Doe"
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Appointment Phone */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">Appointment Phone Number</label>
                                    <div className="relative">
                                        <Phone className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="tel"
                                            value={profile?.phone || ""}
                                            onChange={(e) => setProp("phone", e.target.value)}
                                            className="input-field input-field-with-icon"
                                            style={{ paddingLeft: "3rem" }}
                                            placeholder="+91 9876543210"
                                        />
                                    </div>
                                </div>

                                {/* Telegram Chat ID */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">Telegram Chat ID</label>
                                    <div className="relative">
                                        <Send className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={profile?.chat_id || ""}
                                            onChange={(e) => setProp("chat_id", e.target.value)}
                                            className="input-field input-field-with-icon"
                                            style={{ paddingLeft: "3rem" }}
                                            placeholder="e.g. 123456789"
                                        />
                                    </div>
                                </div>

                                {/* Specialization */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">Specialization</label>
                                    <div className="relative">
                                        <BadgeCheck className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={profile?.specialization || ""}
                                            onChange={(e) => setProp("specialization", e.target.value)}
                                            className="input-field input-field-with-icon"
                                            style={{ paddingLeft: "3rem" }}
                                            placeholder="e.g. Cardiologist"
                                        />
                                    </div>
                                </div>

                                {/* Education */}
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-sm font-medium text-gray-700">Education / Qualification</label>
                                    <div className="relative">
                                        <GraduationCap className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={profile?.education || ""}
                                            onChange={(e) => setProp("education", e.target.value)}
                                            className="input-field input-field-with-icon"
                                            style={{ paddingLeft: "3rem" }}
                                            placeholder="e.g. MBBS, MD (Cardiology)"
                                        />
                                    </div>
                                </div>

                                {/* Address */}
                                <div className="space-y-1.5 sm:col-span-2">
                                    <label className="text-sm font-medium text-gray-700">Address</label>
                                    <div className="relative">
                                        <MapPin className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-gray-400" />
                                        <textarea
                                            value={profile?.address || ""}
                                            onChange={(e) => setProp("address", e.target.value)}
                                            className="input-field textarea-field-with-icon min-h-[80px] resize-none"
                                            style={{ paddingLeft: "3rem", paddingTop: "0.875rem" }}
                                            placeholder="Clinic / Residence address"
                                            rows={3}
                                        />
                                    </div>
                                </div>
                            </div>
                        </GlassCard>

                        {/* ── Registration & Tax ── */}
                        <GlassCard className="space-y-5">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Shield className="w-5 h-5 text-indigo-500" /> Registration & Tax
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {/* Registration No */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">Doctor Registration No.</label>
                                    <div className="relative">
                                        <Hash className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={profile?.registration_no || ""}
                                            onChange={(e) => setProp("registration_no", e.target.value)}
                                            className="input-field input-field-with-icon"
                                            style={{ paddingLeft: "3rem" }}
                                            placeholder="Reg. number"
                                        />
                                    </div>
                                </div>

                                {/* GST */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">GST Number <span className="text-gray-400 text-xs">(optional)</span></label>
                                    <div className="relative">
                                        <Hash className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={profile?.gst_number || ""}
                                            onChange={(e) => setProp("gst_number", e.target.value)}
                                            className="input-field input-field-with-icon"
                                            style={{ paddingLeft: "3rem" }}
                                            placeholder="GST number"
                                        />
                                    </div>
                                </div>

                                {/* PAN */}
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">PAN Number <span className="text-gray-400 text-xs">(optional)</span></label>
                                    <div className="relative">
                                        <Hash className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="text"
                                            value={profile?.pan_number || ""}
                                            onChange={(e) => setProp("pan_number", e.target.value)}
                                            className="input-field input-field-with-icon"
                                            placeholder="PAN number"
                                            style={{ paddingLeft: "3rem", textTransform: "uppercase" }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </GlassCard>

                        {/* ── WhatsApp Numbers ── */}
                        <GlassCard className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <MessageCircle className="w-5 h-5 text-indigo-500" /> WhatsApp Numbers
                                </h2>
                                <button
                                    type="button"
                                    onClick={() => setProfile(prev => {
                                        if (!prev) return null;
                                        return {
                                            ...prev,
                                            whatsapp_numbers: [...(prev.whatsapp_numbers || []), { whatsapp_number: "", is_primary: false }]
                                        };
                                    })}
                                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors"
                                >
                                    <Plus className="w-3 h-3" /> Add Number
                                </button>
                            </div>
                            <div className="space-y-2">
                                {profile?.whatsapp_numbers?.map((num, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <div className="relative flex-1">
                                            <MessageCircle className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                                            <input
                                                type="tel"
                                                value={num.whatsapp_number}
                                                onChange={(e) => {
                                                    const newS = [...(profile.whatsapp_numbers || [])];
                                                    newS[idx] = { ...newS[idx], whatsapp_number: e.target.value };
                                                    setProfile({ ...profile, whatsapp_numbers: newS });
                                                }}
                                                className="input-field input-field-with-icon text-sm"
                                                style={{ paddingLeft: "3rem" }}
                                                placeholder="+91 9876543210"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newS = (profile.whatsapp_numbers || []).map((n, i) =>
                                                        ({ ...n, is_primary: i === idx })
                                                    );
                                                    setProfile({ ...profile, whatsapp_numbers: newS });
                                                }}
                                                title="Set as primary"
                                                className={`p-1.5 rounded-lg text-xs transition-colors ${num.is_primary
                                                    ? "bg-indigo-100 text-indigo-600"
                                                    : "text-gray-300 hover:text-indigo-400"
                                                    }`}
                                            >
                                                <BadgeCheck className="w-4 h-4" />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const newS = (profile.whatsapp_numbers || []).filter((_, i) => i !== idx);
                                                    setProfile({ ...profile, whatsapp_numbers: newS });
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {(!profile?.whatsapp_numbers || profile.whatsapp_numbers.length === 0) && (
                                    <p className="text-sm text-gray-400 italic">No WhatsApp numbers added yet.</p>
                                )}
                            </div>
                        </GlassCard>

                        {/* Save button */}
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full btn-primary flex items-center justify-center gap-2 py-3"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                    </motion.div>
                </div>
            </form>

            {/* ── Clinics Section ── */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">My Clinics</h2>
                    <Link href="/dashboard/doctor/clinics">
                        <button className="text-indigo-600 hover:text-indigo-700 font-medium text-sm">
                            Manage Clinics &rarr;
                        </button>
                    </Link>
                </div>

                {profile?.clinics && profile.clinics.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {profile.clinics.map((clinic) => (
                            <GlassCard key={clinic.clinic_id} className="relative group">
                                <div className="absolute top-4 right-4">
                                    <span className={`px-2 py-1 rounded-md text-xs font-bold ${clinic.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
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
                                        {clinic.barcode_url && (
                                            <a
                                                href={clinic.barcode_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 mt-2 hover:text-indigo-800"
                                            >
                                                <QrCode className="w-3.5 h-3.5" />
                                                View Barcode
                                            </a>
                                        )}
                                    </div>
                                </div>
                                <div className="border-t border-gray-100 pt-4 mt-4">
                                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Schedule</h4>
                                    <div className="space-y-2">
                                        {clinic.schedules && clinic.schedules.length > 0 ? (
                                            [...clinic.schedules]
                                                .sort((a, b) => {
                                                    if (a.day_of_week !== b.day_of_week) {
                                                        return a.day_of_week - b.day_of_week;
                                                    }
                                                    return String(a.start_time).localeCompare(String(b.start_time));
                                                })
                                                .map((sch, i) => (
                                                <div key={i} className="flex justify-between items-center text-sm">
                                                    <span className="font-medium text-gray-700 w-8">
                                                        {dayNames[((sch.day_of_week % 7) + 7) % 7] || "N/A"}
                                                    </span>
                                                    <div className="flex items-center gap-1 text-gray-500 bg-gray-50 px-2 py-1 rounded-md">
                                                        <Clock className="w-3 h-3" />
                                                        <span>{convertTo12Hour(formatTime(sch.start_time))} - {convertTo12Hour(formatTime(sch.end_time))}</span>
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
                        <p className="text-gray-500 mt-1 mb-4">You haven&apos;t added any clinics yet.</p>
                        <Link href="/dashboard/doctor/clinics">
                            <button className="btn-primary">Add a Clinic</button>
                        </Link>
                    </div>
                )}
            </motion.div>
        </div>
    );
}
