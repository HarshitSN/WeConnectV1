import Link from "next/link";
import { AdminDashboard } from "@/components/AdminDashboard";

export default function AdminPage() {
  return (
    <div className="mx-auto flex min-h-full max-w-5xl flex-col gap-4 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-white">WEC Admin Dashboard</h1>
          <p className="text-sm text-zinc-500">Live terminal feed · certificate revocation (demo)</p>
        </div>
        <Link href="/" className="text-sm text-cyan-400 hover:underline">
          User flow
        </Link>
      </header>
      <AdminDashboard />
    </div>
  );
}
