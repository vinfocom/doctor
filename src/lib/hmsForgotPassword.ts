import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import {
    compareOtp,
    generateOtp,
    generateOtpVerificationToken,
    hashOtp,
    normalizeEmail,
    sendEmailOtp,
} from "@/lib/userPasswordOtp";

type HmsAdminUserRow = {
    user_id: number;
    name: string | null;
    email: string | null;
    password: string | null;
    role: string;
    hospital_id: number | null;
    hospital_status: string | null;
};

type UserPasswordOtpRow = {
    otp_id: number;
    user_id: number;
    email: string;
    otp_hash: string;
    attempt_count: number;
    expires_at: Date;
    resend_after: Date | null;
    used_at: Date | null;
    verification_token: string | null;
    verification_expires_at: Date | null;
    verified_at: Date | null;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(String(value || "").trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getOtpDelegate() {
    return (prisma as unknown as {
        user_password_otps: {
            create: (args: unknown) => Promise<UserPasswordOtpRow>;
            findFirst: (args: unknown) => Promise<UserPasswordOtpRow | null>;
            update: (args: unknown) => Promise<unknown>;
            updateMany: (args: unknown) => Promise<{ count: number }>;
        };
    }).user_password_otps;
}

export function normalizeHmsAdminEmail(email: string | null | undefined) {
    return normalizeEmail(email);
}

export async function findHmsAdminUserByEmail(email: string) {
    const normalizedEmail = normalizeHmsAdminEmail(email);
    if (!normalizedEmail) return null;

    const rows = await prisma.$queryRawUnsafe<HmsAdminUserRow[]>(
        `
        SELECT
            u.user_id,
            u.name,
            u.email,
            u.password,
            u.role,
            u.hospital_id,
            h.status AS hospital_status
        FROM users u
        INNER JOIN hospitals h
          ON h.hospital_id = u.hospital_id
        WHERE u.email = ?
          AND u.role = 'ADMIN'
          AND u.hospital_id IS NOT NULL
          AND h.status = 'ACTIVE'
        LIMIT 1
        `,
        normalizedEmail
    );

    const user = rows[0];
    return user || null;
}

export async function createHmsPasswordResetOtp(input: {
    userId: number;
    email: string;
    otp: string;
}) {
    const normalizedEmail = normalizeHmsAdminEmail(input.email);
    if (!input.userId || !normalizedEmail) {
        throw new Error("A valid HMS user and email are required to create OTP");
    }

    const now = new Date();
    const otpLength = parsePositiveInt(process.env.OTP_LENGTH, 6);
    const expiryMinutes = parsePositiveInt(process.env.OTP_EXPIRY_MINUTES, 10);
    const resendCooldownSeconds = parsePositiveInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 30);

    const normalizedOtp = String(input.otp || "").trim();
    if (!normalizedOtp || normalizedOtp.length !== otpLength) {
        throw new Error("A valid OTP is required to create password reset OTP");
    }

    const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);
    const resendAfter = new Date(now.getTime() + resendCooldownSeconds * 1000);

    const otpDelegate = getOtpDelegate();
    return otpDelegate.create({
        data: {
            user_id: input.userId,
            email: normalizedEmail,
            purpose: "RESET_PASSWORD",
            otp_hash: hashOtp(normalizedOtp),
            attempt_count: 0,
            expires_at: expiresAt,
            resend_after: resendAfter,
            verification_token: null,
            verification_expires_at: null,
            verified_at: null,
            used_at: null,
        },
    });
}

export async function invalidateHmsPasswordResetOtps(email: string, userId?: number) {
    const normalizedEmail = normalizeHmsAdminEmail(email);
    if (!normalizedEmail) return { count: 0 };

    const otpDelegate = getOtpDelegate();
    return otpDelegate.updateMany({
        where: {
            ...(userId ? { user_id: userId } : {}),
            email: normalizedEmail,
            purpose: "RESET_PASSWORD",
            used_at: null,
        },
        data: {
            used_at: new Date(),
            verification_token: null,
            verification_expires_at: null,
            verified_at: null,
        },
    });
}

export async function findLatestHmsPasswordResetOtp(email: string) {
    const normalizedEmail = normalizeHmsAdminEmail(email);
    if (!normalizedEmail) return null;

    const otpDelegate = getOtpDelegate();
    return otpDelegate.findFirst({
        where: {
            email: normalizedEmail,
            purpose: "RESET_PASSWORD",
            used_at: null,
        },
        orderBy: { created_at: "desc" },
    });
}

export async function sendHmsPasswordResetOtp(email: string) {
    const user = await findHmsAdminUserByEmail(email);
    if (!user) {
        return { found: false as const, error: "Contact your hospital admin to reset your login password." };
    }

    const now = new Date();
    const latestActiveOtp = await findLatestHmsPasswordResetOtp(email);
    if (latestActiveOtp?.resend_after && latestActiveOtp.resend_after > now) {
        const resendAfterSeconds = Math.max(
            1,
            Math.ceil((latestActiveOtp.resend_after.getTime() - now.getTime()) / 1000)
        );
        return {
            found: true as const,
            cooldown: true as const,
            resendAfterSeconds,
        };
    }

    const otpLength = parsePositiveInt(process.env.OTP_LENGTH, 6);
    const expiryMinutes = parsePositiveInt(process.env.OTP_EXPIRY_MINUTES, 10);
    const resendCooldownSeconds = parsePositiveInt(process.env.OTP_RESEND_COOLDOWN_SECONDS, 30);

    const otp = generateOtp(otpLength);
    await invalidateHmsPasswordResetOtps(email, user.user_id);
    const createdOtp = await createHmsPasswordResetOtp({
        userId: user.user_id,
        email,
        otp,
    });

    try {
        await sendEmailOtp({ email, otp });
    } catch (error) {
        const otpDelegate = getOtpDelegate();
        await otpDelegate.update({
            where: { otp_id: createdOtp.otp_id },
            data: {
                used_at: new Date(),
                verification_token: null,
                verification_expires_at: null,
                verified_at: null,
            },
        });

        throw error instanceof Error ? error : new Error("Email send failed");
    }

    return {
        found: true as const,
        cooldown: false as const,
        expiresInSeconds: expiryMinutes * 60,
        resendAfterSeconds: resendCooldownSeconds,
        userId: user.user_id,
        email: user.email || normalizeHmsAdminEmail(email),
    };
}

