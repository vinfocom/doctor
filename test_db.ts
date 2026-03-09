import prisma from './src/lib/prisma';
async function main() {
    const schedules = await prisma.doctor_clinic_schedule.findMany();
    console.log("Found", schedules.length, "schedules");
    console.log(schedules);
}
main().finally(() => prisma.$disconnect());
