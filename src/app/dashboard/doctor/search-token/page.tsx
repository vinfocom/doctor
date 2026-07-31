import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getActiveDoctorWhere, getClinicStaffAccessBlockReason, resolveEffectiveAssignedDoctorIds } from "@/lib/clinicStaffAccess";
import SearchTokenClient from "./search-token-client";

function getTodayYmdInIst() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
    }).format(new Date());
}

export default async function SearchTokenPage() {
    const session = await getSession();

    if (!session || session.role !== "CLINIC_STAFF") {
        redirect("/dashboard/doctor");
    }

    const staff = await prisma.clinic_staff.findUnique({
        where: { user_id: session.userId },
        select: {
            staff_role: true,
            status: true,
            valid_from: true,
            valid_to: true,
            doctor_id: true,
            clinic_id: true,
            clinics: {
                select: {
                    hospital_group_code: true,
                },
            },
            doctor_access: {
                select: {
                    doctor_id: true,
                },
            },
        },
    });

    if (!staff) {
        redirect("/dashboard/doctor");
    }

    const blockReason = getClinicStaffAccessBlockReason(staff);
    if (blockReason) {
        redirect(`/login?error=${encodeURIComponent(blockReason)}`);
    }

    const hospitalGroupCode = String(staff.clinics?.hospital_group_code || "").trim().toUpperCase();
    if (hospitalGroupCode !== "NAH") {
        redirect("/dashboard/doctor");
    }

    const assignedDoctorIds = await resolveEffectiveAssignedDoctorIds(prisma, staff);
    const activeClinics = await prisma.clinics.findMany({
        where: {
            doctor_id: { in: assignedDoctorIds },
            status: "ACTIVE",
            hospital_group_code: "NAH",
            doctor: { is: getActiveDoctorWhere() },
        },
        select: {
            clinic_id: true,
            clinic_name: true,
            doctor_id: true,
            doctor: {
                select: {
                    doctor_id: true,
                    doctor_name: true,
                },
            },
        },
        orderBy: [{ doctor_id: "asc" }, { clinic_id: "asc" }],
    });

    const doctorOptions = Array.from(
        activeClinics.reduce((map, clinic) => {
            const doctorId = Number(clinic.doctor_id || 0);
            if (!doctorId || map.has(doctorId)) {
                return map;
            }

            map.set(doctorId, {
                doctor_id: doctorId,
                doctor_name: clinic.doctor?.doctor_name || `Doctor ${doctorId}`,
                clinic_id: Number(clinic.clinic_id),
                clinic_name: clinic.clinic_name || "Clinic",
            });
            return map;
        }, new Map<number, { doctor_id: number; doctor_name: string; clinic_id: number; clinic_name: string }>())
    ).map(([, value]) => value);

    const canCreateAppointments = !["VIEWER", "Viewer"].includes(String(staff.staff_role || "").trim());

    return (
        <SearchTokenClient
            canCreateAppointments={canCreateAppointments}
            doctorOptions={doctorOptions}
            todayYmd={getTodayYmdInIst()}
        />
    );
}
