"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { Shield, UserPlus, X, Pencil, Trash2, AlertTriangle, UploadCloud, FileText, CheckCircle2, Plus, CircleMinus, Power, Smartphone, User, Bot, Building2, Stethoscope, GraduationCap, MapPin, BarChart3, Eye, EyeOff, Phone, Hash, FileDigit, ExternalLink, MessageSquareText } from "lucide-react";

/* ───────────────── Types ───────────────── */
interface WhatsAppNum { id?: number; whatsapp_number: string }
interface DoctorSmsService {
    enabled: boolean;
    status: "DISABLED" | "ACTIVE" | "EXHAUSTED";
    totalCredits: number;
    usedCredits: number;
    remainingCredits: number;
    displayText: string;
}
interface Doctor {
    doctor_id: number;
    doctor_name: string;
    specialization: string | null;
    phone: string | null;
    whatsapp_number?: string | null;
    admin_id: number | null;
    registration_no?: string | null;
    education?: string | null;
    address?: string | null;
    gst_number?: string | null;
    pan_number?: string | null;
    document_url?: string | null;
    chat_id?: string | null;
    telegram_userid?: string | null;
    profile_pic_url?: string | null;
    active_from?: string | null;
    active_to?: string | null;
    num_clinics?: number | null;
    status?: string | null;
    whatsapp_numbers?: WhatsAppNum[];
    user?: { email: string | null } | null;
    sms_service?: DoctorSmsService | null;
}

const INITIAL_FORM = {
    name: "", email: "", password: "", role: "DOCTOR", phone: "", whatsapp_number: "",
    gst_number: "", pan_number: "", address: "", registration_no: "", education: "", specialization: "",
    chat_id: "", telegram_userid: "", num_clinics: "0", active_from: "", active_to: "",
};

const toDateInput = (value?: string | null) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toISOString().split("T")[0];
};

const getEffectiveStatus = (doc: Doctor) => {
    if (doc.status === "INACTIVE") return "INACTIVE";
    const todayStr = new Date().toISOString().split("T")[0];
    if (doc.active_from) {
        const fromStr = toDateInput(doc.active_from);
        if (fromStr && fromStr > todayStr) return "INACTIVE";
    }
    if (doc.active_to) {
        const toStr = toDateInput(doc.active_to);
        if (toStr && toStr < todayStr) return "INACTIVE";
    }
    return "ACTIVE";
};

const getSmsStatusTone = (status?: string | null) => {
    if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status === "EXHAUSTED") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-gray-50 text-gray-600 border-gray-200";
};

const getSmsRowBadge = (sms?: DoctorSmsService | null) => {
    if (!sms?.enabled) {
        return {
            label: "SMS Disabled",
            className: "bg-red-50 text-red-600 border-red-200",
        };
    }

    if (sms.status === "EXHAUSTED" || sms.remainingCredits <= 0) {
        return {
            label: "SMS Exhausted",
            className: "bg-amber-50 text-amber-700 border-amber-200",
        };
    }

    return {
        label: "SMS Active",
        className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
};

/* ───────────── Reusable upload component ───────────── */
function FileUploadBox({
    id, label, fileRef, file, url, uploading, uploadError,
    onFileChange, onClear,
}: {
    id: string; label: string;
    fileRef: React.RefObject<HTMLInputElement | null>; file: File | null; url: string;
    uploading: boolean; uploadError: string;
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClear: () => void;
}) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">
                {label} <span className="text-gray-400 text-xs font-normal">(PDF, JPG, PNG — max 5 MB)</span>
            </label>
            <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={onFileChange} className="hidden" id={id} />
            {!file && !url ? (
                <label htmlFor={id} className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl py-5 px-4 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/40 transition-all group">
                    <UploadCloud size={24} className="text-gray-300 group-hover:text-indigo-400 transition-colors mb-1" />
                    <p className="text-sm text-gray-400 group-hover:text-indigo-500 font-medium transition-colors">Click to upload</p>
                    <p className="text-xs text-gray-300 mt-0.5">PDF, JPG, PNG, WEBP up to 5 MB</p>
                </label>
            ) : (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-indigo-100 bg-indigo-50">
                    {uploading ? (
                        <>
                            <svg className="animate-spin h-5 w-5 text-indigo-400" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" /></svg>
                            <span className="text-sm text-indigo-500">Uploading…</span>
                        </>
                    ) : (
                        <>
                            {url ? <CheckCircle2 size={18} className="text-green-500 shrink-0" /> : <FileText size={18} className="text-indigo-400 shrink-0" />}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-700 truncate">{file ? file.name : url.split("/").pop()}</p>
                                {file && <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(1)} KB</p>}
                                {!file && url && <p className="text-xs text-gray-400">Previously uploaded</p>}
                            </div>
                            <button type="button" onClick={onClear} className="text-gray-400 hover:text-red-500 transition-colors"><X size={16} /></button>
                        </>
                    )}
                </div>
            )}
            {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
        </div>
    );
}

/* ───────────── Multiple WhatsApp component ───────────── */
function WhatsAppList({ numbers, onChange }: { numbers: string[]; onChange: (v: string[]) => void }) {
    return (
        <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Smartphone size={14} className="text-indigo-500" /> WhatsApp Numbers</label>
            {numbers.map((n, i) => (
                <div key={i} className="flex items-center gap-2">
                    <input
                        type="tel"
                        value={n}
                        onChange={(e) => { const copy = [...numbers]; copy[i] = e.target.value; onChange(copy); }}
                        className="input-field flex-1"
                        placeholder="+91 98765 43210"
                    />
                    {numbers.length > 1 && (
                        <motion.button type="button" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                            onClick={() => onChange(numbers.filter((_, j) => j !== i))}
                            className="text-red-400 hover:text-red-600 transition-colors" title="Remove"
                        ><CircleMinus size={20} /></motion.button>
                    )}
                </div>
            ))}
            <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => onChange([...numbers, ""])}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors mt-1"
            ><Plus size={14} /> Add WhatsApp Number</motion.button>
        </div>
    );
}

