import { ConciergeClient } from "@/components/ConciergeClient";
import Navbar from "@/components/layout/Navbar";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const sp = await searchParams;
  const embed = sp.embed === "1";

  if (embed) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-black p-3">
        <ConciergeClient embed={embed} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <Navbar />
      <div className="flex flex-1 flex-col bg-zinc-950 p-6 lg:p-10">
        <ConciergeClient embed={embed} />
      </div>
    </div>
  );
}
