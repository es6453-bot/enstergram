import Link from "next/link";
import { Flame, Sparkles } from "lucide-react";
export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-glow" aria-hidden="true" />
      <Link className="brand auth-brand" href="/">
        <Flame fill="currentColor" size={28} />
        <span className="brand-name">Estergram</span>
      </Link>
      <section className="auth-card">
        <div className="eyebrow">
          <Sparkles size={14} /> YOUR 10 WORDS OF FAME
        </div>
        {children}
      </section>
      <p className="auth-footnote">Fictional fame. Real competition.</p>
    </main>
  );
}
