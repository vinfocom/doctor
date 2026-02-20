const http = require('http');

const data = JSON.stringify({
  email: 'doctor@example.com', // assuming this is a test doctor email, let's just query db to find a doctor email first
});

// actually let's just use Prisma to find a doctor, generate token, and query appointments
