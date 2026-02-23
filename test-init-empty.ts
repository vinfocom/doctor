// testing empty object
import { PrismaClient } from "./src/generated/prisma/client";
const prisma = new PrismaClient({});
console.log("Success with empty object");
