"use client";

import { useEffect, useReducer } from "react";
import type { CollectionKey, DB } from "./types";
import { getDB, initFromStorage, subscribe } from "./db";

/**
 * 특정 컬렉션을 구독하는 훅. 첫 렌더는 SEED(서버와 동일) → 마운트 후
 * localStorage 값으로 갱신되어 하이드레이션 불일치를 피한다.
 */
export function useCollection<K extends CollectionKey>(key: K): DB[K] {
  const [, force] = useReducer((c) => c + 1, 0);
  useEffect(() => {
    // 구독을 먼저 등록한 뒤 초기화 → initFromStorage 의 emit 을 놓치지 않는다.
    const un = subscribe(force);
    initFromStorage();
    return un;
  }, []);
  return getDB()[key];
}

/** 전체 DB 구독 (대시보드/비서실장 집계용) */
export function useDB(): DB {
  const [, force] = useReducer((c) => c + 1, 0);
  useEffect(() => {
    const un = subscribe(force);
    initFromStorage();
    return un;
  }, []);
  return getDB();
}
