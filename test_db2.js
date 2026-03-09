const { execSync } = require('child_process');
const fs = require('fs');

// Extract DATABASE_URL from .env
const envContent = fs.readFileSync('/home/vinfocom/Documents/doctor-main/Doctor/doctor/.env', 'utf-8');
const dbUrlMatch = envContent.match(/DATABASE_URL="([^"]+)"/);

if (dbUrlMatch) {
    process.env.DATABASE_URL = dbUrlMatch[1];
    console.log("Found DB URL");
} else {
    console.log("Could not find DB URL");
}

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("Fetching clinics...");
    const clinics = await prisma.clinics.findMany();
    console.log("Clinics:", clinics.length);

    console.log("Fetching schedules...");
    const schedules = await prisma.doctor_clinic_schedule.findMany();
    console.log("Schedules:", schedules);

    console.log("Fetching appointments...");
    const appointments = await prisma.appointment.findMany();
    console.log("Appointments:", appointments.length);
}

main().finally(() => prisma.$disconnect());
