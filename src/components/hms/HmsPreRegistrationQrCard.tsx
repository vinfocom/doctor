"use client";

import { useState } from "react";
import { Download, Loader2, QrCode } from "lucide-react";
import Image from "next/image";
import { HmsStatusAlert } from "@/components/hms/HmsStatusAlert";
import { useHmsAutoDismissMessage } from "@/components/hms/useHmsAutoDismissMessage";

export default function HmsPreRegistrationQrCard() {
    const [previewUrl, setPreviewUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    useHmsAutoDismissMessage(error, () => setError(""), 7500);
    useHmsAutoDismissMessage(success, () => setSuccess(""), 5000);

    const generateQr = async () => {
        setLoading(true);
        setError("");
        setSuccess("");
        try {
            const response = await fetch("/api/hms/hospital-admin/pre-registration-qr", {
                method: "POST",
                cache: "no-store",
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data?.error || "Unable to generate QR.");
            }
            setPreviewUrl(data.preview_data_url || "");
            setSuccess("QR generated.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to generate QR.");
        } finally {
            setLoading(false);
        }
    };

    const downloadQr = () => {
        window.open("/api/hms/hospital-admin/pre-registration-qr/download", "_blank", "noopener,noreferrer");
    };

    return (
        <section className="mt-6 rounded-lg border border-black bg-white p-4 text-black">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-bold text-black">Pre-registration Token QR</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void generateQr()}
                        disabled={loading}
                        className="inline-flex h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-bold text-white disabled:opacity-60"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <QrCode size={16} />}
                        Generate QR
                    </button>
                    <button
                        type="button"
                        onClick={downloadQr}
                        className="inline-flex h-10 items-center gap-2 rounded-lg border border-black px-4 text-sm font-bold text-black hover:bg-black hover:text-white"
                    >
                        <Download size={16} />
                        Download QR
                    </button>
                </div>
            </div>

            {error ? <HmsStatusAlert tone="error" message={error} onDismiss={() => setError("")} className="mt-4" /> : null}
            {success ? <HmsStatusAlert tone="success" message={success} onDismiss={() => setSuccess("")} className="mt-4" /> : null}

            {previewUrl ? (
                <div className="mt-4 inline-flex rounded-lg border border-black bg-white p-3">
                    <Image
                        src={previewUrl}
                        alt="Pre-registration token QR"
                        width={192}
                        height={192}
                        unoptimized
                        className="h-48 w-48 object-contain"
                    />
                </div>
            ) : null}
        </section>
    );
}
