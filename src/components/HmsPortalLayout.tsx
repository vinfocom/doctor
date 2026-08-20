import { redirect } from "next/navigation";
import HmsSidebar from "@/components/HmsSidebar";
import { getHmsSession, getHmsStaffProfile, type HospitalContext } from "@/lib/hms-auth";
import { getHmsFeatureFlags } from "@/lib/hms-feature-flags";
import prisma from "@/lib/prisma";

type HmsPortalLayoutProps = {
    children: React.ReactNode;
    role: HospitalContext["role"];
};

type AccountSummary = {
    label: string;
    subLabel: string;
};

function formatDoctorName(name: string | null | undefined) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return "Doctor";
    return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

async function getAccountSummary(context: HospitalContext): Promise<AccountSummary> {
    if (context.role === "DOCTOR") {
        const rows = await prisma.$queryRawUnsafe<Array<{ doctor_id: number; doctor_name: string | null }>>(
            `
            SELECT doctor_id, doctor_name
            FROM doctors
            WHERE user_id = ?
              AND admin_id = ?
            LIMIT 1
            `,
            context.userId,
            context.adminId
        );
        const doctor = rows[0];
        return {
            label: formatDoctorName(doctor?.doctor_name),
            subLabel: context.hospitalName,
        };
    }

    if (context.role === "HOSPITAL_STAFF") {
        const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null; staff_id: number | null; staff_type: string | null }>>(
            `
            SELECT u.name, hs.staff_id, hs.staff_type
            FROM users u
            LEFT JOIN hospital_staff hs
              ON hs.user_id = u.user_id
             AND hs.hospital_id = ?
            WHERE u.user_id = ?
            LIMIT 1
            `,
            context.hospitalId,
            context.userId
        );
        const staff = rows[0];
        return {
            label: staff?.name || "Staff",
            subLabel: staff?.staff_type ? String(staff.staff_type).replace("_", " ") : context.hospitalName,
        };
    }

    const rows = await prisma.$queryRawUnsafe<Array<{ name: string | null }>>(
        `
        SELECT name
        FROM users
        WHERE user_id = ?
        LIMIT 1
        `,
        context.userId
    );

    return {
        label: rows[0]?.name || "Hospital Admin",
        subLabel: context.hospitalName,
    };
}

export default async function HmsPortalLayout({ children, role }: HmsPortalLayoutProps) {
    const session = await getHmsSession({ allowPasswordChange: true });

    if (!session) {
        redirect("/hms/login");
    }

    if (session.forcePasswordChange) {
        redirect("/hms/change-password");
    }

    if (session.hospitalContext.role !== role) {
        redirect("/hms");
    }

    const featureFlags = await getHmsFeatureFlags(session.hospitalContext.hospitalId);
    const staffProfile = session.hospitalContext.role === "HOSPITAL_STAFF"
        ? await getHmsStaffProfile(session.hospitalContext)
        : null;
    const accountSummary = await getAccountSummary(session.hospitalContext);

    return (
        <div className="dashboard-layout">
            <HmsSidebar
                context={session.hospitalContext}
                featureFlags={featureFlags}
                staffType={staffProfile?.staffType || null}
                accountLabel={accountSummary.label}
                accountSubLabel={accountSummary.subLabel}
            />
            <main className="dashboard-main">
                {children}
            </main>
        </div>
    );
}
