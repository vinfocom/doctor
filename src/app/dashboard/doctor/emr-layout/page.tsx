import { redirect } from "next/navigation";
import EmrLayoutSettingsForm from "@/components/emr/EmrLayoutSettingsForm";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getDoctorEmrEnabled } from "@/lib/emrFeatureGate";

export default async function DoctorEmrLayoutPage() {
  const session = await getSession();

  if (!session || session.role !== "DOCTOR") {
    redirect("/login");
  }

  const doctor = await prisma.doctors.findUnique({
    where: { user_id: session.userId },
    select: { doctor_id: true },
  });

  const emrEnabled = doctor?.doctor_id
    ? await getDoctorEmrEnabled(doctor.doctor_id)
    : false;

  if (!emrEnabled) {
    redirect("/dashboard/doctor");
  }

  return (
    <EmrLayoutSettingsForm
      role="DOCTOR"
      title="Prescription Layout Settings"
      subtitle="Control section order, visibility, branding, margins, and print/PDF preview for your EMR prescription pad."
    />
  );
}
