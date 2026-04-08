"use client";
import React, { useState } from "react";
import { HoveredLink, Menu, MenuItem } from "./ui/navbar-menu";
import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import { motion } from "motion/react";

export default function Navbar({ className }: { className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <motion.div
      className={cn("fixed top-6 inset-x-0 z-50 px-4 sm:px-6 lg:px-10", className)}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div className="mx-auto flex w-full max-w-[1440px] items-start justify-between gap-3 sm:gap-4 xl:gap-6">
        <Link
          href="/"
          className="brand-logo-shell brand-logo-left shrink-0"
          aria-label="Vinfocom home"
        >
          <Image
            src="/vinfocom-logo.png"
            alt="Vinfocom logo"
            width={220}
            height={80}
            className="h-12 w-auto object-contain sm:h-14 lg:h-16"
            priority
          />
        </Link>

        <div className="flex min-w-0 flex-1 justify-center px-1 sm:px-3 lg:px-6">
          <Menu setActive={setActive}>
            <Link href="/" className="font-bold">
              <MenuItem setActive={setActive} active={active} item="Home" />
            </Link>
            <MenuItem setActive={setActive} active={active} item="Services">
              <div className="flex flex-col space-y-4 text-sm">
                <HoveredLink href="/dashboard/admin">Admin Dashboard</HoveredLink>
                <HoveredLink href="/dashboard/doctor">Doctor Dashboard</HoveredLink>
              </div>
            </MenuItem>
            <Link href="/login" className="font-bold">
              <MenuItem setActive={setActive} active={active} item="Login" />
            </Link>
          </Menu>
        </div>

        <Link
          href="/"
          className="brand-logo-shell brand-logo-right shrink-0"
          aria-label="Dapto home"
        >
          <Image
            src="/dapto-logo.png"
            alt="Dapto logo"
            width={220}
            height={80}
            className="h-12 w-auto object-contain sm:h-14 lg:h-16"
            priority
          />
        </Link>
      </div>
    </motion.div>
  );
}
