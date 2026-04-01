import Header from "@/components/Header";
import SMEClient from "@/components/sme/SMEClient";

export default function SMEPage() {
  return (
    <div className="flex flex-col" style={{ height: "100dvh" }}>
      <Header />

      <main className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-6">
        <SMEClient />
      </main>
    </div>
  );
}
