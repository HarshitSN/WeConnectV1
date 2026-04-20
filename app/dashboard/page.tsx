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
      <div className="flex min-h-full flex-1 flex-col bg-gradient-to-br from-[#f4faff] via-[#e8f3ff] to-[#f6fbff] p-4">
        <ConciergeClient embed={embed} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#fafcfe] bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-50/40 via-white to-blue-50/30">
      <Navbar />
      <div className="mx-auto w-full max-w-7xl flex-1 flex-col p-4 sm:p-6 lg:p-10">
        <ConciergeClient embed={embed} />
      </div>
    </div>
  );
}
