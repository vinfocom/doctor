
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
    try {
        // Find the first user with role DOCTOR
        const doctorUser = await prisma.users.findFirst({
            where: { role: "DOCTOR" },
        });

        if (!doctorUser) {
            console.log("No doctor found. Creating a demo doctor...");
            const hashedPassword = await hash("password123", 12);

            // Create user
            const newUser = await prisma.users.create({
                data: {
                    email: "doctor@example.com",
                    password: hashedPassword,
                    name: "Demo Doctor",
                    role: "DOCTOR",
                    created_at: new Date(),
                },
            });

            // Create admin record (required for some relations) or doctor record?
            // Doctors usually have an entry in `doctors` table linked to an admin.
            // Need an admin first.
            const adminUser = await prisma.users.findFirst({ where: { role: "ADMIN" } });
            let adminId = 1; // Default fallback

            if (adminUser) {
                const adminRecord = await prisma.admins.findUnique({ where: { user_id: adminUser.user_id } });
                if (adminRecord) adminId = adminRecord.admin_id;
            }

            // Create doctor record
            await prisma.doctors.create({
                data: {
                    doctor_name: "Demo Doctor",
                    admin_id: adminId,
                    status: "ACTIVE",
                    phone: "1234567890",
                    user_id: newUser.user_id
                }
            });
            // Actually, looking at schema:
            // model doctors { doctor_id, doctor_name, ... }
            // model users { user_id, role, ... }
            // There is NO foreign key from doctors to users in the schema provided previously!
            // This is a schema design issue. But for Login, we just need `users` table.

            console.log(`Created demo doctor: doctor@example.com / password123`);
            console.log(`Created demo doctor: doctor@example.com / password123`);
            return;
        }

        // Link existing doctor if not linked
        const existingDoctorProfile = await prisma.doctors.findFirst({
            where: { doctor_name: "Demo Doctor", user_id: null }
        });

        if (existingDoctorProfile) {
            await prisma.doctors.update({
                where: { doctor_id: existingDoctorProfile.doctor_id },
                data: { user_id: doctorUser.user_id }
            });
            console.log("Linked existing Doctor profile to User.");
        }

        const newPassword = "password123";
        const hashedPassword = await hash(newPassword, 12);

        await prisma.users.update({
            where: { user_id: doctorUser.user_id },
            data: { password: hashedPassword },
        });

        console.log(`Password reset for doctor: ${doctorUser.email}`);
        console.log(`New Credentials: ${doctorUser.email} / ${newPassword}`);

    } catch (error) {
        console.error("Error resetting doctor password:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
