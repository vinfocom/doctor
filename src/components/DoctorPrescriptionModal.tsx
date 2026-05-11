"use client";

import React, { useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X, Upload, ImagePlus, ZoomIn, ZoomOut, FileText, Trash2 } from "lucide-react";
import { getPrescriptionErrorMessage } from "@/lib/prescriptionErrors";

export interface PrescriptionModalTarget {
    patientId: number;
    doctorId: number;
    patientName: string;
    clinicId?: number | null;
    appointmentId?: number | null;
}

interface PrescriptionPageItem {
    prescription_page_id: number;
    page_number: number;
    storage_key: string;
    file_url: string;
    mime_type: string | null;
    original_file_name: string | null;
    file_size_bytes: number | null;
    width: number | null;
    height: number | null;
    created_at: string;
}

interface PrescriptionRecordItem {
    prescription_id: number;
    patient_id: number;
    doctor_id: number;
    clinic_id: number | null;
    appointment_id: number | null;
    uploaded_by_role: "PATIENT" | "DOCTOR" | "STAFF";
    uploaded_by_user_id: number | null;
    uploaded_by_patient_id: number | null;
    note: string | null;
    page_count: number;
    status: "ACTIVE" | "ARCHIVED" | "DELETED";
    created_at: string;
    updated_at: string;
    pages: PrescriptionPageItem[];
    uploaded_by_user?: {
        user_id: number;
        name?: string | null;
        email?: string | null;
    } | null;
    uploaded_by_patient?: {
        patient_id: number;
        full_name?: string | null;
        phone?: string | null;
    } | null;
}

interface DoctorPrescriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    target: PrescriptionModalTarget | null;
    allowUpload?: boolean;
}

