
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

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

export default function AppointmentModal({ isOpen, onClose, onSuccess }: AppointmentModalProps) {
    const [clinics, setClinics] = useState<Clinic[]>([]);
    const [schedules, setSchedules] = useState<Schedule[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        patient_phone: '',
        patient_name: '', // Optional, for new patients
        clinic_id: '',
        date: '',
        time: '',
        symptoms: ''
    });

    const [availableSlots, setAvailableSlots] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            fetchClinics();
        }
    }, [isOpen]);

    useEffect(() => {
        if (formData.clinic_id && formData.date) {
            calculateSlots();
        }
    }, [formData.clinic_id, formData.date, schedules]);


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

    const fetchSchedule = async (clinicId: string) => {
        try {
            const res = await fetch(`/api/schedule?clinicId=${clinicId}`);
            if (res.ok) {
                const data = await res.json();
                setSchedules(data.schedules || []);
            }
        } catch (err) {
            console.error("Failed to fetch schedule", err);
        }
    };

    const handleClinicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const clinicId = e.target.value;
        setFormData({ ...formData, clinic_id: clinicId, date: '', time: '' });
        if (clinicId) {
            fetchSchedule(clinicId);
        } else {
            setSchedules([]);
        }
    };

    const calculateSlots = async () => {
        if (!formData.date || !formData.clinic_id) return;

        const date = new Date(formData.date);
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

        const schedule = schedules.find(s => s.day_of_week === dayOfWeek && s.clinic_id === Number(formData.clinic_id));

        if (!schedule) {
            setAvailableSlots([]);
            return;
        }

        // Generate slots based on start_time, end_time, and slot_duration
        // This is a simplified version. Ideally, we should also check for existing appointments to exclude booked slots.
        // For now, we will just generate all possible slots.

        // Fetch existing appointments for this date/clinic to filter out booked slots
        let bookedTimes: string[] = [];
        try {
            // We need an endpoint to get booked slots. 
            // For now, let's assume valid slots are generated and backend rejects if booked.
            // Ideally: const res = await fetch(\`/api/appointments?date=\${formData.date}&clinicId=\${formData.clinic_id}\`);
            // if (res.ok) { const apps = await res.json(); bookedTimes = apps.map(a => a.slot.slot_time); }
        } catch (e) {
            console.error(e);
        }


        const slots: string[] = [];
        const start = new Date(`1970-01-01T${new Date(schedule.start_time).toLocaleTimeString('en-US', { hour12: false })}`);
        const end = new Date(`1970-01-01T${new Date(schedule.end_time).toLocaleTimeString('en-US', { hour12: false })}`);
        const duration = schedule.slot_duration || 30;

        let current = new Date(start);
        while (current < end) {
            const timeString = current.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
            if (!bookedTimes.includes(timeString)) {
                slots.push(timeString);
            }
            current.setMinutes(current.getMinutes() + duration);
        }

        setAvailableSlots(slots);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/appointments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patient_phone: formData.patient_phone,
                    patient_name: formData.patient_name, // Backend needs to handle this if patient doesn't exist
                    clinic_id: formData.clinic_id,
                    slot_date: formData.date,
                    slot_time: formData.time,
                    symptoms: formData.symptoms
                    // doctor_id and admin_id are handled by backend session ideally, or passed if needed
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
                                        <option key={slot} value={slot}>{slot}</option>
                                    ))}
                                </select>
                                {formData.date && formData.clinic_id && availableSlots.length === 0 && (
                                    <p className="text-xs text-orange-500 mt-1">No slots available or no schedule for this day.</p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Symptoms</label>
                                <textarea
                                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    rows={3}
                                    placeholder="Describe symptoms..."
                                    value={formData.symptoms}
                                    onChange={(e) => setFormData({ ...formData, symptoms: e.target.value })}
                                />
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

