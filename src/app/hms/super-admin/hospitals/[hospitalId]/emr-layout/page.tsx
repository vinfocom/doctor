import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import HmsFullEmrLayoutSettings from "@/components/hms/HmsFullEmrLayoutSettings";

type PageProps = {
    params: Promise<{ hospitalId: string }>;
};

export default async function HmsSuperAdminHospitalEmrLayoutPage({ params }: PageProps) {
    const session = await getSession();

    if (!session || session.role !== "SUPER_ADMIN") {
        redirect("/login");
    }

    const { hospitalId } = await params;
    const parsedHospitalId = Number(hospitalId);
    if (!Number.isInteger(parsedHospitalId) || parsedHospitalId <= 0) {
        redirect("/hms/super-admin");
    }

    return (
        <div className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
            <HmsFullEmrLayoutSettings
                listEndpoint={`/api/hms/super-admin/hospitals/${parsedHospitalId}/emr-layouts`}
                settingsEndpoint={`/api/hms/super-admin/hospitals/${parsedHospitalId}/emr-layout-settings`}
                title="EMR Layout"
                subtitle="Full EMR layout settings for this HMS hospital."
            />
        </div>
    );
}
