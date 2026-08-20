import { redirect } from "next/navigation";
import HmsAccessIssue from "@/components/hms/HmsAccessIssue";
import { getSession } from "@/lib/auth";
import { getHmsSession, getHmsStaffProfile } from "@/lib/hms-auth";

export default async function HmsHomePage() {
    const session = await getHmsSession({ allowPasswordChange: true });

    if (!session) {
        const legacySession = await getSession();
        if (legacySession?.role === "SUPER_ADMIN") {
            redirect("/hms/super-admin");
        }
        redirect("/hms/login");
    }

    if (session.forcePasswordChange) {
        redirect("/hms/change-password");
    }

    if (session.hospitalContext.role === "HOSPITAL_ADMIN") {
        redirect("/hms/hospital-admin");
    }

    if (session.hospitalContext.role === "HOSPITAL_STAFF") {
        const staff = await getHmsStaffProfile(session.hospitalContext);
        if (!staff) {
            return (
                <HmsAccessIssue
                    title="Staff Access Not Active"
                    message="This staff account is logged in, but its HMS staff access is not active for today. Check staff type, status, valid from, and valid to in Hospital Admin."
                />
            );
        }
        if (staff?.staffType === "TV_DISPLAY") {
            redirect("/hms/tv");
        }
        redirect("/hms/staff/new-registration");
    }

    redirect("/hms/doctor");
}
