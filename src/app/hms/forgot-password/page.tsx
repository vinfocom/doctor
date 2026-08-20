"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, ShieldQuestion } from "lucide-react";

export default function HmsForgotPasswordPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");
        setSuccess("");

        const normalizedEmail = email.trim();
        if (!normalizedEmail) {
            setError("Email is required.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch("/api/hms/auth/forgot-password/send-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: normalizedEmail }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to send OTP.");
                return;
            }

            setSuccess("OTP sent successfully.");
            router.replace(
                `/hms/forgot-password/verify?email=${encodeURIComponent(normalizedEmail)}&expiresInSeconds=${encodeURIComponent(
                    String(data.expiresInSeconds || 600)
                )}&resendAfterSeconds=${encodeURIComponent(String(data.resendAfterSeconds || 30))}`
            );
        } catch {
            setError("Unable to send OTP. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8 text-black">
            <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-black bg-white p-5">
                <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-black bg-black text-white">
                        <ShieldQuestion size={18} />
                    </span>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-black">HMS</p>
                        <h1 className="text-lg font-bold text-black">Forgot Password</h1>
                    </div>
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
                    <label className="mb-1 block text-xs font-medium text-black">Email</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        className="w-full rounded-lg border border-black px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/15"
                    />
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldQuestion size={16} />}
                    Send OTP
                </button>

                <Link
                    href="/hms/login"
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 text-center text-xs font-medium text-black underline-offset-4 hover:underline"
                >
                    <ArrowLeft size={14} />
                    Back to login
                </Link>
            </form>
        </main>
    );
}
