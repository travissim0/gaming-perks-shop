import { z } from 'zod';
import { bracketSizeSchema } from './contracts';
import {
  announcementSchema,
  auditSchema,
  drawSchema,
  entrySchema,
  fixtureSchema,
  idSchema,
  noticeSchema,
  phaseSchema,
  resultSchema,
  settingsSchema,
} from './contracts';

const slotSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('empty') }),
  z.object({ state: z.literal('player'), entryId: idSchema }),
]);
const fixtureViewSchema = fixtureSchema
  .omit({ result: true, held: true, holdReason: true })
  .extend({
    slots: z.tuple([slotSchema, slotSchema]),
    state: z.enum([
      'waiting',
      'ready',
      'held',
      'in_progress',
      'completed',
      'bye',
      'skipped',
      'conditional',
    ]),
    winner: slotSchema,
    loser: slotSchema,
    result: resultSchema.omit({ reason: true, actorId: true }).nullable(),
  });
export const tournamentViewSchema = z.object({
  id: idSchema,
  revision: z.number().int(),
  settings: settingsSchema,
  phase: phaseSchema,
  published: z.boolean(),
  featured: z.boolean(),
  paused: z.boolean(),
  pauseReason: z.string(),
  rules: z.object({
    text: z.string(),
    version: z.number().int(),
    publishedAt: z.string().nullable(),
  }),
  entries: z.array(entrySchema.pick({ id: true, alias: true, status: true, seed: true })),
  fixtures: z.array(fixtureViewSchema).max(63),
  seedOrder: z.array(idSchema).max(32),
  bracketSize: bracketSizeSchema.nullable(),
  draws: z.array(
    drawSchema.extend({
      randomSeed: drawSchema.shape.randomSeed.nullable(),
      order: z.array(idSchema).max(32),
    }),
  ),
  announcements: z.array(announcementSchema),
  completionReason: z.string().nullable(),
  championId: idSchema.nullable(),
  placements: z.array(
    z.object({
      entryId: idSchema,
      alias: z.string(),
      seed: z.number().nullable(),
      losses: z.number(),
      place: z.number().nullable(),
      eliminatedRound: z.number().nullable(),
      bracket: fixtureSchema.shape.bracket.nullable(),
    }),
  ),
  queue: z.array(
    z.object({
      matchId: idSchema,
      eligible: z.boolean(),
      eligibleAt: z.string().nullable(),
      estimatedAt: z.string().nullable(),
    }),
  ),
  updatedAt: z.string(),
  serverNow: z.string(),
  me: z
    .object({
      entry: entrySchema.nullable(),
      notices: z.array(noticeSchema),
      director: z.boolean(),
      referee: z.boolean(),
      hasAlias: z.boolean(),
    })
    .nullable(),
  staff: z
    .object({
      entries: z.array(
        entrySchema.omit({
          userId: true,
          unavailableFromMatchId: true,
          availabilityBeforeRuling: true,
        }),
      ),
      refereeIds: z.array(idSchema),
      audit: z.array(auditSchema),
      correctionImpacts: z.record(
        z.string(),
        z.object({ affected: z.array(idSchema), blocked: z.array(idSchema) }),
      ),
      holds: z.record(z.string(), z.string()),
      reversibleEntryIds: z.array(idSchema),
      rulings: z.record(z.string(), z.string()),
    })
    .nullable(),
});
export const eventSummarySchema = z.object({
  id: idSchema,
  slug: z.string(),
  title: z.string(),
  startsAt: z.string(),
  phase: phaseSchema,
  published: z.boolean(),
  featured: z.boolean(),
  capacity: z.number(),
  registered: z.number(),
  champion: z.string().nullable(),
});
export const listResponseSchema = z.object({
  events: z.array(eventSummarySchema),
  enabled: z.boolean(),
  nextOffset: z.number().nullable().optional(),
});
export const detailResponseSchema = z.object({ event: tournamentViewSchema });
export const accessResponseSchema = z.object({
  director: z.boolean(),
  referee: z.boolean(),
  userId: idSchema,
});

export const historyResponseSchema = z.object({
  rows: z.array(
    z.object({
      cursor: z.string(),
      item: z.union([
        auditSchema,
        drawSchema.extend({
          randomSeed: drawSchema.shape.randomSeed.nullable(),
          order: z.array(idSchema),
        }),
        noticeSchema,
        announcementSchema,
      ]),
    }),
  ),
  nextBefore: z.string().nullable(),
});
