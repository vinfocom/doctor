"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
    LayoutDashboard,
    UserPlus,
    Users,
    Calendar,
    MonitorPlay,
    Clock,
    LogOut,
    Building2,
    Menu,
    X,
} from "lucide-react";

interface SidebarProps {
    role: "SUPER_ADMIN" | "ADMIN" | "DOCTOR" | "CLINIC_STAFF";
    userName: string;
    staffRole?: string | null;
}

export default function DashboardSidebar({ role, userName, staffRole }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [openPathname, setOpenPathname] = useState<string | null>(null);
    const isOpen = Boolean(pathname) && openPathname === pathname;
    const homeHref = role === "SUPER_ADMIN" || role === "ADMIN"
        ? "/dashboard/admin"
        : "/dashboard/doctor";

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    };

    const displayName = role === "DOCTOR" && userName
        ? (/^dr\.?\s/i.test(userName.trim()) ? userName.trim() : `Dr. ${userName.trim()}`)
        : userName;

    useEffect(() => {
        if (!isOpen) {
            document.body.style.overflow = "";
            return;
        }

        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    const links = {
        SUPER_ADMIN: [
            { href: "/dashboard/admin", label: "Overview", icon: <LayoutDashboard size={20} /> },
            { href: "/dashboard/admin/doctors", label: "Doctors", icon: <UserPlus size={20} /> },
            { href: "/dashboard/admin/patients", label: "Patients", icon: <Users size={20} /> },
            { href: "/dashboard/admin/clinics", label: "Clinics", icon: <Building2 size={20} /> },
            { href: "/dashboard/admin/appointments", label: "Appointments", icon: <Calendar size={20} /> },

        ],
        ADMIN: [
            { href: "/dashboard/admin", label: "Overview", icon: <LayoutDashboard size={20} /> },
            { href: "/dashboard/admin/doctors", label: "Doctors", icon: <UserPlus size={20} /> },
            { href: "/dashboard/admin/patients", label: "Patients", icon: <Users size={20} /> },
            { href: "/dashboard/admin/clinics", label: "Clinics", icon: <Building2 size={20} /> },
            { href: "/dashboard/admin/appointments", label: "Appointments", icon: <Calendar size={20} /> },

        ],
        CLINIC_STAFF: [
            { href: "/dashboard/doctor", label: "Overview", icon: <LayoutDashboard size={20} /> },
            { href: "/dashboard/doctor/appointments", label: "Appointments", icon: <Calendar size={20} /> },
            ...(staffRole === "HAVE_ACCESS"
                ? [{ href: "/dashboard/doctor/live", label: "Live", icon: <MonitorPlay size={20} /> }]
                : []),
        ],
        DOCTOR: [
            { href: "/dashboard/doctor", label: "Overview", icon: <LayoutDashboard size={20} /> },

            { href: "/dashboard/doctor/clinics", label: "My Clinics", icon: <Building2 size={20} /> },
            { href: "/dashboard/doctor/schedule", label: "Schedule", icon: <Clock size={20} /> },
            { href: "/dashboard/doctor/appointments", label: "My Appointments", icon: <Calendar size={20} /> },
            { href: "/dashboard/doctor/live", label: "Live", icon: <MonitorPlay size={20} /> },
            { href: "/dashboard/doctor/live/ads", label: "Live Ads", icon: <MonitorPlay size={20} /> },
            { href: "/dashboard/doctor/patients", label: "Patients", icon: <Users size={20} /> },
            { href: "/dashboard/doctor/users", label: "Users", icon: <UserPlus size={20} /> },
            { href: "/dashboard/doctor/profile", label: "Profile", icon: <UserPlus size={20} /> },

        ],
    };

    const currentLinks = links[role] || [];

    const sidebarContent = (
        <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="mb-7 -mt-4 px-2 flex justify-between items-center">
                <Link href={homeHref} className="block" onClick={() => setOpenPathname(null)}>
                    <div className="flex items-center">
                        <Image
                            src="/logo.png"
                            alt="Dapto"
                            width={150}
                            height={60}
                            priority
                            className="h-auto w-[150px] object-contain"
                        />
                    </div>
                </Link>
                {/* Close button for mobile */}
                <button
                    type="button"
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenPathname(null);
                    }}
                    className="dashboard-mobile-close rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 min-[900px]:hidden"
                    aria-label="Close navigation"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-1">
                {currentLinks.map((link, i) => (
                    <motion.div
                        key={link.href}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 + i * 0.06, duration: 0.4 }}
                    >
                        <Link
                            href={link.href}
                            onClick={() => setOpenPathname(null)}
                            className={`sidebar-link ${pathname === link.href ? "active" : ""}`}
                        >
                            <span className="text-lg">{link.icon}</span>
                            <span>{link.label}</span>
                            {pathname === link.href && (
                                <motion.div
                                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-indigo-500"
                                    layoutId="activeIndicator"
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                />
                            )}
                        </Link>
                    </motion.div>
                ))}
            </nav>

            {/* User Section */}
            <div className="mt-auto pt-4 border-t border-gray-100">
                <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-xl bg-gray-50">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-sm font-bold text-white shadow-lg shadow-indigo-500/20">
                        {userName?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{displayName}</p>
                        <p className="text-[11px] text-gray-400 tracking-wide uppercase">{role.replace("_", " ")}</p>
                    </div>
                </div>
                <button
                    onClick={handleLogout}
                    className="sidebar-link w-full text-red-500/70 hover:text-red-600 hover:bg-red-50"
                >
                    <LogOut size={18} />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );

    return (
        <>
            {/* Mobile Menu Button - Fixed position, visible only on small screens */}
            <div className={`dashboard-mobile-toggle fixed left-3 top-3 z-50 sm:left-4 sm:top-4 min-[900px]:hidden ${isOpen ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"}`}>
                <button
                    type="button"
                    onClick={() => {
                        if (!pathname) return;
                        setOpenPathname(pathname);
                    }}
                    className="rounded-lg border border-gray-100 bg-white p-2 text-gray-700 shadow-md"
                    aria-label="Open navigation"
                >
                    <Menu size={24} />
                </button>
            </div>

            {/* Desktop Sidebar */}
            <motion.div
                className="dashboard-sidebar hidden min-[900px]:flex"
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5 }}
            >
                {sidebarContent}
            </motion.div>

            {/* Mobile Sidebar overlay */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setOpenPathname(null)}
                            className="dashboard-mobile-overlay fixed inset-0 bg-black z-40 min-[900px]:hidden"
                        />
                        {/* Drawer */}
                        <motion.div
                            initial={{ x: "-100%" }}
                            animate={{ x: 0 }}
                            exit={{ x: "-100%" }}
                            onClick={(event) => event.stopPropagation()}
                            className="dashboard-mobile-drawer fixed inset-y-0 left-0 z-[60] w-[280px] max-w-[85vw] overflow-y-auto bg-white p-6 min-[900px]:hidden"
                        >
                            {sidebarContent}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
