import { z } from 'zod';

export const bracketSizeSchema = z.union([
  z.literal(4),
  z.literal(8),
  z.literal(16),
  z.literal(32),
]);
export type BracketSize = z.infer<typeof bracketSizeSchema>;

export const accountIdSchema = z.uuid();

export const idSchema = z.string().min(1).max(100);
const instant = z.iso.datetime({ offset: true });
const shortText = z.string().trim().min(1).max(160);
export const phaseSchema = z.enum([
  'draft',
  'registration',
  'check_in',
  'seeding',
  'bracket',
  'final',
  'completed',
  'cancelled',
]);
export const entryStatusSchema = z.enum([
  'registered',
  'waitlisted',
  'checked_in',
  'withdrawn',
  'no_show',
  'disqualified',
]);

export const settingsSchema = z
  .object({
    title: shortText,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(80),
    description: z.string().trim().max(4000),
    startsAt: instant,
    timezone: z.literal('America/New_York'),
    registrationOpensAt: instant,
    registrationClosesAt: instant,
    checkInOpensAt: instant,
    checkInClosesAt: instant,
    capacity: z.number().int().min(4).max(32),
    arena: shortText,
    callChannel: shortText,
    staffContact: shortText,
    restMinutes: z.number().int().min(0).max(60),
    estimatedGameSeconds: z.number().int().min(15).max(120).default(30),
    estimatedChangeoverMinutes: z.number().min(0).max(15).default(2),
    seedingMethod: z.enum(['manual', 'draw']),
    doubleForfeitPolicy: z.enum(['hold', 'eliminate_both']).default('hold'),
    seedingCriteria: z.string().trim().max(2000),
  })
  .strict()
  .superRefine((value, ctx) => {
    const before = (a: keyof typeof value, b: keyof typeof value) => {
      if (Date.parse(String(value[a])) >= Date.parse(String(value[b]))) {
        ctx.addIssue({ code: 'custom', path: [b], message: `${b} must be after ${a}.` });
      }
    };
    before('registrationOpensAt', 'registrationClosesAt');
    before('checkInOpensAt', 'checkInClosesAt');
    before('registrationClosesAt', 'checkInClosesAt');
    if (Date.parse(value.checkInClosesAt) > Date.parse(value.startsAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['checkInClosesAt'],
        message: 'Check-in must close before the event starts.',
      });
    }
  });

export const entrySchema = z.object({
  id: idSchema,
  userId: idSchema,
  alias: z.string().trim().min(1).max(64),
  status: entryStatusSchema,
  registeredAt: instant,
  reregisterAfter: instant.nullable().optional(),
  registrationSequence: z.number().int().nonnegative(),
  checkedInAt: instant.nullable(),
  acceptedRulesVersion: z.number().int().positive(),
  seed: z.number().int().min(1).max(32).nullable(),
  unavailableFromMatchId: idSchema.nullable().optional(),
  availabilityBeforeRuling: z
    .object({ status: entryStatusSchema, unavailableFromMatchId: idSchema.nullable() })
    .nullable()
    .optional(),
});
export const sourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('seed'), seed: z.number().int().min(1).max(32) }),
  z.object({ kind: z.literal('winner'), matchId: idSchema }),
  z.object({ kind: z.literal('loser'), matchId: idSchema }),
]);
export const resultSchema = z.object({
  kind: z.enum(['played', 'forfeit', 'double_forfeit']),
  winnerId: idSchema.nullable(),
  scoreA: z.number().int().min(0).max(3).nullable(),
  scoreB: z.number().int().min(0).max(3).nullable(),
  reason: z.string().trim().max(2000),
  recordedAt: instant,
  actorId: idSchema,
  revision: z.number().int().positive(),
  previousStatuses: z.array(z.object({ entryId: idSchema, status: entryStatusSchema })).optional(),
});
export const fixtureSchema = z.object({
  id: idSchema,
  bracket: z.enum(['upper', 'lower', 'final', 'reset']),
  round: z.number().int().positive(),
  sources: z.tuple([sourceSchema, sourceSchema]),
  startedAt: instant.nullable(),
  scheduledAt: instant.nullable(),
  held: z.boolean(),
  holdReason: z.string().max(2000),
  result: resultSchema.nullable(),
});
export const noticeSchema = z.object({
  id: idSchema,
  userId: idSchema,
  message: z.string().max(1000),
  createdAt: instant,
  readAt: instant.nullable(),
});
export const announcementSchema = z.object({
  id: idSchema,
  body: z.string().min(1).max(4000),
  createdAt: instant,
});
export const auditSchema = z.object({
  id: idSchema,
  actorId: idSchema,
  action: shortText,
  at: instant,
  revision: z.number().int().nonnegative(),
  reason: z.string().max(2000),
  matchId: idSchema.nullable(),
  previousResult: resultSchema.nullable(),
  details: z.record(z.string(), z.json()),
});

export const drawSchema = z.object({
  id: idSchema,
  algorithm: z.literal('sha256-fisher-yates-v1'),
  entrants: z
    .array(z.object({ id: idSchema, alias: z.string().min(1).max(64) }))
    .min(4)
    .max(32),
  randomSeed: z.string().regex(/^[a-f0-9]{64}$/),
  commitment: z.string().regex(/^[a-f0-9]{64}$/),
  order: z.array(idSchema).min(4).max(32),
  committedAt: instant,
  revealedAt: instant.nullable(),
  voidReason: z.string().max(2000).nullable(),
});

