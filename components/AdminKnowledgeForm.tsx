"use client";

import { useActionState } from "react";
import { addKnowledge } from "@/lib/actions/ingest";
import { useRef } from "react";

const CATEGORIES = [
  { value: "bio", label: "Bio" },
  { value: "skills", label: "Skills" },
  { value: "projects", label: "Projects" },
  { value: "experience", label: "Experience" },
  { value: "general", label: "General" },
];

export default function AdminKnowledgeForm() {
  const [state, formAction, isPending] = useActionState(addKnowledge, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Reset form on success
  if (state?.success && formRef.current) {
    formRef.current.reset();
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      {/* Category Select */}
      <div>
        <label
          htmlFor="category"
          className="block text-sm font-medium text-slate-300 mb-2"
        >
          Category
        </label>
        <select
          id="category"
          name="category"
          defaultValue="general"
          className="w-full px-4 py-3 bg-[var(--color-midnight)] border border-[var(--color-border)] rounded-xl text-[var(--color-warm-white)] focus:outline-none focus:border-[var(--color-violet)] transition-colors duration-200 cursor-pointer"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* Source Label */}
      <div>
        <label
          htmlFor="source"
          className="block text-sm font-medium text-slate-300 mb-2"
        >
          Source Label{" "}
          <span className="text-slate-500 font-normal">
            (optional — defaults to category)
          </span>
        </label>
        <input
          id="source"
          name="source"
          type="text"
          placeholder="e.g. LinkedIn bio, portfolio"
          className="w-full px-4 py-3 bg-[var(--color-midnight)] border border-[var(--color-border)] rounded-xl text-[var(--color-warm-white)] placeholder-slate-500 focus:outline-none focus:border-[var(--color-violet)] transition-colors duration-200"
        />
      </div>

      {/* Text Content */}
      <div>
        <label
          htmlFor="text"
          className="block text-sm font-medium text-slate-300 mb-2"
        >
          Knowledge Content
        </label>
        <textarea
          id="text"
          name="text"
          required
          rows={10}
          placeholder="Paste facts about Talha here — bio, skills, project descriptions, experience…"
          className="w-full px-4 py-3 bg-[var(--color-midnight)] border border-[var(--color-border)] rounded-xl text-[var(--color-warm-white)] placeholder-slate-500 focus:outline-none focus:border-[var(--color-violet)] transition-colors duration-200 resize-y min-h-[160px]"
        />
      </div>

      {/* Feedback */}
      {state?.success && (
        <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
          Added — split into {state.chunkCount} chunk
          {state.chunkCount !== 1 ? "s" : ""}
        </div>
      )}

      {state?.error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {state.error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full py-3 px-4 text-white font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        style={{
          background:
            "linear-gradient(135deg, var(--color-violet), var(--color-indigo))",
        }}
      >
        {isPending ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="animate-spin w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Processing…
          </span>
        ) : (
          "Add Knowledge"
        )}
      </button>
    </form>
  );
}
