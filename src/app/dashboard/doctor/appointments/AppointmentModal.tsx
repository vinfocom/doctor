
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { convertTo12Hour, convertTo24Hour } from '@/lib/timeUtils';

interface Clinic {
    clinic_id: number;
    clinic_name: string;
}

interface AppointmentModalInitialValues {
    appointmentId?: number;
    patient_phone?: string;
    patient_name?: string;
    clinic_id?: string;
    date?: string;
    time?: string;
    booking_for?: BookingFor;
}

interface AppointmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    mode?: 'create' | 'reschedule';
    initialValues?: AppointmentModalInitialValues;
}

type BookingFor = 'SELF' | 'OTHER';

interface MatchedPatient {
    patient_id: number;
    full_name: string | null;
}

const to12HourLabel = (time: string): string => {
    if (!time) return "";
    return /AM|PM/i.test(time) ? time : convertTo12Hour(time);
};

const emptyForm = {
    patient_phone: '',
    patient_name: '',
    clinic_id: '',
    date: '',
    time: '',
    booking_for: 'SELF' as BookingFor,
};

export default function AppointmentModal({
    isOpen,
    onClose,
    onSuccess,
    mode = 'create',
    initialValues,
}: AppointmentModalProps) {
    const [clinics, setClinics] = useState<Clinic[]>([]);
    const [slotDuration, setSlotDuration] = useState<number>(30);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [formData, setFormData] = useState(emptyForm);
    const [availableSlots, setAvailableSlots] = useState<string[]>([]);
    const [matchedPatients, setMatchedPatients] = useState<MatchedPatient[]>([]);
    const [lookupLoading, setLookupLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchClinics();
            setError('');
            setAvailableSlots([]);
            setSlotDuration(30);
            setMatchedPatients([]);
            setLookupLoading(false);
            setFormData({
                patient_phone: initialValues?.patient_phone || '',
                patient_name: initialValues?.patient_name || '',
                clinic_id: initialValues?.clinic_id || '',
                date: initialValues?.date || '',
                time: initialValues?.time || '',
                booking_for: initialValues?.booking_for || 'SELF',
            });
        } else {
            setFormData(emptyForm);
            setAvailableSlots([]);
            setError('');
            setMatchedPatients([]);
            setLookupLoading(false);
        }
    }, [initialValues, isOpen]);

    useEffect(() => {
        if (!isOpen || mode !== 'create') return;

        const phone = formData.patient_phone.trim();
        if (phone.length < 8) {
            setMatchedPatients([]);
            setLookupLoading(false);
            return;
        }

        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setLookupLoading(true);
            try {
                const res = await fetch(`/api/patients/lookup?phone=${encodeURIComponent(phone)}`, {
                    signal: controller.signal,
                });

                if (!res.ok) {
                    setMatchedPatients([]);
                    return;
                }

                const data = await res.json();
                setMatchedPatients(data.patients || []);
            } catch (error) {
                if ((error as Error).name !== 'AbortError') {
                    setMatchedPatients([]);
                }
            } finally {
                setLookupLoading(false);
            }
        }, 250);

        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [formData.patient_phone, isOpen, mode]);


    const fetchClinics = async () => {
        try {
            const res = await fetch('/api/clinics');
            if (res.ok) {
                const data = await res.json();
                setClinics(data.clinics || []);
            }
        } catch (err) {
            console.error("Failed to fetch clinics", err);
        }
    };

    const fetchSlots = useCallback(async () => {
        if (!formData.date || !formData.clinic_id) return;

        try {
            const res = await fetch(`/api/slots?date=${formData.date}&clinicId=${formData.clinic_id}`);
            if (res.ok) {
                const data = await res.json();
                setAvailableSlots(data.slots || []);
                if (data.slot_duration) {
                    setSlotDuration(data.slot_duration);
                }
            } else {
                setAvailableSlots([]);
            }
        } catch (e) {
            console.error(e);
            setAvailableSlots([]);
        }
    }, [formData.clinic_id, formData.date]);

    useEffect(() => {
        if (formData.clinic_id && formData.date) {
            fetchSlots();
        }
    }, [fetchSlots, formData.clinic_id, formData.date]);

    const handleClinicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const clinicId = e.target.value;
        setFormData({ ...formData, clinic_id: clinicId, date: '', time: '' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const duration = slotDuration;

            let startTime24 = formData.time;
            if (startTime24.match(/AM|PM/i)) {
                startTime24 = convertTo24Hour(formData.time);
            }

            const [sh, sm] = startTime24.split(':').map(Number);
            const startTimeDate = new Date();
            startTimeDate.setHours(sh, sm, 0, 0);

            const endTimeDate = new Date(startTimeDate.getTime() + duration * 60000);

            const eh = endTimeDate.getHours().toString().padStart(2, '0');
            const em = endTimeDate.getMinutes().toString().padStart(2, '0');
            const endTime24 = `${eh}:${em}`;

            const payload = mode === 'reschedule'
                ? {
                    appointmentId: initialValues?.appointmentId,
                    appointment_date: formData.date,
                    start_time: startTime24,
                    end_time: endTime24,
                    booking_for: formData.booking_for,
                    rescheduled_by: 'DOCTOR',
                }
                : {
                    patient_phone: formData.patient_phone,
                    patient_name: formData.patient_name,
                    booking_for: formData.booking_for,
                    clinic_id: formData.clinic_id,
                    appointment_date: formData.date,
                    start_time: startTime24,
                    end_time: endTime24,
                };

            const res = await fetch('/api/appointments', {
                method: mode === 'reschedule' ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to create appointment');
            }
        } catch {
            setError('An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden"
                    >
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-800">
                                {mode === 'reschedule' ? 'Reschedule Appointment' : 'New Appointment'}
                            </h2>
                            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100">
                                    {error}
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Patient Phone</label>
                                <input
                                    type="tel"
                                    required
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    placeholder="Enter phone number"
                                    value={formData.patient_phone}
                                    onChange={(e) => setFormData({ ...formData, patient_phone: e.target.value })}
                                    readOnly={mode === 'reschedule'}
                                />
                                {mode === 'create' && lookupLoading && (
                                    <p className="mt-1 text-xs text-gray-400">Checking existing patients...</p>
                                )}
                            </div>

                            {mode === 'create' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Booking For</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['SELF', 'OTHER'] as BookingFor[]).map((value) => (
                                            <button
                                                key={value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, booking_for: value })}
                                                className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                                                    formData.booking_for === value
                                                        ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                                                }`}
                                            >
                                                {value === 'SELF' ? 'Self' : 'Other'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Patient Name{mode === 'create' ? '' : ' (Optional if existing)'}
                                </label>
                                <input
                                    type="text"
                                    required={mode === 'create'}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    placeholder="Enter full name"
                                    value={formData.patient_name}
                                    onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
                                    readOnly={mode === 'reschedule'}
                                />
                                {mode === 'create' && matchedPatients.length > 0 && (
                                    <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3">
                                        <p className="text-xs font-medium text-amber-700">Existing names on this phone</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {matchedPatients.map((patient) => (
                                                <button
                                                    key={patient.patient_id}
                                                    type="button"
                                                    onClick={() => setFormData({
                                                        ...formData,
                                                        patient_name: patient.full_name || '',
                                                        booking_for: 'SELF',
                                                    })}
                                                    className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100"
                                                >
                                                    {patient.full_name || 'Unnamed patient'}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="mt-2 text-xs text-amber-700">
                                            Same name reuses the same patient. Different name books for `Other` on the same phone.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
                                    <select
                                        required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                        value={formData.clinic_id}
                                        onChange={handleClinicChange}
                                        disabled={mode === 'reschedule'}
                                    >
                                        <option value="">Select Clinic</option>
                                        {clinics.map(c => (
                                            <option key={c.clinic_id} value={c.clinic_id}>{c.clinic_name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                    <input
                                        type="date"
                                        required
                                        min={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                        value={formData.date}
                                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Time Slot</label>
                                <select
                                    required
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    value={formData.time}
                                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                                    disabled={!formData.date || !formData.clinic_id || availableSlots.length === 0}
                                >
                                    <option value="">Select Time</option>
                                    {availableSlots.map(slot => (
                                        <option key={slot} value={slot}>{to12HourLabel(slot)}</option>
                                    ))}
                                </select>
                                {formData.date && formData.clinic_id && availableSlots.length === 0 && (
                                    <p className="text-xs text-orange-500 mt-1">No slots available or no schedule for this day.</p>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm shadow-indigo-200 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading
                                        ? (mode === 'reschedule' ? 'Saving...' : 'Creating...')
                                        : (mode === 'reschedule' ? 'Save Reschedule' : 'Create Appointment')}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
