"use client";

import { useState, useEffect } from "react";
import { PremiumTable } from "@/components/ui/PremiumTable";
import { PremiumButton } from "@/components/ui/PremiumButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { Loader2, RefreshCcw, Search } from "lucide-react";

interface Appointment {
    appointment_id: number;
    patient: {
        full_name: string;
        phone: string;
    } | null;
    doctor: {
        doctor_name: string;
    } | null;
    clinic: {
        clinic_name: string;
    } | null;
    status: string;
    created_at: string;
    slot: {
        slot_date: string;
        slot_time: string;
    } | null;
}

export default function AppointmentsPage() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        fetchAppointments();
    }, []);

    const fetchAppointments = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/appointments");
            if (res.ok) {
                const data = await res.json();
                setAppointments(data || []);
            } else {
                setError("Failed to fetch appointments");
            }
        } catch {
            setError("An error occurred while fetching appointments");
        } finally {
            setLoading(false);
        }
    };

    const columns = [
        {
            header: "Patient",
            accessorKey: (item: Appointment) => (
                <div>
                    <div className="font-medium text-gray-900">{item.patient?.full_name || "Unknown"}</div>
                    <div className="text-xs text-gray-400">{item.patient?.phone}</div>
                </div>
            )
        },
        {
            header: "Doctor/Clinic",
            accessorKey: (item: Appointment) => (
                <div>
                    <div className="font-medium text-indigo-600">{item.doctor?.doctor_name}</div>
                    <div className="text-xs text-gray-400">{item.clinic?.clinic_name}</div>
                </div>
            )
        },
        {
            header: "Date & Time",
            accessorKey: (item: Appointment) => (
                <div className="flex flex-col">
                    <span className="text-gray-700">
                        {item.slot?.slot_date ? new Date(item.slot.slot_date).toLocaleDateString() : 'N/A'}
                    </span>
                    <span className="text-xs text-gray-400">
                        {item.slot?.slot_time ? new Date(item.slot.slot_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </span>
                </div>
            )
        },
        {
            header: "Status",
            accessorKey: (item: Appointment) => {
                const colors: Record<string, string> = {
                    PENDING: "bg-amber-50 text-amber-600 border-amber-200",
                    CONFIRMED: "bg-emerald-50 text-emerald-600 border-emerald-200",
                    CANCELLED: "bg-red-50 text-red-600 border-red-200",
                    COMPLETED: "bg-indigo-50 text-indigo-600 border-indigo-200",
                };
                const statusColor = colors[item.status] || "bg-gray-50 text-gray-500";
                return (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
                        {item.status}
                    </span>
                );
            }
        },
    ];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold gradient-text">
                        Appointments
                    </h1>
                    <p className="text-gray-500 mt-2">View and manage patient appointments.</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search patients..."
                            className="input-field pl-10 w-64"
                        />
                    </div>
                    <PremiumButton variant="secondary" onClick={fetchAppointments} icon={RefreshCcw}>
                        Refresh
                    </PremiumButton>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-sm">
                    {error}
                </div>
            )}

            <GlassCard className="p-0 overflow-hidden border-0 bg-transparent shadow-none">
                {loading ? (
                    <div className="py-20 flex justify-center">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                    </div>
                ) : (
                    <PremiumTable
                        columns={columns}
                        data={appointments}
                    />
                )}
            </GlassCard>
        </div>
    );
}
