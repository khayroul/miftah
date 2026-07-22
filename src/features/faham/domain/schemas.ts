import { z } from "zod";

const fahamSourceEnum = z.enum(["reading_page", "theme_chunk", "hifz_ayah"]);
const fahamDirectionEnum = z.enum(["arab_to_bm", "bm_to_arab", "mixed"]);
const fahamRatingEnum = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
]);

const ayahIdsSchema = z.array(z.number().int().positive()).min(1);

export const fahamExposureSchema = z.discriminatedUnion("sourceType", [
  z.object({
    ayahIds: ayahIdsSchema,
    pageNumber: z.number().int().min(1).max(604),
    sourceType: z.literal("reading_page"),
    surahId: z.number().int().min(1).max(114).nullable().optional(),
  }),
  z.object({
    ayahIds: ayahIdsSchema,
    sourceType: z.literal("theme_chunk"),
    surahId: z.number().int().min(1).max(114),
    themeChunkIndex: z.number().int().positive(),
  }),
  z.object({
    ayahIds: ayahIdsSchema.length(1),
    sourceType: z.literal("hifz_ayah"),
    surahId: z.number().int().min(1).max(114).nullable().optional(),
  }),
]);

export const fahamQueueRequestSchema = z.object({
  directionMode: fahamDirectionEnum.optional(),
  meaningLocale: z.enum(["ms", "en"]).optional(),
  dueLimit: z.number().int().min(1).max(100).optional(),
  minDistinctContextCount: z.number().int().min(1).max(5).optional(),
  minExposureEventCount: z.number().int().min(1).max(10).optional(),
  minOccurrenceWeight: z.number().int().min(1).max(20).optional(),
  newLimit: z.number().int().min(0).max(100).optional(),
  pauseNewCardsAboveDueCount: z.number().int().min(0).max(200).optional(),
  preferredSources: z.array(fahamSourceEnum).max(3).optional(),
  isRevision: z.boolean().optional(),
});

export const fahamRateRequestSchema = z.union([
  z.object({
    progressId: z.number().int().positive(),
    rating: fahamRatingEnum,
  }),
  z.object({
    rating: fahamRatingEnum,
    wordId: z.number().int().positive(),
  }),
]);
