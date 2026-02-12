import FeaturedCourses from "@/components/FeaturedCourses";
import Main from "@/components/Main";

export default function Home() {
  return (
   <>
   
     <main className="min-h-screen bg-black/96 antialiased bg-grid-white/[0.02]">
      <Main />
      <FeaturedCourses />
      
      
    </main>
   </>
  );
}
