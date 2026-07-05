import AdminKnowledgeForm from "@/components/AdminKnowledgeForm";
import DeleteKnowledge from "@/components/DeleteKnowledge";
import { logout } from "@/lib/actions/login";

export default function AdminDashboard() {
  return (
    <div className="min-h-screen bg-[var(--color-midnight)] px-4 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div
              className="inline-flex items-center justify-center w-10 h-10 rounded-xl border border-[var(--color-border)]"
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
            <div>
              <h1
                className="text-xl font-bold text-[var(--color-warm-white)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Jr. Talha Admin
              </h1>
              <p className="text-xs text-slate-400">Knowledge Dashboard</p>
            </div>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="px-4 py-2 text-sm text-slate-400 hover:text-[var(--color-warm-white)] bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] rounded-xl transition-colors duration-200 cursor-pointer"
            >
              Sign Out
            </button>
          </form>
        </div>

        {/* Main Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
          <div className="mb-6">
            <h2
              className="text-lg font-semibold text-[var(--color-warm-white)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Add Knowledge
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Paste facts about Talha below. Content is automatically chunked,
              embedded, and stored in the vector database — available to chat
              visitors immediately.
            </p>
          </div>

          <AdminKnowledgeForm />
        </div>
        
        <DeleteKnowledge />

        {/* Info */}
        <div className="mt-6 px-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl">
          <p className="text-xs text-slate-500">
            <span className="text-slate-400 font-medium">How it works:</span>{" "}
            Text is split into ~800 character chunks with 120 char overlap,
            embedded using sentence-transformers/all-MiniLM-L6-v2, and stored
            in Pinecone. Chat visitors can query this data immediately — no
            redeploy needed.
          </p>
        </div>
      </div>
    </div>
  );
}
