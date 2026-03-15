import { z } from "zod";
import { entityIdSchema, trimmedString } from "@/lib/validation/schemas/common";

export const plaidCreateLinkTokenSchema = z
  .object({
    redirectUri: z.string().url("Redirect URI must be a valid URL").optional(),
  })
  .strict();

export const plaidExchangePublicTokenSchema = z
  .object({
    publicToken: trimmedString("Public token", 512),
    institutionId: z.string().trim().max(128).optional(),
    institutionName: z.string().trim().max(160).optional(),
  })
  .strict();

export const plaidTransactionsSyncSchema = z
  .object({
    bankConnectionId: entityIdSchema.optional(),
  })
  .strict();

export type PlaidCreateLinkTokenInput = z.infer<typeof plaidCreateLinkTokenSchema>;
export type PlaidExchangePublicTokenInput = z.infer<typeof plaidExchangePublicTokenSchema>;
export type PlaidTransactionsSyncInput = z.infer<typeof plaidTransactionsSyncSchema>;
