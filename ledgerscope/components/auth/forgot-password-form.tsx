"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import type { AppApiError } from "@/types/api-errors";

type ForgotPasswordResponse = {
  success?: boolean;
  message?: string;
  previewResetUrl?: string;
};

function isForgotPasswordResponse(value: unknown): value is ForgotPasswordResponse {
  if (!value || typeof value !== "object") return false;
  return "message" in value || "previewResetUrl" in value || "success" in value;
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [previewResetUrl, setPreviewResetUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setPreviewResetUrl(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json().catch(() => null)) as ForgotPasswordResponse | AppApiError | null;

      if (!response.ok) {
        setError((payload as AppApiError | null)?.error ?? "Unable to start password recovery.");
        return;
      }

      setSuccess(
        isForgotPasswordResponse(payload)
          ? payload.message ?? "If an account exists for that email, a reset link is on its way."
          : "If an account exists for that email, a reset link is on its way.",
      );
      setPreviewResetUrl(isForgotPasswordResponse(payload) ? payload.previewResetUrl ?? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start password recovery.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Forgot password"
      subtitle="Enter your email and we'll send a password reset link if your account exists."
      footer={
        <>
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-slate-900 underline underline-offset-4">
            Back to sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900 transition focus:border-slate-400 focus:ring-2"
            placeholder="you@company.com"
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
        {previewResetUrl ? (
          <p className="text-sm text-slate-600">
            Local preview:{" "}
            <Link href={previewResetUrl} className="font-medium text-slate-900 underline underline-offset-4">
              open reset link
            </Link>
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Sending link..." : "Send reset link"}
        </button>
      </form>
    </AuthShell>
  );
}
