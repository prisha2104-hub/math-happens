/**
 * Versioned key/value persistence.
 *
 * Everything the app stores goes through a `StorageAdapter` (async by design
 * so an IndexedDB adapter can replace localStorage without touching callers)
 * and is wrapped in a versioned envelope so schemas can migrate.
 */
export interface StorageAdapter {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

export class StorageWriteError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StorageWriteError";
  }
}

export class MemoryAdapter implements StorageAdapter {
  private readonly map = new Map<string, string>();

  async read(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }
  async write(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }
  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
  async keys(): Promise<string[]> {
    return [...this.map.keys()];
  }
}

export class WebStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: Storage) {}

  async read(key: string): Promise<string | null> {
    return this.storage.getItem(key);
  }
  async write(key: string, value: string): Promise<void> {
    try {
      this.storage.setItem(key, value);
    } catch (error) {
      throw new StorageWriteError(`could not write "${key}" (storage may be full or disabled)`, error);
    }
  }
  async remove(key: string): Promise<void> {
    this.storage.removeItem(key);
  }
  async keys(): Promise<string[]> {
    const result: string[] = [];
    for (let i = 0; i < this.storage.length; i += 1) {
      const key = this.storage.key(i);
      if (key !== null) result.push(key);
    }
    return result;
  }
}

/** localStorage when usable (not SSR, not blocked), otherwise null. */
export function createWebStorageAdapter(): WebStorageAdapter | null {
  if (typeof window === "undefined") return null;
  try {
    const probe = "__math-happens-probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return new WebStorageAdapter(window.localStorage);
  } catch {
    return null;
  }
}

export interface Envelope<T> {
  version: number;
  savedAt: number;
  data: T;
}

export interface Schema<T> {
  /** Current schema version written by this build. */
  version: number;
  /**
   * Upgrade data written by an older version. Return null if it cannot be
   * salvaged, in which case the record is treated as missing.
   */
  migrate: (data: unknown, fromVersion: number) => T | null;
  /** Validate/coerce data of the current version. Return null to discard it. */
  parse: (data: unknown) => T | null;
}

function isEnvelope(value: unknown): value is Envelope<unknown> {
  return typeof value === "object" && value !== null && typeof (value as Envelope<unknown>).version === "number" && "data" in value;
}

export async function readVersioned<T>(adapter: StorageAdapter, key: string, schema: Schema<T>): Promise<T | null> {
  const raw = await adapter.read(key);
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isEnvelope(parsed)) return null;
  if (parsed.version === schema.version) return schema.parse(parsed.data);
  if (parsed.version < schema.version) return schema.migrate(parsed.data, parsed.version);
  // Written by a newer build than this one; do not guess.
  return null;
}

export async function writeVersioned<T>(adapter: StorageAdapter, key: string, schema: Schema<T>, data: T, savedAt = Date.now()): Promise<void> {
  const envelope: Envelope<T> = { version: schema.version, savedAt, data };
  await adapter.write(key, JSON.stringify(envelope));
}
