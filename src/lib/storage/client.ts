import { DeferredAdapter, IndexedDBAdapter, isIndexedDBAvailable, migrateFromWebStorage } from "./indexeddb";
import { KEY_PREFIX, type Repositories, createRepositories } from "./repositories";
import { MemoryAdapter, type StorageAdapter, createWebStorageAdapter } from "./storage";

let adapter: DeferredAdapter | null = null;
let repositories: Repositories | null = null;

/**
 * Best store available in this environment: IndexedDB (migrating any Phase 1
 * localStorage data into it once, non-destructively), else localStorage, else
 * memory. Resolution happens on first use.
 */
export function getStorageAdapter(): DeferredAdapter {
  adapter ??= new DeferredAdapter(async () => {
    const web = createWebStorageAdapter();
    if (isIndexedDBAvailable()) {
      const idb = new IndexedDBAdapter();
      try {
        await idb.open();
        if (web) await migrateFromWebStorage(web, idb, KEY_PREFIX);
        return { adapter: idb, name: "indexeddb" };
      } catch {
        /* IndexedDB blocked (private mode, quota, disabled); fall through. */
      }
    }
    const fallback: StorageAdapter = web ?? new MemoryAdapter();
    return { adapter: fallback, name: web ? "localstorage" : "memory" };
  });
  return adapter;
}

/** Lazily-created repositories backed by the best adapter available in this environment. */
export function getRepositories(): Repositories {
  repositories ??= createRepositories(getStorageAdapter());
  return repositories;
}
