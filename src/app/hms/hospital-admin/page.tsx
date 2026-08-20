import { redirect } from "next/navigation";
import { MonitorPlay, Settings, SlidersHorizontal, Stethoscope, UserPlus } from "lucide-react";
import HmsPortalOverview from "@/components/HmsPortalOverview";
import { getHmsSession } from "@/lib/hms-auth";
import prisma from "@/lib/prisma";

type AdminMetricRow = {
    doctors_count: bigint | number;
    staff_count: bigint | number;
    today_visits: bigint | number;
    pending_payments: bigint | number;
    waiting_visits: bigint | number;
};

function toNumber(value: bigint | number | null | undefined) {
    if (typeof value === "bigint") return Number(value);
    return Number(value || 0);
}

function todayYmd() {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export default async function HospitalAdminPage() {
    const session = await getHmsSession();

    if (!session || session.hospitalContext.role !== "HOSPITAL_ADMIN") {
        redirect("/hms");
    }

    const rows = await prisma.$queryRawUnsafe<AdminMetricRow[]>(
        `
        SELECT
            (SELECT COUNT(*) FROM hospital_doctors WHERE hospital_id = ?) AS doctors_count,
            (SELECT COUNT(*) FROM hospital_staff WHERE hospital_id = ?) AS staff_count,
            (SELECT COUNT(*) FROM visits WHERE hospital_id = ? AND visit_date = ?) AS today_visits,
            (SELECT COUNT(*) FROM visits WHERE hospital_id = ? AND visit_date = ? AND payment_status = 'PENDING') AS pending_payments,
            (SELECT COUNT(*) FROM visits WHERE hospital_id = ? AND visit_date = ? AND status = 'WAITING') AS waiting_visits
        `,
        session.hospitalContext.hospitalId,
        session.hospitalContext.hospitalId,
        session.hospitalContext.hospitalId,
        todayYmd(),
        session.hospitalContext.hospitalId,
        todayYmd(),
        session.hospitalContext.hospitalId,
        todayYmd()
    );
    const metrics = rows[0];

    return (
        <HmsPortalOverview
            eyebrow={session.hospitalContext.hospitalCode}
            title="Hospital Admin"
            metrics={[
                { label: "Doctors", value: String(toNumber(metrics?.doctors_count)) },
                { label: "Staff", value: String(toNumber(metrics?.staff_count)) },
                { label: "Today Visits", value: String(toNumber(metrics?.today_visits)) },
                { label: "Waiting", value: String(toNumber(metrics?.waiting_visits)) },
                { label: "Pending Payments", value: String(toNumber(metrics?.pending_payments)) },
            ]}
            actions={[
                { label: "Create doctor", icon: Stethoscope },
                { label: "Create staff", icon: UserPlus },
                { label: "Policy settings", icon: Settings },
                { label: "Feature flags", icon: SlidersHorizontal },
                { label: "TV display", icon: MonitorPlay },
            ]}
        />
    );
}
