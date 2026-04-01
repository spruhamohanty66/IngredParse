import Header from "@/components/Header";
import HomeClient from "@/components/HomeClient";
import BottomNav from "@/components/BottomNav";

export default function Home() {
  return (
    <div className="flex flex-col" style={{ height: "100dvh" }}>
      <Header />

      <main
        className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-6"
        style={{ paddingBottom: "96px" }}
      >
        <HomeClient />
      </main>

      <BottomNav />
    </div>
  );
}
