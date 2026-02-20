import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/chat?patient_id=...&doctor_id=...
export async function GET(request: NextRequest) {
    try {
        const searchParams = request.nextUrl.searchParams;
        const patient_id = searchParams.get("patient_id");
        const doctor_id = searchParams.get("doctor_id");

        if (!patient_id || !doctor_id) {
            return NextResponse.json(
                { error: "Missing patient_id or doctor_id" },
                { status: 400 }
            );
        }

        const messages = await prisma.chat_messages.findMany({
            where: {
                patient_id: parseInt(patient_id),
                doctor_id: parseInt(doctor_id),
            },
            orderBy: {
                created_at: "asc",
            },
        });

        return NextResponse.json({ messages }, { status: 200 });
    } catch (error) {
        console.error("Error fetching chat messages:", error);
        return NextResponse.json(
            { error: "Failed to fetch messages" },
            { status: 500 }
        );
    }
}

// POST /api/chat
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { patient_id, doctor_id, sender, content } = body;

        if (!patient_id || !doctor_id || !sender || !content) {
            return NextResponse.json(
                { error: "Missing required fields" },
                { status: 400 }
            );
        }

        if (sender !== "DOCTOR" && sender !== "PATIENT") {
            return NextResponse.json(
                { error: "Invalid sender. Must be DOCTOR or PATIENT" },
                { status: 400 }
            );
        }

        const message = await prisma.chat_messages.create({
            data: {
                patient_id: parseInt(patient_id),
                doctor_id: parseInt(doctor_id),
                sender,
                content,
            },
        });

        return NextResponse.json({ message }, { status: 201 });
    } catch (error) {
        console.error("Error creating chat message:", error);
        return NextResponse.json(
            { error: "Failed to create message" },
            { status: 500 }
        );
    }
}
