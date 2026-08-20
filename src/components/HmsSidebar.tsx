"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
    Building2,
    BarChart3,
    CalendarDays,
    LayoutDashboard,
    LogOut,
    Menu,
    MonitorPlay,
    PanelTop,
    Settings,
    Stethoscope,
    UserCircle,
    UserPlus,
    Users,
    X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { HmsStaffType, HospitalContext } from "@/lib/hms-auth";
import type { HmsFeatureFlags, HmsFeatureKey } from "@/lib/hms-feature-flags";

type HmsSidebarProps = {
    context: HospitalContext;
    featureFlags: HmsFeatureFlags;
    staffType?: HmsStaffType | null;
    accountLabel?: string | null;
    accountSubLabel?: string | null;
};

type HmsNavLink = {
    href: string;
    label: string;
    icon: typeof LayoutDashboard;
    feature?: HmsFeatureKey;
    staffType?: HmsStaffType;
};

const navByRole: Record<HospitalContext["role"], HmsNavLink[]> = {
    HOSPITAL_ADMIN: [
        { href: "/hms/hospital-admin", label: "Dashboard", icon: LayoutDashboard },
        { href: "/hms/hospital-admin/doctors", label: "Doctors", icon: Stethoscope },
        { href: "/hms/hospital-admin/staff", label: "Staff", icon: UserPlus },
        { href: "/hms/hospital-admin/reports", label: "Reports", icon: BarChart3 },
        { href: "/hms/hospital-admin/policy-settings", label: "Policy Settings", icon: Settings },
        { href: "/hms/hospital-admin/emr-layout", label: "EMR Layout", icon: PanelTop, feature: "emr_module" },
        { href: "/hms/hospital-admin/feature-flags", label: "Enabled Features", icon: Settings },
        { href: "/hms/hospital-admin/tv-display", label: "TV Display", icon: MonitorPlay, feature: "tv_display_module" },
        { href: "/hms/hospital-admin/ads", label: "Ads", icon: Building2, feature: "ads_module" },
        { href: "/hms/hospital-admin/profile", label: "Profile", icon: UserCircle },
    ],
    HOSPITAL_STAFF: [
        { href: "/hms/staff/new-registration", label: "New Registration", icon: LayoutDashboard, feature: "reception_module", staffType: "REGISTRATION" },
        { href: "/hms/staff/registrations", label: "Pre-registration Token", icon: CalendarDays, feature: "qr_temp_token_enabled", staffType: "REGISTRATION" },
        { href: "/hms/staff/visits", label: "Today's Visits", icon: CalendarDays, feature: "reception_module", staffType: "REGISTRATION" },
        { href: "/hms/staff/patients", label: "Patients", icon: Users, feature: "reception_module", staffType: "REGISTRATION" },
        { href: "/hms/staff/tv-display", label: "Live TV", icon: MonitorPlay, feature: "tv_display_module", staffType: "TV_DISPLAY" },
        { href: "/hms/staff/profile", label: "Profile", icon: UserCircle },
    ],
    DOCTOR: [
        { href: "/hms/doctor", label: "Queue", icon: LayoutDashboard },
        { href: "/hms/doctor/visits", label: "Visits", icon: CalendarDays },
        { href: "/hms/doctor/patients", label: "Patients", icon: Users },
        { href: "/hms/doctor/profile", label: "Profile", icon: UserCircle },
    ],
};

function isActive(pathname: string | null, href: string) {
    return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

function resolveActiveHref(pathname: string | null, links: HmsNavLink[]) {
    if (!pathname) return null;
    return links
        .filter((link) => isActive(pathname, link.href))
        .sort((left, right) => right.href.length - left.href.length)[0]?.href || null;
}

export default function HmsSidebar({ context, featureFlags, staffType, accountLabel, accountSubLabel }: HmsSidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [openPathname, setOpenPathname] = useState<string | null>(null);
    const isOpen = Boolean(pathname) && openPathname === pathname;
    const currentLinks = (navByRole[context.role] || []).filter((link) => {
        if (link.feature && !featureFlags[link.feature]) return false;
        if (context.role === "HOSPITAL_STAFF" && link.staffType && link.staffType !== staffType) return false;
        return true;
    });
    const activeHref = useMemo(() => resolveActiveHref(pathname, currentLinks), [pathname, currentLinks]);
    const initials = context.hospitalCode.slice(0, 2).toUpperCase();

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

    const handleLogout = async () => {
        await fetch("/api/hms/auth/logout", { method: "POST" });
        router.push("/login");
    };

    const sidebarContent = (
        <div className="flex h-full flex-col">
            <div className="mb-7 flex items-center justify-between">
                <Link href="/hms" onClick={() => setOpenPathname(null)} className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-black text-sm font-bold text-white">
                        {initials}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-black">{context.hospitalName}</p>
                        <p className="text-xs font-medium uppercase tracking-wide text-black">{context.role.replace("_", " ")}</p>
                    </div>
                </Link>
                <button
                    type="button"
                    onClick={() => setOpenPathname(null)}
                    className="dashboard-mobile-close rounded-lg p-2 text-black transition-colors hover:bg-black hover:text-white min-[900px]:hidden"
                    aria-label="Close navigation"
                >
                    <X size={22} />
                </button>
            </div>

            <nav className="flex-1 space-y-1">
                {currentLinks.map((link, index) => {
                    const Icon = link.icon;
                    const active = activeHref === link.href;

                    return (
                        <motion.div
                            key={link.href}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.04 + index * 0.04, duration: 0.25 }}
                        >
                            <Link
                                href={link.href}
                                onClick={() => setOpenPathname(null)}
                                className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                                    active
                                        ? "bg-black text-white"
                                        : "text-black hover:bg-black hover:text-white"
                                }`}
                            >
                                <Icon size={18} />
                                <span>{link.label}</span>
                            </Link>
                        </motion.div>
                    );
                })}
            </nav>

            <div className="mt-auto border-t border-black pt-4">
                <div className="mb-2 rounded-lg border border-black bg-white px-3 py-3">
                    <p className="truncate text-sm font-semibold text-black">{accountLabel || context.hospitalCode}</p>
                    <p className="text-xs text-black">{accountSubLabel || context.hospitalName}</p>
                </div>
                <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
                >
                    <LogOut size={18} />
                    <span>Logout</span>
                </button>
            </div>
        </div>
    );

    return (
        <>
            <div className={`dashboard-mobile-toggle fixed left-3 top-3 z-50 sm:left-4 sm:top-4 min-[900px]:hidden ${isOpen ? "pointer-events-none opacity-0" : "pointer-events-auto opacity-100"}`}>
                <button
                    type="button"
                    onClick={() => {
                        if (!pathname) return;
                        setOpenPathname(pathname);
                    }}
                    className="rounded-lg border border-black bg-white p-2 text-black shadow-md"
                    aria-label="Open navigation"
                >
                    <Menu size={23} />
                </button>
            </div>

            <motion.div
                className="dashboard-sidebar hidden min-[900px]:flex"
                initial={{ x: -16, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
            >
                {sidebarContent}
            </motion.div>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.5 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setOpenPathname(null)}
                            className="dashboard-mobile-overlay fixed inset-0 z-40 bg-black min-[900px]:hidden"
                        />
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
