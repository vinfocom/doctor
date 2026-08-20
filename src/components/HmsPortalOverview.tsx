import type { LucideIcon } from "lucide-react";

type Metric = {
    label: string;
    value: string;
};

type Action = {
    label: string;
    icon: LucideIcon;
};

type HmsPortalOverviewProps = {
    title: string;
    eyebrow: string;
    metrics: Metric[];
    actions: Action[];
};

export default function HmsPortalOverview({ title, eyebrow, metrics, actions }: HmsPortalOverviewProps) {
    return (
        <div className="w-full">
            <div className="mb-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{eyebrow}</p>
                <h1 className="mt-1 text-2xl font-bold text-gray-950 sm:text-3xl">{title}</h1>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {metrics.map((metric) => (
                    <div key={metric.label} className="rounded-lg border border-gray-200 bg-white p-4">
                        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{metric.label}</p>
                        <p className="mt-2 text-2xl font-bold text-gray-950">{metric.value}</p>
                    </div>
                ))}
            </div>

            <div className="mt-6 rounded-lg border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                    <h2 className="text-sm font-semibold text-gray-950">Actions</h2>
                </div>
                <div className="grid gap-0 sm:grid-cols-2 xl:grid-cols-3">
                    {actions.map((action) => {
                        const Icon = action.icon;

                        return (
                            <div key={action.label} className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 last:border-b-0 sm:border-r xl:last:border-r-0">
                                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white">
                                    <Icon size={17} />
                                </span>
                                <span className="text-sm font-medium text-gray-800">{action.label}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
