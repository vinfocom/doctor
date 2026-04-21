"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Calculator, Check, Eye, EyeOff, RefreshCw } from "lucide-react";
import Image from "next/image";

export default function LoginPage() {
    const router = useRouter();
    const [form, setForm] = useState({ email: "", password: "" });
    const [challengeId, setChallengeId] = useState("");
    const [challengeQuestion, setChallengeQuestion] = useState("");
    const [challengeAnswer, setChallengeAnswer] = useState("");
    const [challengeVerificationToken, setChallengeVerificationToken] = useState("");
    const [challengeVerified, setChallengeVerified] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [challengeLoading, setChallengeLoading] = useState(false);
    const [verifyingChallenge, setVerifyingChallenge] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [challengeStatus, setChallengeStatus] = useState<"idle" | "success">("idle");
    const [answerInputActive, setAnswerInputActive] = useState(false);

    const canSubmit = useMemo(
        () =>
            Boolean(
                form.email.trim() &&
                form.password &&
                challengeId &&
                challengeVerificationToken &&
                challengeAnswer.trim() &&
                challengeVerified
            ) && !loading,
        [challengeAnswer, challengeId, challengeVerificationToken, challengeVerified, form.email, form.password, loading]
    );

    const loadChallenge = async (clearAnswer = true) => {
        setChallengeLoading(true);
        setError("");
        setChallengeVerified(false);
        setChallengeVerificationToken("");
        setChallengeStatus("idle");

        try {
            const res = await fetch("/api/auth/login-challenge", { cache: "no-store" });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || "Unable to load calculation");
                setChallengeId("");
                setChallengeQuestion("");
                return;
            }

            setChallengeId(data.challengeId || "");
            setChallengeQuestion(data.question || "");
            if (clearAnswer) {
                setChallengeAnswer("");
                setAnswerInputActive(false);
            }
        } catch {
            setError("Unable to load calculation");
            setChallengeId("");
            setChallengeQuestion("");
        } finally {
            setChallengeLoading(false);
        }
    };

    useEffect(() => {
        loadChallenge();
    }, []);

    useEffect(() => {
        setChallengeVerified(false);
        setChallengeVerificationToken("");
        setChallengeStatus("idle");
    }, [challengeAnswer]);

    const handleVerifyChallenge = useCallback(async (answer: string) => {
        if (!challengeId || !answer.trim()) return;
        if (challengeVerified) return;
        setVerifyingChallenge(true);
        setError("");
        setChallengeVerified(false);
        setChallengeVerificationToken("");
        setChallengeStatus("idle");

        try {
            const res = await fetch("/api/auth/login-challenge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    challengeId,
                    answer: answer.trim(),
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                return;
            }

            setChallengeVerificationToken(data.verificationToken || "");
            setChallengeVerified(true);
            setChallengeStatus("success");
        } catch {
            // Keep quiet while user is typing; login submit still enforces verification.
        } finally {
            setVerifyingChallenge(false);
        }
    }, [challengeId, challengeVerified]);

    useEffect(() => {
        if (!challengeAnswer.trim() || !challengeId || challengeLoading || challengeVerified) return;

        const timer = setTimeout(() => {
            void handleVerifyChallenge(challengeAnswer);
        }, 250);

        return () => clearTimeout(timer);
    }, [challengeAnswer, challengeId, challengeLoading, challengeVerified, handleVerifyChallenge]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!challengeVerified || !challengeId || !challengeVerificationToken) {
            setError("Please verify the calculation before signing in.");
            return;
        }

        setLoading(true);

        try {
            const res = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    challengeId,
                    challengeVerificationToken,
                }),
            });

            const data = await res.json();
            if (!res.ok) {
                setError(data.error);
                if (res.status === 400) {
                    setChallengeVerified(false);
                    await loadChallenge();
                }
                return;
            }

            const role = data.user.role;
            if (role === "SUPER_ADMIN" || role === "ADMIN") router.push("/dashboard/admin");
            else if (role === "DOCTOR" || role === "CLINIC_STAFF") router.push("/dashboard/doctor");
            else router.push("/dashboard/admin");
        } catch {
            setError("Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-gradient-to-br from-gray-50 to-indigo-50/30">
            <div className="page-glow" />

            <div className="fixed top-6 inset-x-0 z-50 px-4 sm:px-6 lg:px-10">
                <div className="mx-auto flex w-full max-w-[1440px] items-start justify-between gap-3 sm:gap-4 xl:gap-6">
                    <div className="brand-logo-shell brand-logo-left shrink-0">
                        <Image
                            src="/vinfocom-logo.png"
                            alt="Vinfocom logo"
                            width={220}
                            height={80}
                            className="h-12 w-auto object-contain sm:h-14 lg:h-16"
                            priority
                        />
                    </div>
                    <div className="brand-logo-shell brand-logo-right shrink-0">
                        <Image
                            src="/dapto-logo.png"
                            alt="Dapto logo"
                            width={220}
                            height={80}
                            className="h-12 w-auto object-contain sm:h-14 lg:h-16"
                            priority
                        />
                    </div>
                </div>
            </div>

            {/* Background orbs */}
            <motion.div
                className="absolute top-20 left-20 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl"
                animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
                className="absolute bottom-20 right-20 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl"
                animate={{ scale: [1.1, 1, 1.1], opacity: [0.2, 0.4, 0.2] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            />

            <motion.div
                className="relative z-10 w-full max-w-md"
                initial={{ opacity: 0, y: 30, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
                <div className="glass-card p-6 sm:p-8 md:p-10">
                    {/* Header */}
                    <motion.div
                        className="text-center mb-8"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                    >
                        <div className="hidden w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-600/10 flex items-center justify-center text-2xl mx-auto mb-4">
                            🏥
                        </div>
                        <div className="mx-auto mb-4 flex justify-center">
                            <Image
                                src="/dapto-logo.png"
                                alt="Dapto logo"
                                width={180}
                                height={64}
                                className="h-12 w-auto object-contain"
                                priority
                            />
                        </div>
                        <h1 className="text-3xl font-bold gradient-text">Welcome Back</h1>
                        <p className="text-gray-500 mt-2 text-sm">Sign in to your account</p>
                    </motion.div>

                    {/* Error */}
                    {error && (
                        <motion.div
                            className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm text-center"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                        >
                            {error}
                        </motion.div>
                    )}

                    {/* Form */}
                    <motion.form
                        onSubmit={handleSubmit}
                        className="space-y-5"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                    >
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Email</label>
                            <input
                                type="email"
                                className="input-field"
                                placeholder="you@example.com"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-600 mb-2">Password</label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="input-field pr-10"
                                    placeholder="••••••••"
                                    value={form.password}
                                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <label className="block text-sm font-medium text-gray-700">Quick Verification</label>
                                <button
                                    type="button"
                                    onClick={() => loadChallenge()}
                                    disabled={challengeLoading || verifyingChallenge}
                                    className="inline-flex items-center text-indigo-600 transition hover:text-indigo-800 disabled:opacity-50"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            </div>
                            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-100 bg-white px-4 py-3 shadow-sm">
                                <div className="flex min-w-0 flex-1 items-center gap-3 pl-1">
                                    <Calculator size={20} className="shrink-0 text-indigo-600" />
                                    {challengeLoading ? (
                                        <span className="text-lg font-bold text-gray-800 sm:text-xl">Loading calculation...</span>
                                    ) : challengeQuestion ? (
                                        <>
                                            <span className="whitespace-nowrap text-2xl font-bold text-gray-800">
                                                {challengeQuestion.replace("?", "").trim()}
                                            </span>
                                            {challengeAnswer === "" && !answerInputActive && !challengeVerified ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setAnswerInputActive(true)}
                                                    className="flex h-12 w-20 shrink-0 items-center justify-center rounded-2xl border border-indigo-200 bg-white px-2 sm:w-24"
                                                >
                                                    <span className="text-2xl font-bold text-gray-400">?</span>
                                                </button>
                                            ) : (
                                                <input
                                                    autoFocus={answerInputActive && !challengeVerified}
                                                    type="text"
                                                    inputMode="numeric"
                                                    maxLength={4}
                                                    className="h-12 w-20 shrink-0 rounded-2xl border border-indigo-200 bg-white px-2 text-center text-2xl font-bold text-gray-800 outline-none sm:w-24"
                                                    placeholder="?"
                                                    value={challengeAnswer}
                                                    onChange={(e) => {
                                                        const next = e.target.value.slice(0, 4);
                                                        setChallengeAnswer(next);
                                                        if (next === "" && !challengeVerified) {
                                                            setAnswerInputActive(false);
                                                        }
                                                    }}
                                                    onBlur={() => {
                                                        if (!challengeAnswer && !challengeVerified) {
                                                            setAnswerInputActive(false);
                                                        }
                                                    }}
                                                    disabled={challengeVerified}
                                                />
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-lg font-bold text-gray-800 sm:text-xl">Calculation unavailable</span>
                                    )}
                                </div>
                                <div className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center">
                                    {verifyingChallenge ? (
                                        <svg className="h-4 w-4 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                        </svg>
                                    ) : challengeStatus === "success" ? (
                                        <motion.div
                                            initial={{ scale: 0.7, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ duration: 0.22 }}
                                            className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500"
                                        >
                                            <Check size={18} className="text-white" />
                                        </motion.div>
                                    ) : null}
                                </div>
                            </div>
                        </div>

                        <motion.button
                            type="submit"
                            className="btn-primary w-full py-3.5 mt-2 disabled:cursor-not-allowed disabled:opacity-60"
                            disabled={!canSubmit}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                    Signing in...
                                </span>
                            ) : "Sign In"}
                        </motion.button>
                    </motion.form>
                </div>
            </motion.div>
        </div>
    );
}
