import { UserCircle } from "lucide-react";
import HmsPreRegistrationQrCard from "@/components/hms/HmsPreRegistrationQrCard";
import prisma from "@/lib/prisma";
import type { HospitalContext } from "@/lib/hms-auth";
import { isHmsFeatureEnabled } from "@/lib/hms-feature-flags";
import { toHospitalSmsPayload, type HospitalSmsSnapshot } from "@/lib/hospitalSms";

type UserRow = {
    name: string | null;
    email: string | null;
};

type DoctorRow = {
    doctor_id: number;
    doctor_name: string | null;
    specialization: string | null;
    registration_no: string | null;
    room_no: string | null;
};

type StaffRow = {
    staff_type: string | null;
    status: string | null;
};

type HospitalSmsRow = {
    sms_service_enabled: boolean | number | null;
    sms_service_status: string | null;
    sms_credit_total: number | bigint | null;
    sms_credit_used: number | bigint | null;
    current_pack_total: number | bigint | null;
    current_pack_used: number | bigint | null;
};

function formatDoctorName(name: string | null | undefined) {
    const trimmed = String(name || "").trim();
    if (!trimmed) return "Doctor";
    return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
}

async function loadProfile(context: HospitalContext) {
    const users = await prisma.$queryRawUnsafe<UserRow[]>(
        `
        SELECT name, email
        FROM users
        WHERE user_id = ?
        LIMIT 1
        `,
        context.userId
    );

    let doctor: DoctorRow | null = null;
    let staff: StaffRow | null = null;
    let smsService: HospitalSmsSnapshot | null = null;

    if (context.role === "DOCTOR") {
        const rows = await prisma.$queryRawUnsafe<DoctorRow[]>(
            `
            SELECT d.doctor_id, d.doctor_name, d.specialization, d.registration_no, hd.room_no
            FROM doctors d
            LEFT JOIN hospital_doctors hd
              ON hd.doctor_id = d.doctor_id
             AND hd.hospital_id = ?
            WHERE d.user_id = ?
              AND d.admin_id = ?
            LIMIT 1
            `,
            context.hospitalId,
            context.userId,
            context.adminId
        );
        doctor = rows[0] || null;
    }

    if (context.role === "HOSPITAL_STAFF") {
        const rows = await prisma.$queryRawUnsafe<StaffRow[]>(
            `
            SELECT staff_type, status
            FROM hospital_staff
            WHERE hospital_id = ?
              AND user_id = ?
            LIMIT 1
            `,
            context.hospitalId,
            context.userId
        );
        staff = rows[0] || null;
    }

    if (context.role === "HOSPITAL_ADMIN") {
        const rows = await prisma.$queryRawUnsafe<HospitalSmsRow[]>(
            `
            SELECT
                sms_service_enabled,
                sms_service_status,
                sms_credit_total,
                sms_credit_used,
                current_pack_total,
                current_pack_used
            FROM hospital_sms_service
            WHERE hospital_id = ?
            LIMIT 1
            `,
            context.hospitalId
        );
        smsService = toHospitalSmsPayload(rows[0] || null);
    }

    return { user: users[0] || null, doctor, staff, smsService };
}

export default async function HmsProfileView({ context }: { context: HospitalContext }) {
    const { user, doctor, staff, smsService } = await loadProfile(context);
    const displayName = doctor ? formatDoctorName(doctor.doctor_name) : user?.name || context.role.replace("_", " ");
    const showPreRegistrationQr = context.role === "HOSPITAL_ADMIN" && await isHmsFeatureEnabled(context, "qr_temp_token_enabled");

    return (
        <div className="w-full">
            <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{context.hospitalName}</p>
                <h1 className="mt-1 text-2xl font-bold text-gray-950 sm:text-3xl">Profile</h1>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-black text-white">
                        <UserCircle size={21} />
                    </span>
                    <div>
                        <p className="font-semibold text-gray-950">{displayName}</p>
                        <p className="text-sm text-gray-500">{user?.email || "-"}</p>
                    </div>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                    <ProfileItem label="Role" value={context.role.replace("_", " ")} />
                    <ProfileItem label="Hospital" value={context.hospitalName} />
                    {smsService && <ProfileItem label="SMS Balance" value={smsService.displayText} />}
                    {smsService && <ProfileItem label="SMS Status" value={smsService.status} />}
                    {doctor && <ProfileItem label="Room" value={doctor.room_no || "-"} />}
                    {doctor && <ProfileItem label="Specialization" value={doctor.specialization || "-"} />}
                    {doctor && <ProfileItem label="Registration No." value={doctor.registration_no || "-"} />}
                    {staff && <ProfileItem label="Staff Type" value={String(staff.staff_type || "-").replace("_", " ")} />}
                    {staff && <ProfileItem label="Status" value={staff.status || "-"} />}
                </div>
            </div>

            {showPreRegistrationQr ? <HmsPreRegistrationQrCard /> : null}
        </div>
    );
}

function ProfileItem({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
            <p className="mt-1 font-semibold text-gray-950">{value}</p>
        </div>
    );
}
