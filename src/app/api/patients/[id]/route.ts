export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

function normalizePhone(value: string | null | undefined) {
    return String(value || "").replace(/\D/g, "");
}

function phonesMatch(left: string | null | undefined, right: string | null | undefined) {
    const normalizedLeft = normalizePhone(left);
    const normalizedRight = normalizePhone(right);
    if (!normalizedLeft || !normalizedRight) return false;
    if (normalizedLeft === normalizedRight) return true;
    if (normalizedLeft.length >= 10 && normalizedRight.length >= 10) {
        return normalizedLeft.slice(-10) === normalizedRight.slice(-10);
    }
    return false;
}

async function getAuthorizedPatientScope(
    req: Request,
    patientId: number,
    appointmentId?: number | null
) {
    const session = await getSessionFromRequest(req);
    if (!session) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    const patient = await prisma.patients.findUnique({
        where: { patient_id: patientId },
        select: {
            patient_id: true,
            admin_id: true,
            doctor_id: true,
            phone: true,
        },
    });

    if (!patient) {
        return { error: NextResponse.json({ error: "Patient not found" }, { status: 404 }) };
    }

    if (session.role === "DOCTOR") {
        const doctor = await prisma.doctors.findUnique({
            where: { user_id: session.userId },
            select: { doctor_id: true, admin_id: true },
        });

        if (!doctor) {
            return { error: NextResponse.json({ error: "Doctor profile not found" }, { status: 404 }) };
        }

        if (doctor.admin_id !== patient.admin_id) {
            return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
        }

        if (appointmentId) {
            const appointment = await prisma.appointment.findFirst({
                where: {
                    appointment_id: appointmentId,
                    patient_id: patientId,
                    doctor_id: doctor.doctor_id,
                },
                select: { appointment_id: true },
            });

            if (!appointment) {
                return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
            }
        }

        return { patient };
    }

    if (session.role === "CLINIC_STAFF") {
        const staff = await prisma.clinic_staff.findUnique({
            where: { user_id: session.userId },
            select: {
                doctor_id: true,
                clinic_id: true,
                staff_role: true,
            },
        });

        if (!staff) {
            return { error: NextResponse.json({ error: "Staff profile not found" }, { status: 404 }) };
        }

        if (staff.staff_role === "VIEWER" || staff.staff_role === "Viewer") {
            return { error: NextResponse.json({ error: "Viewers cannot edit patient details" }, { status: 403 }) };
        }

        const appointmentWhere = appointmentId
            ? {
                appointment_id: appointmentId,
                patient_id: patientId,
                doctor_id: staff.doctor_id,
                ...(staff.clinic_id ? { clinic_id: staff.clinic_id } : {}),
            }
            : {
                patient_id: patientId,
                doctor_id: staff.doctor_id,
                ...(staff.clinic_id ? { clinic_id: staff.clinic_id } : {}),
            };

        const appointment = await prisma.appointment.findFirst({
            where: appointmentWhere,
            select: { appointment_id: true },
        });

        if (!appointment) {
            return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
        }

        return { patient };
    }

    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}

export async function PATCH(
    req: Request,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const patientId = Number(id);

        if (!Number.isFinite(patientId) || patientId <= 0) {
            return NextResponse.json({ error: "Invalid patient ID" }, { status: 400 });
        }

        const body = await req.json();
        const appointmentId = body?.appointment_id ? Number(body.appointment_id) : null;
        const session = await getSessionFromRequest(req);
        if (!session) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if ((session.role === "DOCTOR" || session.role === "CLINIC_STAFF") && !appointmentId) {
            return NextResponse.json({ error: "Appointment ID is required for patient edits" }, { status: 400 });
        }
        const scope = await getAuthorizedPatientScope(req, patientId, appointmentId);
        if (scope.error) return scope.error;

        const currentPatient = scope.patient;
        const profileUpdateData: Record<string, string | number | null> = {};

        if (body.full_name !== undefined) {
            const fullName = String(body.full_name).trim();
            if (!fullName) {
                return NextResponse.json({ error: "Patient name is required" }, { status: 400 });
            }
            profileUpdateData.full_name = fullName;
        }

        if (body.gender !== undefined) {
            const gender = String(body.gender || "").trim();
            profileUpdateData.gender = gender ? gender : null;
        }

        if (body.age !== undefined) {
            if (body.age === null || body.age === "") {
                profileUpdateData.age = null;
            } else {
                const ageNum = parseInt(String(body.age), 10);
                if (Number.isNaN(ageNum) || ageNum <= 0 || ageNum >= 150) {
                    return NextResponse.json({ error: "Age must be between 1 and 149" }, { status: 400 });
                }
                profileUpdateData.age = ageNum;
            }
        }

        let nextPhoneValue: string | null = null;
        let shouldUpdatePhone = false;
        if (body.phone !== undefined) {
            const normalizedPhone = normalizePhone(body.phone);
            if (!normalizedPhone) {
                return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
            }
            if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
                return NextResponse.json({ error: "Phone number must contain 10 to 15 digits" }, { status: 400 });
            }
            nextPhoneValue = normalizedPhone;
            shouldUpdatePhone = true;
        }

        if (!shouldUpdatePhone && Object.keys(profileUpdateData).length === 0) {
            return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
        }

        const updated = await prisma.$transaction(async (tx) => {
            let linkedPatientIds = [currentPatient.patient_id];

            if (shouldUpdatePhone && nextPhoneValue !== null) {
                const siblingPatients = await tx.patients.findMany({
                    where: { admin_id: currentPatient.admin_id },
                    select: {
                        patient_id: true,
                        phone: true,
                    },
                });

                linkedPatientIds = currentPatient.phone
                    ? siblingPatients
                        .filter((item) => phonesMatch(item.phone, currentPatient.phone))
                        .map((item) => item.patient_id)
                    : [currentPatient.patient_id];

                if (linkedPatientIds.length === 0) {
                    linkedPatientIds = [currentPatient.patient_id];
                }

                await tx.patients.updateMany({
                    where: {
                        patient_id: { in: linkedPatientIds },
                    },
                    data: {
                        phone: nextPhoneValue,
                    },
                });
            }

            if (Object.keys(profileUpdateData).length > 0) {
                await tx.patients.update({
                    where: { patient_id: currentPatient.patient_id },
                    data: profileUpdateData,
                });
            }

            const refreshedPatient = await tx.patients.findUnique({
                where: { patient_id: currentPatient.patient_id },
                select: {
                    patient_id: true,
                    full_name: true,
                    phone: true,
                    age: true,
                    gender: true,
                },
            });

            return {
                patient: refreshedPatient,
                linkedPatientIds,
            };
        });

        return NextResponse.json({
            patient: updated.patient,
            linked_patient_ids: updated.linkedPatientIds,
        });
    } catch (error) {
        console.error("Update patient error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
