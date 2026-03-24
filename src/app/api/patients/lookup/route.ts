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

export async function GET(req: Request) {
    try {
        const session = await getSessionFromRequest(req);
        if (!session || (session.role !== "DOCTOR" && session.role !== "ADMIN" && session.role !== "CLINIC_STAFF")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const phone = String(searchParams.get("phone") || "").trim();
        if (!phone) {
            return NextResponse.json({ patients: [] });
        }

        let adminId: number | undefined;
        if (session.role === "DOCTOR") {
            const doctor = await prisma.doctors.findUnique({
                where: { user_id: session.userId },
                select: { admin_id: true },
            });

            if (!doctor) {
                return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
            }

            adminId = doctor.admin_id;
        } else if (session.role === "ADMIN") {
            const admin = await prisma.admins.findUnique({
                where: { user_id: session.userId },
                select: { admin_id: true },
            });

            if (!admin) {
                return NextResponse.json({ error: "Admin profile not found" }, { status: 404 });
            }

            adminId = admin.admin_id;
        } else {
            const staff = await prisma.clinic_staff.findUnique({
                where: { user_id: session.userId },
                select: {
                    doctor_id: true,
                    doctors: {
                        select: {
                            admin_id: true,
                        },
                    },
                },
            });

            if (!staff || !staff.doctor_id || !staff.doctors?.admin_id) {
                return NextResponse.json({ error: "Staff profile not found" }, { status: 404 });
            }

            adminId = staff.doctors.admin_id;
        }

        const patients = await prisma.patients.findMany({
            where: {
                admin_id: adminId,
            },
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
            },
            orderBy: {
                patient_id: "desc",
            },
        });

        const uniquePatients = patients
            .filter((patient) => phonesMatch(patient.phone, phone))
            .filter((patient, index, items) => {
            const currentName = (patient.full_name || "").trim().toLowerCase();
            return items.findIndex((item) => (item.full_name || "").trim().toLowerCase() === currentName) === index;
            })
            .map(({ patient_id, full_name }) => ({ patient_id, full_name }));

        return NextResponse.json({ patients: uniquePatients });
    } catch (error) {
        console.error("Patient lookup error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
