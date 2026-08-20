import { Loader2 } from "lucide-react";

export default function HmsLoading() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-white px-4 py-8 text-black">
            <div className="flex w-full max-w-sm flex-col items-center rounded-lg border border-black bg-white p-6 text-center">
                <Loader2 size={28} className="animate-spin text-black" />
                <h1 className="mt-4 text-xl font-bold text-black">Loading, please wait</h1>
            </div>
        </main>
    );
}
