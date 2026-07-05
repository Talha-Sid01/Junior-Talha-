"use client";

import { useActionState } from "react";
import { deleteKnowledgeAction } from "@/lib/actions/delete";

export default function DeleteKnowledge() {
  const [state, formAction, isPending] = useActionState(
    async (
      _prev: { success?: boolean; error?: string } | null,
      formData: FormData
    ) => {
      return await deleteKnowledgeAction(_prev, formData);
    },
    null
  );

  return (
    <div className="mt-8 p-6 bg-red-500/5 border border-red-500/20 rounded-2xl">
      <div className="mb-4">
        <h3
          className="text-lg font-semibold text-red-400"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Danger Zone
        </h3>
        <p className="text-sm text-slate-400 mt-1">
          This will permanently delete all chunks from the Pinecone vector
          database. This action cannot be undone.
        </p>
      </div>

      <form action={formAction} className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          name="confirm"
          required
          placeholder='Type "DELETE" to confirm'
          pattern="DELETE"
          className="flex-1 px-4 py-2.5 bg-[var(--color-midnight)] border border-[var(--color-border)] rounded-xl text-[var(--color-warm-white)] placeholder-slate-500 focus:outline-none focus:border-red-500/50 transition-colors duration-200"
        />
        <button
          type="submit"
          disabled={isPending}
          className="px-6 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-medium rounded-xl border border-red-500/20 hover:border-red-500/30 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {isPending ? "Deleting..." : "Delete All Knowledge"}
        </button>
      </form>

      {state?.error && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
          {state.error}
        </div>
      )}
      
      {state?.success && (
        <div className="mt-4 flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
          All knowledge has been successfully deleted.
        </div>
      )}
    </div>
  );
}
