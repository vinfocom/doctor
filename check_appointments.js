
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const appointments = await prisma.appointment.findMany({
        take: 5,
        orderBy: { created_at: 'desc' }
    });
    console.log(JSON.stringify(appointments, null, 2));
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
