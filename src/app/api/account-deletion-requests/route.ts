import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { getSessionFromRequest } from "@/lib/request-auth";
import { sendAccountDeletionRequestEmail } from "@/lib/accountDeletionEmail";

export const dynamic = "force-dynamic";

type ExistingRequest = {
  request_id: number;
  user_id: number;
  role: string;
  phone: string | null;
  requested_at: Date;
  status: string;
  email_status: string;
  reason: string | null;
};

type AccountMailDetails = {
  name: string | null;
  patientId: number | null;
  uhid: string | null;
  doctorId: number | null;
  doctorName: string | null;
  clinicStaffId: number | null;
  clinicId: number | null;
  associatedClinicIds: number[];
  clinicName: string | null;
  adminId: number | null;
  staffRole: string | null;
  specialization: string | null;
};

const ALLOWED_DELETION_REASONS = new Set([
  "I no longer need Dapto",
  "I have privacy concerns",
  "I am using another service",
  "I have an account issue",
  "I have trouble using the app",
  "I receive too many notifications",
  "I have a duplicate account",
  "I no longer use this phone number",
  "The service is not available in my area",
  "I am leaving the clinic or practice",
  "Other",
]);

export async function POST(req: Request) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !Number.isInteger(Number(session.userId))) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if (!["PATIENT", "DOCTOR", "CLINIC_STAFF"].includes(session.role)) {
      return NextResponse.json({ error: "This account cannot request deletion here" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const password = typeof body?.password === "string" ? body.password : "";
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });
    if (!ALLOWED_DELETION_REASONS.has(reason) || reason.length > 80) {
      return NextResponse.json({ error: "Choose a valid, concise reason for your request" }, { status: 400 });
    }

    const account = await prisma.$transaction(async (tx) => {
      const userId = Number(session.userId);
      let passwordHash: string | null = null;
      let phone: string | null = null;
      let email: string | null = session.email || null;
      let details: AccountMailDetails = {
        name: null,
        patientId: null,
        uhid: null,
        doctorId: null,
        doctorName: null,
        clinicStaffId: null,
        clinicId: null,
        associatedClinicIds: [],
        clinicName: null,
        adminId: null,
        staffRole: null,
        specialization: null,
      };

      if (session.role === "PATIENT") {
        const locked = await tx.$queryRaw<Array<{ patient_id: number }>>`
          SELECT patient_id FROM patients WHERE patient_id = ${userId} FOR UPDATE
        `;
        if (!locked.length) return null;
        const patient = await tx.patients.findUnique({
          where: { patient_id: userId },
          select: { patient_id: true, full_name: true, uhid: true, admin_id: true, doctor_id: true, phone: true, password: true },
        });
        passwordHash = patient?.password || null;
        phone = patient?.phone || null;
        details = {
          ...details,
          name: patient?.full_name || null,
          patientId: patient?.patient_id ?? null,
          uhid: patient?.uhid || null,
          adminId: patient?.admin_id ?? null,
          doctorId: patient?.doctor_id ?? null,
        };
      } else {
        const locked = await tx.$queryRaw<Array<{ user_id: number }>>`
          SELECT user_id FROM users WHERE user_id = ${userId} FOR UPDATE
        `;
        if (!locked.length) return null;
        const user = await tx.users.findUnique({
          where: { user_id: userId },
          select: {
            password: true,
            name: true,
            email: true,
            doctor: { select: { doctor_id: true, doctor_name: true, phone: true, specialization: true, admin_id: true, clinics: { select: { clinic_id: true, clinic_name: true } } } },
            clinic_staff: { select: { staff_id: true, doctor_id: true, clinic_id: true, whatsapp_number: true, staff_role: true, doctors: { select: { doctor_name: true, specialization: true, admin_id: true } }, clinics: { select: { clinic_name: true } } } },
          },
        });
        passwordHash = user?.password || null;
        email = user?.email || email;
        phone = session.role === "DOCTOR"
          ? user?.doctor?.phone || null
          : user?.clinic_staff?.whatsapp_number || null;
        if (session.role === "DOCTOR") {
          const doctor = user?.doctor;
          details = {
            ...details,
            name: doctor?.doctor_name || user?.email || null,
            doctorId: doctor?.doctor_id ?? null,
            doctorName: doctor?.doctor_name || null,
            adminId: doctor?.admin_id ?? null,
            specialization: doctor?.specialization || null,
            clinicId: doctor?.clinics[0]?.clinic_id ?? null,
            associatedClinicIds: doctor?.clinics.map((clinic) => clinic.clinic_id) || [],
            clinicName: doctor?.clinics.map((clinic) => clinic.clinic_name).filter(Boolean).join(", ") || null,
          };
        } else {
          const staff = user?.clinic_staff;
          details = {
            ...details,
            name: user?.name || user?.email || null,
            clinicStaffId: staff?.staff_id ?? null,
            doctorId: staff?.doctor_id ?? null,
            doctorName: staff?.doctors?.doctor_name || null,
            clinicId: staff?.clinic_id ?? null,
            clinicName: staff?.clinics?.clinic_name || null,
            adminId: staff?.doctors?.admin_id ?? null,
            staffRole: staff?.staff_role || null,
            specialization: staff?.doctors?.specialization || null,
          };
        }
      }

      if (!passwordHash || !(await bcrypt.compare(password, passwordHash))) return { invalidPassword: true as const };

      const existing = await tx.$queryRaw<ExistingRequest[]>`
        SELECT request_id, user_id, role, phone, requested_at, status, email_status, reason
        FROM account_deletion_requests
        WHERE user_id = ${userId} AND status = 'pending'
        ORDER BY requested_at DESC LIMIT 1
      `;
      if (existing[0]) return { request: existing[0], email, details, reused: true };

      await tx.$executeRaw`
        INSERT INTO account_deletion_requests (user_id, role, phone, requested_at, status, reason, email_status)
        VALUES (${userId}, ${session.role}, ${phone}, NOW(), 'pending', ${reason}, 'pending')
      `;
      const request = await tx.$queryRaw<ExistingRequest[]>`
        SELECT request_id, user_id, role, phone, requested_at, status, email_status, reason
        FROM account_deletion_requests WHERE user_id = ${userId} AND status = 'pending'
        ORDER BY requested_at DESC LIMIT 1
      `;
      return { request: request[0], email, details, reused: false };
    });

    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    if ("invalidPassword" in account) return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
    const request = account.request;
    if (!request) return NextResponse.json({ error: "Could not save request" }, { status: 500 });

    const claim = await prisma.$executeRaw`
      UPDATE account_deletion_requests SET email_status = 'sending'
      WHERE request_id = ${request.request_id} AND status = 'pending' AND email_status IN ('pending', 'failed')
    `;
    if (Number(claim) > 0) {
      try {
        await sendAccountDeletionRequestEmail({
          requestId: request.request_id,
          userId: request.user_id,
          role: request.role,
          phone: request.phone,
          requestedAt: request.requested_at,
          email: account.email,
          reason: request.reason,
          details: account.details,
        });
        await prisma.$executeRaw`
          UPDATE account_deletion_requests SET email_status = 'sent', email_sent_at = NOW()
          WHERE request_id = ${request.request_id} AND email_status = 'sending'
        `;
      } catch (emailError) {
        await prisma.$executeRaw`
          UPDATE account_deletion_requests SET email_status = 'failed'
          WHERE request_id = ${request.request_id} AND email_status = 'sending'
        `;
        console.error("[account-deletion] support email failed", emailError);
        return NextResponse.json(
          { error: "Your request was saved, but we could not send the support notification. Please retry." },
          { status: 502 }
        );
      }
    }

    return NextResponse.json({
      request: { id: request.request_id, status: request.status, requestedAt: request.requested_at },
      reused: account.reused,
      message: "Your request has been received. We will process it within some days.",
    }, { status: account.reused ? 200 : 201 });
  } catch (error) {
    console.error("[account-deletion] request failed", error);
    return NextResponse.json({ error: "Unable to submit account deletion request" }, { status: 500 });
  }
}
