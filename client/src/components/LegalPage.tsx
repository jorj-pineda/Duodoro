import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

interface Props {
  title: string;
  effectiveDate: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, effectiveDate, children }: Props) {
  return (
    <div className="min-h-dvh bg-bg texture-dots">
      <header className="flex items-center justify-between px-5 py-4 max-w-3xl mx-auto">
        <Link
          href="/"
          className="font-display text-xl text-ink tracking-wide hover:text-accent"
        >
          Duodoro
        </Link>
        <ThemeToggle />
      </header>
      <main className="px-5 pb-16">
        <article className="max-w-3xl mx-auto bg-surface border border-line rounded-2xl px-6 py-8 sm:px-10 sm:py-10 shadow-sm text-muted leading-relaxed">
          <h1 className="font-display text-3xl sm:text-4xl text-ink leading-tight">
            {title}
          </h1>
          <p className="text-xs text-faint mt-2">Effective {effectiveDate}</p>
          <div className="mt-8 space-y-7 [&_h2]:font-display [&_h2]:text-xl [&_h2]:text-ink [&_h2]:mb-2 [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_a]:text-accent [&_a]:underline">
            {children}
          </div>
          <nav
            aria-label="Legal documents"
            className="border-t border-line mt-9 pt-5 flex flex-wrap gap-5 text-sm"
          >
            <Link href="/">Back to Duodoro</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </nav>
        </article>
      </main>
    </div>
  );
}
