import ChatWidget from "@/components/ChatWidget";
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col max-w-3xl mx-auto w-full relative">
      {/* Admin Login Button */}
      <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50">
        <Link 
          href="/admin/login" 
          className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-medium rounded-full bg-[var(--color-surface)]/80 backdrop-blur-md border border-[var(--color-border)] hover:border-[var(--color-violet)] hover:text-white transition-all flex items-center gap-1.5 sm:gap-2 shadow-lg group"
        >
          <svg className="w-4 h-4 text-slate-400 group-hover:text-[var(--color-violet)] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013 3h7a3 3 0 013 3v1" />
          </svg>
          Admin Login
        </Link>
      </div>

      {/* Header */}
      <header className="shrink-0 px-6 pt-8 pb-4 text-center">
        <div className="inline-flex items-center gap-3 mb-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center border border-[var(--color-border)]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-violet), var(--color-indigo))",
            }}
          >
            <span
              className="text-sm font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              JT
            </span>
          </div>
          <h1
            className="text-2xl font-bold"
            style={{
              fontFamily: "var(--font-display)",
              background:
                "linear-gradient(135deg, var(--color-violet), var(--color-indigo))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            Jr. Talha
          </h1>
        </div>
        <p className="text-sm text-slate-400">
          Talha&apos;s AI assistant — ask me anything about his work.
        </p>
      </header>

      {/* Chat */}
      <div className="flex-1 flex flex-col min-h-0">
        <ChatWidget />
      </div>
    </main>
  );
}
