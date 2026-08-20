"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";

type FieldErrors = {
    password?: string;
    confirmPassword?: string;
};

type HmsRole = "HOSPITAL_ADMIN" | "HOSPITAL_STAFF" | "DOCTOR";

function portalForRole(role: HmsRole) {
    if (role === "HOSPITAL_ADMIN") return "/hms/hospital-admin";
    if (role === "HOSPITAL_STAFF") return "/hms/staff";
    return "/hms/doctor";
}

export default function HmsChangePasswordPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const resetEmail = searchParams.get("email") || "";
    const resetToken = searchParams.get("verificationToken") || "";
    const resetMode = Boolean(resetEmail && resetToken);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");
        setFieldErrors({});

        const nextErrors: FieldErrors = {};
        if (password.length < 8) nextErrors.password = "Password must be at least 8 characters.";
        if (password !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match.";

        if (Object.keys(nextErrors).length > 0) {
            setFieldErrors(nextErrors);
            setError("Please correct the highlighted fields.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(resetMode ? "/api/hms/auth/forgot-password/reset-password" : "/api/hms/auth/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(resetMode
                    ? {
                        email: resetEmail,
                        verificationToken: resetToken,
                        newPassword: password,
                        confirmPassword,
                    }
                    : { password, confirmPassword }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to change password.");
                setFieldErrors(data.fieldErrors || {});
                return;
            }

            setSuccess("Password changed.");
            if (resetMode) {
                window.setTimeout(() => router.replace("/hms/login"), 800);
                return;
            }

            router.replace(portalForRole(data.user?.role));
        } catch {
            setError("Unable to change password. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
            <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-white">
                        <LockKeyhole size={18} />
                    </span>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">HMS</p>
                        <h1 className="text-lg font-bold text-gray-950">{resetMode ? "Reset Password" : "Change Password"}</h1>
                    </div>
                </div>

                {resetMode && (
                    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                        Resetting password for <span className="font-semibold text-gray-900">{resetEmail}</span>.
                    </div>
                )}

                {error && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                        <span>{success}</span>
                    </div>
                )}

                <div className="space-y-4">
                    <PasswordField
                        label="New Password"
                        value={password}
                        show={showPassword}
                        error={fieldErrors.password}
                        onChange={setPassword}
                    />
                    <PasswordField
                        label="Confirm Password"
                        value={confirmPassword}
                        show={showPassword}
                        error={fieldErrors.confirmPassword}
                        onChange={setConfirmPassword}
                    />
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600">
                        <input
                            type="checkbox"
                            checked={showPassword}
                            onChange={(event) => setShowPassword(event.target.checked)}
                            className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                        />
                        Show password
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <LockKeyhole size={16} />}
                    Save Password
                </button>
            </form>
        </main>
    );
}

function PasswordField({
    label,
    value,
    show,
    error,
    onChange,
}: {
    label: string;
    value: string;
    show: boolean;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">{label}</label>
            <div className="relative">
                <input
                    type={show ? "text" : "password"}
                    value={value}
                    onChange={(event) => onChange(event.target.value)}
                    className={`w-full rounded-lg border px-3 py-2 pr-10 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10 ${
                        error ? "border-red-300" : "border-gray-200"
                    }`}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </span>
            </div>
            {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
    );
}
