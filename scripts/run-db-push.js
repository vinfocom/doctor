
require('dotenv').config();
const { execSync } = require('child_process');

console.log('Running prisma db push with loaded environment variables...');
try {
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('Schema sync successful.');
} catch (e) {
    console.error('Schema sync failed.');
    process.exit(1);
}
