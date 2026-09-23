import { z } from 'zod';
import {
  Actor,
  accountIdSchema,
  TournamentError,
  auditSchema,
  announcementSchema,
  drawSchema,
  noticeSchema,
  createSchema,
  mutationSchema,
} from './contracts';
import { TournamentRepository } from './repository';
import { canOperate } from './transition';
import { eventCsv, eventExport, eventSummary, publicDraw, tournamentView } from './view';

export interface TournamentHttpDependencies {
  enabled(): boolean;
  repository(): TournamentRepository;
  actor(request: Request, required: boolean): Promise<Actor | null>;
  staffAccount(userId: string): Promise<void>;
  readLimit(request: Request): Promise<void>;
  now(): string;
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  // Next may normalize a loopback hostname in request.url. The HTTP Host header
  // retains the authority that the browser actually addressed.
  const host = request.headers.get('host');
  if (host && /^[a-z0-9.\-:[\]]+$/i.test(host)) url.host = host;
  return url.origin;
}

function headers(request: Request, extra?: HeadersInit): Headers {
  const result = new Headers(extra);
  result.set('Cache-Control', 'no-store, private');
  result.set('Vary', 'Authorization, Origin');
  result.set('Access-Control-Allow-Origin', requestOrigin(request));
  result.set('Access-Control-Allow-Credentials', 'false');
  result.set('X-Content-Type-Options', 'nosniff');
  return result;
}

function json(request: Request, data: unknown, status = 200) {
  return Response.json(data, { status, headers: headers(request) });
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (origin !== requestOrigin(request) || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new TournamentError(
      'forbidden_origin',
      'Use the Freeinf website to make this change.',
      403,
    );
  }
}

export async function boundedJson(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    throw new TournamentError('invalid_content_type', 'Send a JSON request.', 415);
  const max = 65536;
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declared) || declared > max)
    throw new TournamentError('too_large', 'The submitted content is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new TournamentError('invalid_body', 'A request body is required.', 400);
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new TournamentError('too_large', 'The submitted content is too large.', 413);
    }
    text += decoder.decode(chunk.value, { stream: true });
  }
  text += decoder.decode();
  try {
    return JSON.parse(text);
  } catch {
    throw new TournamentError('invalid_body', 'The submitted JSON could not be read.', 400);
  }
}

