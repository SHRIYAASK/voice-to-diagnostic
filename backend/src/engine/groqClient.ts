/**
 * Groq chat client with automatic failover between API keys (accounts).
 *
 * Free-tier Groq limits are per account (for example 8,000 tokens per minute). When the SDK gets a 429 it silently
 * sleeps for the server's `retry-after` (often 20+ seconds) and retries, which freezes the voice reply.
 * With a backup key in GROQ_API_KEY_2 the SDK's own retries are turned off and a rate-limited or timed-out request
 * is re-sent at once on the other account. A key that just failed is skipped until its cool-down ends.
 * Without a backup key the plain SDK client is returned, so nothing changes.
 */

import Groq from 'groq-sdk';

// Per-attempt timeout, the same value both Groq clients used before
const REQUEST_TIMEOUT_MS = 2500;
// Never park a key for longer than this, even if the server asks for more
const MAX_COOLDOWN_MS = 60_000;
// How long a key is skipped when the server gave no retry-after (rate limit without header, timeout, 5xx)
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 10_000;
const SHORT_COOLDOWN_MS = 3_000;

/** The only part of the SDK the engine uses */
export type GroqChatClient = {
  chat: { completions: { create: Groq['chat']['completions']['create'] } };
};

export interface NamedGroqClient {
  name: string;
  client: Groq;
}

/** Capacity / availability problems that another account can fix. A 400 is the request's own fault. */
function isFailoverError(err: unknown): boolean {
  if (err instanceof Groq.APIConnectionError) return true; // includes request timeouts
  const status = (err as { status?: number } | null)?.status;
  return status === 429 || status === 408 || (typeof status === 'number' && status >= 500);
}

/** How long to skip a key after this error */
function cooldownFor(err: unknown): number {
  const e = err as { status?: number; headers?: any } | null;
  if (e?.status === 429) {
    const raw = typeof e.headers?.get === 'function' ? e.headers.get('retry-after') : e.headers?.['retry-after'];
    const seconds = parseFloat(raw);
    return Number.isFinite(seconds)
      ? Math.min(Math.max(seconds, 0) * 1000, MAX_COOLDOWN_MS)
      : DEFAULT_RATE_LIMIT_COOLDOWN_MS;
  }
  return SHORT_COOLDOWN_MS;
}

function describeError(err: unknown): string {
  const e = err as { status?: number; name?: string } | null;
  const label = e?.status ?? (err instanceof Groq.APIConnectionError ? 'timeout / connection error' : e?.name ?? 'error');
  return `${label}, skipping it for ${Math.round(cooldownFor(err) / 1000)}s`;
}

/**
 * Wraps several SDK clients behind one `chat.completions.create`. Clients are tried in order (keys that are cooling
 * down go last); a capacity/availability error moves on to the next client immediately, any other error is thrown.
 */
export function createFailoverClient(clients: NamedGroqClient[]): GroqChatClient {
  const pool = clients.map((c) => ({ ...c, cooldownUntil: 0 }));

  const create = async (body: any, options?: any) => {
    const now = Date.now();
    // Keys that are not cooling down first (in their original order), then the others, soonest-available first
    const order = pool
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => Math.max(a.entry.cooldownUntil, now) - Math.max(b.entry.cooldownUntil, now) || a.index - b.index)
      .map((x) => x.entry);

    let lastError: unknown;
    for (let i = 0; i < order.length; i++) {
      const entry = order[i];
      try {
        return await entry.client.chat.completions.create(body, options);
      } catch (err) {
        lastError = err;
        if (!isFailoverError(err)) throw err;
        entry.cooldownUntil = Date.now() + cooldownFor(err);
        if (i < order.length - 1) {
          console.warn(`[Groq] ${entry.name} unavailable (${describeError(err)}); failing over to ${order[i + 1].name}`);
        }
      }
    }
    throw lastError;
  };

  return { chat: { completions: { create: create as unknown as GroqChatClient['chat']['completions']['create'] } } };
}

// The engine's modules all ask for a client; they share one instance so that a key found to be rate limited by one
// of them is skipped by the others too (otherwise each would rediscover the limit with its own failed request).
let shared: { signature: string; client: GroqChatClient } | null = null;

/**
 * Builds the engine's Groq client from GROQ_API_KEY and, optionally, GROQ_API_KEY_2 (a key from a different account).
 * Returns null when no valid key is configured.
 */
export function createGroqClient(): GroqChatClient | null {
  const keys = [
    { name: 'primary Groq key', value: process.env.GROQ_API_KEY },
    { name: 'backup Groq key', value: process.env.GROQ_API_KEY_2 },
  ].filter((k): k is { name: string; value: string } => Boolean(k.value && k.value.startsWith('gsk_')));

  if (keys.length === 0) return null;

  const signature = keys.map((k) => k.value).join('|');
  if (shared && shared.signature === signature) return shared.client;

  // With a backup key the SDK must not sleep through `retry-after` itself: failing over is faster.
  const maxRetries = keys.length > 1 ? 0 : undefined;
  const clients = keys.map((k) => ({
    name: k.name,
    client: new Groq({ apiKey: k.value, timeout: REQUEST_TIMEOUT_MS, maxRetries }),
  }));

  const client = clients.length === 1 ? clients[0].client : createFailoverClient(clients);
  shared = { signature, client };
  return client;
}
