/**
 * Generic IndexedDB primitives backing every locally-persisted dataset in
 * Swift: one database, one object store, keyed by string. A single store
 * (rather than one object store per dataset) means adding a future dataset
 * is just a new key — never a version bump or an `onupgradeneeded` migration.
 *
 * Every public function here swallows its own failures and resolves to a
 * safe default (`undefined`/void) instead of throwing — mirroring
 * `readStored`/`writeStored` in `src/lib/theme/useTheme.ts`. Persistence is a
 * convenience: the app already holds this data in memory, so a blocked
 * database, a private-browsing restriction, or a disabled API must never
 * break the app. Callers never need their own try/catch.
 */

const DB_NAME = "swift";
const DB_VERSION = 1;
const STORE_NAME = "csv-uploads";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error as Error);
  });
}

async function runTx<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = fn(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error as Error);
    });
  } finally {
    db.close();
  }
}

export async function idbGet<T>(key: string): Promise<T | undefined> {
  try {
    return await runTx<T>("readonly", (store) => store.get(key));
  } catch {
    return undefined;
  }
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    await runTx("readwrite", (store) => store.put(value, key));
  } catch {
    /* non-fatal, see file header */
  }
}

export async function idbDelete(key: string): Promise<void> {
  try {
    await runTx("readwrite", (store) => store.delete(key));
  } catch {
    /* non-fatal, see file header */
  }
}

export async function idbClearAll(): Promise<void> {
  try {
    await runTx("readwrite", (store) => store.clear());
  } catch {
    /* non-fatal, see file header */
  }
}