export function createTournamentHttp(deps: TournamentHttpDependencies) {
  const admittedActor = async (request: Request, required: boolean) => {
    await deps.readLimit(request);
    const actor = await deps.actor(request, required);
    if (actor && !accountIdSchema.safeParse(actor.userId).success)
      throw new TournamentError(
        'unauthorized',
        'Your Freeinf account ID could not be verified.',
        401,
      );
    return actor;
  };
  const handle = async (request: Request, operation: () => Promise<Response>) => {
    try {
      const response = await operation();
      return response;
    } catch (error) {
      if (error instanceof TournamentError) {
        const response = json(request, { error: error.message, code: error.code }, error.status);
        if (error.status === 429) response.headers.set('Retry-After', '60');
        return response;
      }
      if (error instanceof z.ZodError)
        return json(
          request,
          {
            error: 'Review the submitted fields.',
            code: 'invalid_input',
            fields: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
          422,
        );
      const requestId = crypto.randomUUID();
      console.error('dueling_tournament_request_failed', {
        requestId,
        kind: error instanceof Error ? error.name : 'Unknown',
      });
      return json(
        request,
        {
          error: 'The tournament request could not be completed. Please retry.',
          code: 'request_failed',
          requestId,
        },
        500,
      );
    }
  };
  const available = () => {
    if (!deps.enabled())
      throw new TournamentError('unavailable', 'Tournament services are not available yet.', 503);
  };
  const requiredActor = async (request: Request) => {
    const actor = await admittedActor(request, true);
    if (!actor) throw new TournamentError('unauthorized', 'Sign in to your Freeinf account.', 401);
    return actor;
  };
  return {
    options: (request: Request) =>
      handle(request, async () => {
        sameOrigin(request);
        const value = headers(request, {
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        });
        return new Response(null, { status: 204, headers: value });
      }),
    list: (request: Request) =>
      handle(request, async () => {
        if (!deps.enabled()) return json(request, { events: [], enabled: false });
        const actor = await admittedActor(request, false);
        const offset = z.coerce
          .number()
          .int()
          .min(0)
          .max(10000)
          .parse(new URL(request.url).searchParams.get('offset') ?? 0);
        const repository = deps.repository();
        const events = await repository.list(actor, offset);
        return json(request, {
          events: events.map(eventSummary),
          enabled: true,
          nextOffset: repository.lastListCount === 20 ? offset + 20 : null,
        });
      }),
    create: (request: Request) =>
      handle(request, async () => {
        available();
        sameOrigin(request);
        const actor = await requiredActor(request);
        const input = createSchema.parse(await boundedJson(request));
        const result = await deps
          .repository()
          .create(input.settings, input.operationId, actor, deps.now());
        return json(request, { event: tournamentView(result, actor, deps.now()) }, 201);
      }),
    detail: (request: Request, locator: string) =>
      handle(request, async () => {
        available();
        z.string().min(1).max(100).parse(locator);
        const actor = await admittedActor(request, false);
        const event = await deps.repository().get(locator, actor);
        return json(request, { event: tournamentView(event, actor, deps.now()) });
      }),
    mutate: (request: Request, locator: string) =>
      handle(request, async () => {
        available();
        sameOrigin(request);
        z.string().min(1).max(100).parse(locator);
        const actor = await requiredActor(request);
        const input = mutationSchema.parse(await boundedJson(request));
        if (input.command.type === 'staff') {
          if (!actor.director)
            throw new TournamentError('forbidden', 'Tournament director access is required.', 403);
          await deps.staffAccount(input.command.userId);
        }
        const result = await deps.repository().mutate(locator, input, actor, deps.now());
        return json(request, { event: tournamentView(result, actor, deps.now()) });
      }),
    history: (request: Request, locator: string) =>
      handle(request, async () => {
        available();
        const actor = await admittedActor(request, false);
        const url = new URL(request.url);
        const kind = z
          .enum(['audit', 'draws', 'notices', 'announcements'])
          .parse(url.searchParams.get('kind'));
        const before = z
          .string()
          .regex(/^[0-9]{1,18}$/)
          .nullable()
          .parse(url.searchParams.get('before'));
        const event = await deps.repository().get(locator, actor);
        const raw = await deps.repository().history(event.id, actor, kind, before);
        const rows = z
          .array(z.object({ cursor: z.string(), item: z.unknown() }))
          .max(50)
          .parse(raw)
          .map((row) => ({
            cursor: row.cursor,
            item:
              kind === 'draws'
                ? publicDraw(drawSchema.parse(row.item))
                : kind === 'audit'
                  ? auditSchema.parse(row.item)
                  : kind === 'notices'
                    ? noticeSchema.parse(row.item)
                    : announcementSchema.parse(row.item),
          }));
        return json(request, { rows, nextBefore: rows.length === 50 ? rows.at(-1)!.cursor : null });
      }),
    access: (request: Request) =>
      handle(request, async () => {
        available();
        const actor = await requiredActor(request);
        const capabilities = await deps.repository().capabilities(actor.userId);
        return json(request, { ...capabilities, userId: actor.userId });
      }),
    export: (request: Request, locator: string) =>
      handle(request, async () => {
        available();
        const actor = await requiredActor(request);
        const event = await deps.repository().get(locator, actor);
        if (!canOperate(event, actor))
          throw new TournamentError('forbidden', 'Tournament staff access is required.', 403);
        const kind = z
          .enum(['players', 'matches', 'results', 'event'])
          .parse(new URL(request.url).searchParams.get('kind') ?? 'event');
        const output =
          kind === 'event'
            ? JSON.stringify(eventExport(event, deps.now()), null, 2)
            : eventCsv(event, kind);
        return new Response(output, {
          headers: headers(request, {
            'Content-Type':
              kind === 'event' ? 'application/json; charset=utf-8' : 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="${event.settings.slug}-${kind}.${kind === 'event' ? 'json' : 'csv'}"`,
          }),
        });
      }),
  };
}
