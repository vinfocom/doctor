"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";

function formatCountdown(totalSeconds: number) {
    const safeSeconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function HmsForgotPasswordVerifyPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const email = searchParams.get("email") || "";
    const initialExpiresInSeconds = Number(searchParams.get("expiresInSeconds") || "600");
    const initialResendAfterSeconds = Number(searchParams.get("resendAfterSeconds") || "30");

    const [otp, setOtp] = useState("");
    const [loading, setLoading] = useState(false);
    const [resending, setResending] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [expiresInSeconds, setExpiresInSeconds] = useState(
        Number.isFinite(initialExpiresInSeconds) ? initialExpiresInSeconds : 600
    );
    const [resendAfterSeconds, setResendAfterSeconds] = useState(
        Number.isFinite(initialResendAfterSeconds) ? initialResendAfterSeconds : 30
    );

    useEffect(() => {
        if (!email) {
            router.replace("/hms/forgot-password");
        }
    }, [email, router]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setExpiresInSeconds((value) => Math.max(0, value - 1));
            setResendAfterSeconds((value) => Math.max(0, value - 1));
        }, 1000);

        return () => window.clearInterval(timer);
    }, []);

    const canResend = resendAfterSeconds <= 0;
    const otpHint = useMemo(() => `OTP expires in ${formatCountdown(expiresInSeconds)}`, [expiresInSeconds]);

    const handleVerify = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        if (!email) {
            setError("Email is required.");
            return;
        }

        if (!otp.trim()) {
            setError("OTP is required.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch("/api/hms/auth/forgot-password/verify-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp: otp.trim() }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to verify OTP.");
                return;
            }

            setSuccess("OTP verified.");
            router.replace(
                `/hms/change-password?email=${encodeURIComponent(email)}&verificationToken=${encodeURIComponent(
                    data.verificationToken
                )}`
            );
        } catch {
            setError("Unable to verify OTP. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setError("");
        setSuccess("");
        if (!canResend || !email) return;

        setResending(true);
        try {
            const response = await fetch("/api/hms/auth/forgot-password/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to resend OTP.");
                return;
            }

            setExpiresInSeconds(Number(data.expiresInSeconds || 600));
            setResendAfterSeconds(Number(data.resendAfterSeconds || 30));
            setSuccess("OTP resent.");
        } catch {
            setError("Unable to resend OTP. Check your connection and try again.");
        } finally {
            setResending(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8 text-black">
            <form onSubmit={handleVerify} className="w-full max-w-sm rounded-lg border border-black bg-white p-5">
                <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-black bg-black text-white">
                        <ShieldCheck size={18} />
                    </span>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-black">HMS</p>
                        <h1 className="text-lg font-bold text-black">Verify OTP</h1>
                    </div>
                </div>

                <div className="mb-4 rounded-lg border border-black px-3 py-2 text-xs text-black">
                    <div className="font-semibold">Email</div>
                    <div className="break-all">{email || "-"}</div>
                    <div className="mt-2">{otpHint}</div>
                </div>

                {error && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-black px-3 py-2 text-sm text-black">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {success && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-black px-3 py-2 text-sm text-black">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                        <span>{success}</span>
                    </div>
                )}

                <div>
                    <label className="mb-1 block text-xs font-medium text-black">OTP</label>
                    <input
                        inputMode="numeric"
                        value={otp}
                        onChange={(event) => setOtp(event.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                        className="w-full rounded-lg border border-black px-3 py-2 text-sm tracking-[0.35em] outline-none focus:ring-2 focus:ring-black/15"
                    />
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={handleResend}
                        disabled={!canResend || resending}
                        className="inline-flex items-center gap-2 rounded-lg border border-black px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {resending ? <Loader2 size={14} className="animate-spin" /> : null}
                        {canResend ? "Resend OTP" : `Resend in ${formatCountdown(resendAfterSeconds)}`}
                    </button>

                    <button
                        type="submit"
                        disabled={loading}
                        className="inline-flex items-center gap-2 rounded-lg bg-black px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                        Verify
                    </button>
                </div>

                <Link
                    href="/hms/forgot-password"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 text-center text-xs font-medium text-black underline-offset-4 hover:underline"
                >
                    <ArrowLeft size={14} />
                    Back
                </Link>
            </form>
        </main>
    );
}
