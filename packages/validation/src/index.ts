import { z } from "zod";

export const uuidSchema = z.string().uuid();
export const ethereumAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/u);
export const bytes32Schema = z.string().regex(/^0x[a-fA-F0-9]{64}$/u);

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
