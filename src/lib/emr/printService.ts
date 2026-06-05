import prisma from "@/lib/prisma";
import {
  getPrescriptionRecord,
} from "@/lib/emr/prescriptionService";
import { resolvePrescriptionLayoutSettings } from "@/lib/emr/layoutService";
import type { EmrPrintablePrescription } from "@/lib/emr/types";

export async function getPrintablePrescriptionData(input: {
  prescriptionId: number;
  doctorId: number;
}): Promise<EmrPrintablePrescription | null> {
  const prescription = await getPrescriptionRecord(
    input.prescriptionId,
    input.doctorId
  );

  if (!prescription || prescription.status !== "final" || prescription.is_deleted) {
    return null;
  }

  const [doctor, patient, clinic, layoutSettings] = await Promise.all([
    prisma.doctors.findUnique({
      where: { doctor_id: input.doctorId },
      select: {
        doctor_id: true,
        doctor_name: true,
        education: true,
        registration_no: true,
        specialization: true,
      },
    }),
    prisma.patients.findUnique({
      where: { patient_id: prescription.patient_id },
      select: {
        patient_id: true,
        full_name: true,
        phone: true,
        age: true,
        gender: true,
      },
    }),
    prescription.clinic_id
      ? prisma.clinics.findUnique({
          where: { clinic_id: prescription.clinic_id },
          select: {
            clinic_id: true,
            clinic_name: true,
            phone: true,
            location: true,
          },
        })
      : Promise.resolve(null),
    resolvePrescriptionLayoutSettings({
      doctorId: input.doctorId,
      clinicId: prescription.clinic_id,
    }),
  ]);

  if (!doctor || !patient) {
    return null;
  }

  return {
    prescription,
    doctor: {
      doctor_id: doctor.doctor_id,
      doctor_name: doctor.doctor_name,
      qualification: doctor.education,
      registration_no: doctor.registration_no,
      specialization: doctor.specialization,
    },
    patient: {
      patient_id: patient.patient_id,
      full_name: patient.full_name,
      phone: patient.phone,
      age: patient.age,
      gender: patient.gender,
    },
    clinic: clinic
      ? {
          clinic_id: clinic.clinic_id,
          clinic_name: clinic.clinic_name,
          phone: clinic.phone,
          location: clinic.location,
        }
      : null,
    layout_settings: layoutSettings,
    pdf_hook: {
      pdf_url: prescription.pdf_url,
      source: "structured_sql",
      print_data_api: `/api/emr/prescriptions/${prescription.id}/print-data`,
    },
  };
}
