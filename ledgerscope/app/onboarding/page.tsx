import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { OnboardingForm } from "@/components/auth/onboarding-form";

export default async function OnboardingPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, onboardingCompletedAt: true },
  });

  if (user?.onboardingCompletedAt) {
    redirect("/dashboard");
  }

  return <OnboardingForm userName={user?.name} />;
}
