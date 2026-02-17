"use client";
import React, { useState } from "react";
import { HoveredLink, Menu, MenuItem } from "./ui/navbar-menu";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { motion } from "motion/react";

export default function Navbar({ className }: { className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <motion.div
      className={cn("fixed top-10 inset-x-0 max-w-2xl mx-auto z-50", className)}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
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
    </motion.div>
  );
}