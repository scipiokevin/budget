import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 40 }}>
      <h1>LedgerScope is live</h1>
      <p>Deployment is working.</p>
      <p><Link href="/dashboard">Go to dashboard</Link></p>
      <p><Link href="/onboarding">Go to onboarding</Link></p>
      <p><Link href="/api/auth/signin">Sign in</Link></p>
    </main>
  );
}
