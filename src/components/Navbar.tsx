"use client";
import React, { useState } from "react";
import { HoveredLink, Menu, MenuItem, ProductItem } from "./ui/navbar-menu";
import { cn } from "@/lib/utils";
import Link from "next/link";


export default function Navbar({ className }: { className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <div className={cn("fixed top-10 inset-x-0 max-w-2xl mx-auto z-50", className)}>
   <Menu setActive={setActive}>
    <Link href={"/"} className=" font-bold">
   <MenuItem setActive={setActive} active={active} item="Home">
   
   </MenuItem>
   </Link>
   <MenuItem setActive={setActive} active={active}  item="Services">
          <div className="flex flex-col space-y-4 text-sm">
            <HoveredLink href="/web-dev">Web Development</HoveredLink>
            <HoveredLink href="/interface-design">Interface Design</HoveredLink>
            <HoveredLink href="/seo">Search Engine Optimization</HoveredLink>
            <HoveredLink href="/branding">Branding</HoveredLink>
          </div>
        </MenuItem>

        <Link href={"/contact"} className=" font-bold">
   <MenuItem setActive={setActive} active={active} item="Contact">
   <HoveredLink href="/contact">Contact</HoveredLink>
   </MenuItem>
   </Link>
   
   </Menu>
    </div>
  );
}