export async function verifyHmsPasswordResetOtp(email: string, otp: string) {
    const user = await findHmsAdminUserByEmail(email);
    if (!user) {
        return { found: false as const, error: "Contact your hospital admin to reset your login password." };
    }

    const normalizedEmail = normalizeHmsAdminEmail(email);
    const now = new Date();
    const otpDelegate = getOtpDelegate();
    const latestOtp = await otpDelegate.findFirst({
        where: {
            user_id: user.user_id,
            email: normalizedEmail,
            purpose: "RESET_PASSWORD",
            used_at: null,
        },
        orderBy: { created_at: "desc" },
        select: {
            otp_id: true,
            user_id: true,
            otp_hash: true,
            attempt_count: true,
            expires_at: true,
            used_at: true,
            verified_at: true,
            verification_token: true,
            verification_expires_at: true,
            created_at: true,
        },
    });

    if (!latestOtp) {
        return { found: true as const, error: "OTP is invalid" };
    }

    if (latestOtp.expires_at <= now) {
        return { found: true as const, error: "OTP has expired" };
    }

    const maxAttempts = parsePositiveInt(process.env.OTP_MAX_ATTEMPTS, 5);
    if (latestOtp.attempt_count >= maxAttempts) {
        return { found: true as const, error: "Maximum OTP verification attempts exceeded", rateLimited: true as const };
    }

    const isValidOtp = compareOtp(otp, latestOtp.otp_hash);
    if (!isValidOtp) {
        await otpDelegate.update({
            where: { otp_id: latestOtp.otp_id },
            data: {
                attempt_count: { increment: 1 },
            },
        });

        return { found: true as const, error: "Invalid OTP" };
    }

    const verificationToken = generateOtpVerificationToken();
    const verificationTokenTtlMinutes = parsePositiveInt(process.env.OTP_VERIFICATION_TOKEN_TTL_MINUTES, 10);
    const verificationExpiresAt = new Date(now.getTime() + verificationTokenTtlMinutes * 60 * 1000);

    await otpDelegate.update({
        where: { otp_id: latestOtp.otp_id },
        data: {
            verified_at: now,
            verification_token: verificationToken,
            verification_expires_at: verificationExpiresAt,
        },
    });

    return {
        found: true as const,
        verificationToken,
        verificationExpiresAt,
        expiresInSeconds: verificationTokenTtlMinutes * 60,
    };
}

export async function resetHmsPasswordWithOtpToken(input: {
    email: string;
    verificationToken: string;
    newPassword: string;
    confirmPassword: string;
}) {
    const user = await findHmsAdminUserByEmail(input.email);
    if (!user) {
        return { found: false as const, error: "Contact your hospital admin to reset your login password." };
    }

    const email = normalizeHmsAdminEmail(input.email);
    const password = String(input.newPassword || "").trim();
    const confirmPassword = String(input.confirmPassword || "").trim();
    const verificationToken = String(input.verificationToken || "").trim();

    if (!email || !password || !confirmPassword || !verificationToken) {
        return { found: true as const, error: "Email, passwords, and verification token are required" };
    }

    if (password.length < 8) {
        return { found: true as const, error: "Password must be at least 8 characters long" };
    }

    if (password !== confirmPassword) {
        return { found: true as const, error: "Password and confirm password must match" };
    }

    const now = new Date();
    const otpDelegate = getOtpDelegate();
    const verifiedOtp = await otpDelegate.findFirst({
        where: {
            user_id: user.user_id,
            email,
            purpose: "RESET_PASSWORD",
            verification_token: verificationToken,
            verification_expires_at: { gt: now },
            used_at: null,
        },
        orderBy: { created_at: "desc" },
        select: {
            otp_id: true,
            user_id: true,
            verification_token: true,
            verification_expires_at: true,
            used_at: true,
        },
    });

    if (!verifiedOtp) {
        return { found: true as const, error: "Invalid or expired verification token" };
    }

    const currentHash = user.password;
    if (!currentHash) {
        return { found: true as const, error: "Account password is not configured." };
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
            `
            UPDATE users
            SET password = ?,
                force_password_change = FALSE,
                password_reset_at = CURRENT_TIMESTAMP,
                password_reset_by = ?
            WHERE user_id = ?
            `,
            hashedPassword,
            user.user_id,
            user.user_id
        );

        await tx.user_password_otps.update({
            where: { otp_id: verifiedOtp.otp_id },
            data: {
                used_at: now,
                verification_token: null,
                verification_expires_at: null,
            },
        });
    });

    return {
        found: true as const,
        success: true as const,
    };
}
