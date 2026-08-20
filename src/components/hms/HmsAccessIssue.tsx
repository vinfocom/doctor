type HmsAccessIssueProps = {
    title: string;
    message: string;
};

export default function HmsAccessIssue({ title, message }: HmsAccessIssueProps) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8 text-black">
            <div className="w-full max-w-md rounded-lg border border-black bg-white p-5">
                <p className="text-xs font-bold uppercase text-black">Access Check</p>
                <h1 className="mt-1 text-2xl font-bold text-black">{title}</h1>
                <p className="mt-3 text-sm font-semibold leading-6 text-black">{message}</p>
            </div>
        </main>
    );
}