// A logical aggregate contract. Physical schema/RPC mapping requires owner verification.
export const tournamentSchema = z
  .object({
    id: idSchema,
    revision: z.number().int().nonnegative(),
    settings: settingsSchema,
    phase: phaseSchema,
    published: z.boolean(),
    featured: z.boolean(),
    paused: z.boolean(),
    pauseReason: z.string().max(2000),
    pauseSource: z.enum(['manual', 'no_final_winner']).nullable().optional(),
    rules: z.object({
      text: z.string().max(30000),
      version: z.number().int().positive(),
      publishedAt: instant.nullable(),
    }),
    entries: z.array(entrySchema).max(1000),
    fixtures: z.array(fixtureSchema).max(63),
    seedOrder: z.array(idSchema).max(32),
    // Missing on stored legacy events, whose existing fixtures remain 16 slots.
    bracketSize: bracketSizeSchema.optional(),
    draws: z.array(drawSchema),
    refereeIds: z.array(idSchema).max(20),
    announcements: z.array(announcementSchema),
    notices: z.array(noticeSchema),
    audit: z.array(auditSchema),
    receipts: z.array(
      z.object({
        id: idSchema,
        actorId: idSchema,
        fingerprint: z.string().max(128),
        revision: z.number().int(),
      }),
    ),
    completionReason: z.string().max(2000).nullable().optional(),
    createdAt: instant,
    updatedAt: instant,
  })
  .superRefine((event, ctx) => {
    const size = event.bracketSize ?? 16;
    if (
      event.fixtures.length &&
      (event.fixtures.length !== 2 * size - 1 ||
        event.seedOrder.length < 4 ||
        event.seedOrder.length > size ||
        event.fixtures.some((fixture) =>
          fixture.sources.some((source) => source.kind === 'seed' && source.seed > size),
        ))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['fixtures'],
        message: 'Stored fixtures and seeds must fit the published bracket size.',
      });
    }
  });

const resultInput = z
  .object({
    type: z.literal('result'),
    matchId: idSchema,
    kind: resultSchema.shape.kind,
    winnerId: idSchema.nullable(),
    scoreA: resultSchema.shape.scoreA,
    scoreB: resultSchema.shape.scoreB,
    reason: z.string().trim().max(2000),
  })
  .strict();

export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('settings'), settings: settingsSchema }).strict(),
  z
    .object({
      type: z.literal('rules'),
      text: z.string().trim().min(1).max(30000),
      publish: z.boolean(),
    })
    .strict(),
  z.object({ type: z.literal('publish'), featured: z.boolean() }).strict(),
  z.object({ type: z.literal('register'), rulesVersion: z.number().int().positive() }).strict(),
  z.object({ type: z.literal('withdraw') }).strict(),
  z.object({ type: z.literal('check_in') }).strict(),
  z.object({ type: z.literal('promote'), entryId: idSchema }).strict(),
  z
    .object({
      type: z.literal('registration_state'),
      state: z.enum(['registration', 'check_in', 'seeding']),
    })
    .strict(),
  z
    .object({
      type: z.literal('seeds'),
      entryIds: z.array(idSchema).min(4).max(32),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z.object({ type: z.literal('draw') }).strict(),
  z.object({ type: z.literal('reveal_draw') }).strict(),
  z.object({ type: z.literal('void_draw'), reason: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ type: z.literal('publish_bracket') }).strict(),
  z
    .object({
      type: z.literal('pause'),
      paused: z.boolean(),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z.object({ type: z.literal('staff'), userId: accountIdSchema, grant: z.boolean() }).strict(),
  z.object({ type: z.literal('announcement'), body: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ type: z.literal('notice_read'), noticeId: idSchema }).strict(),
  z.object({ type: z.literal('start_match'), matchId: idSchema }).strict(),
  z
    .object({
      type: z.literal('hold_match'),
      matchId: idSchema,
      held: z.boolean(),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('schedule_match'),
      matchId: idSchema,
      scheduledAt: instant.nullable(),
    })
    .strict(),
  resultInput,
  z
    .object({
      type: z.literal('correct_result'),
      matchId: idSchema,
      reason: z.string().trim().min(1).max(2000),
      replacement: resultInput.omit({ type: true, matchId: true }),
    })
    .strict(),
  z
    .object({
      type: z.literal('entry_status'),
      entryId: idSchema,
      status: z.enum(['no_show', 'disqualified']),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('reopen_match'),
      matchId: idSchema,
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('finish_without_champion'),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('resolve_absence'),
      matchId: idSchema,
      outcome: z.enum(['resume', 'eliminate_both']),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('restore_entry'),
      entryId: idSchema,
      reason: z.string().trim().min(1).max(2000),
    })
    .strict(),
  z.object({ type: z.literal('cancel'), reason: z.string().trim().min(1).max(2000) }).strict(),
]);
export const mutationSchema = z
  .object({
    operationId: z.uuid(),
    expectedRevision: z.number().int().nonnegative(),
    command: commandSchema,
  })
  .strict();
export const createSchema = z.object({ operationId: z.uuid(), settings: settingsSchema }).strict();

export type Settings = z.infer<typeof settingsSchema>;
export type Entry = z.infer<typeof entrySchema>;
export type Source = z.infer<typeof sourceSchema>;
export type Fixture = z.infer<typeof fixtureSchema>;
export type Result = z.infer<typeof resultSchema>;
export type SeedDraw = z.infer<typeof drawSchema>;
export type Tournament = z.infer<typeof tournamentSchema>;
export type Command = z.infer<typeof commandSchema>;
export type Mutation = z.infer<typeof mutationSchema>;
export type Actor = { userId: string; alias: string | null; director: boolean };

export class TournamentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}

export function requireCondition(
  value: unknown,
  message: string,
  code = 'invalid_transition',
  status = 409,
): asserts value {
  if (!value) throw new TournamentError(code, message, status);
}
