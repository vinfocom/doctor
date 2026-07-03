import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { resolveAssignedDoctorIds } from "@/lib/clinicStaffAccess";

function isAdminRole(role?: string | null) {
    return role === "ADMIN" || role === "SUPER_ADMIN";
}

export async function GET(request: Request) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const clinics = await prisma.clinics.findMany({
            where: {
                hospital_group_code: {
                    not: null,
                },
            },
            include: {
                doctor: {
                    select: {
                        doctor_id: true,
                        doctor_name: true,
                        profile_pic_url: true,
                        specialization: true,
                        status: true,
                    },
                },
            },
            orderBy: [
                { hospital_group_code: "asc" },
                { clinic_name: "asc" },
                { clinic_id: "asc" },
            ],
        });

        const normalizedClinics = clinics.filter((clinic) => String(clinic.hospital_group_code || "").trim());
        const doctorIds = Array.from(
            new Set(
                normalizedClinics
                    .map((clinic) => Number(clinic.doctor_id || 0))
                    .filter((doctorId) => Number.isFinite(doctorId) && doctorId > 0)
            )
        );

        const staffMembers = doctorIds.length > 0
            ? await prisma.clinic_staff.findMany({
                where: {
                    OR: [
                        { doctor_id: { in: doctorIds } },
                        { doctor_access: { some: { doctor_id: { in: doctorIds } } } },
                    ],
                },
                include: {
                    users: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                    clinics: {
                        select: {
                            clinic_id: true,
                            clinic_name: true,
                            hospital_group_code: true,
                        },
                    },
                    doctor_access: {
                        select: {
                            doctor_id: true,
                        },
                    },
                },
                orderBy: { created_at: "desc" },
            })
            : [];

        const groupsMap = new Map<string, {
            hospital_group_code: string;
            display_name: string;
            clinics: Array<{
                clinic_id: number;
                clinic_name: string | null;
                location: string | null;
                phone: string | null;
                status: string | null;
                admin_id: number;
                doctor_id: number | null;
                created_at: Date | null;
                hospital_group_code: string | null;
                doctor: {
                    doctor_id: number;
                    doctor_name: string | null;
                    profile_pic_url: string | null;
                    specialization: string | null;
                    status: string | null;
                } | null;
            }>;
            doctors: Array<{
                doctor_id: number;
                doctor_name: string | null;
                profile_pic_url: string | null;
                specialization: string | null;
                status: string | null;
            }>;
            staff: Array<{
                staff_id: number;
                name: string | null;
                email: string | null;
                role: string;
                status: string;
                clinic_id: number | null;
                clinic_name: string | null;
                assigned_doctor_ids: number[];
            }>;
            warnings: string[];
        }>();

        for (const clinic of normalizedClinics) {
            const groupCode = String(clinic.hospital_group_code || "").trim();
            if (!groupsMap.has(groupCode)) {
                groupsMap.set(groupCode, {
                    hospital_group_code: groupCode,
                    display_name: clinic.clinic_name?.trim() || groupCode,
                    clinics: [],
                    doctors: [],
                    staff: [],
                    warnings: [],
                });
            }

            const group = groupsMap.get(groupCode)!;
            group.clinics.push(clinic);

            if (clinic.doctor && !group.doctors.some((doctor) => doctor.doctor_id === clinic.doctor?.doctor_id)) {
                group.doctors.push(clinic.doctor);
            }
        }

        for (const staff of staffMembers) {
            const assignedDoctorIds = resolveAssignedDoctorIds(staff);
            const relatedGroups = Array.from(
                new Set(
                    normalizedClinics
                        .filter((clinic) => clinic.doctor_id && assignedDoctorIds.includes(Number(clinic.doctor_id)))
                        .map((clinic) => String(clinic.hospital_group_code || "").trim())
                        .filter(Boolean)
                )
            );

            for (const groupCode of relatedGroups) {
                const group = groupsMap.get(groupCode);
                if (!group) continue;
                if (group.staff.some((item) => item.staff_id === staff.staff_id)) continue;

                group.staff.push({
                    staff_id: staff.staff_id,
                    name: staff.users?.name || null,
                    email: staff.users?.email || null,
                    role: staff.staff_role,
                    status: staff.status,
                    clinic_id: staff.clinic_id,
                    clinic_name: staff.clinics?.clinic_name || null,
                    assigned_doctor_ids: assignedDoctorIds,
                });
            }
        }

        const hospitals = Array.from(groupsMap.values())
            .map((group) => {
                const adminIds = new Set(group.clinics.map((clinic) => Number(clinic.admin_id)).filter(Boolean));
                const phones = new Set(group.clinics.map((clinic) => String(clinic.phone || "").trim()).filter(Boolean));
                const locations = new Set(group.clinics.map((clinic) => String(clinic.location || "").trim().toLowerCase()).filter(Boolean));

                const warnings: string[] = [];
                if (adminIds.size > 1) {
                    warnings.push("This group code is used across multiple admins.");
                }
                if (phones.size > 1) {
                    warnings.push("Clinics in this group have different phone numbers.");
                }
                if (locations.size > 1) {
                    warnings.push("Clinics in this group have different locations.");
                }

                return {
                    ...group,
                    warnings,
                    clinics: group.clinics.sort((left, right) =>
                        String(left.clinic_name || "").localeCompare(String(right.clinic_name || ""))
                    ),
                    doctors: group.doctors.sort((left, right) =>
                        String(left.doctor_name || "").localeCompare(String(right.doctor_name || ""))
                    ),
                    staff: group.staff.sort((left, right) =>
                        String(left.name || left.email || "").localeCompare(String(right.name || right.email || ""))
                    ),
                };
            })
            .sort((left, right) => left.display_name.localeCompare(right.display_name));

        return NextResponse.json({ hospitals });
    } catch (error) {
        console.error("Get hospitals error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await getSessionFromRequest(request);
        if (!session || !isAdminRole(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();
        const action = typeof body?.action === "string" ? body.action : "";

        if (action === "assign_staff_doctors") {
            const staffId = Number(body?.staff_id);
            const groupCode = typeof body?.hospital_group_code === "string"
                ? body.hospital_group_code.trim()
                : "";
            const requestedDoctorIds: number[] = Array.isArray(body?.doctor_ids)
                ? Array.from(
                    new Set<number>(
                        body.doctor_ids
                            .map((value: unknown) => Number(value))
                            .filter((value: number) => Number.isFinite(value) && value > 0)
                    )
                )
                : [];

            if (!staffId || !groupCode || requestedDoctorIds.length === 0) {
                return NextResponse.json({ error: "Staff, hospital group, and at least one doctor are required." }, { status: 400 });
            }

            const groupDoctorRows = await prisma.clinics.findMany({
                where: {
                    hospital_group_code: groupCode,
                    doctor_id: { not: null },
                },
                select: {
                    doctor_id: true,
                },
            });

            const allowedDoctorIds = Array.from(
                new Set(
                    groupDoctorRows
                        .map((clinic) => Number(clinic.doctor_id || 0))
                        .filter((doctorId) => Number.isFinite(doctorId) && doctorId > 0)
                )
            );
            const invalidDoctorIds = requestedDoctorIds.filter((doctorId) => !allowedDoctorIds.includes(doctorId));

            if (invalidDoctorIds.length > 0) {
                return NextResponse.json({ error: "Selected doctors must belong to this hospital group." }, { status: 400 });
            }

            const staff = await prisma.clinic_staff.findUnique({
                where: { staff_id: staffId },
                select: {
                    staff_id: true,
                    doctor_id: true,
                    doctor_access: {
                        select: {
                            doctor_id: true,
                        },
                    },
                },
            });

            if (!staff) {
                return NextResponse.json({ error: "Staff not found." }, { status: 404 });
            }

            const currentlyRelatedDoctorIds = resolveAssignedDoctorIds(staff);
            const isStaffInGroup = currentlyRelatedDoctorIds.some((doctorId) => allowedDoctorIds.includes(doctorId));

            if (!isStaffInGroup) {
                return NextResponse.json({ error: "This staff is not associated with the selected hospital group." }, { status: 403 });
            }

            const finalDoctorIds = Array.from(
                new Set([
                    ...requestedDoctorIds,
                    ...(allowedDoctorIds.includes(staff.doctor_id) ? [staff.doctor_id] : []),
                ])
            );

            await prisma.$transaction(async (tx) => {
                await tx.clinic_staff_doctor_access.deleteMany({
                    where: { staff_id: staffId },
                });

                await tx.clinic_staff_doctor_access.createMany({
                    data: finalDoctorIds.map((doctorId) => ({
                        staff_id: staffId,
                        doctor_id: doctorId,
                    })),
                    skipDuplicates: true,
                });
            });

            return NextResponse.json({ success: true });
        }

        const clinicIds = Array.isArray(body?.clinic_ids)
            ? body.clinic_ids.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value) && value > 0)
            : [];
        const nextGroupCode = typeof body?.hospital_group_code === "string"
            ? body.hospital_group_code.trim()
            : "";

        if (clinicIds.length === 0) {
            return NextResponse.json({ error: "At least one clinic must be selected." }, { status: 400 });
        }

        await prisma.clinics.updateMany({
            where: {
                clinic_id: { in: clinicIds },
            },
            data: {
                hospital_group_code: nextGroupCode || null,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Update hospital grouping error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
