export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";

type RelatedPatient = {
    patient_id: number;
    full_name?: string | null;
    phone: string | null;
    profile_type?: "SELF" | "OTHER" | null;
};

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

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;

        const patient = await prisma.patients.findUnique({
            where: { patient_id: patientId },
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
                doctor_id: true,
                admin_id: true,
                profile_type: true,
                age: true,
                gender: true,
            },
        });

        if (!patient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const relatedPatients = patient.phone
            ? await prisma.patients.findMany({
                where: { admin_id: patient.admin_id },
                select: {
                    patient_id: true,
                    full_name: true,
                    phone: true,
                    profile_type: true,
                },
                orderBy: { patient_id: "asc" },
            })
            : [patient];

        const phoneLinkedPatients = (relatedPatients as RelatedPatient[]).filter((item: RelatedPatient) =>
            phonesMatch(item.phone, patient.phone)
        );
        const groupedPatientIds = phoneLinkedPatients.map((item: RelatedPatient) => item.patient_id);
        const groupedPatientIdsSet = new Set(groupedPatientIds);

        const appointments = await prisma.appointment.findMany({
            where: {
                patient_id: groupedPatientIds.length > 0 ? { in: groupedPatientIds } : patientId,
                doctor_id: { not: null },
            },
            select: {
                patient_id: true,
                doctor_id: true,
                appointment_date: true,
                start_time: true,
                patient: {
                    select: {
                        profile_type: true,
                    },
                },
                doctor: {
                    select: {
                        doctor_id: true,
                        doctor_name: true,
                        phone: true,
                        specialization: true,
                        profile_pic_url: true,
                        status: true,
                    },
                },
            },
            orderBy: { created_at: "desc" },
        });

        const seen = new Set<number>();
        const doctors = [];
        for (const appt of appointments) {
            if (!appt.doctor_id || !appt.doctor || seen.has(appt.doctor_id)) continue;
            if (String(appt.doctor.status || "").toUpperCase() === "INACTIVE") continue;
            if (appt.patient_id != null && !groupedPatientIdsSet.has(appt.patient_id)) continue;
            seen.add(appt.doctor_id);
            doctors.push({
                ...appt.doctor,
                relation_type: appt.patient?.profile_type === "OTHER" ? "OTHER" : "SELF",
            });
        }

        const linked_profiles = phoneLinkedPatients.map((item: RelatedPatient) => ({
            patient_id: item.patient_id,
            full_name: item.full_name,
            profile_type: item.profile_type === "OTHER" ? "OTHER" : "SELF",
        }));

        return NextResponse.json({ patient, doctors, linked_profiles });
    } catch (error) {
        console.error("Patient me error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        console.log("[patient-profile] PATCH session", session);
        if (!session || session.role !== "PATIENT") {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const patientId = session.patientId ?? session.userId;
        const currentPatient = await prisma.patients.findUnique({
            where: { patient_id: patientId },
            select: {
                patient_id: true,
                admin_id: true,
                phone: true,
            },
        });

        if (!currentPatient) {
            return NextResponse.json({ error: "Patient not found" }, { status: 404 });
        }

        const body = await req.json();
        const { full_name, phone, age, gender, push_token } = body;
        console.log("[patient-profile] PATCH request body", {
            patientId,
            hasPushToken: push_token !== undefined,
            pushTokenPreview: push_token ? String(push_token).slice(0, 24) : null,
            keys: Object.keys(body || {}),
        });

        const updateData: Record<string, string | number | null> = {};
        if (full_name !== undefined) updateData.full_name = String(full_name).trim();
        if (phone !== undefined) updateData.phone = String(phone).trim();
        if (gender !== undefined) updateData.gender = String(gender).trim();
        if (push_token !== undefined) updateData.push_token = push_token ? String(push_token).trim() : null;
        if (age !== undefined && age !== null && age !== '') {
            const ageNum = parseInt(String(age), 10);
            if (!isNaN(ageNum) && ageNum > 0 && ageNum < 150) {
                updateData.age = ageNum;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
        }

        const nextPhoneValue =
            phone !== undefined ? String(phone).trim() : currentPatient.phone;

        const updated = await prisma.$transaction(async (tx) => {
            const updatedPatient = await tx.patients.update({
                where: { patient_id: patientId },
                data: updateData,
                select: {
                    patient_id: true,
                    full_name: true,
                    phone: true,
                    age: true,
                    gender: true,
                },
            });

            // A patient may have multiple linked rows under the same admin/phone
            // (for SELF/OTHER profiles). Keep push tokens in sync so doctor->patient
            // notifications still target the active device regardless of which
            // linked patient_id owns the appointment/chat thread.
            if (push_token !== undefined && nextPhoneValue) {
                const linkedPatients = await tx.patients.findMany({
                    where: { admin_id: currentPatient.admin_id },
                    select: {
                        patient_id: true,
                        phone: true,
                    },
                });

                const linkedPatientIds = (linkedPatients as RelatedPatient[])
                    .filter((item: RelatedPatient) => phonesMatch(item.phone, nextPhoneValue))
                    .map((item: RelatedPatient) => item.patient_id);

                if (linkedPatientIds.length > 1) {
                    await tx.patients.updateMany({
                        where: {
                            patient_id: { in: linkedPatientIds },
                        },
                        data: {
                            push_token: updateData.push_token as string | null,
                        },
                    });
                }

                console.log("[patient-profile] PATCH synced push token to linked patients", {
                    patientId,
                    linkedPatientIds,
                });
            }

            return updatedPatient;
        });
        console.log("[patient-profile] PATCH updated successfully", {
            patientId,
            updatedFields: Object.keys(updateData),
        });

        return NextResponse.json({ patient: updated });
    } catch (error) {
        console.error("Patient profile update error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
