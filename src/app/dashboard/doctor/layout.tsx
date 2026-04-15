import { getSession } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import prisma from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function DoctorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSession();

    if (!session || (session.role !== "DOCTOR" && session.role !== "CLINIC_STAFF")) {
        redirect("/login");
    }
    const userName = session.email?.split("@")[0] || (session.role === "DOCTOR" ? "Doctor" : "Staff");
    let staffRole: string | null = null;

    if (session.role === "CLINIC_STAFF") {
        const staff = await prisma.clinic_staff.findUnique({
            where: { user_id: session.userId },
            select: { staff_role: true },
        });
        staffRole = staff?.staff_role || null;
    }

    return (
        <div className="dashboard-layout">
            <DashboardSidebar role={session.role} userName={userName} staffRole={staffRole} />
            <div className="dashboard-main">
                {children}
            </div>
        </div>
    );
}