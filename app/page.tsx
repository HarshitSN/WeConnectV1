import { ConciergeClient } from "@/components/ConciergeClient";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ embed?: string }>;
}) {
  const sp = await searchParams;
  const embed = sp.embed === "1";

  return (
    <div
      className={`flex min-h-full flex-1 flex-col ${embed ? "bg-black p-3" : "bg-zinc-950 p-6 lg:p-10"}`}
    >
      <ConciergeClient embed={embed} />
    </div>
  );
}
