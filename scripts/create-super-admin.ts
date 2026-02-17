
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
    const email = "superadmin@example.com";
    const password = "password123";
    const name = "Super Admin";

    try {
        // Check if user exists
        const existingUser = await prisma.users.findUnique({
            where: { email },
        });

        if (existingUser) {
            console.log(`User with email ${email} already exists.`);
            return;
        }

        const hashedPassword = await hash(password, 12);

        // Create user
        const user = await prisma.users.create({
            data: {
                email,
                password: hashedPassword,
                name,
                role: "SUPER_ADMIN",
                created_at: new Date(),
            },
        });

        console.log(`Created user: ${user.email} (ID: ${user.user_id})`);

        // Create admin record
        const admin = await prisma.admins.create({
            data: {
                user_id: user.user_id,
                created_at: new Date(),
            },
        });

        console.log(`Created admin record: ID ${admin.admin_id}`);
        console.log("Super Admin created successfully!");
        console.log(`Credentials: ${email} / ${password}`);

    } catch (error) {
        console.error("Error creating super admin:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
