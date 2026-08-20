import HmsPortalLayout from "@/components/HmsPortalLayout";

export default function HospitalAdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <HmsPortalLayout role="HOSPITAL_ADMIN">{children}</HmsPortalLayout>;
}
