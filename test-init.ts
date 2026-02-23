import { PrismaClient } from "./src/generated/prisma/client";

console.log("Testing initialization...");
try {
    const prisma = new PrismaClient({ adapter: null as any });
    console.log("Success with null adapter");
} catch (e) {
    console.error("Error with null adapter", e);
}
