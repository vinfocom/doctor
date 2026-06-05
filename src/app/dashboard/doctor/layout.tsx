import { getSession } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import prisma from "@/lib/prisma";
import { getDoctorEmrEnabled } from "@/lib/emrFeatureGate";
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
    const fallbackUserName = session.email?.split("@")[0] || (session.role === "DOCTOR" ? "Doctor" : "Staff");
    let userName = fallbackUserName;
    let staffRole: string | null = null;
    let emrPrescriptionEnabled = false;

    if (session.role === "DOCTOR") {
        const doctor = await prisma.doctors.findUnique({
            where: { user_id: session.userId },
            select: { doctor_id: true, doctor_name: true },
        });
        userName = doctor?.doctor_name?.trim() || userName;
        emrPrescriptionEnabled = doctor?.doctor_id
            ? await getDoctorEmrEnabled(doctor.doctor_id)
            : false;
    }

    if (session.role === "CLINIC_STAFF") {
        const staff = await prisma.clinic_staff.findUnique({
            where: { user_id: session.userId },
            select: {
                staff_role: true,
                users: {
                    select: { name: true },
                },
            },
        });
        staffRole = staff?.staff_role || null;
        userName = staff?.users?.name?.trim() || userName;
    }

    return (
        <div className="dashboard-layout">
            <DashboardSidebar
                role={session.role}
                userName={userName}
                staffRole={staffRole}
                emrPrescriptionEnabled={emrPrescriptionEnabled}
            />
            <div className="dashboard-main">
                {children}
            </div>
        </div>
    );
}
