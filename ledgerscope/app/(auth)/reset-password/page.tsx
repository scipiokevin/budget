import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getPasswordResetTokenStatus } from "@/lib/auth/password-reset";

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const session = await auth();

  if (session?.user?.id) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token ?? null;
  const initialStatus = (await getPasswordResetTokenStatus(token)).status;

  return <ResetPasswordForm token={token} initialStatus={initialStatus} />;
}
