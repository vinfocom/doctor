import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";

const prisma = new PrismaClient({ adapter: null as any });

async function main() {
    const users = await prisma.users.findMany({ take: 1 });
    console.log("Success! Users found:", users.length);
}

main().catch(console.error).finally(() => prisma.$disconnect());
