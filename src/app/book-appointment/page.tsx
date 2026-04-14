import Navbar from "@/components/Navbar";
import AppointmentBookingPanel from "@/components/AppointmentBookingPanel";

export default function BookAppointmentPage() {
  return (
    <>
      <div className="relative w-full flex items-center justify-center">
        <Navbar />
      </div>
      <main className="min-h-screen antialiased relative overflow-hidden px-4 py-28 md:py-36">
        <div className="page-glow" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-indigo-100/40 to-transparent rounded-full blur-3xl pointer-events-none" />
        <section className="relative z-10 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-gray-900">
              Book Your Appointment
            </h1>
            <p className="mt-4 text-sm md:text-base text-gray-500 max-w-2xl mx-auto">
              Choose the available specialization and continue using the appointment link.
            </p>
          </div>

          <AppointmentBookingPanel />
        </section>
      </main>
    </>
  );
}
