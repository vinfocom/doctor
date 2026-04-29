export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { generateToken } from "@/lib/jwt";
import { validateLoginChallengeProof } from "@/lib/loginChallenge";

const DEFAULT_PATIENT_ADMIN_ID = 1;

type SignupPatientRow = {
    patient_id: number;
    full_name: string | null;
    phone: string | null;
    doctor_id: number | null;
    admin_id: number;
    booking_id: number | null;
    profile_type: "SELF" | "OTHER";
    age: number | null;
    gender: string | null;
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

async function findSelfPatientByPhone(phone: string): Promise<SignupPatientRow | null> {
    const patients = await prisma.patients.findMany({
        where: {
            admin_id: DEFAULT_PATIENT_ADMIN_ID,
            profile_type: "SELF",
        },
        select: {
            patient_id: true,
            full_name: true,
            phone: true,
            doctor_id: true,
            admin_id: true,
            booking_id: true,
            profile_type: true,
            age: true,
            gender: true,
        },
        orderBy: { patient_id: "desc" },
    });

    return patients.find((patient) => phonesMatch(patient.phone, phone)) || null;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const phone = String(searchParams.get("phone") || "").trim();

        if (!phone) {
            return NextResponse.json({ exists: false, patient: null });
        }

        const patient = await findSelfPatientByPhone(phone);
        return NextResponse.json({
            exists: Boolean(patient),
            patient,
        });
    } catch (error) {
        console.error("Patient signup lookup error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const full_name = String(body?.full_name || "").trim();
        const phone = String(body?.phone || "").trim();
        const password = String(body?.password || "").trim();
        const confirmPassword = String(body?.confirmPassword || "").trim();
        const gender = body?.gender == null ? null : String(body.gender).trim() || null;
        const ageValue = body?.age;
        const challengeId = String(body?.challengeId || "").trim();
        const challengeVerificationToken = String(body?.challengeVerificationToken || "").trim();

        if (!full_name) {
            return NextResponse.json({ error: "Full name is required" }, { status: 400 });
        }

        if (!phone) {
            return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
        }

        if (!password) {
            return NextResponse.json({ error: "Password is required" }, { status: 400 });
        }

        if (!confirmPassword) {
            return NextResponse.json({ error: "Confirm password is required" }, { status: 400 });
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: "Password must be at least 6 characters long" },
                { status: 400 }
            );
        }

        if (password !== confirmPassword) {
            return NextResponse.json(
                { error: "Password and confirm password must match" },
                { status: 400 }
            );
        }

        if (!challengeId || !challengeVerificationToken) {
            return NextResponse.json(
                { error: "Verified calculation is required" },
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

        const existingPatient = await findSelfPatientByPhone(phone);
        if (existingPatient) {
            return NextResponse.json(
                {
                    error: "This phone number is already linked to a patient account.",
                    patient: existingPatient,
                },
                { status: 409 }
            );
        }

        let parsedAge: number | null = null;
        if (ageValue !== undefined && ageValue !== null && String(ageValue).trim() !== "") {
            const ageNum = parseInt(String(ageValue), 10);
            if (!Number.isNaN(ageNum) && ageNum > 0 && ageNum < 150) {
                parsedAge = ageNum;
            }
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const patient = await prisma.patients.create({
            data: {
                full_name,
                phone,
                password: hashedPassword,
                age: parsedAge,
                gender,
                admin_id: DEFAULT_PATIENT_ADMIN_ID,
                doctor_id: null,
                booking_id: null,
                profile_type: "SELF",
            },
            select: {
                patient_id: true,
                full_name: true,
                phone: true,
                age: true,
                gender: true,
                admin_id: true,
                doctor_id: true,
                booking_id: true,
                profile_type: true,
            },
        });

        const token = generateToken({
            userId: patient.patient_id,
            patientId: patient.patient_id,
            role: "PATIENT",
        });

        const response = NextResponse.json(
            {
                message: "Patient signup successful",
                role: "PATIENT",
                token,
                patient,
            },
            { status: 201 }
        );

        response.cookies.set("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
            path: "/",
        });

        return response;
    } catch (error) {
        console.error("Patient signup error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
