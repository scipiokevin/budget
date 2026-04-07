"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

type UserMenuProps = {
  name?: string | null;
  email?: string | null;
};

function resolveDisplayName(name?: string | null, email?: string | null) {
  const safeName = typeof name === "string" ? name.trim() : "";
  if (safeName.length > 0) return safeName;
  return email ?? "Signed in";
}

export function UserMenu({ name, email }: UserMenuProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignOut() {
    setIsSubmitting(true);
    try {
      await signOut({ callbackUrl: "/login" });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="text-slate-600">{resolveDisplayName(name, email)}</span>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={isSubmitting}
        className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white disabled:opacity-60"
      >
        {isSubmitting ? "Signing out..." : "Sign out"}
      </button>
    </div>
  );
}
