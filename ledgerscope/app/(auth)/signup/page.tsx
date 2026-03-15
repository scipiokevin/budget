import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/prisma";
import { SignupForm } from "@/components/auth/signup-form";

export default async function SignupPage() {
  const session = await auth();

  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompletedAt: true },
    });

    redirect(user?.onboardingCompletedAt ? "/dashboard" : "/onboarding");
  }

  return <SignupForm />;
}
