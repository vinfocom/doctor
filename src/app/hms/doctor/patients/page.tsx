import { redirect } from "next/navigation";
import { getHmsSession } from "@/lib/hms-auth";
import HmsDoctorPatientsClient from "./HmsDoctorPatientsClient";

export default async function HmsDoctorPatientsPage() {
    const session = await getHmsSession();

    if (!session || session.hospitalContext.role !== "DOCTOR") {
        redirect("/hms");
    }

    return <HmsDoctorPatientsClient />;
}
