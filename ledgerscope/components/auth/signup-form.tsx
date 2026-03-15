"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AuthShell } from "@/components/auth/auth-shell";
import type { AppApiError } from "@/types/api-errors";

const REQUEST_TIMEOUT_MS = 12000;

function timeoutPromise(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

async function signInWithTimeout(email: string, password: string) {
  const signInPromise = signIn("credentials", {
    email,
    password,
    redirect: false,
    callbackUrl: "/onboarding",
  });

  return Promise.race([signInPromise, timeoutPromise(REQUEST_TIMEOUT_MS, "Sign-in request timed out.")]);
}

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const signupResponse = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          email,
          password,
        }),
        signal: controller.signal,
      });

      clearTimeout(fetchTimeout);

      if (!signupResponse.ok) {
        const payload = (await signupResponse.json().catch(() => null)) as AppApiError | null;
        setError(payload?.error ?? "Could not create your account.");
        return;
      }

      const signInResult = await signInWithTimeout(email, password);

      if (!signInResult || signInResult.error) {
        setError("Account created, but automatic sign-in failed. Please sign in manually.");
        return;
      }

      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setError("Signup request timed out. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Could not create your account.");
      }
    } finally {
      clearTimeout(fetchTimeout);
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Create account"
      subtitle="Start tracking budgets, forecasts, and transactions."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-slate-900 underline underline-offset-4">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-slate-900 transition focus:border-slate-400 focus:ring-2"
            placeholder="Optional"
          />
        </label>

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

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Password</span>
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

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}
