import { z } from "zod";
import { entityIdSchema, nonNegativeAmountSchema, trimmedString } from "@/lib/validation/schemas/common";

export const budgetPayloadSchema = z
  .object({
    category: trimmedString("Category", 80),
    budgetAmount: nonNegativeAmountSchema,
    actualSpent: nonNegativeAmountSchema,
    pendingSpent: nonNegativeAmountSchema,
  })
  .strict();

export const budgetCreateSchema = budgetPayloadSchema;

export const budgetUpdateSchema = budgetPayloadSchema
  .extend({
    id: entityIdSchema,
  })
  .strict();

export const budgetDeleteSchema = z
  .object({
    id: entityIdSchema,
  })
  .strict();

export type BudgetCreateInput = z.infer<typeof budgetCreateSchema>;
export type BudgetUpdateInput = z.infer<typeof budgetUpdateSchema>;
export type BudgetDeleteInput = z.infer<typeof budgetDeleteSchema>;
