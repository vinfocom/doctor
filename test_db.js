const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.users.findMany({ select: { user_id: true, email: true, role: true } });
  const docs = await prisma.doctors.findMany({ select: { doctor_id: true, user_id: true, doctor_name: true } });
  const apts = await prisma.appointment.findMany({ select: { appointment_id: true, doctor_id: true, clinic_id: true } });
  console.log(JSON.stringify({users, docs, apts}, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
