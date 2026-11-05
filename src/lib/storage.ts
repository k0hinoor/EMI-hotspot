/**
 * Local persistence. SQLite is the target store for the packaged desktop build
 * (PRD §10.2); in the browser the same records are kept in IndexedDB behind this
 * small keyed-store interface so the repository never claims a write succeeded
 * before it actually did.
 */

const DB_NAME = 'emi-hotspot'
const DB_VERSION = 1
const STORE = 'kv'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this environment.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open local database.'))
  })
  return dbPromise
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode)
        const req = run(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('Local database request failed.'))
      }),
  )
}

export const storage = {
  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
    } catch {
      return undefined
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    await tx('readwrite', (s) => s.put(value as never, key) as IDBRequest<unknown>).then(() => undefined)
  },
  async remove(key: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(key) as IDBRequest<undefined>).then(() => undefined)
  },
  async isAvailable(): Promise<boolean> {
    try {
      await openDb()
      return true
    } catch {
      return false
    }
  },
}
