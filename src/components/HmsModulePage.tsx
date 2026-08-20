type HmsModulePageProps = {
    title: string;
    rows: Array<{ label: string; value: string }>;
};

export default function HmsModulePage({ title, rows }: HmsModulePageProps) {
    return (
        <div className="w-full">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-950 sm:text-3xl">{title}</h1>
            </div>

            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <table className="w-full text-left text-sm">
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.label} className="border-b border-gray-100 last:border-b-0">
                                <th className="w-56 px-4 py-3 font-medium text-gray-500">{row.label}</th>
                                <td className="px-4 py-3 font-semibold text-gray-950">{row.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
