import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

const PASSWORD_RESET_PREFIX = "password-reset:";
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

type PasswordResetStatus = "valid" | "expired" | "invalid";

type PasswordResetRequest = {
  shouldSendEmail: boolean;
  email?: string;
  name?: string | null;
  resetUrl?: string;
  expiresAt?: Date;
  previewResetUrl?: string;
};

export type PasswordResetTokenStatus = {
  status: PasswordResetStatus;
  email?: string;
  expiresAt?: Date;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function passwordResetIdentifier(userId: string) {
  return `${PASSWORD_RESET_PREFIX}${userId}`;
}

function parsePasswordResetUserId(identifier: string) {
  return identifier.startsWith(PASSWORD_RESET_PREFIX) ? identifier.slice(PASSWORD_RESET_PREFIX.length) : null;
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildPasswordResetUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function isPasswordResetEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export async function createPasswordResetRequest(email: string, origin: string): Promise<PasswordResetRequest> {
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
    },
  });

  if (!user?.id || !user.email || !user.passwordHash) {
    return { shouldSendEmail: false };
  }

  const identifier = passwordResetIdentifier(user.id);
  await prisma.verificationToken.deleteMany({
    where: {
      OR: [
        { identifier },
        { expires: { lt: new Date() } },
      ],
    },
  });

  const rawToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await prisma.verificationToken.create({
    data: {
      identifier,
      token: hashResetToken(rawToken),
      expires: expiresAt,
    },
  });

  const resetUrl = buildPasswordResetUrl(origin, rawToken);

  return {
    shouldSendEmail: true,
    email: user.email,
    name: user.name,
    resetUrl,
    expiresAt,
    previewResetUrl: process.env.NODE_ENV === "production" ? undefined : resetUrl,
  };
}

export async function getPasswordResetTokenStatus(rawToken: string | null | undefined): Promise<PasswordResetTokenStatus> {
  if (!rawToken?.trim()) {
    return { status: "invalid" };
  }

  const record = await prisma.verificationToken.findUnique({
    where: { token: hashResetToken(rawToken) },
    select: {
      identifier: true,
      expires: true,
    },
  });

  if (!record) {
    return { status: "invalid" };
  }

  const userId = parsePasswordResetUserId(record.identifier);
  if (!userId) {
    return { status: "invalid" };
  }

  if (record.expires <= new Date()) {
    return {
      status: "expired",
      expiresAt: record.expires,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user?.email) {
    return { status: "invalid" };
  }

  return {
    status: "valid",
    email: user.email,
    expiresAt: record.expires,
  };
}

export async function resetPasswordWithToken(rawToken: string, password: string): Promise<PasswordResetTokenStatus> {
  const tokenHash = hashResetToken(rawToken);
  const passwordHash = await hash(password, 12);

  try {
    const status = await prisma.$transaction(async (tx) => {
      const record = await tx.verificationToken.findUnique({
        where: { token: tokenHash },
        select: {
          identifier: true,
          expires: true,
        },
      });

      if (!record) {
        return { status: "invalid" as const };
      }

      const userId = parsePasswordResetUserId(record.identifier);
      if (!userId) {
        return { status: "invalid" as const };
      }

      if (record.expires <= new Date()) {
        await tx.verificationToken.deleteMany({
          where: {
            OR: [
              { token: tokenHash },
              { expires: { lt: new Date() } },
            ],
          },
        });
        return { status: "expired" as const, expiresAt: record.expires };
      }

      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });

      if (!user?.email) {
        await tx.verificationToken.deleteMany({ where: { token: tokenHash } });
        return { status: "invalid" as const };
      }

      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      await tx.verificationToken.deleteMany({
        where: {
          OR: [
            { identifier: passwordResetIdentifier(userId) },
            { expires: { lt: new Date() } },
          ],
        },
      });

      return {
        status: "valid" as const,
        email: user.email,
      };
    });

    return status;
  } catch (error) {
    console.error("[password-reset] reset failed", error);
    return { status: "invalid" };
  }
}

export async function sendPasswordResetEmail(params: {
  email: string;
  name?: string | null;
  resetUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    console.warn("[password-reset] email delivery is not configured", {
      email: params.email,
      hasApiKey: Boolean(apiKey),
      hasFrom: Boolean(from),
    });
    return { delivered: false, configured: false } as const;
  }

  const displayName = params.name?.trim() || "there";
  const subject = "Reset your LedgerScope password";
  const safeName = escapeHtml(displayName);
  const safeUrl = escapeHtml(params.resetUrl);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.email],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #0f172a;">
          <p>Hi ${safeName},</p>
          <p>We received a request to reset your LedgerScope password.</p>
          <p>
            <a href="${safeUrl}" style="display: inline-block; background: #0f172a; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none;">
              Reset password
            </a>
          </p>
          <p>If you did not request this, you can ignore this email.</p>
          <p>This link expires in 1 hour.</p>
        </div>
      `,
      text: `Hi ${displayName},\n\nWe received a request to reset your LedgerScope password.\n\nReset it here: ${params.resetUrl}\n\nIf you did not request this, you can ignore this email.\nThis link expires in 1 hour.\n`,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Password reset email failed: ${response.status} ${details}`);
  }

  return { delivered: true, configured: true } as const;
}
