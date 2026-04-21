
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PremiumButton } from "@/components/ui/PremiumButton";
import {
    Plus, X, Pencil, Trash2, Building2, ChevronDown,
    MapPin, Phone, Calendar, Power, AlertTriangle, Stethoscope, Search, QrCode, Eye
} from "lucide-react";

/* ───────── Types ───────── */
interface DoctorInfo {
    doctor_id: number;
    doctor_name: string;
    profile_pic_url?: string | null;
    num_clinics?: number | null;
    specialization?: string | null;
    status?: string | null;
}

interface Clinic {
    clinic_id: number;
    clinic_name: string | null;
    location: string | null;
    phone: string | null;
    status: string | null;
    doctor_id: number | null;
    created_at: string | null;
    barcode_url?: string | null;
    qr_storage_url?: string | null;
    doctor?: DoctorInfo | null;
}

interface DoctorGroup {
    doctor: DoctorInfo;
    clinics: Clinic[];
}

const EMPTY_FORM = { clinic_name: "", location: "", phone: "", doctor_id: "", status: "ACTIVE", barcode_url: "" };

/* ═══════════════════════ MAIN PAGE ═══════════════════════ */
export default function AdminClinicsPage() {
    const router = useRouter();
    const [clinics, setClinics] = useState<Clinic[]>([]);
    const [allDoctors, setAllDoctors] = useState<DoctorInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    // Expand / collapse state per doctor
    const [expanded, setExpanded] = useState<Record<number, boolean>>({});

    // Search
    const [search, setSearch] = useState("");

    // Add modal
    const [showAdd, setShowAdd] = useState(false);
    const [addForm, setAddForm] = useState(EMPTY_FORM);
    const [addSubmitting, setAddSubmitting] = useState(false);
    const [addError, setAddError] = useState("");
    const [addDoctorLocked, setAddDoctorLocked] = useState(false); // lock doctor dropdown when opened from a group

    // Edit modal
    const [editClinic, setEditClinic] = useState<Clinic | null>(null);
    const [editForm, setEditForm] = useState(EMPTY_FORM);
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [editError, setEditError] = useState("");

    // Delete confirm
    const [deleteClinic, setDeleteClinic] = useState<Clinic | null>(null);

    // Status toggle confirm
    const [statusClinic, setStatusClinic] = useState<Clinic | null>(null);
    const [statusToggling, setStatusToggling] = useState(false);
    const [qrPreviewClinic, setQrPreviewClinic] = useState<Clinic | null>(null);
    const [qrPreviewOpen, setQrPreviewOpen] = useState(false);
    const [qrPreviewLoading, setQrPreviewLoading] = useState(false);
    const [qrPreviewError, setQrPreviewError] = useState("");
    const [qrPreviewImage, setQrPreviewImage] = useState("");
    const [qrPreviewMode, setQrPreviewMode] = useState<"generate" | "view">("generate");

    /* ────── Fetch ────── */
    const fetchData = useCallback(async () => {
        try {
            const meRes = await fetch("/api/auth/me");
            if (!meRes.ok) { router.push("/login"); return; }
            const meData = await meRes.json();
            if (meData.user.role !== "SUPER_ADMIN" && meData.user.role !== "ADMIN") { router.push("/login"); return; }

            const res = await fetch("/api/clinics");
            if (res.ok) {
                const data = await res.json();
                setClinics(data.clinics || []);
                setAllDoctors(data.doctors || []);
            }
        } catch { router.push("/login"); }
        finally { setLoading(false); }
    }, [router]);

    useEffect(() => { fetchData(); }, [fetchData]);

    /* ────── Group clinics by doctor ────── */
    const doctorGroups: DoctorGroup[] = React.useMemo(() => {
        const map = new Map<number, DoctorGroup>();

        // First populate groups from all doctors so every doctor shows up
        allDoctors.forEach(doc => {
            map.set(doc.doctor_id, { doctor: doc, clinics: [] });
        });

        // Assign clinics to their doctor groups
        clinics.forEach(c => {
            if (c.doctor_id && c.doctor) {
                let group = map.get(c.doctor_id);
                if (!group) {
                    group = { doctor: c.doctor, clinics: [] };
                    map.set(c.doctor_id, group);
                }
                group.clinics.push(c);
            }
        });

        let groups = Array.from(map.values());

        // Search filter
        if (search.trim()) {
            const q = search.toLowerCase();
            groups = groups.map(g => ({
                ...g,
                clinics: g.clinics.filter(c =>
                    c.clinic_name?.toLowerCase().includes(q) ||
                    c.location?.toLowerCase().includes(q) ||
                    c.phone?.toLowerCase().includes(q) ||
                    g.doctor.doctor_name?.toLowerCase().includes(q)
                ),
            })).filter(g =>
                g.clinics.length > 0 ||
                g.doctor.doctor_name?.toLowerCase().includes(q)
            );
        }

        // Sort: doctors with clinics first, then alphabetically
        groups.sort((a, b) => {
            if (b.clinics.length !== a.clinics.length) return b.clinics.length - a.clinics.length;
            return (a.doctor.doctor_name || "").localeCompare(b.doctor.doctor_name || "");
        });

        return groups;
    }, [clinics, allDoctors, search]);

    // Unassigned clinics (no doctor_id)
    const unassigned = clinics.filter(c => !c.doctor_id);

    /* ────── Stat counts ────── */
    const totalClinics = clinics.length;
    const activeClinics = clinics.filter(c => c.status === "ACTIVE").length;
    const totalDoctorsWithClinics = doctorGroups.filter(g => g.clinics.length > 0).length;

    /* ────── Toggle expand ────── */
    const toggle = (docId: number) => setExpanded(prev => ({ ...prev, [docId]: !prev[docId] }));

    /* ────── Open Add for a specific doctor ────── */
    const openAddForDoctor = (doctorId: number) => {
        setAddForm({ ...EMPTY_FORM, doctor_id: String(doctorId) });
        setAddDoctorLocked(true);
        setAddError("");
        setShowAdd(true);
    };

    /* ────── Add clinic ────── */
    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setAddSubmitting(true); setAddError("");
        try {
            const res = await fetch("/api/clinics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clinic_name: addForm.clinic_name,
                    location: addForm.location,
                    phone: addForm.phone,
                    doctor_id: addForm.doctor_id ? Number(addForm.doctor_id) : null,
                    status: addForm.status,
                }),
            });
            if (res.ok) {
                const docId = addForm.doctor_id ? Number(addForm.doctor_id) : null;
                setShowAdd(false);
                setAddForm(EMPTY_FORM);
                setAddDoctorLocked(false);
                await fetchData();
                // Auto-expand the doctor group for the new clinic
                if (docId) {
                    setExpanded(prev => ({ ...prev, [docId]: true }));
                }
            } else {
                const d = await res.json();
                setAddError(d.error || "Failed to add clinic");
            }
        } catch { setAddError("An error occurred"); }
        finally { setAddSubmitting(false); }
    };

    /* ────── Open edit ────── */
    const openEdit = (c: Clinic) => {
        setEditClinic(c);
        setEditForm({
            clinic_name: c.clinic_name || "",
            location: c.location || "",
            phone: c.phone || "",
            doctor_id: String(c.doctor_id || ""),
            status: c.status || "ACTIVE",
            barcode_url: c.barcode_url || "",
        });
        setEditError("");
    };

    /* ────── Submit edit ────── */
    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editClinic) return;
        setEditSubmitting(true); setEditError("");
        try {
            const res = await fetch(`/api/clinics/${editClinic.clinic_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clinic_name: editForm.clinic_name,
                    location: editForm.location,
                    phone: editForm.phone,
                    status: editForm.status,
                }),
            });
            if (res.ok) {
                setEditClinic(null);
                await fetchData();
            } else {
                const d = await res.json();
                setEditError(d.error || "Failed to update");
            }
        } catch { setEditError("An error occurred"); }
        finally { setEditSubmitting(false); }
    };

    /* ────── Delete ────── */
    const handleDelete = async () => {
        if (!deleteClinic) return;
        try {
            const res = await fetch(`/api/clinics/${deleteClinic.clinic_id}`, { method: "DELETE" });
            if (res.ok) { setDeleteClinic(null); await fetchData(); }
        } catch { /* ignore */ }
    };

    const handleGenerateBarcode = async (doctor_id: number | null | undefined, clinic_id: number) => {
        setQrPreviewMode("generate");
        const clinic = clinics.find((item) => item.clinic_id === clinic_id) || null;
        setQrPreviewClinic(clinic);
        setQrPreviewOpen(true);
        setQrPreviewLoading(true);
        setQrPreviewError("");
        setQrPreviewImage("");

        try {
            const docId = Number(doctor_id);
            const previewRes = await fetch("/api/qr/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    doctor_id: docId,
                    clinic_id,
                }),
            });

            const previewData = await previewRes.json();
            if (!previewRes.ok) {
                throw new Error(previewData.error || "Failed to load QR preview");
            }

            setQrPreviewImage(previewData.dataUrl || "");
            const url = `https://daptoservices.vinfocom.co.in/qr/generate/download?doctor_id=${docId}&clinic_id=${clinic_id}`;
            await fetch(`/api/clinics/${clinic_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    barcode_url: url,
                    qr_storage_url: previewData.qrStorageUrl || null,
                })
            });
            fetchData();
        } catch (e) {
            console.error("Error generating barcode", e);
            setQrPreviewError(e instanceof Error ? e.message : "Failed to load QR preview");
        } finally {
            setQrPreviewLoading(false);
        }
    };

    const handleViewBarcode = (clinic: Clinic) => {
        setQrPreviewMode("view");
        setQrPreviewClinic(clinic);
        setQrPreviewOpen(true);
        setQrPreviewLoading(false);
        setQrPreviewError(clinic.qr_storage_url ? "" : "Stored barcode not found");
        setQrPreviewImage(clinic.qr_storage_url || "");
    };

    /* ────── Status toggle ────── */
    const handleStatusToggle = async () => {
        if (!statusClinic) return;
        setStatusToggling(true);
        try {
            const newStatus = statusClinic.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
            const res = await fetch(`/api/clinics/${statusClinic.clinic_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) { setStatusClinic(null); await fetchData(); }
        } catch { /* ignore */ }
        finally { setStatusToggling(false); }
    };

    /* ────── Format date ────── */
    const fmtDate = (d: string | null) => {
        if (!d) return "—";
        return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    };

    /* ────── Loading ────── */
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
            {/* Header — no Add button here, adding happens from within each doctor group */}
            <motion.div className="mb-6" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Clinic Management</h1>
                    <p className="text-gray-500 mt-1 text-sm">Manage clinics grouped by doctor</p>
                </div>
            </motion.div>

            {/* Stat Cards */}
            <motion.div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                <GlassCard className="flex items-center gap-4 py-4 px-5">
                    <div className="p-3 rounded-xl bg-indigo-50 text-indigo-500 border border-indigo-100">
                        <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900">{totalClinics}</p>
                        <p className="text-xs text-gray-500 font-medium">Total Clinics</p>
                    </div>
                </GlassCard>
                <GlassCard className="flex items-center gap-4 py-4 px-5">
                    <div className="p-3 rounded-xl bg-green-50 text-green-500 border border-green-100">
                        <Power className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900">{activeClinics}</p>
                        <p className="text-xs text-gray-500 font-medium">Active Clinics</p>
                    </div>
                </GlassCard>
                <GlassCard className="flex items-center gap-4 py-4 px-5">
                    <div className="p-3 rounded-xl bg-purple-50 text-purple-500 border border-purple-100">
                        <Stethoscope className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-gray-900">{totalDoctorsWithClinics}</p>
                        <p className="text-xs text-gray-500 font-medium">Doctors with Clinics</p>
                    </div>
                </GlassCard>
            </motion.div>

            {/* Search — fixed padding so icon and placeholder don't overlap */}
            <motion.div className="mb-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                <div className="relative w-full max-w-md">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by doctor or clinic name..."
                        className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-11 pr-4 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                </div>
            </motion.div>

            {/* Error */}
            <AnimatePresence>
                {error && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm mb-4 overflow-hidden">
                        {error}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Doctor Groups */}
            <div className="space-y-4">
                {doctorGroups.map((group, gi) => {
                    const isOpen = expanded[group.doctor.doctor_id] ?? (group.clinics.length > 0);
                    const actual = group.clinics.length;
                    const defined = group.doctor.num_clinics ?? 0;
                    // Counter color: green if within limit, orange if at limit, indigo otherwise
                    const counterColor = actual > defined && defined > 0
                        ? "bg-orange-50 text-orange-600 border-orange-200"
                        : actual === defined && defined > 0
                            ? "bg-green-50 text-green-600 border-green-200"
                            : "bg-indigo-50 text-indigo-600 border-indigo-100";

                    return (
                        <motion.div key={group.doctor.doctor_id}
                            initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 + gi * 0.04 }}
                        >
                            <GlassCard className="overflow-hidden">
                                {/* Doctor Header Row */}
                                <div
                                    className="flex items-center gap-4 cursor-pointer select-none rounded-t-2xl px-4 py-4 transition-colors hover:bg-gray-50/60 sm:px-6"
                                    onClick={() => toggle(group.doctor.doctor_id)}
                                >
                                    {/* Avatar */}
                                    {group.doctor.profile_pic_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={group.doctor.profile_pic_url} alt="" className="w-10 h-10 rounded-xl object-cover shadow-sm" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                                            {group.doctor.doctor_name?.charAt(0)?.toUpperCase()}
                                        </div>
                                    )}

                                    {/* Name & Meta */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-base font-bold text-gray-900 truncate">Dr. {group.doctor.doctor_name}</h3>
                                            {group.doctor.specialization && (
                                                <span className="badge badge-confirmed text-[10px] hidden sm:inline">{group.doctor.specialization}</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-0.5">
                                            {actual}/{defined} {actual === 1 ? "clinic" : "clinics"} created
                                        </p>
                                    </div>

                                    {/* Clinic count badge X/N */}
                                    <div className="flex items-center gap-3">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border ${counterColor}`}>
                                            <Building2 className="w-3.5 h-3.5" />
                                            {actual}/{defined}
                                        </span>
                                        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                                            <ChevronDown className="w-5 h-5 text-gray-400" />
                                        </motion.div>
                                    </div>
                                </div>

                                {/* Clinics Table */}
                                <AnimatePresence>
                                    {isOpen && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.25 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="border-t border-gray-100">
                                                {group.clinics.length === 0 ? (
                                                    <div className="px-6 py-8 text-center">
                                                        <Building2 className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                                                        <p className="text-sm text-gray-400">No clinics added yet for this doctor</p>
                                                        <p className="text-xs text-gray-300 mt-0.5">{defined > 0 ? `${defined} clinics defined — start adding` : "No clinics defined"}</p>
                                                    </div>
                                                ) : (
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                                                    <th className="px-6 py-3 font-semibold">#</th>
                                                                    <th className="px-4 py-3 font-semibold">Clinic Name</th>
                                                                    <th className="px-4 py-3 font-semibold">Location</th>
                                                                    <th className="px-4 py-3 font-semibold">Phone</th>
                                                                    <th className="px-4 py-3 font-semibold">Created</th>
                                                                    <th className="px-4 py-3 font-semibold">Status</th>
                                                                    <th className="px-4 py-3 font-semibold">Actions</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {group.clinics.map((c, ci) => (
                                                                    <motion.tr
                                                                        key={c.clinic_id}
                                                                        initial={{ opacity: 0, x: -5 }}
                                                                        animate={{ opacity: 1, x: 0 }}
                                                                        transition={{ delay: ci * 0.03 }}
                                                                        className="border-t border-gray-50 hover:bg-gray-50/40 transition-colors"
                                                                    >
                                                                        <td className="px-6 py-3">
                                                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-gray-100 text-gray-500 text-xs font-bold">
                                                                                {ci + 1}/{Math.max(defined, actual)}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="flex items-center gap-2">
                                                                                <Building2 className="w-4 h-4 text-indigo-400 shrink-0" />
                                                                                <span className="font-medium text-gray-800">{c.clinic_name || "—"}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="flex items-start gap-1.5 text-gray-500">
                                                                                <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400" />
                                                                                <span className="max-w-[180px] truncate">{c.location || "—"}</span>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="flex items-center gap-1.5 text-gray-500">
                                                                                <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                                {c.phone || "—"}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="flex items-center gap-1.5 text-gray-500">
                                                                                <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                                                {fmtDate(c.created_at)}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <button
                                                                                onClick={() => setStatusClinic(c)}
                                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${c.status === "ACTIVE"
                                                                                    ? "bg-green-50 text-green-600 border-green-200 hover:bg-green-100"
                                                                                    : "bg-red-50 text-red-500 border-red-200 hover:bg-red-100"
                                                                                    }`}
                                                                            >
                                                                                <span className={`w-2 h-2 rounded-full ${c.status === "ACTIVE" ? "bg-green-500" : "bg-red-500"}`} />
                                                                                {c.status === "ACTIVE" ? "Active" : "Inactive"}
                                                                            </button>
                                                                        </td>
                                                                        <td className="px-4 py-3">
                                                                            <div className="flex items-center gap-1.5">
                                                                                <button
                                                                                    onClick={() => handleGenerateBarcode(group.doctor.doctor_id, c.clinic_id)}
                                                                                    className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                                                                    title="Generate Bar Code"
                                                                                >
                                                                                    <QrCode size={14} />
                                                                                </button>
                                                                                <button
                                                                                    onClick={() => handleViewBarcode(c)}
                                                                                    disabled={!c.qr_storage_url}
                                                                                    className={`p-2 rounded-lg transition-colors ${c.qr_storage_url ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "cursor-not-allowed bg-gray-100 text-gray-300"}`}
                                                                                    title="View Bar Code"
                                                                                >
                                                                                    <Eye size={14} />
                                                                                </button>
                                                                                <motion.button
                                                                                    onClick={() => openEdit(c)}
                                                                                    className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                                                                    title="Edit" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                                                                >
                                                                                    <Pencil size={14} />
                                                                                </motion.button>
                                                                                <motion.button
                                                                                    onClick={() => setDeleteClinic(c)}
                                                                                    className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                                                                    title="Delete" whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                                                                                >
                                                                                    <Trash2 size={14} />
                                                                                </motion.button>
                                                                            </div>
                                                                        </td>
                                                                    </motion.tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                )}

                                                {/* Add clinic button at bottom */}
                                                <div className="px-6 py-3 border-t border-gray-50 flex items-center justify-between">
                                                    <button
                                                        onClick={() => openAddForDoctor(group.doctor.doctor_id)}
                                                        className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 inline-flex items-center gap-1 transition-colors"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" /> Add Clinic for Dr. {group.doctor.doctor_name}
                                                    </button>
                                                    {actual > defined && defined > 0 && (
                                                        <span className="text-[10px] text-orange-500 font-medium">
                                                            Exceeded by {actual - defined} — doctor&apos;s num_clinics synced to {actual}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </GlassCard>
                        </motion.div>
                    );
                })}

                {/* Unassigned clinics */}
                {unassigned.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                        <GlassCard>
                            <div className="px-6 py-4">
                                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                                    <Building2 className="w-5 h-5 text-gray-400" />
                                    Unassigned Clinics
                                    <span className="text-xs font-semibold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-md">{unassigned.length}</span>
                                </h3>
                            </div>
                            <div className="border-t border-gray-100 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-left text-xs text-gray-400 uppercase tracking-wider">
                                            <th className="px-6 py-3 font-semibold">Clinic Name</th>
                                            <th className="px-4 py-3 font-semibold">Location</th>
                                            <th className="px-4 py-3 font-semibold">Phone</th>
                                            <th className="px-4 py-3 font-semibold">Created</th>
                                            <th className="px-4 py-3 font-semibold">Status</th>
                                            <th className="px-4 py-3 font-semibold">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {unassigned.map((c) => (
                                            <tr key={c.clinic_id} className="border-t border-gray-50 hover:bg-gray-50/40">
                                                <td className="px-6 py-3 font-medium text-gray-800">{c.clinic_name || "—"}</td>
                                                <td className="px-4 py-3 text-gray-500">{c.location || "—"}</td>
                                                <td className="px-4 py-3 text-gray-500">{c.phone || "—"}</td>
                                                <td className="px-4 py-3 text-gray-500">{fmtDate(c.created_at)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${c.status === "ACTIVE" ? "bg-green-50 text-green-600 border-green-200" : "bg-red-50 text-red-500 border-red-200"}`}>
                                                        <span className={`w-2 h-2 rounded-full ${c.status === "ACTIVE" ? "bg-green-500" : "bg-red-500"}`} />
                                                        {c.status === "ACTIVE" ? "Active" : "Inactive"}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            onClick={() => handleGenerateBarcode(c.doctor_id, c.clinic_id)}
                                                            className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                                            title="Generate Bar Code"
                                                        >
                                                            <QrCode size={14} />
                                                        </button>
                                                        <button
                                                            onClick={() => handleViewBarcode(c)}
                                                            disabled={!c.qr_storage_url}
                                                            className={`p-2 rounded-lg transition-colors ${c.qr_storage_url ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "cursor-not-allowed bg-gray-100 text-gray-300"}`}
                                                            title="View Bar Code"
                                                        >
                                                            <Eye size={14} />
                                                        </button>
                                                        <button onClick={() => openEdit(c)} className="p-2 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors"><Pencil size={14} /></button>
                                                        <button onClick={() => setDeleteClinic(c)} className="p-2 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"><Trash2 size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </GlassCard>
                    </motion.div>
                )}

                {/* Empty state */}
                {doctorGroups.length === 0 && unassigned.length === 0 && (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-200">
                            <Building2 className="w-10 h-10 text-gray-300" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-600">No clinics found</h3>
                        <p className="text-gray-400 mt-2 max-w-sm mx-auto">Get started by adding your first clinic.</p>
                    </div>
                )}
            </div>

            {/* ═══════ Add Clinic Modal ═══════ */}
            <AnimatePresence>
                {qrPreviewOpen && (
                    <>
                        <motion.div
                            className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => {
                                setQrPreviewOpen(false);
                                setQrPreviewClinic(null);
                                setQrPreviewImage("");
                                setQrPreviewError("");
                            }}
                        />
                        <motion.div
                            className="fixed inset-0 z-[80] flex items-center justify-center p-4"
                            initial={{ opacity: 0, scale: 0.96 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                        >
                            <div className="w-full max-w-sm rounded-3xl border border-indigo-100 bg-white p-6 shadow-2xl">
                                <div className="mb-4 flex items-start justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900">QR Preview</h3>
                                        <p className="mt-1 text-sm text-gray-500">
                                            {qrPreviewClinic?.clinic_name || "Clinic QR code"}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setQrPreviewOpen(false);
                                            setQrPreviewClinic(null);
                                            setQrPreviewImage("");
                                            setQrPreviewError("");
                                        }}
                                        className="rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                                        aria-label="Close QR preview"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-4">
                                    {qrPreviewLoading ? (
                                        <div className="flex flex-col items-center gap-3 text-sm text-gray-500">
                                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                                            Loading preview...
                                        </div>
                                    ) : qrPreviewError ? (
                                        <p className="text-center text-sm font-medium text-red-500">{qrPreviewError}</p>
                                    ) : qrPreviewImage ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={qrPreviewImage}
                                            alt={`${qrPreviewClinic?.clinic_name || "Clinic"} QR code preview`}
                                            className="h-auto max-h-64 w-full rounded-xl object-contain"
                                        />
                                    ) : (
                                        <p className="text-sm text-gray-500">Preview unavailable.</p>
                                    )}
                                </div>

                                <div className="mt-5 flex justify-end gap-3">
                                    <button
                                        onClick={() => {
                                            setQrPreviewOpen(false);
                                            setQrPreviewClinic(null);
                                            setQrPreviewImage("");
                                            setQrPreviewError("");
                                        }}
                                        className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                                    >
                                        Close
                                    </button>
                                    {qrPreviewMode === "generate" && (
                                        <a
                                            href={
                                                qrPreviewClinic?.doctor_id
                                                    ? `/api/qr/generate/download?doctor_id=${qrPreviewClinic.doctor_id}&clinic_id=${qrPreviewClinic.clinic_id}`
                                                    : "#"
                                            }
                                            className={`rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors ${qrPreviewClinic?.doctor_id ? "bg-indigo-600 hover:bg-indigo-700" : "pointer-events-none bg-indigo-300"}`}
                                        >
                                            Download
                                        </a>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
                {showAdd && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => { setShowAdd(false); setAddDoctorLocked(false); }} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div
                                className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
                                initial={{ scale: 0.92, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 30 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button onClick={() => { setShowAdd(false); setAddDoctorLocked(false); }} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
                                    <X size={20} />
                                </button>

                                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                                    <Building2 size={18} className="text-indigo-500" /> Add New Clinic
                                </h2>

                                {/* Show X/N info in popup if doctor is locked */}
                                {addDoctorLocked && addForm.doctor_id && (() => {
                                    const doc = allDoctors.find(d => d.doctor_id === Number(addForm.doctor_id));
                                    const docClinics = clinics.filter(c => c.doctor_id === Number(addForm.doctor_id)).length;
                                    const docDefined = doc?.num_clinics ?? 0;
                                    return (
                                        <p className="text-sm text-gray-400 mb-6">
                                            For Dr. {doc?.doctor_name} — currently {docClinics}/{docDefined} clinics created
                                            {docClinics >= docDefined && docDefined > 0 && (
                                                <span className="block text-orange-500 text-xs mt-1">
                                                    ⚠️ Adding will exceed the defined limit. Doctor&apos;s num_clinics will be updated.
                                                </span>
                                            )}
                                        </p>
                                    );
                                })()}
                                {!addDoctorLocked && (
                                    <p className="text-sm text-gray-400 mb-6">Create a new clinic and assign it to a doctor</p>
                                )}

                                <form onSubmit={handleAdd} className="space-y-5">
                                    {/* Doctor select — locked when opened from a doctor group */}
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Doctor *</label>
                                        {addDoctorLocked ? (
                                            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-800">
                                                <Stethoscope className="w-4 h-4 text-indigo-500" />
                                                Dr. {allDoctors.find(d => d.doctor_id === Number(addForm.doctor_id))?.doctor_name || "—"}
                                            </div>
                                        ) : (
                                            <select
                                                value={addForm.doctor_id}
                                                onChange={(e) => setAddForm({ ...addForm, doctor_id: e.target.value })}
                                                required
                                                className="input-field w-full"
                                            >
                                                <option value="">Choose a doctor…</option>
                                                {allDoctors.map(doc => (
                                                    <option key={doc.doctor_id} value={doc.doctor_id}>
                                                        Dr. {doc.doctor_name} {doc.specialization ? `(${doc.specialization})` : ""}
                                                    </option>
                                                ))}
                                            </select>
                                        )}
                                    </div>

                                    {/* Clinic name */}
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Clinic Name *</label>
                                        <input
                                            type="text"
                                            value={addForm.clinic_name}
                                            onChange={(e) => setAddForm({ ...addForm, clinic_name: e.target.value })}
                                            required
                                            className="input-field w-full"
                                            placeholder="e.g. City Health Center"
                                        />
                                    </div>

                                    {/* Location */}
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Location *</label>
                                        <input
                                            type="text"
                                            value={addForm.location}
                                            onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
                                            required
                                            className="input-field w-full"
                                            placeholder="Full address of the clinic"
                                        />
                                    </div>

                                    {/* Phone */}
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Phone Number</label>
                                        <input
                                            type="text"
                                            value={addForm.phone}
                                            onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                                            className="input-field w-full"
                                            placeholder="e.g. +91 98765 43210"
                                        />
                                    </div>

                                    {/* Status */}
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Status</label>
                                        <select
                                            value={addForm.status}
                                            onChange={(e) => setAddForm({ ...addForm, status: e.target.value })}
                                            className="input-field w-full"
                                        >
                                            <option value="ACTIVE">Active</option>
                                            <option value="INACTIVE">Inactive</option>
                                        </select>
                                    </div>

                                    {addError && (
                                        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{addError}</p>
                                    )}

                                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                                        <PremiumButton type="button" variant="ghost" onClick={() => { setShowAdd(false); setAddDoctorLocked(false); }}>Cancel</PremiumButton>
                                        <PremiumButton type="submit" disabled={addSubmitting}>
                                            {addSubmitting ? "Saving…" : "Save Clinic"}
                                        </PremiumButton>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══════ Edit Clinic Modal ═══════ */}
            <AnimatePresence>
                {editClinic && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setEditClinic(null)} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div
                                className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl sm:p-8"
                                initial={{ scale: 0.92, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.92, y: 30 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button onClick={() => setEditClinic(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors">
                                    <X size={20} />
                                </button>

                                <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
                                    <Pencil size={18} className="text-indigo-500" /> Edit Clinic
                                </h2>
                                <p className="text-sm text-gray-400 mb-6">{editClinic.clinic_name}</p>

                                <form onSubmit={handleEdit} className="space-y-5">
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Clinic Name *</label>
                                        <input type="text" value={editForm.clinic_name}
                                            onChange={(e) => setEditForm({ ...editForm, clinic_name: e.target.value })}
                                            required className="input-field w-full" placeholder="Clinic name" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Location *</label>
                                        <input type="text" value={editForm.location}
                                            onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                                            required className="input-field w-full" placeholder="Full address" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Phone Number</label>
                                        <input type="text" value={editForm.phone}
                                            onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                            className="input-field w-full" placeholder="+91 98765 43210" />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-sm font-medium text-gray-700">Status</label>
                                        <select value={editForm.status}
                                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                            className="input-field w-full">
                                            <option value="ACTIVE">Active</option>
                                            <option value="INACTIVE">Inactive</option>
                                        </select>
                                    </div>

                                    {editError && (
                                        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{editError}</p>
                                    )}

                                    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
                                        <PremiumButton type="button" variant="ghost" onClick={() => setEditClinic(null)}>Cancel</PremiumButton>
                                        <PremiumButton type="submit" disabled={editSubmitting}>
                                            {editSubmitting ? "Saving…" : "Update Clinic"}
                                        </PremiumButton>
                                    </div>
                                </form>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══════ Delete Confirmation Modal ═══════ */}
            <AnimatePresence>
                {deleteClinic && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setDeleteClinic(null)} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center relative"
                                initial={{ scale: 0.88, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 20 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                                    <AlertTriangle size={26} className="text-red-500" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Clinic?</h3>
                                <p className="text-sm text-gray-500 mb-6">
                                    Are you sure you want to delete <span className="font-semibold text-gray-700">{deleteClinic.clinic_name}</span>? This action cannot be undone.
                                </p>
                                <div className="flex flex-col gap-3 sm:flex-row">
                                    <button onClick={() => setDeleteClinic(null)} className="flex-1 btn-secondary">Cancel</button>
                                    <button onClick={handleDelete} className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-xl py-2.5 transition-colors">
                                        Yes, Delete
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* ═══════ Status Toggle Confirmation Modal ═══════ */}
            <AnimatePresence>
                {statusClinic && (
                    <>
                        <motion.div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setStatusClinic(null)} />
                        <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            <motion.div
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center relative"
                                initial={{ scale: 0.88, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.88, y: 20 }}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${statusClinic.status === "INACTIVE" ? "bg-green-50" : "bg-orange-50"}`}>
                                    <Power size={26} className={statusClinic.status === "INACTIVE" ? "text-green-500" : "text-orange-500"} />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    {statusClinic.status === "INACTIVE" ? "Activate" : "Deactivate"} Clinic?
                                </h3>
                                <p className="text-sm text-gray-500 mb-6">
                                    Are you sure you want to {statusClinic.status === "INACTIVE" ? "activate" : "deactivate"}{" "}
                                    <span className="font-semibold text-gray-700">{statusClinic.clinic_name}</span>?
                                </p>
                                <div className="flex gap-3">
                                    <button onClick={() => setStatusClinic(null)} className="flex-1 btn-secondary">Cancel</button>
                                    <button onClick={handleStatusToggle} disabled={statusToggling}
                                        className={`flex-1 font-semibold rounded-xl py-2.5 transition-colors text-white ${statusClinic.status === "INACTIVE"
                                            ? "bg-green-500 hover:bg-green-600"
                                            : "bg-orange-500 hover:bg-orange-600"
                                            }`}
                                    >
                                        {statusToggling ? "Processing…" : statusClinic.status === "INACTIVE" ? "Yes, Activate" : "Yes, Deactivate"}
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
