import { z } from "zod";

export const trimmedString = (field: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, `${field} is required`)
    .max(max, `${field} is too long`);

export const entityIdSchema = z.string().trim().min(1, "Id is required");

export const nonNegativeAmountSchema = z.coerce
  .number({ error: "Amount must be a number" })
  .finite("Amount must be finite")
  .nonnegative("Amount must be non-negative");
