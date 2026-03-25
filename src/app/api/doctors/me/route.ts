
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/jwt";
import { cookies } from "next/headers";

function jsonSafe<T>(value: T): T {
    return JSON.parse(
        JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v))
    ) as T;
}

export async function GET(req: Request) {
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;

    if (!token) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Find doctor profile linked to this user
        // Note: user.id is verified, but we need to check if they have a doctor profile
        const doctor = await prisma.doctors.findUnique({
            where: { user_id: user.userId },
            include: {
                admin: {
                    select: {
                        user: {
                            select: {
                                email: true
                            }
                        }
                    }
                },
            }
        });

        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        const [clinics, whatsappNumbers] = await Promise.all([
            prisma.clinics.findMany({
                where: { doctor_id: doctor.doctor_id },
                include: {
                    schedules: {
                        orderBy: [
                            { day_of_week: "asc" },
                            { start_time: "asc" },
                        ],
                    },
                },
                orderBy: { clinic_name: "asc" },
            }),
            prisma.doctor_whatsapp_numbers.findMany({
                where: { doctor_id: doctor.doctor_id },
                orderBy: [{ is_primary: "desc" }, { id: "asc" }],
            }),
        ]);

        return NextResponse.json({
            doctor: jsonSafe({
                ...doctor,
                clinics,
                whatsapp_numbers: whatsappNumbers,
            }),
        });
    } catch (error) {
        console.error("Error fetching doctor profile:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    const cookieStore = await cookies();
    let token = cookieStore.get("token")?.value;

    if (!token) {
        const authHeader = req.headers.get("Authorization");
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }
    }

    if (!token) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const {
            doctor_name,
            phone,
            whatsapp_number,
            specialization,
            whatsapp_numbers,
            chat_id,
            telegram_userid,
            gst_number,
            pan_number,
            address,
            registration_no,
            education,
            document_url,
            profile_pic_url,
            push_token,
        } = body;
        console.log("[doctor-profile] PATCH request body", {
            userId: user.userId,
            hasPushToken: push_token !== undefined,
            pushTokenPreview: push_token ? String(push_token).slice(0, 24) : null,
            keys: Object.keys(body || {}),
        });

        // Ensure doctor exists for this user
        const doctor = await prisma.doctors.findUnique({
            where: { user_id: user.userId }
        });

        if (!doctor) {
            return NextResponse.json({ error: "Doctor profile not found" }, { status: 404 });
        }

        // Safely convert chat_id to BigInt – empty / non-numeric strings become null
        let chatIdValue: bigint | null | undefined = undefined;
        if (chat_id !== undefined) {
            const trimmed = String(chat_id).trim();
            if (trimmed === "" || trimmed === "null") {
                chatIdValue = null;
            } else if (/^-?\d+$/.test(trimmed)) {
                chatIdValue = BigInt(trimmed);
            } else {
                // non-numeric – keep existing value untouched
                chatIdValue = undefined;
            }
        }

        // Build update payload – only include fields that were sent in the request
        // so we never accidentally overwrite DB values with undefined
        const updateData: Record<string, unknown> = {};
        if (doctor_name !== undefined) updateData.doctor_name = doctor_name;
        if (phone !== undefined) updateData.phone = phone;
        if (whatsapp_number !== undefined) updateData.whatsapp_number = whatsapp_number;
        if (specialization !== undefined) updateData.specialization = specialization;
        if (gst_number !== undefined) updateData.gst_number = gst_number;
        if (pan_number !== undefined) updateData.pan_number = pan_number;
        if (address !== undefined) updateData.address = address;
        if (registration_no !== undefined) updateData.registration_no = registration_no;
        if (education !== undefined) updateData.education = education;
        if (document_url !== undefined) updateData.document_url = document_url;
        if (profile_pic_url !== undefined) updateData.profile_pic_url = profile_pic_url;
        if (chatIdValue !== undefined) updateData.chat_id = chatIdValue;
        if (telegram_userid !== undefined) updateData.telegram_userid = telegram_userid;
        if (push_token !== undefined) updateData.push_token = push_token;

        const result = await prisma.$transaction(async (tx) => {
            const updatedDoctor = await tx.doctors.update({
                where: { doctor_id: doctor.doctor_id },
                data: updateData,
            });

            // Handle multiple whatsapp numbers
            if (Array.isArray(whatsapp_numbers)) {
                await tx.doctor_whatsapp_numbers.deleteMany({
                    where: { doctor_id: doctor.doctor_id }
                });

                if (whatsapp_numbers.length > 0) {
                    await tx.doctor_whatsapp_numbers.createMany({
                        data: whatsapp_numbers
                            .filter((w: any) => w.whatsapp_number?.trim())
                            .map((w: any) => ({
                                doctor_id: doctor.doctor_id,
                                whatsapp_number: w.whatsapp_number.trim(),
                                is_primary: w.is_primary || false,
                                chat_id: updatedDoctor.chat_id ?? null,
                            }))
                    });
                }
            }
            if (chatIdValue !== undefined && !Array.isArray(whatsapp_numbers)) {
                await tx.doctor_whatsapp_numbers.updateMany({
                    where: { doctor_id: doctor.doctor_id },
                    data: { chat_id: chatIdValue },
                });
            }

            return updatedDoctor;
        });
        console.log("[doctor-profile] PATCH updated successfully", {
            doctorId: doctor.doctor_id,
            updatedFields: Object.keys(updateData),
        });

        return NextResponse.json({ doctor: jsonSafe(result) });
    } catch (error) {
        console.error("Error updating doctor profile:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
