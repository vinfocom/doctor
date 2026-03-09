const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Fetching doctors...");
        const doctors = await prisma.doctors.findMany({
            include: {
                admin: {
                    select: {
                        admin_id: true,
                        user: {
                            select: { user_id: true, name: true, email: true },
                        },
                    },
                },
                schedules: true,
            },
        });
        console.log("Success:", doctors.length);
    } catch (error) {
        console.error("Prisma error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
