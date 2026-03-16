"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { Shield, UserPlus, X, Pencil, Trash2, AlertTriangle, UploadCloud, FileText, CheckCircle2, Plus, CircleMinus, Power, Smartphone, User, Bot, Building2, Stethoscope, GraduationCap, MapPin, BarChart3, Eye, Phone, Hash, FileDigit, ExternalLink } from "lucide-react";

/* ───────────────── Types ───────────────── */
interface WhatsAppNum { id?: number; whatsapp_number: string }
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
    profile_pic_url?: string | null;
    num_clinics?: number | null;
    status?: string | null;
    whatsapp_numbers?: WhatsAppNum[];
}

const INITIAL_FORM = {
    name: "", email: "", password: "", role: "DOCTOR", phone: "", whatsapp_number: "",
    gst_number: "", pan_number: "", address: "", registration_no: "", education: "", specialization: "",
    chat_id: "", num_clinics: "0",
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
        chat_id: "", num_clinics: "0",
    });
    const [editError, setEditError] = useState("");
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [editWaNums, setEditWaNums] = useState<string[]>([""]);

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

    /* ────── Generic cloudinary upload helper ────── */
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
        if (res.ok) { setDoctors(doctors.filter((d) => d.doctor_id !== doctorId)); setDeleteConfirmId(null); }
    };

    /* ────── Toggle Active/Inactive ────── */
    const handleStatusToggle = async () => {
        if (!statusToggleDoc) return;
        setStatusToggling(true);
        try {
            const newStatus = statusToggleDoc.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
            const res = await fetch("/api/doctors", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ doctor_id: statusToggleDoc.doctor_id, status: newStatus }),
            });
            if (res.ok) {
                await fetchData();
                setStatusToggleDoc(null);
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
            num_clinics: String(doc.num_clinics ?? 0),
        });
        setEditDocUrl(doc.document_url || ""); setEditDocFile(null); setEditUploadError("");
        setEditProfilePicUrl(doc.profile_pic_url || ""); setEditProfilePicFile(null); setEditProfilePicError("");
        setEditWaNums(doc.whatsapp_numbers && doc.whatsapp_numbers.length > 0
            ? doc.whatsapp_numbers.map(w => w.whatsapp_number)
            : (doc.whatsapp_number ? [doc.whatsapp_number] : [""])
        );
        setEditError("");
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
                    whatsapp_numbers: editWaNums.filter(n => n.trim()).map(n => ({ whatsapp_number: n.trim() })),
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
                        profile_pic_url: profilePicUrl || null,
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
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Manage Doctors</h1>
                        <p className="text-gray-500 mt-1 text-sm">View, edit and manage all registered doctors</p>
                    </div>
                    <PremiumButton onClick={() => { setShowForm(!showForm); resetForm(); }} icon={UserPlus}>
                        Create New Doctor
                    </PremiumButton>
                </div>
            </motion.div>

            {success && (
                <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{success}</div>
            )}

            {/* ────── Doctors Table ────── */}
            <motion.div className="glass-card p-7" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
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
                                    <th>Doctor's Name</th>
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
                                                    <span className="text-gray-800 font-medium group-hover:text-indigo-600 group-hover:underline transition-colors">Dr. {doc.doctor_name}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <span className={`inline-block w-2.5 h-2.5 rounded-full ${doc.status === "INACTIVE" ? "bg-red-500" : "bg-green-500"}`} />
                                                    <span className={`text-xs font-semibold ${doc.status === "INACTIVE" ? "text-red-600" : "text-green-600"}`}>
                                                        {doc.status === "INACTIVE" ? "Inactive" : "Active"}
                                                    </span>
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
                                                <div className="flex items-center gap-1.5">
                                                    <motion.button
                                                        onClick={() => openEdit(doc)}
                                                        className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                                        title="Edit" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                                    >
                                                        <Pencil size={15} />
                                                    </motion.button>
                                                    <motion.button
                                                        onClick={() => setStatusToggleDoc(doc)}
                                                        className={`p-2 rounded-lg transition-colors ${doc.status === "INACTIVE"
                                                            ? "bg-green-50 text-green-600 hover:bg-green-100"
                                                            : "bg-orange-50 text-orange-600 hover:bg-orange-100"
                                                            }`}
                                                        title={doc.status === "INACTIVE" ? "Activate" : "Deactivate"}
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
                            <motion.div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-8 relative max-h-[90vh] overflow-y-auto" initial={{ scale: 0.92, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 30 }} onClick={(e) => e.stopPropagation()}>
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
                                            <span className={`inline-block w-2 h-2 rounded-full ${viewDoc.status === "INACTIVE" ? "bg-red-500" : "bg-green-500"}`} />
                                            <span className={`text-xs font-semibold ${viewDoc.status === "INACTIVE" ? "text-red-600" : "text-green-600"}`}>
                                                {viewDoc.status === "INACTIVE" ? "Inactive" : "Active"}
                                            </span>
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
                                        <div className="grid grid-cols-2 gap-3">
                                            {viewDoc.phone && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Phone</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.phone}</p>
                                                </div>
                                            )}
                                            {viewDoc.chat_id && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Telegram ID</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.chat_id}</p>
                                                </div>
                                            )}
                                            {(viewDoc.num_clinics !== null && viewDoc.num_clinics !== undefined) && (
                                                <div className="bg-gray-50 rounded-xl px-3.5 py-2.5">
                                                    <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-0.5">Clinics</p>
                                                    <p className="text-sm font-medium text-gray-800">{viewDoc.num_clinics}</p>
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
                                            <div className="grid grid-cols-2 gap-3">
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
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${statusToggleDoc.status === "INACTIVE" ? "bg-green-50" : "bg-orange-50"
                                    }`}>
                                    <Power size={26} className={statusToggleDoc.status === "INACTIVE" ? "text-green-500" : "text-orange-500"} />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    {statusToggleDoc.status === "INACTIVE" ? "Activate" : "Deactivate"} Doctor?
                                </h3>
                                <p className="text-sm text-gray-500 mb-6">
                                    Are you sure you want to {statusToggleDoc.status === "INACTIVE" ? "activate" : "deactivate"}{" "}
                                    <span className="font-semibold text-gray-700">Dr. {statusToggleDoc.doctor_name}</span>?
                                    {statusToggleDoc.status !== "INACTIVE" && (
                                        <span className="block mt-1 text-orange-500 font-medium">The doctor will not be able to log in while deactivated.</span>
                                    )}
                                </p>
                                <div className="flex gap-3">
                                    <button onClick={() => setStatusToggleDoc(null)} className="flex-1 btn-secondary">Cancel</button>
                                    <button onClick={handleStatusToggle} disabled={statusToggling}
                                        className={`flex-1 font-semibold rounded-xl py-2.5 transition-colors text-white ${statusToggleDoc.status === "INACTIVE"
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
                                                <label className="text-sm font-medium text-gray-700">Appointment Phone Number</label>
                                                <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="input-field" placeholder="+91 98765 43210" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Bot size={14} className="text-indigo-500" /> Telegram Chat ID</label>
                                                <input type="text" value={editForm.chat_id} onChange={(e) => setEditForm({ ...editForm, chat_id: e.target.value })} className="input-field" placeholder="e.g. 123456789" />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Building2 size={14} className="text-indigo-500" /> No. of Clinics</label>
                                                <input type="number" min="0" value={editForm.num_clinics} onChange={(e) => setEditForm({ ...editForm, num_clinics: e.target.value })} className="input-field" placeholder="0" />
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

                                    {editError && <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{editError}</p>}

                                    <div className="flex justify-end gap-3 pt-2">
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
                {showForm && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowForm(false); resetForm(); }} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 relative max-h-[92vh] overflow-y-auto" initial={{ scale: 0.92, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 30 }} onClick={(e) => e.stopPropagation()}>
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
                                                <input type="password" name="password" value={formData.password} onChange={handleInputChange} required className="input-field" placeholder="••••••••" />
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
