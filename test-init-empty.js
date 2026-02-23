"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// testing empty object
var client_1 = require("./src/generated/prisma/client");
var prisma = new client_1.PrismaClient({});
console.log("Success with empty object");
