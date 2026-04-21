"use client";

import React, { useState, useEffect } from "react";
import { Users, UserPlus, Search, Edit2, Trash2, MapPin, X, Save, Loader2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { PremiumTable } from "@/components/ui/PremiumTable";

interface StaffUser {
    staff_id: number;
    user_id: number;
    name: string;
    email: string;
    role: string;
    status: string;
    valid_from: string | null;
    valid_to: string | null;
    created_at: string;
    clinic_id: number | null;
    clinic_name: string | null;
    doctor_whatsapp_number?: string | null;
}

interface Clinic {
    clinic_id: number;
    clinic_name: string;
}

interface UserTableRow {
    id: number;
    username: string;
    email: string;
    role: string;
    status: string;
    clinic: string;
    validity: string;
    created_on: string;
    _raw: StaffUser;
}

export default function UsersViewPage() {
    const [users, setUsers] = useState<StaffUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [clinics, setClinics] = useState<Clinic[]>([]);

    // Edit modal state
    const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
    const [editForm, setEditForm] = useState({
        username: "",
        email: "",
        password: "",
        role: "VIEWER",
        status: "ACTIVE",
        clinic_id: "",
        is_limited: false,
        valid_from: "",
        valid_to: "",
        doctor_whatsapp_number: "",
    });
    const [showEditPassword, setShowEditPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState("");

    useEffect(() => {
        fetchUsers();
        fetchClinics();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/doctor/staff");
            if (res.ok) {
                const data = await res.json();
                setUsers(data.staff || []);
            } else {
                console.error("Failed to fetch staff");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchClinics = async () => {
        try {
            const res = await fetch("/api/clinics");
            if (res.ok) {
                const data = await res.json();
                setClinics(data.clinics || data || []);
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDelete = async (staffId: number) => {
        if (!confirm("Are you sure you want to delete this user?")) return;
        try {
            const res = await fetch(`/api/doctor/staff/${staffId}`, { method: "DELETE" });
            if (res.ok) {
                fetchUsers();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to delete user");
            }
        } catch (err) {
            console.error(err);
        }
    };

    const openEdit = (user: StaffUser) => {
        setEditingUser(user);
        setSaveError("");
        setEditForm({
            username: user.name || "",
            email: user.email || "",
            password: "",
            role: user.role || "VIEWER",
            status: user.status || "ACTIVE",
            clinic_id: user.clinic_id ? String(user.clinic_id) : "",
            is_limited: !!(user.valid_from || user.valid_to),
            valid_from: user.valid_from ? user.valid_from.split("T")[0] : "",
            valid_to: user.valid_to ? user.valid_to.split("T")[0] : "",
            doctor_whatsapp_number: user.doctor_whatsapp_number || "",
        });
    };

    const handleSaveEdit = async () => {
        if (!editingUser) return;
        setSaving(true);
        setSaveError("");
        try {
            const res = await fetch(`/api/doctor/staff/${editingUser.staff_id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editForm),
            });
            if (res.ok) {
                setEditingUser(null);
                fetchUsers();
            } else {
                const err = await res.json();
                setSaveError(err.error || "Failed to update user");
            }
        } catch {
            setSaveError("Something went wrong");
        } finally {
            setSaving(false);
        }
    };

    const columns = [
        { header: "USERNAME", accessorKey: "username" as const },
        { header: "EMAIL", accessorKey: "email" as const },
        { header: "CLINIC", accessorKey: "clinic" as const },
        { header: "ROLE", accessorKey: "role" as const },
        { header: "STATUS", accessorKey: "status" as const },
        { header: "VALIDITY", accessorKey: "validity" as const },
        { header: "CREATED ON", accessorKey: "created_on" as const },
        { header: "ACTIONS", accessorKey: "actions" as const },
    ];

    const filteredUsers = users.filter((user) => {
        const query = search.toLowerCase();
        const userName = user?.name || "";
        const userEmail = user?.email || "";
        const userRole = user?.role || "";
        const userStatus = user?.status || "ACTIVE";

        const matchesSearch = userName.toLowerCase().includes(query) || userEmail.toLowerCase().includes(query) || userRole.toLowerCase().includes(query);
        const matchesStatus = statusFilter === "all" || userStatus.toLowerCase() === statusFilter.toLowerCase();
        return matchesSearch && matchesStatus;
    });

    const data: UserTableRow[] = filteredUsers.map((user) => ({
        id: user.staff_id,
        username: user.name || "N/A",
        email: user.email || "N/A",
        role: user.role?.replace("_", " ") || "Unknown",
        status: user.status || "ACTIVE",
        clinic: user.clinic_name || "All Clinics",
        validity: (user.valid_from || user.valid_to)
            ? `${user.valid_from ? new Date(user.valid_from).toLocaleDateString() : "Start"} – ${user.valid_to ? new Date(user.valid_to).toLocaleDateString() : "End"}`
            : "No Limit",
        created_on: new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        _raw: user,
    }));

    return (
        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
            {/* Header */}
            <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-800">
                        <Users className="text-purple-600" /> View Users
                    </h1>
                    <p className="text-gray-500 mt-1">Manage clinic staff ({users.length} total)</p>
                </div>
                <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                    <button onClick={fetchUsers} className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm text-center">
                        Refresh
                    </button>
                    <Link href="/dashboard/doctor/users/add" className="px-4 py-2 flex items-center justify-center gap-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow-md text-sm transition-colors">
                        <UserPlus size={18} /> Add User
                    </Link>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 max-w-xl">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                        type="text"
                        placeholder="Search by name, email, or role..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all text-sm"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="w-full border border-gray-200 rounded-lg px-4 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-sm sm:w-auto"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                </select>
            </div>

            {/* Table */}
            {loading ? (
                <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-12 flex items-center justify-center">
                    <Loader2 className="animate-spin text-purple-600 w-8 h-8" />
                </div>
            ) : (
                <PremiumTable
                    columns={columns.map((col) => {
                        if (col.accessorKey === "status") {
                            return {
                                ...col,
                                accessorKey: (row: UserTableRow) => (
                                    <span className={`px-3 py-1 text-xs font-semibold rounded-full ${row.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                        {row.status}
                                    </span>
                                ),
                            };
                        }
                        if (col.accessorKey === "clinic") {
                            return {
                                ...col,
                                accessorKey: (row: UserTableRow) => (
                                    <span className="flex items-center gap-1.5 text-gray-600 bg-gray-50 px-2 py-1 rounded-md text-sm">
                                        <MapPin size={14} className="text-gray-400" />
                                        {row.clinic}
                                    </span>
                                ),
                            };
                        }
                        if (col.accessorKey === "actions") {
                            return {
                                ...col,
                                accessorKey: (row: UserTableRow) => (
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            onClick={() => openEdit(row._raw)}
                                            className="text-purple-600 hover:text-purple-800 p-1.5 hover:bg-purple-50 rounded-lg transition-colors"
                                            title="Edit user"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(row.id)}
                                            className="text-red-500 hover:text-red-700 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Delete user"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ),
                            };
                        }
                        return col;
                    })}
                    data={data}
                />
            )}

            {/* Edit Modal */}
            {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
                    <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl shadow-2xl p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-gray-800">Edit User</h2>
                            <button onClick={() => setEditingUser(null)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                <X size={18} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {/* Name */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                <input
                                    type="text"
                                    value={editForm.username}
                                    onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                />
                            </div>

                            {/* Email */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                <input
                                    type="email"
                                    value={editForm.email}
                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                                <div className="relative">
                                    <input
                                        type={showEditPassword ? "text" : "password"}
                                        value={editForm.password}
                                        onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                                        placeholder="Leave blank to keep current"
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowEditPassword((v) => !v)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-purple-600 transition-colors"
                                        aria-label={showEditPassword ? "Hide password" : "Show password"}
                                    >
                                        {showEditPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">Leave blank to keep existing password.</p>
                            </div>

                            {/* Role */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                                <select
                                    value={editForm.role}
                                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                >
                                    <option value="HAVE_ACCESS">Have Access</option>
                                    <option value="VIEWER">Viewer</option>
                                </select>
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                                <select
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                >
                                    <option value="ACTIVE">Active</option>
                                    <option value="INACTIVE">Inactive</option>
                                </select>
                            </div>

                            {/* Clinic */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Assigned Clinic</label>
                                <select
                                    value={editForm.clinic_id}
                                    onChange={(e) => setEditForm({ ...editForm, clinic_id: e.target.value })}
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                >
                                    <option value="">All Clinics</option>
                                    {clinics.map((c) => (
                                        <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Doctor WhatsApp Number</label>
                                <input
                                    type="tel"
                                    value={editForm.doctor_whatsapp_number}
                                    onChange={(e) => setEditForm({ ...editForm, doctor_whatsapp_number: e.target.value })}
                                    placeholder="+91 98765 43210"
                                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                />
                            </div>

                            {/* Limited Access Toggle */}
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="is_limited_edit"
                                    checked={editForm.is_limited}
                                    onChange={(e) => setEditForm({ ...editForm, is_limited: e.target.checked })}
                                    className="w-4 h-4 accent-purple-600"
                                />
                                <label htmlFor="is_limited_edit" className="text-sm font-medium text-gray-700">Set Validity Period</label>
                            </div>

                            {editForm.is_limited && (
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
                                        <input
                                            type="date"
                                            value={editForm.valid_from}
                                            onChange={(e) => setEditForm({ ...editForm, valid_from: e.target.value })}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
                                        <input
                                            type="date"
                                            value={editForm.valid_to}
                                            onChange={(e) => setEditForm({ ...editForm, valid_to: e.target.value })}
                                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                        />
                                    </div>
                                </div>
                            )}

                            {saveError && (
                                <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>
                            )}
                        </div>

                        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white rounded-lg flex items-center justify-center gap-2 text-sm transition-colors"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
