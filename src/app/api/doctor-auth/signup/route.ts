export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { validateLoginChallengeProof } from "@/lib/loginChallenge";

const DEFAULT_DOCTOR_ADMIN_ID = 1;

function normalizeEmail(value: unknown) {
    return String(value || "").trim().toLowerCase();
}

function normalizeText(value: unknown) {
    return String(value || "").trim();
}

function sanitizePhone(value: unknown) {
    return String(value || "").replace(/[^\d+]/g, "").trim();
}

function normalizeClinicCount(value: unknown) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.floor(parsed));
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        const email = normalizeEmail(body?.email);
        const password = String(body?.password || "");
        const confirmPassword = String(body?.confirmPassword || "");
        const doctor_name = normalizeText(body?.doctor_name);
        const phone = sanitizePhone(body?.phone);
        const num_clinics = normalizeClinicCount(body?.num_clinics);
        const whatsapp_number = sanitizePhone(body?.whatsapp_number);
        const specialization = normalizeText(body?.specialization);
        const registration_no = normalizeText(body?.registration_no);
        const education = normalizeText(body?.education);
        const document_url = normalizeText(body?.document_url);
        const profile_pic_url = normalizeText(body?.profile_pic_url);
        const address = normalizeText(body?.address);
        const gst_number = normalizeText(body?.gst_number);
        const pan_number = normalizeText(body?.pan_number);
        const challengeId = normalizeText(body?.challengeId);
        const challengeVerificationToken = normalizeText(body?.challengeVerificationToken);

        if (
            !email ||
            !password ||
            !confirmPassword ||
            !doctor_name ||
            !phone ||
            !whatsapp_number ||
            !specialization ||
            !registration_no ||
            !education ||
            !document_url ||
            !address ||
            !challengeId ||
            !challengeVerificationToken
        ) {
            return NextResponse.json(
                {
                    error:
                        "Email, password, confirm password, doctor name, phone, WhatsApp number, specialization, registration number, education, degree document, address, and verified calculation are required",
                },
                { status: 400 }
            );
        }

        if (password !== confirmPassword) {
            return NextResponse.json(
                { error: "Password and confirm password must match" },
                { status: 400 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters long" },
                { status: 400 }
            );
        }

        const challengeResult = validateLoginChallengeProof(
            challengeId,
            challengeVerificationToken
        );
        if (!challengeResult.ok) {
            const message =
                challengeResult.reason === "expired"
                    ? "Calculation expired. Please generate a new one."
                    : "Please verify the calculation before signing up.";

            return NextResponse.json({ error: message }, { status: 400 });
        }

        const admin = await prisma.admins.findUnique({
            where: { admin_id: DEFAULT_DOCTOR_ADMIN_ID },
            select: { admin_id: true },
        });

        if (!admin) {
            return NextResponse.json(
                { error: "Default admin_id 1 was not found. Please create that admin first." },
                { status: 400 }
            );
        }

        const existingUser = await prisma.users.findUnique({
            where: { email },
            select: { user_id: true },
        });
        if (existingUser) {
            return NextResponse.json(
                { error: "A user with this email already exists" },
                { status: 409 }
            );
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const whatsappNumbers = Array.isArray(body?.whatsapp_numbers)
            ? body.whatsapp_numbers
                .map((item: unknown) =>
                    typeof item === "string"
                        ? sanitizePhone(item)
                        : sanitizePhone((item as { whatsapp_number?: unknown })?.whatsapp_number)
                )
                .filter(Boolean)
            : [];

        const result = await prisma.$transaction(async (tx) => {
            const user = await tx.users.create({
                data: {
                    email,
                    password: hashedPassword,
                    name: doctor_name,
                    role: "DOCTOR",
                },
            });

            const doctor = await tx.doctors.create({
                data: {
                    admin_id: admin.admin_id,
                    user_id: user.user_id,
                    doctor_name,
                    phone,
                    whatsapp_number,
                    specialization,
                    registration_no,
                    education,
                    document_url,
                    profile_pic_url: profile_pic_url || null,
                    address,
                    gst_number,
                    pan_number,
                    status: "INACTIVE",
                    username: email.split("@")[0] || `doctor_${user.user_id}`,
                    chat_id: null,
                    num_clinics,
                },
                select: {
                    doctor_id: true,
                    user_id: true,
                    admin_id: true,
                    doctor_name: true,
                    phone: true,
                    whatsapp_number: true,
                    specialization: true,
                    registration_no: true,
                    education: true,
                    document_url: true,
                    profile_pic_url: true,
                    address: true,
                    gst_number: true,
                    pan_number: true,
                    status: true,
                },
            });

            await tx.doctor_whatsapp_numbers.createMany({
                data: (whatsappNumbers.length > 0 ? whatsappNumbers : [whatsapp_number]).map((number: string, index: number) => ({
                    doctor_id: doctor.doctor_id,
                    whatsapp_number: number,
                    is_primary: index === 0,
                    chat_id: null,
                })),
            });

            return { user, doctor };
        });

        return NextResponse.json(
            {
                message: "Profile submitted successfully. We will review your profile.",
                review_required: true,
                user: {
                    id: result.user.user_id,
                    email: result.user.email,
                    name: result.user.name,
                    role: result.user.role,
                },
                doctor: result.doctor,
            },
            { status: 201 }
        );
    } catch (error) {
        console.error("Doctor signup error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
