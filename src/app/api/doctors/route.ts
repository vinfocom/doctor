export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import bcrypt from "bcryptjs";

// GET: List doctors
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const adminId = searchParams.get("adminId");

        const where: Record<string, unknown> = {};
        if (adminId) where.admin_id = Number(adminId);

        const doctors = await prisma.doctors.findMany({
            where,
            include: {
                admin: {
                    select: {
                        admin_id: true,
                        user: {
                            select: { user_id: true, name: true, email: true },
                        },
                    },
                },
                user: {
                    select: { email: true },
                },
                schedules: true,
                whatsapp_numbers: true,
            },
        });
        const jsonSafe = <T,>(value: T): T =>
            JSON.parse(
                JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v))
            ) as T;

        const serializedDoctors = doctors.map(doc => ({
            ...doc,
            chat_id: doc.chat_id ? String(doc.chat_id) : null,
        }));

        return NextResponse.json({ doctors: jsonSafe(serializedDoctors) });
    } catch (error: any) {
        console.error("Get doctors error:", error);
        return NextResponse.json(
            { error: "Internal server error", details: error?.message || String(error) },
            { status: 500 }
        );
    }
}

// DELETE: Admin can delete a doctor
export async function DELETE(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const doctorId = searchParams.get("id");

        if (!doctorId) {
            return NextResponse.json({ error: "Doctor ID required" }, { status: 400 });
        }

        const doctor = await prisma.doctors.findUnique({
            where: { doctor_id: parseInt(doctorId) },
            select: { doctor_id: true, user_id: true },
        });

        if (!doctor) {
            return NextResponse.json({ error: "Doctor not found" }, { status: 404 });
        }

        // Delete in FK-safe order: tokens → doctor → user (so email is reusable)
        await prisma.$transaction(async (tx) => {
            // 1. Delete user_tokens for this user (FK on users)
            if (doctor.user_id) {
                await tx.user_tokens.deleteMany({ where: { user_id: doctor.user_id } });
            }
            // 2. Delete the doctor record
            await tx.doctors.delete({ where: { doctor_id: doctor.doctor_id } });
            // 3. Delete the linked user so email can be reused
            if (doctor.user_id) {
                await tx.users.delete({ where: { user_id: doctor.user_id } });
            }
        });

        return NextResponse.json({ message: "Doctor deleted successfully" });
    } catch (error) {
        console.error("Delete doctor error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

// PATCH: Update doctor details
export async function PATCH(req: NextRequest) {
    try {
        const session = await getSession();
        if (!session || (session.role !== "SUPER_ADMIN" && session.role !== "ADMIN")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await req.json();
        const {
            doctor_id, doctor_name, phone, whatsapp_number, specialization,
            gst_number, pan_number, address, registration_no, education, document_url,
            chat_id, telegram_userid, profile_pic_url, num_clinics, status, active_from, active_to,
            whatsapp_numbers, // array of { whatsapp_number: string }
            email, password, // newly added user credentials
        } = body;

        if (!doctor_id) {
            return NextResponse.json({ error: "doctor_id required" }, { status: 400 });
        }

        // Safely convert chat_id to BigInt; empty / non-numeric strings become null or ignored
        let chatIdValue: bigint | null | undefined = undefined;
        if (chat_id !== undefined) {
            const trimmed = String(chat_id).trim();
            if (trimmed === "" || trimmed === "null") {
                chatIdValue = null;
            } else if (/^-?\d+$/.test(trimmed)) {
                chatIdValue = BigInt(trimmed);
            }
        }

        const updated = await prisma.$transaction(async (tx) => {
            const doc = await tx.doctors.update({
                where: { doctor_id: Number(doctor_id) },
                data: {
                    ...(doctor_name !== undefined && { doctor_name }),
                    ...(phone !== undefined && { phone }),
                    ...(whatsapp_number !== undefined && { whatsapp_number }),
                    ...(specialization !== undefined && { specialization }),
                    ...(gst_number !== undefined && { gst_number: gst_number || null }),
                    ...(pan_number !== undefined && { pan_number: pan_number || null }),
                    ...(address !== undefined && { address: address || null }),
                    ...(registration_no !== undefined && { registration_no: registration_no || null }),
                    ...(education !== undefined && { education: education || null }),
                    ...(document_url !== undefined && { document_url: document_url || null }),
                    ...(chatIdValue !== undefined && { chat_id: chatIdValue }),
                    ...(telegram_userid !== undefined && { telegram_userid: telegram_userid || null }),
                    ...(profile_pic_url !== undefined && { profile_pic_url: profile_pic_url || null }),
                    ...(active_from !== undefined && { active_from: active_from ? new Date(active_from) : null }),
                    ...(active_to !== undefined && { active_to: active_to ? new Date(active_to) : null }),
                    ...(num_clinics !== undefined && { num_clinics: Number(num_clinics) || 0 }),
                    ...(status !== undefined && { status }),
                },
            });

            // Handle user credentials update using the doctor's user_id reference
            if (doc.user_id && (email !== undefined || (password !== undefined && password.trim() !== ""))) {
                const userUpdateData: Record<string, any> = {};
                // If email is explicitly provided and not empty
                if (email !== undefined && email.trim() !== "") {
                    userUpdateData.email = email;
                }
                // If password is provided and not empty
                if (password !== undefined && password.trim() !== "") {
                    userUpdateData.password = await bcrypt.hash(password, 10);
                }
                if (Object.keys(userUpdateData).length > 0) {
                    await tx.users.update({
                        where: { user_id: doc.user_id },
                        data: userUpdateData,
                    });
                }
            }

            // Replace whatsapp_numbers if provided
            if (Array.isArray(whatsapp_numbers)) {
                await tx.doctor_whatsapp_numbers.deleteMany({ where: { doctor_id: Number(doctor_id) } });
                if (whatsapp_numbers.length > 0) {
                    await tx.doctor_whatsapp_numbers.createMany({
                        data: whatsapp_numbers.map((wn: { whatsapp_number: string }, i: number) => ({
                            doctor_id: Number(doctor_id),
                            whatsapp_number: wn.whatsapp_number,
                            is_primary: i === 0,
                            chat_id: doc.chat_id ?? null,
                        })),
                    });
                }
            }
            if (chatIdValue !== undefined && !Array.isArray(whatsapp_numbers)) {
                await tx.doctor_whatsapp_numbers.updateMany({
                    where: { doctor_id: Number(doctor_id) },
                    data: { chat_id: chatIdValue },
                });
            }

            return doc;
        });

        // Re-fetch with whatsapp_numbers and user email included
        const full = await prisma.doctors.findUnique({
            where: { doctor_id: Number(doctor_id) },
            include: {
                whatsapp_numbers: true,
                user: { select: { email: true } },
            },
        });

        const jsonSafe = <T,>(value: T): T =>
            JSON.parse(
                JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v))
            ) as T;

        return NextResponse.json({
            message: "Doctor updated successfully",
            doctor: jsonSafe({ ...full, chat_id: full?.chat_id ? String(full.chat_id) : null }),
        });
    } catch (error) {
        console.error("Update doctor error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
