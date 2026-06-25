import type { CollectionKey, DB } from "./types";
import { SEED } from "./seed";

const KEY = "jyj-db-v1";

const clone = (o: DB): DB => JSON.parse(JSON.stringify(o));

/**
 * 스토어 상태를 globalThis 싱글톤에 보관한다.
 * Next.js 코드 스플리팅으로 이 모듈이 여러 청크에 중복 포함되더라도
 * 모든 인스턴스가 동일한 상태(cache/listeners)를 공유하게 보장한다.
 */
interface Store {
  cache: DB;
  initialized: boolean;
  listeners: Set<() => void>;
}

const g = globalThis as unknown as { __JYJ_STORE__?: Store };
const store: Store =
  g.__JYJ_STORE__ ??
  (g.__JYJ_STORE__ = {
    cache: clone(SEED),
    initialized: false,
    listeners: new Set(),
  });

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(store.cache));
  } catch {
    /* 무시 */
  }
}

function emit() {
  store.listeners.forEach((l) => l());
}

export function initFromStorage() {
  if (store.initialized || typeof window === "undefined") return;
  store.initialized = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) store.cache = JSON.parse(raw);
    else persist();
  } catch {
    /* 무시 */
  }
  emit();
}

export function getDB(): DB {
  return store.cache;
}

export function subscribe(l: () => void): () => void {
  store.listeners.add(l);
  return () => {
    store.listeners.delete(l);
  };
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id-" + Math.floor(Math.random() * 1e9).toString(36);
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function insert<K extends CollectionKey>(key: K, item: DB[K][number]) {
  store.cache = {
    ...store.cache,
    [key]: [item, ...(store.cache[key] as unknown[])],
  } as DB;
  persist();
  emit();
}

export function update<K extends CollectionKey>(
  key: K,
  id: string,
  patch: Partial<DB[K][number]>
) {
  store.cache = {
    ...store.cache,
    [key]: (store.cache[key] as Array<{ id: string }>).map((x) =>
      x.id === id ? { ...x, ...patch } : x
    ),
  } as DB;
  persist();
  emit();
}

export function remove<K extends CollectionKey>(key: K, id: string) {
  store.cache = {
    ...store.cache,
    [key]: (store.cache[key] as Array<{ id: string }>).filter(
      (x) => x.id !== id
    ),
  } as DB;
  persist();
  emit();
}

/** 전체 초기화(데모용) */
export function resetDB() {
  store.cache = clone(SEED);
  persist();
  emit();
}
