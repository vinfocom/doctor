"use client";
import React, { useState } from "react";
import { HoveredLink, Menu, MenuItem, ProductItem } from "./ui/navbar-menu";
import { cn } from "@/lib/utils";


export default function Navbar({ className }: { className?: string }) {
  const [active, setActive] = useState<string | null>(null);
  return (
    <nav className="navbar">
      <h1>Doctor App</h1>
      <ul>
        <li><a href="/">Home</a></li>
        <li><a href="/appointments">Appointments</a></li>
        <li><a href="/patients">Patients</a></li>
        <li><a href="/settings">Settings</a></li>
      </ul>
    </nav>
  );
}