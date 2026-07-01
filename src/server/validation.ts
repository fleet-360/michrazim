import "server-only";
import { z } from "zod";

/**
 * Runtime validation for every server-action input. TypeScript types stop at
 * the network boundary — anything a client sends reaches these schemas first.
 */

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "invalid id");

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(100),
  company: z.string().trim().max(120).default(""),
  title: z.string().trim().max(120).default(""),
});

export const tenderIdSchema = z.string().regex(/^[\w.:-]{1,64}$/);

export const bidUpdateSchema = z.object({
  id: objectIdSchema,
  bid: z.number().finite().min(0).max(1e12),
  riskAppetite: z.number().finite().min(0).max(1),
});

export const questionSchema = z.string().trim().min(1).max(2000);

export const assistantHistorySchema = z
  .array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().max(4000),
    }),
  )
  .max(20)
  .default([]);

export const importDealsSchema = z.object({
  text: z.string().min(1).max(50_000),
  city: z.string().trim().min(1).max(100),
});

export const parseTenderSchema = z.string().min(1).max(20_000);

export const cityFeesPatchSchema = z.strictObject({
  buildingFeePerSqm: z.number().finite().min(0).max(100_000).optional(),
  sewageLevyPerSqm: z.number().finite().min(0).max(100_000).optional(),
  waterLevyPerSqm: z.number().finite().min(0).max(100_000).optional(),
  roadsLevyPerSqm: z.number().finite().min(0).max(100_000).optional(),
  drainageLevyPerSqm: z.number().finite().min(0).max(100_000).optional(),
  openSpaceLevyPerSqm: z.number().finite().min(0).max(100_000).optional(),
  avgResidentialPricePerSqm: z.number().finite().min(0).max(1_000_000).optional(),
});

export const newProjectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  track: z.enum(["RMI", "URBAN_RENEWAL", "PRIVATE"]),
  city: z.string().trim().min(1).max(100),
  gush: z.string().trim().max(20).optional(),
  helka: z.string().trim().max(20).optional(),
  address: z.string().trim().max(300).optional(),
  lat: z.number().finite().min(-90).max(90).optional(),
  lng: z.number().finite().min(-180).max(180).optional(),
  marketAnchor: z.number().finite().min(0).max(1e12).optional(),
  // DealInputs is a deep engine type; enforce the load-bearing invariants here
  // and let the typed engine handle the rest.
  inputs: z.looseObject({
    rights: z.looseObject({ plotAreaSqm: z.number().finite().positive().max(1e8) }),
  }),
});

export const importTenderSchema = z.object({
  name: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(100),
  units: z.number().finite().min(0).max(20_000),
  totalDevelopCost: z.number().finite().min(0).max(1e11).optional(),
  site: z.string().trim().max(300).optional(),
  semelYeshuv: z.string().trim().max(10).optional(),
});

export const importRenewalSchema = z.object({
  name: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(100),
  targetUnits: z.number().finite().min(0).max(20_000),
  existingUnits: z.number().finite().min(0).max(20_000).optional(),
  planNumber: z.string().trim().max(50).optional(),
  semelYeshuv: z.string().trim().max(10).optional(),
});

export const gushHelkaSchema = z.string().regex(/^\d{1,7}$/);
