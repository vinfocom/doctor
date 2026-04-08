"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { Spotlight } from "./ui/Spotlight";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.3 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] as const } }
};

const features = [
  { icon: "🏥", title: "Top Doctors", desc: "Access verified and experienced doctors across all specializations.", gradient: "from-indigo-100 to-purple-100" },
  { icon: "📅", title: "Easy Booking", desc: "Book appointments in seconds. Pick a doctor, choose a time, done.", gradient: "from-cyan-100 to-blue-100" },
  { icon: "🔒", title: "Secure & Private", desc: "Enterprise-grade encryption keeps your health data safe.", gradient: "from-emerald-100 to-green-100" },
];

export default function Main() {
  return (
    <div className="relative overflow-hidden">
      {/* Background effects */}
      <div className="page-glow" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-indigo-100/40 to-transparent rounded-full blur-3xl pointer-events-none" />

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20">
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="rgba(79,70,229,0.15)" />

        <motion.div
          className="relative z-10 w-full max-w-4xl text-center"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.h1
            variants={itemVariants}
            className="text-4xl md:text-6xl lg:text-7xl font-bold leading-[1.05] tracking-tight"
          >
            <span className="text-gray-900">
              Your Health,
            </span>
            <br />
            <span className="gradient-text">Our Priority</span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mt-6 text-lg md:text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed"
          >
            Book appointments with top doctors effortlessly.
            <span className="text-gray-700"> Anytime, anywhere</span> — your wellness journey starts here.
          </motion.p>

          <motion.div
            variants={itemVariants}
            className="mt-10 flex justify-center"
          >
            <Link href="/book-appointment">
              <motion.button
                className="px-14 py-5 text-lg font-semibold rounded-3xl text-white border border-cyan-300/70 bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-600 shadow-[0_18px_45px_rgba(14,165,233,0.32)] ring-4 ring-cyan-100/80"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                Book Appointment
              </motion.button>
            </Link>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="mt-6 flex justify-center"
          >
            <Link href="/login">
              <motion.button
                className="btn-secondary px-8 py-4 text-base rounded-2xl"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
              >
                Sign In
              </motion.button>
            </Link>
          </motion.div>

        </motion.div>

        {/* Floating gradient orbs */}
        <motion.div
          className="absolute bottom-20 left-10 w-72 h-72 bg-indigo-200/30 rounded-full blur-3xl"
          animate={{ y: [0, -20, 0], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-40 right-10 w-96 h-96 bg-purple-200/20 rounded-full blur-3xl"
          animate={{ y: [0, 15, 0], opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />
      </section>

      {/* Features Section */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 py-20 md:pt-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <span className="text-sm font-semibold text-indigo-600 tracking-wider uppercase">Features</span>
          <h2 className="text-3xl md:text-5xl font-bold mt-3 text-gray-900">
            Why Choose Dapto?
          </h2>
          <p className="text-gray-500 mt-4 max-w-lg mx-auto">
            Everything you need to manage your health appointments in one place.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="glass-card p-8 group"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
            >
              <motion.div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-2xl mb-5`}
                whileHover={{ scale: 1.1, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {feature.icon}
              </motion.div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-indigo-600 transition-colors">
                {feature.title}
              </h3>
              <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <motion.section
        className="relative z-10 max-w-4xl mx-auto px-4 py-28"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="glass-card p-12 md:p-16 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-purple-50/50" />
          <div className="relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-4 text-gray-900">
              Ready to Get Started?
            </h2>
            <p className="text-gray-500 mb-8 max-w-lg mx-auto">
              Join thousands of doctors and clinics who trust Dapto for managing appointments.
            </p>
            <Link href="/login">
              <motion.button
                className="btn-primary px-10 py-4 text-base rounded-2xl"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.97 }}
              >
                Sign In Now
              </motion.button>
            </Link>
          </div>
        </div>
      </motion.section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-200 py-8 text-center text-gray-400 text-sm">
        <p className="mb-2">
          <Link href="/privacy-policy" className="text-gray-500 hover:text-gray-700">
            Privacy Policy
          </Link>
        </p>
        <p>© 2026 Vinfocom IT Services Pvt. Ltd. All rights reserved.</p>
      </footer>
    </div>
  );
}
