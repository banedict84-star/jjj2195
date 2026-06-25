"use client";

/**
 * 사용자가 브라우저에서 직접 입력하는 OpenAI 키 관리(클라이언트 전용).
 * 키는 이 브라우저의 localStorage 에만 저장되고, AI 요청 시 헤더로 전달된다.
 * 저장소(repo)나 서버에는 영구 저장되지 않는다.
 */
const KEY_STORAGE = "openai-key";

export function getStoredKey(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

export function setStoredKey(k: string) {
  try {
    localStorage.setItem(KEY_STORAGE, k.trim());
  } catch {
    /* 무시 */
  }
}

export function clearStoredKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* 무시 */
  }
}

/** AI 요청에 붙일 헤더 (키가 있을 때만) */
export function aiHeaders(): Record<string, string> {
  const k = getStoredKey();
  return k ? { "x-openai-key": k } : {};
}