export default function DoctorPrescriptionModal({
    isOpen,
    onClose,
    target,
    allowUpload = true,
}: DoctorPrescriptionModalProps) {
    const [prescriptionLoading, setPrescriptionLoading] = useState(false);
    const [prescriptionError, setPrescriptionError] = useState("");
    const [prescriptionRecords, setPrescriptionRecords] = useState<PrescriptionRecordItem[]>([]);
    const [prescriptionUploadNote, setPrescriptionUploadNote] = useState("");
    const [prescriptionUploadFiles, setPrescriptionUploadFiles] = useState<File[]>([]);
    const [prescriptionUploadLoading, setPrescriptionUploadLoading] = useState(false);
    const [viewerOpen, setViewerOpen] = useState(false);
    const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionRecordItem | null>(null);
    const [selectedPrescriptionPageIndex, setSelectedPrescriptionPageIndex] = useState(0);
    const [selectedUploadPreviewIndex, setSelectedUploadPreviewIndex] = useState<number | null>(null);
    const [viewerZoom, setViewerZoom] = useState(1);
    const [portalReady, setPortalReady] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    React.useEffect(() => {
        setPortalReady(true);
        return () => setPortalReady(false);
    }, []);

    const closeViewer = useCallback(() => {
        setViewerOpen(false);
        setSelectedPrescription(null);
        setSelectedPrescriptionPageIndex(0);
        setViewerZoom(1);
    }, []);

    const resetLocalState = useCallback(() => {
        closeViewer();
        setSelectedUploadPreviewIndex(null);
        setPrescriptionError("");
        setPrescriptionRecords([]);
        setPrescriptionUploadFiles([]);
        setPrescriptionUploadNote("");
        setPrescriptionUploadLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [closeViewer]);

    const handleClose = useCallback(() => {
        resetLocalState();
        onClose();
    }, [onClose, resetLocalState]);

    const formatPrescriptionUploader = useCallback((record: PrescriptionRecordItem) => {
        if (record.uploaded_by_role === "PATIENT") {
            return record.uploaded_by_patient?.full_name
                ? `Uploaded by: Patient - ${record.uploaded_by_patient.full_name}`
                : "Uploaded by: Patient";
        }

        if (record.uploaded_by_role === "DOCTOR") {
            return record.uploaded_by_user?.name
                ? `Uploaded by: Doctor - ${record.uploaded_by_user.name}`
                : "Uploaded by: Doctor";
        }

        return record.uploaded_by_user?.name
            ? `Uploaded by: Staff - ${record.uploaded_by_user.name}`
            : "Uploaded by: Staff";
    }, []);

    const loadPrescriptions = useCallback(async () => {
        if (!target) return;
        setPrescriptionLoading(true);
        setPrescriptionError("");
        try {
            const res = await fetch(
                `/api/prescriptions?patient_id=${target.patientId}&doctor_id=${target.doctorId}`,
                { cache: "no-store" }
            );
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || "Failed to load prescriptions");
            }
            setPrescriptionRecords(data?.prescriptions || []);
        } catch (error) {
            setPrescriptionError(getPrescriptionErrorMessage(error, "Failed to load prescriptions"));
        } finally {
            setPrescriptionLoading(false);
        }
    }, [target]);

    React.useEffect(() => {
        if (!isOpen || !target) return;
        void loadPrescriptions();
    }, [isOpen, loadPrescriptions, target]);

    const handlePrescriptionFilesChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const nextFiles = Array.from(event.target.files || []);
        if (nextFiles.length === 0) return;

        setPrescriptionUploadFiles((prev) => {
            const merged = [...prev];

            nextFiles.forEach((file) => {
                const duplicateIndex = merged.findIndex(
                    (item) =>
                        item.name === file.name &&
                        item.size === file.size &&
                        item.lastModified === file.lastModified
                );

                if (duplicateIndex === -1 && merged.length < 5) {
                    merged.push(file);
                }
            });

            return merged.slice(0, 5);
        });

        event.target.value = "";
    }, []);

    const handlePrescriptionUpload = useCallback(async () => {
        if (!target || !allowUpload) return;
        if (!target.patientId || !target.doctorId) {
            setPrescriptionError("Prescription upload is only allowed inside the correct patient-doctor context.");
            return;
        }
        if (prescriptionUploadFiles.length === 0) {
            setPrescriptionError("Please select at least one prescription image.");
            return;
        }

        setPrescriptionUploadLoading(true);
        setPrescriptionError("");

        try {
            const formData = new FormData();
            formData.append("patient_id", String(target.patientId));
            formData.append("doctor_id", String(target.doctorId));
            if (target.clinicId) {
                formData.append("clinic_id", String(target.clinicId));
            }
            if (target.appointmentId) {
                formData.append("appointment_id", String(target.appointmentId));
            }
            if (prescriptionUploadNote.trim()) {
                formData.append("note", prescriptionUploadNote.trim());
            }
            prescriptionUploadFiles.forEach((file) => formData.append("files", file));

            const uploadRes = await fetch("/api/prescriptions", {
                method: "POST",
                body: formData,
            });
            const uploadData = await uploadRes.json();
            if (!uploadRes.ok) {
                throw new Error(uploadData?.error || "Failed to upload prescription pages");
            }

            setPrescriptionUploadFiles([]);
            setPrescriptionUploadNote("");
            if (fileInputRef.current) fileInputRef.current.value = "";
            await loadPrescriptions();
        } catch (error) {
            setPrescriptionError(getPrescriptionErrorMessage(error, "Failed to upload prescription"));
        } finally {
            setPrescriptionUploadLoading(false);
        }
    }, [allowUpload, loadPrescriptions, prescriptionUploadFiles, prescriptionUploadNote, target]);

    const handleDeletePrescription = useCallback(async (record: PrescriptionRecordItem) => {
        if (!target) return;
        const confirmed = window.confirm("Delete this prescription and all of its uploaded pages?");
        if (!confirmed) return;

        setPrescriptionError("");
        try {
            const res = await fetch(
                `/api/prescriptions/${record.prescription_id}?patient_id=${target.patientId}&doctor_id=${target.doctorId}`,
                { method: "DELETE" }
            );
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data?.error || "Failed to delete prescription");
            }

            if (selectedPrescription?.prescription_id === record.prescription_id) {
                closeViewer();
            }

            await loadPrescriptions();
        } catch (error) {
            setPrescriptionError(getPrescriptionErrorMessage(error, "Failed to delete prescription"));
        }
    }, [closeViewer, loadPrescriptions, selectedPrescription?.prescription_id, target]);

    const selectedPrescriptionPage = useMemo(
        () => selectedPrescription?.pages?.[selectedPrescriptionPageIndex] ?? null,
        [selectedPrescription, selectedPrescriptionPageIndex]
    );

    const prescriptionUploadPreviews = useMemo(
        () =>
            prescriptionUploadFiles.map((file) => ({
                file,
                url: URL.createObjectURL(file),
            })),
        [prescriptionUploadFiles]
    );

    React.useEffect(() => {
        return () => {
            prescriptionUploadPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
        };
    }, [prescriptionUploadPreviews]);

    const selectedUploadPreview = useMemo(
        () => (selectedUploadPreviewIndex === null ? null : prescriptionUploadPreviews[selectedUploadPreviewIndex] ?? null),
        [prescriptionUploadPreviews, selectedUploadPreviewIndex]
    );

    if (!isOpen || !target || !portalReady) return null;

    return createPortal(
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-2 sm:px-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    onClick={(event) => event.stopPropagation()}
                    className="w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl"
                >
                    <div className="flex items-start justify-between border-b border-gray-100 px-4 py-4 sm:px-6 sm:py-5">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 sm:text-xl">Prescriptions</h2>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            className="rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="max-h-[42vh] overflow-y-auto border-b border-gray-100 px-4 py-4 sm:max-h-[48vh] sm:px-6 sm:py-5 lg:max-h-[72vh] lg:border-b-0 lg:border-r lg:border-r-gray-100">
                            {prescriptionLoading ? (
                                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                                    <p className="mt-4 text-sm">Loading prescriptions...</p>
                                </div>
                            ) : prescriptionError ? (
                                <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                                    {prescriptionError}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            void loadPrescriptions();
                                        }}
                                        className="mt-3 inline-flex rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                                    >
                                        Retry
                                    </button>
                                </div>
                            ) : prescriptionRecords.length === 0 ? (
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-8 text-center text-gray-500">
                                    <FileText className="mx-auto mb-3 text-gray-300" size={28} />
                                    <p className="font-medium text-gray-700">No prescriptions uploaded yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {prescriptionRecords.map((record) => (
                                        <button
                                            key={record.prescription_id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedPrescription(record);
                                                setSelectedPrescriptionPageIndex(0);
                                                setViewerZoom(1);
                                                setViewerOpen(true);
                                            }}
                                            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-left transition-colors hover:border-indigo-200 hover:bg-indigo-50 sm:px-4 sm:py-4"
                                        >
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-gray-900">
                                                        Uploaded on {new Date(record.created_at).toLocaleDateString("en-IN")}
                                                    </p>
                                                    <p className="mt-1 text-xs text-gray-500 break-words">{formatPrescriptionUploader(record)}</p>
                                                </div>
                                                <div className="flex items-center gap-2 self-start sm:self-auto">
                                                    <button
                                                        type="button"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            void handleDeletePrescription(record);
                                                        }}
                                                        className="rounded-full border border-red-200 bg-white p-2 text-red-600 transition hover:bg-red-50"
                                                        aria-label="Delete prescription"
                                                        title="Delete prescription"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-700">
                                                        {record.page_count} {record.page_count === 1 ? "page" : "pages"}
                                                    </span>
                                                </div>
                                            </div>
                                            {record.note ? (
                                                <div className="mt-3 rounded-lg border border-gray-100 bg-white px-3 py-3">
                                                    <p className="text-sm text-gray-700 break-words">{record.note}</p>
                                                </div>
                                            ) : null}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="max-h-[40vh] overflow-y-auto bg-white px-4 py-4 sm:max-h-[44vh] sm:px-6 sm:py-5 lg:max-h-[72vh]">
                            {allowUpload ? (
                                <>
                                    <div className="flex items-center gap-2">
                                        <Upload size={16} className="text-indigo-600" />
                                        <h3 className="text-sm font-semibold text-gray-900">Upload Prescription</h3>
                                    </div>

                                    <div className="mt-5 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Add Pages</label>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif"
                                                multiple
                                                onChange={handlePrescriptionFilesChange}
                                                className="block w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 file:mb-2 file:mr-0 file:block file:w-full file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 sm:file:mb-0 sm:file:mr-3 sm:file:inline-block sm:file:w-auto"
                                            />
                                        </div>

                                        {prescriptionUploadFiles.length > 0 && (
                                            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                                    {prescriptionUploadPreviews.map((preview, index) => (
                                                        <div key={`${preview.file.name}-${index}`} className="relative overflow-hidden rounded-xl border border-gray-200 bg-white">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedUploadPreviewIndex(index)}
                                                                className="block aspect-[3/4] w-full bg-slate-100"
                                                            >
                                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                                <img
                                                                    src={preview.url}
                                                                    alt={`Selected prescription page ${index + 1}`}
                                                                    className="h-full w-full object-cover"
                                                                />
                                                            </button>
                                                            <div className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1.5">
                                                                <span className="text-xs font-semibold text-white">Page {index + 1}</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setPrescriptionUploadFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
                                                                    if (fileInputRef.current && prescriptionUploadFiles.length === 1) {
                                                                        fileInputRef.current.value = "";
                                                                    }
                                                                }}
                                                                className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-xs font-medium text-white transition hover:bg-black/80"
                                                            >
                                                                X
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">Note (Optional)</label>
                                            <textarea
                                                value={prescriptionUploadNote}
                                                onChange={(e) => setPrescriptionUploadNote(e.target.value)}
                                                rows={4}
                                                maxLength={500}
                                                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                                placeholder="Add a short note for this prescription"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={handlePrescriptionUpload}
                                            disabled={prescriptionUploadLoading}
                                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {prescriptionUploadLoading ? (
                                                <>
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                                                    Uploading...
                                                </>
                                            ) : (
                                                <>
                                                    <Upload size={16} />
                                                    Upload Prescription
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">
                                    You have view-only access for prescriptions in this portal.
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>

            {viewerOpen && selectedPrescription && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm px-2 sm:px-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        className="w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-2xl bg-slate-950 text-white shadow-2xl"
                    >
                        <div className="flex items-start justify-between border-b border-white/10 px-4 py-4 sm:px-6 sm:py-5">
                            <div>
                                <h2 className="text-lg font-bold sm:text-xl">Prescription Viewer</h2>
                                <p className="mt-1 text-xs text-white/70 sm:text-sm">
                                    Uploaded on {new Date(selectedPrescription.created_at).toLocaleDateString("en-IN")} | Page {selectedPrescriptionPageIndex + 1} of {selectedPrescription.pages.length}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={closeViewer}
                                className="rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setViewerZoom((prev) => Math.max(1, Number((prev - 0.25).toFixed(2))))}
                                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium transition hover:bg-white/20"
                                >
                                    <ZoomOut size={16} />
                                    Zoom Out
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewerZoom((prev) => Math.min(3, Number((prev + 0.25).toFixed(2))))}
                                    className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium transition hover:bg-white/20"
                                >
                                    <ZoomIn size={16} />
                                    Zoom In
                                </button>
                            </div>
                            <span className="text-sm text-white/70 lg:text-right">Zoom {Math.round(viewerZoom * 100)}%</span>
                        </div>

                        <div className="grid gap-0 lg:grid-cols-[1fr_280px]">
                            <div className="h-[42vh] overflow-auto bg-slate-900 px-4 py-4 sm:h-[50vh] sm:px-6 sm:py-6 lg:h-[calc(92vh-12rem)] lg:min-h-[55vh]">
                                {selectedPrescriptionPage ? (
                                    <div className="flex h-full w-full items-center justify-center">
                                        <img
                                            src={selectedPrescriptionPage.file_url}
                                            alt={`Prescription page ${selectedPrescriptionPage.page_number}`}
                                            className="h-full max-h-full w-full max-w-full rounded-xl object-contain shadow-2xl transition-transform duration-200"
                                            style={{ transform: `scale(${viewerZoom})`, transformOrigin: "center center" }}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex h-full w-full items-center justify-center">
                                        <p className="text-white/70">No page available.</p>
                                    </div>
                                )}
                            </div>

                            <div className="border-t border-white/10 bg-slate-950 px-4 py-4 sm:px-6 sm:py-5 lg:border-l lg:border-t-0 lg:border-l-white/10">
                                {selectedPrescription.note ? (
                                    <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-white/50">Note</p>
                                        <p className="mt-2 text-sm text-white/85">{selectedPrescription.note}</p>
                                    </div>
                                ) : null}

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
                                    {selectedPrescription.pages.map((page, index) => (
                                        <button
                                            key={page.prescription_page_id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedPrescriptionPageIndex(index);
                                                setViewerZoom(1);
                                            }}
                                            className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
                                                selectedPrescriptionPageIndex === index
                                                    ? "border-indigo-400 bg-indigo-500/10 text-white"
                                                    : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                                            }`}
                                        >
                                            <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-slate-900">
                                                <img
                                                    src={page.file_url}
                                                    alt={`Prescription thumbnail for page ${page.page_number}`}
                                                    className="h-full w-full object-cover"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold">Page {page.page_number}</p>
                                                <p className="mt-1 text-xs text-white/60">
                                                    Tap to preview this page
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {selectedUploadPreview && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 px-2 sm:px-4">
                    <div className="w-full max-w-3xl overflow-hidden rounded-2xl bg-slate-950 text-white shadow-2xl">
                        <div className="flex items-start justify-between border-b border-white/10 px-4 py-4 sm:px-6">
                            <div>
                                <h3 className="text-lg font-bold">Selected Page Preview</h3>
                                <p className="mt-1 text-xs text-white/70 sm:text-sm">
                                    Page {selectedUploadPreviewIndex! + 1} of {prescriptionUploadPreviews.length}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedUploadPreviewIndex(null)}
                                className="rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="flex h-[70vh] items-center justify-center bg-slate-900 px-4 py-4 sm:px-6 sm:py-6">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={selectedUploadPreview.url}
                                alt={`Selected prescription preview ${selectedUploadPreviewIndex! + 1}`}
                                className="h-full max-h-full w-full max-w-full rounded-xl object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}
