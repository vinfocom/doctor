const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const schedules = await prisma.doctor_clinic_schedule.findMany();
    console.log("Schedules:", schedules);

    const dateStr = "2026-02-26";
    const [year, month, day] = dateStr.split('-').map(Number);

    console.log("raw new Date(str).getDay():", new Date(dateStr).getDay());
    console.log("new Date(y, m-1, d).getDay():", new Date(year, month - 1, day).getDay());
}

main().finally(() => prisma.$disconnect());
