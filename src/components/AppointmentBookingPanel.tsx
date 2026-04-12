"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { ExternalLink, Search, Stethoscope, UserRound } from "lucide-react";

type DoctorRecord = {
  doctor_id: number;
  doctor_name?: string | null;
  specialization?: string | null;
};

const doctorLinks: Record<string, string> = {
  "surgeon|aman": "https://daptoservices.vinfocom.co.in/whatsapp/web/Dr.Aman",
  "surgen|amit sethi": "https://daptoservices.vinfocom.co.in/whatsapp/web/Dr.Amit",
  "senior physican|amit sethi": "https://daptoservices.vinfocom.co.in/whatsapp/web/Dr.Amit",
  "senior consultant|sanjay vinayak": "https://daptoservices.vinfocom.co.in/whatsapp/web/Dr.SanjayVinayak",
};

const normalizeValue = (value: string) => value.trim().toLowerCase();

export default function AppointmentBookingPanel() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState("");
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const loadDoctors = async () => {
      try {
        setIsLoadingDoctors(true);
        setLoadError("");

        const response = await fetch("/api/doctors", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Failed to fetch doctors");
        }

        const data = await response.json();
        const doctorList = Array.isArray(data?.doctors) ? data.doctors : [];

        if (isMounted) {
          setDoctors(doctorList);
        }
      } catch {
        if (isMounted) {
          setLoadError("Unable to load doctors right now.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingDoctors(false);
        }
      }
    };

    loadDoctors();

    return () => {
      isMounted = false;
    };
  }, []);

  const specializations = useMemo(() => {
    return Array.from(
      new Set(
        doctors
          .map((doctor) => doctor.specialization?.trim())
          .filter((specialization): specialization is string => Boolean(specialization))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [doctors]);

  const filteredSpecializations = useMemo(() => {
    const query = normalizeValue(searchTerm);
    if (!query) {
      return specializations;
    }

    return specializations.filter((specialization) =>
      normalizeValue(specialization).includes(query)
    );
  }, [searchTerm, specializations]);

  useEffect(() => {
    const query = normalizeValue(searchTerm);

    if (!query) {
      return;
    }

    const exactMatch = specializations.find(
      (specialization) => normalizeValue(specialization) === query
    );

    if (exactMatch && normalizeValue(selectedSpecialization) !== query) {
      setSelectedSpecialization(exactMatch);
    }
  }, [searchTerm, selectedSpecialization, specializations]);

  const selectedDoctors = useMemo(() => {
    if (!selectedSpecialization) {
      return [];
    }

    const specializationKey = normalizeValue(selectedSpecialization);

    return doctors.filter(
      (doctor) =>
        doctor.doctor_name?.trim() &&
        normalizeValue(doctor.specialization || "") === specializationKey
    );
  }, [doctors, selectedSpecialization]);

  const handleDoctorClick = (doctor: DoctorRecord) => {
    const key = `${normalizeValue(doctor.specialization || "")}|${normalizeValue(doctor.doctor_name || "")}`;
    const link = doctorLinks[key];

    if (!link) {
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="glass-card p-6 md:p-8 text-left max-w-3xl mx-auto"
    >
      <div className="flex items-start gap-3 mb-6">
        <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Stethoscope className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-gray-900">Book Appointment</h3>
          <p className="text-sm text-gray-500 mt-1">
            Select a specialization from the doctors available in our database.
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-indigo-100 bg-white/80 p-4 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search specialization..."
              className="input-field input-field-with-icon pr-4"
              disabled={isLoadingDoctors || Boolean(loadError)}
            />
          </div>

          <select
            className="input-field"
            value={selectedSpecialization}
            onChange={(event) => setSelectedSpecialization(event.target.value)}
            disabled={isLoadingDoctors || Boolean(loadError)}
          >
            <option value="">Select specialization</option>
            {filteredSpecializations.map((specialization) => (
              <option key={specialization} value={specialization}>
                {specialization}
              </option>
            ))}
          </select>
        </div>

        {selectedSpecialization && (
          <div className="mt-4 flex items-center gap-2 text-sm">
            <span className="text-gray-500">Selected:</span>
            <span className="badge badge-booked">{selectedSpecialization}</span>
            <button
              type="button"
              onClick={() => {
                setSelectedSpecialization("");
                setSearchTerm("");
              }}
              className="text-indigo-600 font-medium hover:text-indigo-700"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {isLoadingDoctors && (
        <p className="mt-4 text-sm text-gray-500">Loading specializations...</p>
      )}

      {loadError && (
        <p className="mt-4 text-sm text-red-500">{loadError}</p>
      )}

      {!isLoadingDoctors && !loadError && filteredSpecializations.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">No specialization found for your search.</p>
      )}

      {selectedSpecialization && !isLoadingDoctors && !loadError && (
        <div className="mt-6">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h4 className="text-base font-semibold text-gray-900">Available Doctors</h4>
              <p className="text-sm text-gray-500">{selectedSpecialization}</p>
            </div>
            <span className="badge badge-booked">
              {selectedDoctors.length} doctor{selectedDoctors.length === 1 ? "" : "s"}
            </span>
          </div>

          {selectedDoctors.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-4 py-5 text-sm text-gray-500">
              No doctors found for this specialization.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedDoctors.map((doctor) => {
                const doctorKey = `${normalizeValue(doctor.specialization || "")}|${normalizeValue(doctor.doctor_name || "")}`;
                const doctorLink = doctorLinks[doctorKey];

                return (
                  <motion.button
                    key={doctor.doctor_id}
                    type="button"
                    className="w-full rounded-2xl border border-gray-200 bg-white/80 px-5 py-4 text-left transition-all hover:border-indigo-200 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    disabled={!doctorLink}
                    onClick={() => handleDoctorClick(doctor)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                          <UserRound className="w-5 h-5" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-gray-900">
                            {doctor.doctor_name}
                          </p>
                          <p className="text-sm text-gray-500 mt-1">
                            {doctor.specialization}
                          </p>
                          <p className="text-xs text-indigo-600 mt-2 font-medium">
                            {doctorLink ? "Open appointment link" : "Appointment link not available yet"}
                          </p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-400 shrink-0" />
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
