import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { UserMenu } from "@/components/auth/user-menu";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompletedAt: true },
  });

  if (!user?.onboardingCompletedAt) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 md:grid md:grid-cols-[16rem_1fr]">
      <AppSidebar />
      <section>
        <div className="flex justify-end p-4 md:p-6">
          <UserMenu name={session.user.name} email={session.user.email} />
        </div>
        {children}
      </section>
    </div>
  );
}

