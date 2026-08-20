"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";

type HmsStatusAlertProps = {
    tone: "success" | "error";
    message: string;
    onDismiss?: () => void;
    className?: string;
};

export function HmsStatusAlert({ tone, message, onDismiss, className = "" }: HmsStatusAlertProps) {
    const isSuccess = tone === "success";

    return (
        <div
            role={isSuccess ? "status" : "alert"}
            aria-live={isSuccess ? "polite" : "assertive"}
            className={`mb-4 flex items-start gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${
                isSuccess ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-red-700 bg-red-50 text-red-800"
            } ${className}`}
        >
            {isSuccess ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
            <span className="min-w-0 flex-1">{message}</span>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    className={`-mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                        isSuccess ? "hover:bg-emerald-100" : "hover:bg-red-100"
                    }`}
                    aria-label="Close message"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
}
