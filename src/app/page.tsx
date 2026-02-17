import Main from "@/components/Main";
import Navbar from "@/components/Navbar";

export default function Home() {
  return (
    <>
      <div className="relative w-full flex items-center justify-center">
        <Navbar />
      </div>
      <main className="min-h-screen antialiased">
        <Main />
      </main>
    </>
  );
}
