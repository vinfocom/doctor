type HmsFeatureDisabledProps = {
    title: string;
};

export default function HmsFeatureDisabled({ title }: HmsFeatureDisabledProps) {
    return (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Disabled</p>
            <h1 className="mt-1 text-2xl font-bold text-gray-950">{title}</h1>
        </div>
    );
}
