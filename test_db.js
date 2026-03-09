import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const schedules = await prisma.doctor_clinic_schedule.findMany();
  console.log("Total schedules:", schedules.length);
  if (schedules.length > 0) {
    console.log(schedules[0]);
  }
}
main();
