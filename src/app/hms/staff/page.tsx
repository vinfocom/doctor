import { redirect } from "next/navigation";
import HmsAccessIssue from "@/components/hms/HmsAccessIssue";
import { getHmsSession, getHmsStaffProfile } from "@/lib/hms-auth";

export default async function HmsStaffPage() {
    const session = await getHmsSession();

    if (!session || session.hospitalContext.role !== "HOSPITAL_STAFF") {
        redirect("/hms");
    }

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
