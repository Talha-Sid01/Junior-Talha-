"use client";

import { useActionState } from "react";
import { login } from "@/lib/actions/login";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AdminLoginPage() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: { error?: string; success?: boolean } | null, formData: FormData) => {
      return await login(formData);
    },
    null
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      router.push("/admin");
    }
  }, [state, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-midnight)] px-4">
      <div className="w-full max-w-md">
        {/* Logo / Branding */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 border border-[var(--color-border)]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-violet), var(--color-indigo))",
            }}
          >
            <span
              className="text-2xl font-bold text-white"
              style={{ fontFamily: "var(--font-display)" }}
            >
              JT
            </span>
          </div>
          <h1
            className="text-2xl font-bold text-[var(--color-warm-white)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Jr. Talha Admin
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Enter your password to access the dashboard
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8">
          <form action={formAction} className="space-y-6">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoFocus
                className="w-full px-4 py-3 bg-[var(--color-midnight)] border border-[var(--color-border)] rounded-xl text-[var(--color-warm-white)] placeholder-slate-500 focus:outline-none focus:border-[var(--color-violet)] transition-colors duration-200"
                placeholder="Enter admin password"
              />
            </div>

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
                  Signing in…
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-6">
          Protected admin area — unauthorized access is prohibited.
        </p>
      </div>
    </div>
  );
}
