import { Sparkles } from "lucide-react";
export default function WelcomeBanner({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="bg-banner-gradient rounded-2xl p-5 flex items-center gap-4 mb-6">
      <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
        <Sparkles className="text-white" size={20} />
      </div>
      <div>
        <h2 className="text-white font-bold text-base leading-snug">{title}</h2>
        <p className="text-white/75 text-sm mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}
