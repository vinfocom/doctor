"use client";

import { useParams } from "next/navigation";
import EmrLayoutSettingsForm from "@/components/emr/EmrLayoutSettingsForm";

export default function AdminDoctorEmrLayoutPage() {
  const params = useParams<{ doctorId: string }>();
  const doctorId = Number(params?.doctorId);

  return (
    <EmrLayoutSettingsForm
      role="ADMIN"
      doctorId={Number.isInteger(doctorId) && doctorId > 0 ? doctorId : undefined}
      title="Doctor Prescription Layout Settings"
      subtitle="Review or override EMR pad and print/PDF layout settings for this doctor."
    />
  );
}
