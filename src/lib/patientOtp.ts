import { createHash, randomBytes, timingSafeEqual } from "crypto";

import prisma from "@/lib/prisma";

export type PatientOtpPurpose = "SET_PASSWORD_FIRST_TIME" | "RESET_PASSWORD";

type PatientLookup = {
  patient_id: number;
  full_name: string | null;
  phone: string | null;
  password: string | null;
  doctor_id: number | null;
  booking_id: number | null;
  admin_id: number;
  age: number | null;
  gender: string | null;
  profile_type: "SELF" | "OTHER";
};

type SendSmsOtpInput = {
  phone: string;
  otp: string;
};

type SendSmsOtpResult = {
  ok: boolean;
  status: number;
  data: unknown;
};

const DEFAULT_PATIENT_ADMIN_ID = 1;
const DEFAULT_OTP_LENGTH = 6;
const OTP_HASH_PREFIX = "sha256:";
export const OTP_SMS_TEMPLATE_TEXT =
  "Use {#numeric#} to login to your account It is valid for 10 min. Do not share this with anyone for security reasons. - Dapto";

function getOtpSecret() {
  return process.env.JWT_SECRET || "SUPER_SECRET_KEY";
}

function getOtpHashBuffer(value: string) {
  return createHash("sha256")
    .update(`${getOtpSecret()}:${value}`, "utf8")
    .digest();
}

function getPatientOtpDelegate() {
  return (prisma as unknown as {
    patient_password_otps: {
      updateMany: (args: unknown) => Promise<{ count: number }>;
    };
  }).patient_password_otps;
}

export function normalizePhone(phone: string | null | undefined) {
  return String(phone || "").replace(/\D/g, "");
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

export async function findPatientByPhone(phone: string) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return null;

  const patients = await prisma.patients.findMany({
    where: {
      admin_id: DEFAULT_PATIENT_ADMIN_ID,
      profile_type: "SELF",
    },
    select: {
      patient_id: true,
      full_name: true,
      phone: true,
      password: true,
      doctor_id: true,
      booking_id: true,
      admin_id: true,
      age: true,
      gender: true,
      profile_type: true,
    },
    orderBy: { patient_id: "desc" },
  });

  return (
    patients.find((patient) => phonesMatch(patient.phone, normalizedPhone)) ?? null
  ) as PatientLookup | null;
}

export function toSafePatient(patient: PatientLookup) {
  return {
    patient_id: patient.patient_id,
    full_name: patient.full_name,
    phone: patient.phone,
    doctor_id: patient.doctor_id,
    booking_id: patient.booking_id,
    admin_id: patient.admin_id,
    age: patient.age,
    gender: patient.gender,
    profile_type: patient.profile_type,
  };
}

export function generateOtp(length = DEFAULT_OTP_LENGTH) {
  const otpLength = Math.max(4, Math.min(8, Number(length) || DEFAULT_OTP_LENGTH));
  const min = 10 ** (otpLength - 1);
  const max = 10 ** otpLength;
  return String(Math.floor(Math.random() * (max - min)) + min);
}

export function hashOtp(otp: string) {
  const normalizedOtp = String(otp || "").trim();
  const digest = getOtpHashBuffer(normalizedOtp).toString("hex");
  return `${OTP_HASH_PREFIX}${digest}`;
}

export function compareOtp(plainOtp: string, otpHash: string | null | undefined) {
  const normalizedHash = String(otpHash || "").trim();
  if (!normalizedHash.startsWith(OTP_HASH_PREFIX)) return false;

  const storedHex = normalizedHash.slice(OTP_HASH_PREFIX.length);
  if (!storedHex) return false;

  const storedBuffer = Buffer.from(storedHex, "hex");
  const computedBuffer = getOtpHashBuffer(String(plainOtp || "").trim());
  if (storedBuffer.length !== computedBuffer.length) return false;

  return timingSafeEqual(storedBuffer, computedBuffer);
}

export function generateOtpVerificationToken() {
  return randomBytes(32).toString("hex");
}

export function buildOtpSmsMessage(otp: string) {
  return OTP_SMS_TEMPLATE_TEXT.replace("{#numeric#}", String(otp || "").trim());
}

export async function sendSmsOtp({ phone, otp }: SendSmsOtpInput): Promise<SendSmsOtpResult> {
  const apiKey = String(process.env.SMS_API_KEY || "").trim();
  const endpointUrl = String(process.env.SMS_API_ENDPOINT_URL || "").trim();
  const senderId = String(process.env.SMS_SENDER_ID || "").trim();
  const templateId = String(process.env.SMS_TEMPLATE_ID || "").trim();
  const entityId = String(process.env.SMS_ENTITY_ID || "").trim();

  if (!apiKey || !endpointUrl || !senderId) {
    throw new Error("Missing SMS provider configuration");
  }

  const normalizedPhone = normalizePhone(phone);
  const normalizedOtp = String(otp || "").trim();
  if (!normalizedPhone) {
    throw new Error("A valid phone number is required to send OTP");
  }
  if (!normalizedOtp) {
    throw new Error("A valid OTP is required to send SMS");
  }

  const message = buildOtpSmsMessage(normalizedOtp);
  const url = new URL(endpointUrl);
  url.searchParams.set("sender", senderId);
  url.searchParams.set("numbers", normalizedPhone);
  url.searchParams.set("messagetype", "TXT");
  url.searchParams.set("message", message);
  url.searchParams.set("response", "Y");
  url.searchParams.set("apikey", apiKey);
  if (templateId) url.searchParams.set("templateid", templateId);
  if (entityId) url.searchParams.set("entityid", entityId);

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  let data: unknown = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text().catch(() => null);
  }

  if (!response.ok) {
    const messageText =
      typeof data === "string" && data
        ? data
        : `SMS provider request failed with status ${response.status}`;
    throw new Error(messageText);
  }

  return {
    ok: true,
    status: response.status,
    data,
  };
}

export async function invalidatePreviousOtps(
  phone: string,
  purpose: PatientOtpPurpose,
  patientId?: number
) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) {
    return { count: 0 };
  }

  const otpDelegate = getPatientOtpDelegate();
  return otpDelegate.updateMany({
    where: {
      ...(patientId ? { patient_id: patientId } : {}),
      phone: normalizedPhone,
      purpose,
      used_at: null,
    },
    data: {
      used_at: new Date(),
      verification_token: null,
      verification_expires_at: null,
    },
  });
}
