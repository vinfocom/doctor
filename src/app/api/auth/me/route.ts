export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDoctorEmrEnabled } from "@/lib/emrFeatureGate";
import {
    getClinicStaffAccessBlockReason,
    getHospitalGroupCodesForDoctors,
    resolveEffectiveAssignedDoctorIds,
} from "@/lib/clinicStaffAccess";

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const user = await prisma.users.findUnique({
            where: { user_id: session.userId },
            select: {
                user_id: true,
                email: true,
                name: true,
                role: true,
                created_at: true,
                admin: {
                    select: {
                        admin_id: true,
                    },
                },
                clinic_staff: {
                    select: {
                        staff_id: true,
                        staff_role: true,
                        clinic_id: true,
                        doctor_id: true,
                        status: true,
                        valid_from: true,
                        valid_to: true,
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
                },
                doctor: {
                    select: {
                        doctor_id: true,
                        status: true,
                        active_from: true,
                        active_to: true,
                    },
                },
            },
        });

        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // For CLINIC_STAFF, include staff-specific role in the response
        const responseUser = {
            ...user,
            doctor_id: user.doctor?.doctor_id || null,
            staff_role: user.clinic_staff?.staff_role || null,
            staff_clinic_id: user.clinic_staff?.clinic_id || null,
            staff_doctor_id: user.clinic_staff?.doctor_id || null,
            assigned_doctor_ids: [] as number[],
            hospital_group_codes: [] as string[],
            emr_prescription_enabled: false,
        };

        if (responseUser.role === "CLINIC_STAFF" && user.clinic_staff) {
            const staffBlockReason = getClinicStaffAccessBlockReason(user.clinic_staff);
            if (staffBlockReason) {
                return NextResponse.json({ error: staffBlockReason }, { status: 403 });
            }

            responseUser.assigned_doctor_ids = await resolveEffectiveAssignedDoctorIds(prisma, user.clinic_staff);
            responseUser.hospital_group_codes = await getHospitalGroupCodesForDoctors(
                prisma,
                responseUser.assigned_doctor_ids
            );
        }

        // Block inactive/expired doctors (token might be old)
        if (responseUser.role === "DOCTOR") {
            const doctor = responseUser.doctor;
            if (doctor?.status === "INACTIVE") {
                return NextResponse.json({ error: "Your account has been deactivated. Please contact the administrator." }, { status: 403 });
            }
            const todayStr = new Date().toISOString().split("T")[0];
            if (doctor?.active_from) {
                const fromStr = new Date(doctor.active_from).toISOString().split("T")[0];
                if (fromStr > todayStr) {
                    return NextResponse.json({ error: "Your account access has not started yet." }, { status: 403 });
                }
            }
            if (doctor?.active_to) {
                const toStr = new Date(doctor.active_to).toISOString().split("T")[0];
                if (toStr < todayStr) {
                    return NextResponse.json({ error: "Your account access has expired." }, { status: 403 });
                }
            }

            responseUser.emr_prescription_enabled = doctor?.doctor_id
                ? await getDoctorEmrEnabled(doctor.doctor_id)
                : false;
        }

        return NextResponse.json({ user: responseUser });
    } catch (error) {
        console.error("Get me error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
