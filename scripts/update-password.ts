
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hash } from "bcryptjs";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error("DATABASE_URL is not defined in .env");
    process.exit(1);
}

const adapter = new PrismaMariaDb(connectionString);
const prisma = new PrismaClient({ adapter });

async function main() {
    const email = "superadmin@messagebot.local";
    const newPassword = "password123";

    try {
        const user = await prisma.users.findUnique({
            where: { email },
        });

        if (!user) {
            console.log(`User with email ${email} not found.`);
            return;
        }

        const hashedPassword = await hash(newPassword, 12);

        await prisma.users.update({
            where: { email },
            data: { password: hashedPassword },
        });

        console.log(`Password updated for ${email}`);
        console.log(`New password: ${newPassword}`);

    } catch (error) {
        console.error("Error updating password:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
