import { type StorageAdapter, StorageWriteError } from "./storage";

export const IDB_NAME = "math-happens";
export const IDB_STORE = "kv";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}

/**
 * Key/value store on IndexedDB. Same string-in, string-out contract as the
 * localStorage adapter, but without the ~5 MB ceiling that a few hundred
 * multiple-choice sessions would hit.
 */
export class IndexedDBAdapter implements StorageAdapter {
  private db: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName = IDB_NAME,
    private readonly storeName = IDB_STORE,
  ) {}

  /** Opens (and creates) the database. Rejects if IndexedDB is unusable. */
  open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      let req: IDBOpenDBRequest;
      try {
        req = indexedDB.open(this.dbName, 1);
      } catch (error) {
        reject(error);
        return;
      }
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(this.storeName)) req.result.createObjectStore(this.storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("could not open IndexedDB"));
      req.onblocked = () => reject(new Error("IndexedDB open blocked"));
    });
    return this.db;
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.open();
    return db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async read(key: string): Promise<string | null> {
    const value = await request((await this.store("readonly")).get(key));
    return typeof value === "string" ? value : null;
  }

  async write(key: string, value: string): Promise<void> {
    try {
      await request((await this.store("readwrite")).put(value, key));
    } catch (error) {
      throw new StorageWriteError(`could not write "${key}" to IndexedDB`, error);
    }
  }

  async remove(key: string): Promise<void> {
    await request((await this.store("readwrite")).delete(key));
  }

  async keys(): Promise<string[]> {
    const keys = await request((await this.store("readonly")).getAllKeys());
    return keys.filter((k): k is string => typeof k === "string");
  }
}

export const MIGRATION_MARKER_KEY = "math-happens:migrated-from-localstorage";

/**
 * Copy every record under `prefix` from one adapter to another. Nothing is
 * deleted from the source, and records already present in the destination are
 * left alone, so re-running is harmless.
 */
export async function copyRecords(from: StorageAdapter, to: StorageAdapter, prefix: string): Promise<number> {
  const sourceKeys = (await from.keys()).filter((k) => k.startsWith(prefix));
  const existing = new Set(await to.keys());
  let copied = 0;
  for (const key of sourceKeys) {
    if (existing.has(key)) continue;
    const value = await from.read(key);
    if (value !== null) {
      await to.write(key, value);
      copied += 1;
    }
  }
  return copied;
}

/**
 * One-time migration of Phase 1 localStorage data into IndexedDB. Guarded by a
 * marker in the destination so it runs once; the localStorage copy stays put
 * as a backup.
 */
export async function migrateFromWebStorage(from: StorageAdapter, to: StorageAdapter, prefix: string, now = Date.now()): Promise<number> {
  if ((await to.read(MIGRATION_MARKER_KEY)) !== null) return 0;
  const copied = await copyRecords(from, to, prefix);
  await to.write(MIGRATION_MARKER_KEY, JSON.stringify({ at: now, copied }));
  return copied;
}

/**
 * Adapter that resolves its backing store lazily: IndexedDB with migration
 * when it works, otherwise whatever fallback is supplied. Callers never wait
 * on initialisation explicitly; every operation awaits it.
 */
export class DeferredAdapter implements StorageAdapter {
  private readonly backing: Promise<StorageAdapter>;
  private resolvedName: string = "pending";

  constructor(choose: () => Promise<{ adapter: StorageAdapter; name: string }>) {
    this.backing = choose().then(({ adapter, name }) => {
      this.resolvedName = name;
      return adapter;
    });
  }

  /** Human-readable name of the store in use ("indexeddb", "localstorage", "memory"). */
  async name(): Promise<string> {
    await this.backing;
    return this.resolvedName;
  }

  async read(key: string): Promise<string | null> {
    return (await this.backing).read(key);
  }
  async write(key: string, value: string): Promise<void> {
    return (await this.backing).write(key, value);
  }
  async remove(key: string): Promise<void> {
    return (await this.backing).remove(key);
  }
  async keys(): Promise<string[]> {
    return (await this.backing).keys();
  }
}
