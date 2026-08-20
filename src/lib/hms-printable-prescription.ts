import prisma from "@/lib/prisma";
import { getPrescriptionRecord } from "@/lib/emr/prescriptionService";
import type { EmrPrintablePrescription } from "@/lib/emr/types";
import { getHmsEmrLayoutSettings } from "@/lib/hms-emr-layout-settings";

export async function getHmsPrintablePrescriptionData(input: {
  hospitalId: number;
  adminId: number;
  hospitalCode: string;
  prescriptionId: number;
  doctorId: number;
}): Promise<EmrPrintablePrescription | null> {
  const prescription = await getPrescriptionRecord(input.prescriptionId, input.doctorId);

  if (!prescription || prescription.status !== "final" || prescription.is_deleted) {
    return null;
  }

  const [doctor, patient, referredToDoctor, hmsLayout] = await Promise.all([
    prisma.doctors.findUnique({
      where: { doctor_id: input.doctorId },
      select: {
        doctor_id: true,
        doctor_name: true,
        education: true,
        registration_no: true,
        specialization: true,
        admin_id: true,
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
        admin_id: true,
        hospital_group_code: true,
      },
    }),
    prescription.referred_to_doctor_id
      ? prisma.doctors.findFirst({
          where: {
            doctor_id: prescription.referred_to_doctor_id,
            admin_id: input.adminId,
          },
          select: {
            doctor_id: true,
            doctor_name: true,
            specialization: true,
            education: true,
          },
        })
      : Promise.resolve(null),
    getHmsEmrLayoutSettings({
      hospitalId: input.hospitalId,
      doctorId: input.doctorId,
    }),
  ]);

  if (
    !doctor ||
    !patient ||
    doctor.admin_id !== input.adminId ||
    patient.admin_id !== input.adminId ||
    patient.hospital_group_code !== input.hospitalCode
  ) {
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
    referred_to_doctor: referredToDoctor
      ? {
          doctor_id: referredToDoctor.doctor_id,
          doctor_name: referredToDoctor.doctor_name,
          specialization: referredToDoctor.specialization,
          qualification: referredToDoctor.education,
        }
      : null,
    patient: {
      patient_id: patient.patient_id,
      full_name: patient.full_name,
      phone: patient.phone,
      age: patient.age,
      gender: patient.gender,
    },
    clinic: null,
    layout_settings: {
      ...hmsLayout.settings,
      page_margin_json: {
        ...hmsLayout.settings.page_margin_json,
        show_prescription_number: false,
      },
    },
    pdf_hook: {
      pdf_url: prescription.pdf_url,
      source: "structured_sql",
      print_data_api: `/api/hms/emr/prescriptions/${prescription.id}/print-data`,
    },
  };
}
