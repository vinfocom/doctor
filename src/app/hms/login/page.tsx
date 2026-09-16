"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { AlertCircle, Building2, Eye, EyeOff, Loader2, LogIn } from "lucide-react";

export default function HmsLoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError("");

        if (!email.trim() || !password) {
            setError("Email and password are required.");
            return;
        }

        setLoading(true);
        try {
            const response = await fetch("/api/hms/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), password }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                setError(data.error || "Unable to log in.");
                return;
            }

            if (data.forcePasswordChange || data.user?.forcePasswordChange) {
                router.replace("/hms/change-password");
                return;
            }

            router.replace("/hms");
        } catch {
            setError("Unable to log in. Check your connection and try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="relative flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
            <div className="fixed top-6 inset-x-0 z-50 px-4 sm:px-6 lg:px-10">
                <div className="mx-auto flex w-full max-w-[1440px] items-start justify-between gap-3 sm:gap-4 xl:gap-6">
                    <a
                        href="https://vinfocom.co.in/"
                        className="brand-logo-shell brand-logo-left shrink-0"
                        aria-label="Visit Vinfocom website"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        <Image
                            src="/vinfocom-logo.png"
                            alt="Vinfocom logo"
                            width={220}
                            height={80}
                            className="h-12 w-auto object-contain sm:h-14 lg:h-16"
                            priority
                        />
                    </a>
                    <Link
                        href="/"
                        className="brand-logo-shell brand-logo-right shrink-0"
                        aria-label="Go to Dapto home"
                    >
                        <Image
                            src="/dapto-logo.png"
                            alt="Dapto logo"
                            width={220}
                            height={80}
                            className="h-12 w-auto object-contain sm:h-14 lg:h-16"
                            priority
                        />
                    </Link>
                </div>
            </div>
            <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-black text-white">
                        <Building2 size={18} />
                    </span>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">HMS</p>
                        <h1 className="text-lg font-bold text-gray-950">Hospital Login</h1>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        <AlertCircle size={16} className="mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                className="w-full rounded-lg border border-gray-200 px-3 py-2 pr-10 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((value) => !value)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                    Login
                </button>

                <Link href="/hms/forgot-password" className="mt-4 block text-center text-xs font-medium text-gray-500 hover:text-gray-900">
                    Forgot password?
                </Link>

                <Link href="/login" className="mt-2 block text-center text-xs font-medium text-gray-500 hover:text-gray-900">
                    Regular doctor/clinic login
                </Link>
            </form>
        </main>
    );
}
