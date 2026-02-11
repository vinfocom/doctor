import Navbar from "@/components/Navbar";
import Image from "next/image";

export default function Home() {
  return (
   <>
   <Navbar />
    <main className="container">
      <h2>Welcome to the Doctor App</h2>
      <p>Your personal assistant for managing appointments and patient records.</p>
      <Image 
        src="/doctor-illustration.png" 
        alt="Doctor Illustration" 
        width={600} 
        height={400} 
      />
    </main>
   </>
  );
}
