import { z } from 'zod';
import {
  Actor,
  Mutation,
  Settings,
  Tournament,
  TournamentError,
  tournamentSchema,
} from './contracts';
import { applyMutation, commandFingerprint, newTournament } from './transition';

export interface RpcPort {
  call(name: string, args: Record<string, unknown>): Promise<unknown>;
}

const capabilitySchema = z.object({ director: z.boolean(), referee: z.boolean() });

export class TournamentRepository {
  lastListCount = 0;
  constructor(private readonly port: RpcPort) {}

  async capabilities(userId: string) {
    return capabilitySchema.parse(
      await this.port.call('dueling_tournament_capabilities', { p_actor_id: userId }),
    );
  }

  async list(actor: Actor | null, offset = 0): Promise<Tournament[]> {
    const raw = await this.port.call('dueling_tournament_list', {
      p_actor_id: actor?.userId ?? null,
      p_offset: offset,
    });
    const rows = z.array(z.unknown()).max(20).safeParse(raw);
    if (!rows.success) {
      console.error('dueling_tournament_invalid_list', { code: 'invalid_shape' });
      throw new TournamentError('unavailable', 'Tournament events could not be loaded.', 503);
    }
    this.lastListCount = rows.data.length;
    return rows.data.flatMap((row, index) => {
      const parsed = tournamentSchema.safeParse(row);
      if (parsed.success) return [parsed.data];
      const id = z.object({ id: z.string().max(100) }).safeParse(row);
      console.error('dueling_tournament_invalid_record', {
        eventId: id.success ? id.data.id : null,
        offset: offset + index,
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join('.'),
        })),
      });
      return [];
    });
  }

  async get(locator: string, actor: Actor | null): Promise<Tournament> {
    const raw = await this.port.call('dueling_tournament_get', {
      p_locator: locator,
      p_actor_id: actor?.userId ?? null,
    });
    if (!raw) throw new TournamentError('not_found', 'Tournament not found.', 404);
    const parsed = tournamentSchema.safeParse(raw);
    if (!parsed.success) {
      console.error('dueling_tournament_invalid_record', {
        locator,
        issues: parsed.error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join('.'),
        })),
      });
      throw new TournamentError('unavailable', 'This tournament is temporarily unavailable.', 503);
    }
    return parsed.data;
  }

  async create(settings: Settings, operationId: string, actor: Actor, now: string) {
    const fingerprint = await commandFingerprint({ type: 'settings', settings });
    const proposed = newTournament(crypto.randomUUID(), settings, actor, now);
    const raw = await this.port.call('dueling_tournament_create', {
      p_actor_id: actor.userId,
      p_operation_id: operationId,
      p_fingerprint: fingerprint,
      p_state: proposed,
    });
    return tournamentSchema.parse(raw);
  }

  async history(eventId: string, actor: Actor | null, kind: string, before: string | null) {
    return this.port.call('dueling_tournament_history_page', {
      p_event_id: eventId,
      p_actor_id: actor?.userId ?? null,
      p_kind: kind,
      p_before: before,
    });
  }

  async mutate(locator: string, input: Mutation, actor: Actor, now: string) {
    const current = await this.get(locator, actor);
    if (input.command.type === 'notice_read') {
      await this.port.call('dueling_tournament_ack', {
        p_event_id: current.id,
        p_actor_id: actor.userId,
        p_notice_id: input.command.noticeId,
      });
      return this.get(current.id, actor);
    }
    const fingerprint = await commandFingerprint(input.command);
    const receipt = z
      .object({ eventId: z.string(), fingerprint: z.string() })
      .nullable()
      .parse(
        await this.port.call('dueling_tournament_receipt', {
          p_actor_id: actor.userId,
          p_operation_id: input.operationId,
        }),
      );
    if (receipt && (receipt.eventId !== current.id || receipt.fingerprint !== fingerprint))
      throw new TournamentError('operation_conflict', 'Operation identifier already used.', 409);
    const { tournament, replayed } = receipt
      ? { tournament: current, replayed: true }
      : await applyMutation(current, input, actor, now);
    if (!replayed && tournament.revision === current.revision) return current;
    // Even a retry rechecks the current database grants inside the commit RPC.
    const raw = await this.port.call('dueling_tournament_commit', {
      p_actor_id: actor.userId,
      p_event_id: current.id,
      p_expected_revision: input.expectedRevision,
      p_operation_id: input.operationId,
      p_fingerprint: await commandFingerprint(input.command),
      p_command_type: input.command.type,
      p_state: replayed ? current : tournament,
    });
    return tournamentSchema.parse(raw);
  }
}
