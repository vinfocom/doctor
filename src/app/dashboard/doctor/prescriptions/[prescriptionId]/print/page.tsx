import { notFound, redirect } from "next/navigation";
import EmrPrintablePrescriptionView from "@/components/emr/EmrPrintablePrescriptionView";
import { getSession } from "@/lib/auth";
import { getPrintablePrescriptionData } from "@/lib/emr";
import { assertDoctorEmrPadEnabled } from "@/lib/emrFeatureGate";
import prisma from "@/lib/prisma";

export default async function DoctorPrescriptionPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ prescriptionId: string }>;
  searchParams?: Promise<{ from?: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "DOCTOR") {
    redirect("/login");
  }

  const doctor = await prisma.doctors.findUnique({
    where: { user_id: session.userId },
    select: {
      doctor_id: true,
    },
  });

  if (!doctor) {
    notFound();
  }

  await assertDoctorEmrPadEnabled(doctor.doctor_id);

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const { prescriptionId: prescriptionIdParam } = await params;
  const prescriptionId = Number(prescriptionIdParam);
  if (!Number.isInteger(prescriptionId) || prescriptionId <= 0) {
    notFound();
  }

  const printable = await getPrintablePrescriptionData({
    prescriptionId,
    doctorId: doctor.doctor_id,
  });

  if (!printable) {
    notFound();
  }

  const prescription = printable.prescription;
  const backHref =
    resolvedSearchParams?.from === "patients"
      ? "/dashboard/doctor/patients"
      : prescription.appointment_id
        ? `/dashboard/doctor/appointments/${prescription.appointment_id}/pad?prescriptionId=${prescription.id}`
        : "/dashboard/doctor/appointments";

  return <EmrPrintablePrescriptionView printable={printable} backHref={backHref} />;
}
