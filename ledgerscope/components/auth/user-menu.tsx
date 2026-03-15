"use client";

import { signOut } from "next-auth/react";

type UserMenuProps = {
  email?: string | null;
};

export function UserMenu({ email }: UserMenuProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
      <span className="text-slate-600">{email ?? "Signed in"}</span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: "/login" })}
        className="rounded-md bg-slate-900 px-2 py-1 text-xs text-white"
      >
        Sign out
      </button>
    </div>
  );
}