/* ───────────── Pending details helper ───────────── */
function getPendingFields(doc: Doctor): string[] {
    const pending: string[] = [];
    if (!doc.phone) pending.push("Phone");
    if (!doc.telegram_userid) pending.push("Telegram ID");
    if (!doc.specialization) pending.push("Specialization");
    if (!doc.registration_no) pending.push("Reg. No");
    if (!doc.education) pending.push("Education");
    if (!doc.address) pending.push("Address");
    if (!doc.document_url) pending.push("Document");
    if (!doc.profile_pic_url) pending.push("Profile Pic");
    return pending;
}

/* ═══════════════════════ MAIN PAGE ═══════════════════════ */
export default function AdminDoctorsPage() {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [loading, setLoading] = useState(true);

    // ── Create form
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState(INITIAL_FORM);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [createWaNums, setCreateWaNums] = useState<string[]>([""]);

    // ── Create file uploads
    const fileRef = useRef<HTMLInputElement>(null);
    const [docFile, setDocFile] = useState<File | null>(null);
    const [docUrl, setDocUrl] = useState("");
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState("");

    const profilePicRef = useRef<HTMLInputElement>(null);
    const [profilePicFile, setProfilePicFile] = useState<File | null>(null);
    const [profilePicUrl, setProfilePicUrl] = useState("");
    const [profilePicUploading, setProfilePicUploading] = useState(false);
    const [profilePicError, setProfilePicError] = useState("");

    // ── Edit modal
    const [editDoc, setEditDoc] = useState<Doctor | null>(null);
    const [editForm, setEditForm] = useState({
        doctor_name: "", phone: "", whatsapp_number: "", specialization: "",
        gst_number: "", pan_number: "", address: "", registration_no: "", education: "",
        chat_id: "", telegram_userid: "", num_clinics: "0", active_from: "", active_to: "",
        email: "", password: "",
        sms_service_enabled: false, sms_recharge_credits: "0", sms_recharge_remarks: "",
    });
    const [editError, setEditError] = useState("");
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [editWaNums, setEditWaNums] = useState<string[]>([""]);
    const [showCreatePassword, setShowCreatePassword] = useState(false);
    const [showEditPassword, setShowEditPassword] = useState(false);
    const [smsToggleConfirmOpen, setSmsToggleConfirmOpen] = useState(false);
    const [pendingSmsToggleValue, setPendingSmsToggleValue] = useState<boolean | null>(null);

    // ── Edit file uploads
    const editFileRef = useRef<HTMLInputElement>(null);
    const [editDocFile, setEditDocFile] = useState<File | null>(null);
    const [editDocUrl, setEditDocUrl] = useState("");
    const [editUploading, setEditUploading] = useState(false);
    const [editUploadError, setEditUploadError] = useState("");

    const editProfilePicRef = useRef<HTMLInputElement>(null);
    const [editProfilePicFile, setEditProfilePicFile] = useState<File | null>(null);
    const [editProfilePicUrl, setEditProfilePicUrl] = useState("");
    const [editProfilePicUploading, setEditProfilePicUploading] = useState(false);
    const [editProfilePicError, setEditProfilePicError] = useState("");

    // ── Delete confirm
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [deleteConfirmName, setDeleteConfirmName] = useState<string>("");

    // ── View details
    const [viewDoc, setViewDoc] = useState<Doctor | null>(null);

    // ── Status toggle confirm
    const [statusToggleDoc, setStatusToggleDoc] = useState<Doctor | null>(null);
    const [statusToggling, setStatusToggling] = useState(false);
    const [statusToggleActiveTo, setStatusToggleActiveTo] = useState("");
    const [statusToggleError, setStatusToggleError] = useState("");

    /* ────── Generic file upload helper ────── */
    const uploadFile = async (
        file: File,
        setFile: (f: File | null) => void,
        setUrl: (u: string) => void,
        setUploading: (b: boolean) => void,
        setErr: (s: string) => void,
    ) => {
        setFile(file);
        setErr("");
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await res.json();
            if (res.ok) { setUrl(data.url); }
            else { setErr(data.error || "Upload failed"); setFile(null); }
        } catch { setErr("Upload failed. Please try again."); setFile(null); }
        finally { setUploading(false); }
    };

    /* ────── Fetch ────── */
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

    /* ────── Delete ────── */
    const handleDelete = async (doctorId: number) => {
        const res = await fetch(`/api/doctors?id=${doctorId}`, { method: "DELETE" });
        if (res.ok) {
            setDoctors(doctors.filter((d) => d.doctor_id !== doctorId));
            setDeleteConfirmId(null);
        } else {
            const data = await res.json().catch(() => ({}));
            alert(data.error || "Failed to delete doctor");
        }
    };

    /* ────── Toggle Active/Inactive ────── */
    const handleStatusToggle = async () => {
        if (!statusToggleDoc) return;
        setStatusToggling(true);
        setStatusToggleError("");
        try {
            const effectiveStatus = getEffectiveStatus(statusToggleDoc);
            const newStatus = effectiveStatus === "ACTIVE" ? "INACTIVE" : "ACTIVE";
            const todayStr = new Date().toISOString().split("T")[0];
            if (newStatus === "ACTIVE" && !statusToggleActiveTo) {
                setStatusToggleError("Active To date is required to activate.");
                return;
            }
            const res = await fetch("/api/doctors", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doctor_id: statusToggleDoc.doctor_id,
                    status: newStatus,
                    ...(newStatus === "ACTIVE"
                        ? { active_from: todayStr, active_to: statusToggleActiveTo }
                        : {}),
                }),
            });
            if (res.ok) {
                await fetchData();
                setStatusToggleDoc(null);
                setStatusToggleActiveTo("");
            }
        } catch { /* ignore */ }
        finally { setStatusToggling(false); }
    };

    /* ────── Open edit ────── */
    const openEdit = (doc: Doctor) => {
        setEditDoc(doc);
        setEditForm({
            doctor_name: doc.doctor_name || "",
            phone: doc.phone || "",
            whatsapp_number: doc.whatsapp_number || "",
            specialization: doc.specialization || "",
            gst_number: doc.gst_number || "",
            pan_number: doc.pan_number || "",
            address: doc.address || "",
            registration_no: doc.registration_no || "",
            education: doc.education || "",
            chat_id: doc.chat_id || "",
            telegram_userid: doc.telegram_userid || "",
            num_clinics: String(doc.num_clinics ?? 0),
            active_from: toDateInput(doc.active_from),
            active_to: toDateInput(doc.active_to),
            email: doc.user?.email || "",
            password: "", // Password is blank by default for security
            sms_service_enabled: Boolean(doc.sms_service?.enabled),
            sms_recharge_credits: "0",
            sms_recharge_remarks: "",
        });
        setEditDocUrl(doc.document_url || ""); setEditDocFile(null); setEditUploadError("");
        setEditProfilePicUrl(doc.profile_pic_url || ""); setEditProfilePicFile(null); setEditProfilePicError("");
        setEditWaNums(doc.whatsapp_numbers && doc.whatsapp_numbers.length > 0
            ? doc.whatsapp_numbers.map(w => w.whatsapp_number)
            : (doc.whatsapp_number ? [doc.whatsapp_number] : [""])
        );
        setEditError("");
        setSmsToggleConfirmOpen(false);
        setPendingSmsToggleValue(null);
    };

    const requestSmsToggleChange = (nextValue: boolean) => {
        setPendingSmsToggleValue(nextValue);
        setSmsToggleConfirmOpen(true);
    };

    const confirmSmsToggleChange = () => {
        if (pendingSmsToggleValue === null) return;
        setEditForm((prev) => ({ ...prev, sms_service_enabled: pendingSmsToggleValue }));
        setSmsToggleConfirmOpen(false);
        setPendingSmsToggleValue(null);
    };

    const cancelSmsToggleChange = () => {
        setSmsToggleConfirmOpen(false);
        setPendingSmsToggleValue(null);
    };

    /* ────── Submit edit ────── */
    const handleEditSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editDoc) return;
        setEditSubmitting(true);
        setEditError("");
        try {
            const res = await fetch("/api/doctors", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doctor_id: editDoc.doctor_id,
                    ...editForm,
                    document_url: editDocUrl || null,
                    profile_pic_url: editProfilePicUrl || null,
                    active_from: editForm.active_from || null,
                    active_to: editForm.active_to || null,
                    whatsapp_numbers: editWaNums.filter(n => n.trim()).map(n => ({ whatsapp_number: n.trim() })),
                    sms_service_enabled: editForm.sms_service_enabled,
                    sms_recharge_credits: Number(editForm.sms_recharge_credits || 0),
                    sms_recharge_remarks: editForm.sms_recharge_remarks || null,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                await fetchData();
                setEditDoc(null);
            } else {
                setEditError(data.error || "Update failed");
            }
        } catch { setEditError("An error occurred"); }
        finally { setEditSubmitting(false); }
    };

    /* ────── Create form handlers ────── */
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const resetForm = () => {
        setFormData(INITIAL_FORM);
        setDocFile(null); setDocUrl(""); setUploadError("");
        setProfilePicFile(null); setProfilePicUrl(""); setProfilePicError("");
        setCreateWaNums([""]);
        setError("");
        if (fileRef.current) fileRef.current.value = "";
        if (profilePicRef.current) profilePicRef.current.value = "";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true); setError(""); setSuccess("");
        try {
            const payload = {
                name: formData.name, email: formData.email,
                password: formData.password, role: formData.role,
                specific_details: formData.role === "DOCTOR"
                    ? {
                        phone: formData.phone,
                        whatsapp_number: formData.whatsapp_number,
                        gst_number: formData.gst_number || null,
                        pan_number: formData.pan_number || null,
                        address: formData.address || null,
                        registration_no: formData.registration_no || null,
                        education: formData.education || null,
                        document_url: docUrl || null,
                        specialization: formData.specialization || null,
                        chat_id: formData.chat_id || null,
                        telegram_userid: formData.telegram_userid || null,
                        profile_pic_url: profilePicUrl || null,
                        active_from: formData.active_from || null,
                        active_to: formData.active_to || null,
                        num_clinics: Number(formData.num_clinics) || 0,
                        whatsapp_numbers: createWaNums.filter(n => n.trim()).map(n => ({ whatsapp_number: n.trim() })),
                    }
                    : undefined,
            };
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (res.ok) {
                setSuccess("Doctor created successfully!");
                setTimeout(() => setSuccess(""), 3000);
                resetForm();
                setShowForm(false);
                await fetchData();
            } else {
                setError(data.error || "Failed to create user");
            }
        } catch { setError("An error occurred"); } finally { setSubmitting(false); }
    };

    const anyCreateUploading = uploading || profilePicUploading;
    const anyEditUploading = editUploading || editProfilePicUploading;

    /* ────── Loading state ────── */
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

    /* ════════════════════ RENDER ════════════════════ */
    return (
        <div className="w-full">
            <motion.div className="mb-8" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Manage Doctors</h1>
                        <p className="text-gray-500 mt-1 text-sm">View, edit and manage all registered doctors</p>
                    </div>
                    <PremiumButton className="w-full sm:w-auto" onClick={() => { setShowForm(!showForm); resetForm(); }} icon={UserPlus}>
                        Create New Doctor
                    </PremiumButton>
                </div>
            </motion.div>

            {success && (
                <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{success}</div>
            )}

            {/* ────── Doctors Table ────── */}
            <motion.div className="glass-card p-5 sm:p-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                {doctors.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="mb-3 flex justify-center"><Stethoscope size={40} className="text-indigo-400" /></div>
                        <p className="text-gray-400">No doctors registered yet</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Doctor&apos;s Name</th>
                                    <th>Status</th>
                                    <th>Phone</th>
                                    <th>Specialization</th>
                                    <th>Clinics</th>
                                    <th>Pending Details</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {doctors.map((doc, i) => {
                                    const pending = getPendingFields(doc);
                                    const smsBadge = getSmsRowBadge(doc.sms_service);
                                    return (
                                        <motion.tr
                                            key={doc.doctor_id}
                                            initial={{ opacity: 0, x: -10 }}
                                            animate={{ opacity: 1, x: 0 }}
                                            transition={{ delay: 0.3 + i * 0.05 }}
                                        >
                                            <td>
                                                <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setViewDoc(doc)}>
                                                    {doc.profile_pic_url ? (
                                                        <img src={doc.profile_pic_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
                                                    ) : (
                                                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                                                            {doc.doctor_name?.charAt(0)?.toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div className="min-w-0">
                                                        <span className="block text-gray-800 font-medium group-hover:text-indigo-600 group-hover:underline transition-colors">Dr. {doc.doctor_name}</span>
                                                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${smsBadge.className}`}>
                                                            <MessageSquareText size={12} />
                                                            {smsBadge.label}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    {(() => {
                                                        const effectiveStatus = getEffectiveStatus(doc);
                                                        return (
                                                            <>
                                                                <span className={`inline-block w-2.5 h-2.5 rounded-full ${effectiveStatus === "INACTIVE" ? "bg-red-500" : "bg-green-500"}`} />
                                                                <span className={`text-xs font-semibold ${effectiveStatus === "INACTIVE" ? "text-red-600" : "text-green-600"}`}>
                                                                    {effectiveStatus === "INACTIVE" ? "Inactive" : "Active"}
                                                                </span>
                                                            </>
                                                        );
                                                    })()}
                                                </div>
                                            </td>
                                            <td className="text-gray-500">{doc.phone || "—"}</td>
                                            <td>
                                                <span className="badge badge-confirmed">{doc.specialization || "—"}</span>
                                            </td>
                                            <td className="text-gray-500">{doc.num_clinics ?? 0}</td>
                                            <td>
                                                {pending.length === 0 ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg px-2 py-1">
                                                        <CheckCircle2 size={12} /> Complete
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-2 py-1">
                                                        <AlertTriangle size={12} /> Incomplete
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <motion.button
                                                        onClick={() => openEdit(doc)}
                                                        className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                                        title="Edit" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                                    >
                                                        <Pencil size={15} />
                                                    </motion.button>
                                                    <motion.button
                                                        onClick={() => {
                                                            setStatusToggleDoc({ ...doc, status: getEffectiveStatus(doc) });
                                                            setStatusToggleActiveTo(toDateInput(doc.active_to));
                                                            setStatusToggleError("");
                                                        }}
                                                        className={`p-2 rounded-lg transition-colors ${getEffectiveStatus(doc) === "INACTIVE"
                                                            ? "bg-green-50 text-green-600 hover:bg-green-100"
                                                            : "bg-orange-50 text-orange-600 hover:bg-orange-100"
                                                            }`}
                                                        title={getEffectiveStatus(doc) === "INACTIVE" ? "Activate" : "Deactivate"}
                                                        whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                                    >
                                                        <Power size={15} />
                                                    </motion.button>
                                                    <motion.button
                                                        onClick={() => { setDeleteConfirmId(doc.doctor_id); setDeleteConfirmName(doc.doctor_name); }}
                                                        className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                                        title="Delete" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                                    >
                                                        <Trash2 size={15} />
                                                    </motion.button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </motion.div>

            {/* ═══════ View Doctor Details Modal ═══════ */}
            <AnimatePresence>
                {viewDoc && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewDoc(null)} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8" initial={{ scale: 0.92, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 30 }} onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => setViewDoc(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>

                                {/* Header */}
                                <div className="flex items-center gap-4 mb-6">
                                    {viewDoc.profile_pic_url ? (
                                        <img src={viewDoc.profile_pic_url} alt="" className="w-16 h-16 rounded-2xl object-cover shadow-md" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold text-white shadow-md">
                                            {viewDoc.doctor_name?.charAt(0)?.toUpperCase()}
                                        </div>
                                    )}
                                    <div>
                                        <h2 className="text-xl font-bold text-gray-900">Dr. {viewDoc.doctor_name}</h2>
                                        <div className="flex items-center gap-2 mt-1">
                                            {(() => {
                                                const effectiveStatus = getEffectiveStatus(viewDoc);
                                                return (
                                                    <>
                                                        <span className={`inline-block w-2 h-2 rounded-full ${effectiveStatus === "INACTIVE" ? "bg-red-500" : "bg-green-500"}`} />
                                                        <span className={`text-xs font-semibold ${effectiveStatus === "INACTIVE" ? "text-red-600" : "text-green-600"}`}>
                                                            {effectiveStatus === "INACTIVE" ? "Inactive" : "Active"}
                                                        </span>
                                                    </>
                                                );
                                            })()}
                                            {viewDoc.specialization && (
                                                <span className="badge badge-confirmed ml-1">{viewDoc.specialization}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Details Grid */}
                                <div className="space-y-5">
                                    {/* Basic Info */}
                                    <div>
                                        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><User size={13} /> Basic Info</p>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {viewDoc.phone && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Phone</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.phone}</p>
                                                </div>
                                            )}
                                            {viewDoc.chat_id && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Telegram Chat ID</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.chat_id}</p>
                                                </div>
                                            )}
                                            {viewDoc.telegram_userid && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Telegram User ID</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.telegram_userid}</p>
                                                </div>
                                            )}
                                            {viewDoc.active_from && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Active From</p>
                                                    <p className="text-sm font-medium text-gray-800">{toDateInput(viewDoc.active_from)}</p>
                                                </div>
                                            )}
                                            {viewDoc.active_to && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Active To</p>
                                                    <p className="text-sm font-medium text-gray-800">{toDateInput(viewDoc.active_to)}</p>
                                                </div>
                                            )}
                                            {(viewDoc.num_clinics !== null && viewDoc.num_clinics !== undefined) && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Clinics</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.num_clinics}</p>
                                                </div>
                                            )}
                                            {viewDoc.sms_service && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">SMS Service</p>
                                                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getSmsStatusTone(viewDoc.sms_service.status)}`}>
                                                        {viewDoc.sms_service.status}
                                                    </span>
                                                </div>
                                            )}
                                            {viewDoc.sms_service && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">SMS Balance</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.sms_service.displayText}</p>
                                                </div>
                                            )}
                                            {viewDoc.whatsapp_numbers && viewDoc.whatsapp_numbers.length > 0 && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5 col-span-2">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">WhatsApp</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.whatsapp_numbers.map(w => w.whatsapp_number).join(", ")}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Professional */}
                                    {(viewDoc.registration_no || viewDoc.education || viewDoc.address) && (
                                        <div>
                                            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><Stethoscope size={13} /> Professional</p>
                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                {viewDoc.registration_no && (
                                                    <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Registration No.</p>
                                                        <p className="text-sm font-medium text-gray-800">{viewDoc.registration_no}</p>
                                                    </div>
                                                )}
                                                {viewDoc.education && (
                                                    <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Education</p>
                                                        <p className="text-sm font-medium text-gray-800">{viewDoc.education}</p>
                                                    </div>
                                                )}
                                                {viewDoc.gst_number && (
                                                    <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">GST Number</p>
                                                        <p className="text-sm font-medium text-gray-800">{viewDoc.gst_number}</p>
                                                    </div>
                                                )}
                                                {viewDoc.pan_number && (
                                                    <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">PAN Number</p>
                                                        <p className="text-sm font-medium text-gray-800">{viewDoc.pan_number}</p>
                                                    </div>
                                                )}
                                                {viewDoc.address && (
                                                    <div className="bg-gray-50 rounded-xl px-3.5 py-2.5 col-span-2">
                                                        <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Address</p>
                                                        <p className="text-sm font-medium text-gray-800">{viewDoc.address}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Documents */}
                                    {viewDoc.document_url && (
                                        <div>
                                            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-2.5 flex items-center gap-1.5"><FileText size={13} /> Documents</p>
                                            <div className="flex flex-wrap gap-2">
                                                {viewDoc.document_url && (
                                                    <a href={viewDoc.document_url} target="_blank" rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 hover:bg-indigo-100 transition-colors">
                                                        <FileText size={12} /> Education Document <ExternalLink size={10} />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Footer action */}
                                <div className="mt-6 pt-4 border-t border-gray-100 flex justify-end">
                                    <button onClick={() => { setViewDoc(null); openEdit(viewDoc); }}
                                        className="btn-primary flex items-center gap-2 text-sm">
                                        <Pencil size={14} /> Edit Doctor
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══════ Delete Confirmation Modal ═══════ */}
            <AnimatePresence>
                {deleteConfirmId !== null && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDeleteConfirmId(null)} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center relative" initial={{ scale: 0.88, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 20 }} onClick={(e) => e.stopPropagation()}>
                                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4"><AlertTriangle size={26} className="text-red-500" /></div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Doctor?</h3>
                                <p className="text-sm text-gray-500 mb-6">Are you sure you want to delete <span className="font-semibold text-gray-700">Dr. {deleteConfirmName}</span>? This action cannot be undone.</p>
                                <div className="flex gap-3">
                                    <button onClick={() => setDeleteConfirmId(null)} className="flex-1 btn-secondary">Cancel</button>
                                    <button onClick={() => handleDelete(deleteConfirmId!)} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl py-2.5 transition-colors">Yes, Delete</button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══════ Status Toggle Confirmation Modal ═══════ */}
            <AnimatePresence>
                {statusToggleDoc && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setStatusToggleDoc(null)} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center relative" initial={{ scale: 0.88, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 20 }} onClick={(e) => e.stopPropagation()}>
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${getEffectiveStatus(statusToggleDoc) === "INACTIVE" ? "bg-green-50" : "bg-orange-50"
                                    }`}>
                                    <Power size={26} className={getEffectiveStatus(statusToggleDoc) === "INACTIVE" ? "text-green-500" : "text-orange-500"} />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    {getEffectiveStatus(statusToggleDoc) === "INACTIVE" ? "Activate" : "Deactivate"} Doctor?
                                </h3>
                                <p className="text-sm text-gray-500 mb-6">
                                    Are you sure you want to {getEffectiveStatus(statusToggleDoc) === "INACTIVE" ? "activate" : "deactivate"}{" "}
                                    <span className="font-semibold text-gray-700">Dr. {statusToggleDoc.doctor_name}</span>?
                                    {getEffectiveStatus(statusToggleDoc) !== "INACTIVE" && (
                                        <span className="block mt-1 text-orange-500 font-medium">The doctor will not be able to log in while deactivated.</span>
                                    )}
                                </p>
                                {getEffectiveStatus(statusToggleDoc) === "INACTIVE" && (
                                    <div className="mb-4 text-left">
                                        <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Active To</label>
                                        <input
                                            type="date"
                                            value={statusToggleActiveTo}
                                            onChange={(e) => setStatusToggleActiveTo(e.target.value)}
                                            className="input-field mt-1"
                                        />
                                        {statusToggleError && <p className="text-xs text-red-500 mt-1">{statusToggleError}</p>}
                                    </div>
                                )}
                                <div className="flex gap-3">
                                    <button onClick={() => setStatusToggleDoc(null)} className="flex-1 btn-secondary">Cancel</button>
                                    <button onClick={handleStatusToggle} disabled={statusToggling}
                                        className={`flex-1 font-semibold rounded-xl py-2.5 transition-colors text-white ${getEffectiveStatus(statusToggleDoc) === "INACTIVE"
                                            ? "bg-green-500 hover:bg-green-600"
                                            : "bg-orange-500 hover:bg-orange-600"
                                            }`}
                                    >
                                        {statusToggling ? "Processing…" : statusToggleDoc.status === "INACTIVE" ? "Yes, Activate" : "Yes, Deactivate"}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══════ Edit Modal ═══════ */}
            <AnimatePresence>
                {editDoc && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setEditDoc(null)} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 relative max-h-[92vh] overflow-y-auto" initial={{ scale: 0.92, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 30 }} onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => setEditDoc(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>

                                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2"><Pencil size={18} className="text-indigo-500" /> Edit Doctor</h2>
                                <p className="text-sm text-gray-400 mb-6">Dr. {editDoc.doctor_name}</p>

                                <form onSubmit={handleEditSubmit} className="space-y-6">

                                    {/* ── Profile Picture ── */}
                                    <FileUploadBox id="edit-profile-pic" label="Profile Picture" fileRef={editProfilePicRef} file={editProfilePicFile} url={editProfilePicUrl} uploading={editProfilePicUploading} uploadError={editProfilePicError}
                                        onFileChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, setEditProfilePicFile, setEditProfilePicUrl, setEditProfilePicUploading, setEditProfilePicError); }}
                                        onClear={() => { setEditProfilePicFile(null); setEditProfilePicUrl(""); if (editProfilePicRef.current) editProfilePicRef.current.value = ""; }}
                                    />

                                    {/* ── Basic Details ── */}
                                    <div>
                                        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><User size={14} /> Basic Details</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Full Name</label>
                                                <input type="text" value={editForm.doctor_name} onChange={(e) => setEditForm({ ...editForm, doctor_name: e.target.value })} required className="input-field" placeholder="Doctor name" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Specialization</label>
                                                <input type="text" value={editForm.specialization} onChange={(e) => setEditForm({ ...editForm, specialization: e.target.value })} className="input-field" placeholder="e.g. Cardiologist" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Email Address (Login)</label>
                                                <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="input-field" placeholder="doctor@example.com" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Password <span className="text-gray-400 text-xs font-normal">(Leave blank to keep unchanged)</span></label>
                                                <div className="relative">
                                                    <input
                                                        type={showEditPassword ? "text" : "password"}
                                                        value={editForm.password}
                                                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                                        className="input-field pr-10"
                                                        placeholder="New Password"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowEditPassword((v) => !v)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-500 transition-colors"
                                                        aria-label={showEditPassword ? "Hide password" : "Show password"}
                                                    >
                                                        {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Appointment Phone Number</label>
                                                <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="input-field" placeholder="+91 98765 43210" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Bot size={14} className="text-indigo-500" /> Telegram Chat ID</label>
                                                <input type="text" value={editForm.chat_id} onChange={(e) => setEditForm({ ...editForm, chat_id: e.target.value })} className="input-field" placeholder="e.g. 123456789" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Bot size={14} className="text-indigo-500" /> Telegram User ID</label>
                                                <input type="text" value={editForm.telegram_userid} onChange={(e) => setEditForm({ ...editForm, telegram_userid: e.target.value })} className="input-field" placeholder="e.g. @doctor_smith" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Building2 size={14} className="text-indigo-500" /> No. of Clinics</label>
                                                <input type="number" min="0" value={editForm.num_clinics} onChange={(e) => setEditForm({ ...editForm, num_clinics: e.target.value })} className="input-field" placeholder="0" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Active From</label>
                                                <input type="date" value={editForm.active_from} onChange={(e) => setEditForm({ ...editForm, active_from: e.target.value })} className="input-field" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Active To</label>
                                                <input type="date" value={editForm.active_to} onChange={(e) => setEditForm({ ...editForm, active_to: e.target.value })} className="input-field" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── WhatsApp Numbers ── */}
                                    <WhatsAppList numbers={editWaNums} onChange={setEditWaNums} />

                                    {/* ── Professional Details ── */}
                                    <div>
                                        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Stethoscope size={14} /> Professional Details</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Doctor Registration No.</label>
                                                <input type="text" value={editForm.registration_no} onChange={(e) => setEditForm({ ...editForm, registration_no: e.target.value })} className="input-field" placeholder="e.g. MCI-12345" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><GraduationCap size={14} className="text-indigo-500" /> Education / Qualification</label>
                                                <input type="text" value={editForm.education} onChange={(e) => setEditForm({ ...editForm, education: e.target.value })} className="input-field" placeholder="e.g. MBBS, MD Cardiology" />
                                            </div>
                                            <div className="space-y-1 md:col-span-2">
                                                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><MapPin size={14} className="text-indigo-500" /> Address</label>
                                                <textarea value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} className="input-field resize-none" placeholder="Clinic / Practice Address" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">GST Number <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
                                                <input type="text" value={editForm.gst_number} onChange={(e) => setEditForm({ ...editForm, gst_number: e.target.value })} className="input-field" placeholder="e.g. 22AAAAA0000A1Z5" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">PAN Number <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
                                                <input type="text" value={editForm.pan_number} onChange={(e) => setEditForm({ ...editForm, pan_number: e.target.value })} className="input-field" placeholder="e.g. ABCDE1234F" />
                                            </div>
                                        </div>

                                        {/* ── Document Upload ── */}
                                        <div className="mt-4">
                                            <FileUploadBox id="edit-doc-upload" label="Education / Degree Document" fileRef={editFileRef} file={editDocFile} url={editDocUrl} uploading={editUploading} uploadError={editUploadError}
                                                onFileChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, setEditDocFile, setEditDocUrl, setEditUploading, setEditUploadError); }}
                                                onClear={() => { setEditDocFile(null); setEditDocUrl(""); if (editFileRef.current) editFileRef.current.value = ""; }}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Smartphone size={14} /> SMS Service</p>
                                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 space-y-4">
                                            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-semibold text-gray-900">Enable appointment booking SMS</p>
                                                    <p className="text-xs text-gray-500">This does not affect appointment booking. It only controls whether SMS can be sent afterward.</p>
                                                </div>
                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={editForm.sms_service_enabled}
                                                    onClick={() => requestSmsToggleChange(!editForm.sms_service_enabled)}
                                                    className={`inline-flex shrink-0 flex-col items-center gap-1 self-start rounded-2xl border px-2.5 py-2 text-[11px] font-semibold transition-colors ${editForm.sms_service_enabled
                                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                                        : "border-gray-200 bg-white text-gray-600"
                                                        }`}
                                                >
                                                    <span
                                                        className={`relative h-5 w-10 rounded-full transition-colors ${editForm.sms_service_enabled ? "bg-emerald-500" : "bg-gray-300"}`}
                                                    >
                                                        <span
                                                            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${editForm.sms_service_enabled ? "translate-x-5" : "translate-x-0"}`}
                                                        />
                                                    </span>
                                                    <span>{editForm.sms_service_enabled ? "Active" : "Disabled"}</span>
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                                <div className="rounded-xl bg-white px-3 py-3 border border-indigo-100">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Current Status</p>
                                                    <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${getSmsStatusTone(editDoc.sms_service?.status)}`}>
                                                        {editDoc.sms_service?.status || "DISABLED"}
                                                    </span>
                                                </div>
                                                <div className="rounded-xl bg-white px-3 py-3 border border-indigo-100">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Balance</p>
                                                    <p className="mt-1 text-sm font-semibold text-gray-900">{editDoc.sms_service?.displayText || "0/0 left"}</p>
                                                </div>
                                                <div className="rounded-xl bg-white px-3 py-3 border border-indigo-100">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Quick Recharge</p>
                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                        {[1000, 2000, 5000].map((credits) => (
                                                            <button
                                                                key={credits}
                                                                type="button"
                                                                onClick={() => setEditForm((prev) => ({ ...prev, sms_recharge_credits: String(credits) }))}
                                                                className="rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                                                            >
                                                                +{credits}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700">Credits to add now</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={editForm.sms_recharge_credits}
                                                        onChange={(e) => setEditForm({ ...editForm, sms_recharge_credits: e.target.value })}
                                                        className="input-field"
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700">Recharge note</label>
                                                    <input
                                                        type="text"
                                                        value={editForm.sms_recharge_remarks}
                                                        onChange={(e) => setEditForm({ ...editForm, sms_recharge_remarks: e.target.value })}
                                                        className="input-field"
                                                        placeholder="Optional note for audit"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {editError && <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>}

                                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                                        <button type="button" onClick={() => setEditDoc(null)} className="btn-secondary">Cancel</button>
                                        <button type="submit" disabled={editSubmitting || anyEditUploading} className="btn-primary">
                                            {editSubmitting ? "Saving…" : "Save Changes"}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══════ Create Doctor Modal ═══════ */}
            <AnimatePresence>
                {smsToggleConfirmOpen && editDoc && pendingSmsToggleValue !== null && (
                    <>
                        <motion.div
                            className="fixed inset-0 bg-black/40 z-[70] backdrop-blur-sm"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={cancelSmsToggleChange}
                        />
                        <motion.div
                            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        >
                            <motion.div
                                className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
                                initial={{ scale: 0.94, y: 18 }}
                                animate={{ scale: 1, y: 0 }}
                                exit={{ scale: 0.94, y: 18 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <h3 className="text-lg font-bold text-gray-900">
                                    {pendingSmsToggleValue ? "Enable SMS service?" : "Disable SMS service?"}
                                </h3>
                                <p className="mt-2 text-sm text-gray-500">
                                    {pendingSmsToggleValue
                                        ? `SMS sending will be allowed for Dr. ${editDoc.doctor_name} when credits are available.`
                                        : `SMS sending will be stopped for Dr. ${editDoc.doctor_name}. Appointment booking will continue normally.`}
                                </p>
                                <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                                    <button type="button" onClick={cancelSmsToggleChange} className="btn-secondary">
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={confirmSmsToggleChange}
                                        className={`btn-primary ${pendingSmsToggleValue ? "" : "!bg-red-600 hover:!bg-red-700"}`}
                                    >
                                        {pendingSmsToggleValue ? "Yes, Enable" : "Yes, Disable"}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showForm && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowForm(false); resetForm(); }} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8" initial={{ scale: 0.92, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 30 }} onClick={(e) => e.stopPropagation()}>
                                <button onClick={() => { setShowForm(false); resetForm(); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"><X size={20} /></button>

                                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2"><Shield className="w-5 h-5 text-indigo-500" /> Create New Doctor</h2>
                                <p className="text-sm text-gray-400 mb-6">Fill in the details to register a new doctor account.</p>

                                <form onSubmit={handleSubmit} className="space-y-6">

                                    {/* ── Account Details ── */}
                                    <div>
                                        <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-3">Account Details</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Full Name <span className="text-red-400">*</span></label>
                                                <input type="text" name="name" value={formData.name} onChange={handleInputChange} required className="input-field" placeholder="John Doe" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Role</label>
                                                <select name="role" value={formData.role} onChange={handleInputChange} className="input-field">
                                                    <option value="DOCTOR">Doctor</option>
                                                    <option value="ADMIN">Clinic Admin</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Email Address <span className="text-red-400">*</span></label>
                                                <input type="email" name="email" value={formData.email} onChange={handleInputChange} required className="input-field" placeholder="doctor@example.com" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700">Password <span className="text-red-400">*</span></label>
                                                <div className="relative">
                                                    <input
                                                        type={showCreatePassword ? "text" : "password"}
                                                        name="password"
                                                        value={formData.password}
                                                        onChange={handleInputChange}
                                                        required
                                                        className="input-field pr-10"
                                                        placeholder="••••••••"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowCreatePassword((v) => !v)}
                                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-500 transition-colors"
                                                        aria-label={showCreatePassword ? "Hide password" : "Show password"}
                                                    >
                                                        {showCreatePassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                                    </button>
                                                </div>
                                            </div>
                                            {formData.role === "DOCTOR" && (
                                                <>
                                                    <div className="space-y-1">
                                                        <label className="text-sm font-medium text-gray-700">Appointment Phone Number</label>
                                                        <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} className="input-field" placeholder="+91 98765 43210" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Bot size={14} className="text-indigo-500" /> Telegram Chat ID</label>
                                                        <input type="text" name="chat_id" value={formData.chat_id} onChange={handleInputChange} className="input-field" placeholder="e.g. 123456789" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Bot size={14} className="text-indigo-500" /> Telegram User ID</label>
                                                        <input type="text" name="telegram_userid" value={formData.telegram_userid || ""} onChange={handleInputChange} className="input-field" placeholder="e.g. @doctor_smith" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Building2 size={14} className="text-indigo-500" /> No. of Clinics</label>
                                                        <input type="number" name="num_clinics" min="0" value={formData.num_clinics} onChange={handleInputChange} className="input-field" placeholder="0" />
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── WhatsApp Numbers (for DOCTOR) ── */}
                                    {formData.role === "DOCTOR" && (
                                        <WhatsAppList numbers={createWaNums} onChange={setCreateWaNums} />
                                    )}

                                    {/* ── Profile Picture ── */}
                                    {formData.role === "DOCTOR" && (
                                        <FileUploadBox id="create-profile-pic" label="Profile Picture" fileRef={profilePicRef} file={profilePicFile} url={profilePicUrl} uploading={profilePicUploading} uploadError={profilePicError}
                                            onFileChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, setProfilePicFile, setProfilePicUrl, setProfilePicUploading, setProfilePicError); }}
                                            onClear={() => { setProfilePicFile(null); setProfilePicUrl(""); if (profilePicRef.current) profilePicRef.current.value = ""; }}
                                        />
                                    )}

                                    {/* ── Professional Details (only for DOCTOR role) ── */}
                                    {formData.role === "DOCTOR" && (
                                        <div>
                                            <p className="text-xs font-semibold text-indigo-500 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Stethoscope size={14} /> Professional Details</p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700">Doctor Registration No. <span className="text-red-400">*</span></label>
                                                    <input type="text" name="registration_no" value={formData.registration_no} onChange={handleInputChange} required className="input-field" placeholder="e.g. MCI-12345" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700">Specialization <span className="text-red-400">*</span></label>
                                                    <input type="text" name="specialization" value={formData.specialization} onChange={handleInputChange} required className="input-field" placeholder="e.g. Cardiologist, Orthopedic" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><GraduationCap size={14} className="text-indigo-500" /> Education / Qualification <span className="text-red-400">*</span></label>
                                                    <input type="text" name="education" value={formData.education} onChange={handleInputChange} required className="input-field" placeholder="e.g. MBBS, MD Cardiology" />
                                                </div>
                                                <div className="space-y-1 md:col-span-2">
                                                    <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><MapPin size={14} className="text-indigo-500" /> Address <span className="text-red-400">*</span></label>
                                                    <textarea name="address" value={formData.address} onChange={handleInputChange} required rows={2} className="input-field resize-none" placeholder="Clinic / Practice Address" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700">GST Number <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
                                                    <input type="text" name="gst_number" value={formData.gst_number} onChange={handleInputChange} className="input-field" placeholder="e.g. 22AAAAA0000A1Z5" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700">PAN Number <span className="text-gray-400 text-xs font-normal">(optional)</span></label>
                                                    <input type="text" name="pan_number" value={formData.pan_number} onChange={handleInputChange} className="input-field" placeholder="e.g. ABCDE1234F" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700">Active From</label>
                                                    <input type="date" name="active_from" value={formData.active_from} onChange={handleInputChange} className="input-field" />
                                                </div>
                                                <div className="space-y-1">
                                                    <label className="text-sm font-medium text-gray-700">Active To</label>
                                                    <input type="date" name="active_to" value={formData.active_to} onChange={handleInputChange} className="input-field" />
                                                </div>
                                            </div>

                                            {/* ── Document Upload ── */}
                                            <div className="mt-4">
                                                <FileUploadBox id="doc-upload" label="Education / Degree Document" fileRef={fileRef} file={docFile} url={docUrl} uploading={uploading} uploadError={uploadError}
                                                    onFileChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, setDocFile, setDocUrl, setUploading, setUploadError); }}
                                                    onClear={() => { setDocFile(null); setDocUrl(""); if (fileRef.current) fileRef.current.value = ""; }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {error && <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

                                    <div className="flex justify-end gap-3 pt-2">
                                        <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary">Cancel</button>
                                        <button type="submit" disabled={submitting || anyCreateUploading} className="btn-primary">
                                            {submitting ? "Creating…" : "Create Account"}
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
