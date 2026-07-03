import { getSession } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import prisma from "@/lib/prisma";
import { getDoctorEmrEnabled } from "@/lib/emrFeatureGate";
import { getClinicStaffAccessBlockReason, resolveEffectiveAssignedDoctorIds } from "@/lib/clinicStaffAccess";
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
    let assignedDoctorCount = 0;

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
                doctor_id: true,
                staff_role: true,
                status: true,
                valid_from: true,
                valid_to: true,
                clinics: {
                    select: {
                        hospital_group_code: true,
                    },
                },
                users: {
                    select: { name: true },
                },
                doctor_access: {
                    select: { doctor_id: true },
                },
            },
        });
        const blockReason = staff ? getClinicStaffAccessBlockReason(staff) : "Staff profile not found.";
        if (blockReason) {
            redirect(`/login?error=${encodeURIComponent(blockReason)}`);
        }
        staffRole = staff?.staff_role || null;
        assignedDoctorCount = staff ? (await resolveEffectiveAssignedDoctorIds(prisma, staff)).length : 0;
        userName = staff?.users?.name?.trim() || userName;
    }

    return (
        <div className="dashboard-layout">
            <DashboardSidebar
                role={session.role}
                userName={userName}
                staffRole={staffRole}
                emrPrescriptionEnabled={emrPrescriptionEnabled}
                assignedDoctorCount={assignedDoctorCount}
            />
            <div className="dashboard-main">
                {children}
            </div>
        </div>
    );
}
