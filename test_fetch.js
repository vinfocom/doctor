async function main() {
    const res = await fetch('http://localhost:3000/api/slots?date=2026-02-26&clinicId=1');
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
}
main();
