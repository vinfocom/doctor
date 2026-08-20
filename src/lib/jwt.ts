import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

export interface JWTPayload {
  userId: number;
  email?: string;
  role: "SUPER_ADMIN" | "ADMIN" | "DOCTOR" | "PATIENT" | "CLINIC_STAFF" | "HOSPITAL_ADMIN" | "HOSPITAL_STAFF";
  patientId?: number;
  forcePasswordChange?: boolean;
  hospitalContext?: {
    hospitalId: number;
    hospitalCode: string;
    hospitalName: string;
    adminId: number;
    userId: number;
    role: "HOSPITAL_ADMIN" | "HOSPITAL_STAFF" | "DOCTOR";
  };
}

export function generateToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "365d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}
