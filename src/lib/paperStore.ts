import type { IPaper } from "./types";

const DB_NAME = "paper-rag-assistant";
const DB_VERSION = 1;
const STORE_NAME = "papers";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error);
  });
}

function withoutEphemeralUrl(paper: IPaper): IPaper {
  const { fileUrl: _fileUrl, ...persistentPaper } = paper;
  return persistentPaper;
}

export async function loadPapers(): Promise<IPaper[]> {
  if (typeof indexedDB === "undefined") return [];
  const papers = await runTransaction<IPaper[]>("readonly", (store) => store.getAll());
  return papers.sort((a, b) => b.uploadTime - a.uploadTime);
}

export async function savePaper(paper: IPaper): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await runTransaction<IDBValidKey>("readwrite", (store) =>
    store.put(withoutEphemeralUrl(paper)),
  );
}

export async function removePaper(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await runTransaction<undefined>("readwrite", (store) => store.delete(id));
}
