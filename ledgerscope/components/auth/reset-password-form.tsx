"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import type { AppApiError } from "@/types/api-errors";

type ResetPasswordFormProps = {
  token: string | null;
  initialStatus: "valid" | "expired" | "invalid";
};

export function ResetPasswordForm({ token, initialStatus }: ResetPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetComplete, setIsResetComplete] = useState(false);

  const isTokenUsable = initialStatus === "valid" && Boolean(token);
  const helperMessage = useMemo(() => {
    if (initialStatus === "expired") return "This reset link expired. Request a new one to continue.";
    if (initialStatus === "invalid") return "This reset link is invalid or has already been used.";
    return null;
  }, [initialStatus]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      setError("This reset link is invalid. Request a new one.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords must match.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      const payload = (await response.json().catch(() => null)) as AppApiError | { success?: boolean } | null;

      if (!response.ok) {
        setError((payload as AppApiError | null)?.error ?? "Unable to reset your password.");
        return;
      }

      setIsResetComplete(true);
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset your password.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isResetComplete) {
    return (
      <AuthShell
        title="Password reset"
        subtitle="Your password has been updated."
        footer={
          <Link href="/login" className="font-medium text-slate-900 underline underline-offset-4">
            Return to sign in
          </Link>
        }
      >
        <p className="text-sm text-emerald-700">You can sign in now with your new password.</p>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset password"
      subtitle="Choose a new password for your LedgerScope account."
      footer={
        <>
          Need another link?{" "}
          <Link href="/forgot-password" className="font-medium text-slate-900 underline underline-offset-4">
            Request a new reset email
          </Link>
        </>
      }
    >
      {!isTokenUsable ? (
        <div className="space-y-4">
          <p className="text-sm text-rose-600">{helperMessage}</p>
          <Link
            href="/forgot-password"
            className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Get a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">New password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900 transition focus:border-slate-400 focus:ring-2"
              placeholder="At least 8 characters"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-medium text-slate-700">Confirm new password</span>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900 transition focus:border-slate-400 focus:ring-2"
              placeholder="Repeat your new password"
            />
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Resetting password..." : "Reset password"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
