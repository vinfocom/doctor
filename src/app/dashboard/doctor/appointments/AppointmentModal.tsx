
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { formatTime, convertTo12Hour, convertTo24Hour, parseTime } from '@/lib/timeUtils';

interface Clinic {
    clinic_id: number;
    clinic_name: string;
}

interface Schedule {
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration: number;
    clinic_id: number;
}

interface AppointmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const to12HourLabel = (time: string): string => {
    if (!time) return "";
    return /AM|PM/i.test(time) ? time : convertTo12Hour(time);
};

export default function AppointmentModal({ isOpen, onClose, onSuccess }: AppointmentModalProps) {
    const [clinics, setClinics] = useState<Clinic[]>([]);
    // Schedules removed, using API for slots and duration
    const [slotDuration, setSlotDuration] = useState<number>(30);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        patient_phone: '',
        patient_name: '', // Optional, for new patients
        clinic_id: '',
        date: '',
        time: '',

    });

    const [availableSlots, setAvailableSlots] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchClinics();
        }
    }, [isOpen]);

    useEffect(() => {
        if (formData.clinic_id && formData.date) {
            fetchSlots();
        }
    }, [formData.clinic_id, formData.date]);


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

    // calculateSlots replaced by fetchSlots
    const fetchSlots = async () => {
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
    };

    const handleClinicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const clinicId = e.target.value;
        setFormData({ ...formData, clinic_id: clinicId, date: '', time: '' });
        // No need to fetch schedule manually anymore
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const duration = slotDuration;

            // Parse selected 12h or 24h time. Backend returns HH:MM 24h or 12h? 
            // The API returns "HH:MM" (e.g. "09:00"). 
            // If API returns 24h, `convertTo24Hour` might fail if it expects AM/PM.
            // My API route returns `toLocaleTimeString` with `en-GB`. It returns "09:00".
            // So `formData.time` is "09:00".
            // `convertTo24Hour` handles "09:00" -> "09:00" if no AM/PM? 
            // Let's check `convertTo24Hour`. It expects " ".
            // If `formData.time` is already 24h, we use it directly.

            let startTime24 = formData.time;
            if (startTime24.match(/AM|PM/i)) {
                startTime24 = convertTo24Hour(formData.time);
            }

            // Calculate end time
            const [sh, sm] = startTime24.split(':').map(Number);
            const startTimeDate = new Date();
            startTimeDate.setHours(sh, sm, 0, 0);

            const endTimeDate = new Date(startTimeDate.getTime() + duration * 60000);

            // Format end time to HH:MM (24h)
            const eh = endTimeDate.getHours().toString().padStart(2, '0');
            const em = endTimeDate.getMinutes().toString().padStart(2, '0');
            const endTime24 = `${eh}:${em}`;


            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_phone: formData.patient_phone,
                    patient_name: formData.patient_name,
                    clinic_id: formData.clinic_id,
                    appointment_date: formData.date,
                    start_time: startTime24,
                    end_time: endTime24
                })
            });

            if (res.ok) {
                onSuccess();
                onClose();
            } else {
                const data = await res.json();
                setError(data.error || 'Failed to create appointment');
            }
        } catch (err) {
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
                            <h2 className="text-xl font-bold text-gray-800">New Appointment</h2>
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
                                />
                            </div>

                            {/* Ideally verify patient first, but for now allow manual entry for new patients */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Patient Name (Optional if existing)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    placeholder="Enter full name"
                                    value={formData.patient_name}
                                    onChange={(e) => setFormData({ ...formData, patient_name: e.target.value })}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Clinic</label>
                                    <select
                                        required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                        value={formData.clinic_id}
                                        onChange={handleClinicChange}
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
                                        min={new Date().toISOString().split('T')[0]}
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
                                    {loading ? 'Creating...' : 'Create Appointment'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
