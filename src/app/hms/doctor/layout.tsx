import HmsPortalLayout from "@/components/HmsPortalLayout";

export default function HmsDoctorLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <HmsPortalLayout role="DOCTOR">{children}</HmsPortalLayout>;
}
