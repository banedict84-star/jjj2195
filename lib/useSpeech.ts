"use client";

import { useEffect, useRef, useState } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * 브라우저 내장 음성인식(STT) + 음성합성(TTS) 훅. 한국어(ko-KR).
 * 외부 서비스 없이 동작하며, 마이크 권한과 HTTPS 가 필요하다(배포 앱은 HTTPS).
 * - onResult: 인식 중간/최종 텍스트
 * - onEnd: 인식이 끝났을 때 최종 텍스트 (음성 대화 모드의 자동 전송용)
 */
export function useSpeech(opts: {
  onResult: (text: string) => void;
  onEnd?: (finalText: string) => void;
}) {
  const resRef = useRef(opts.onResult);
  resRef.current = opts.onResult;
  const endRef = useRef(opts.onEnd);
  endRef.current = opts.onEnd;

  const recRef = useRef<any>(null);
  const lastRef = useRef("");
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setSupported(true);
    const rec = new SR();
    rec.lang = "ko-KR";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      lastRef.current = text;
      resRef.current(text);
    };
    rec.onend = () => {
      setListening(false);
      const finalText = lastRef.current;
      lastRef.current = "";
      endRef.current?.(finalText);
    };
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    return () => {
      try {
        rec.abort();
      } catch {
        /* 무시 */
      }
    };
  }, []);

  const start = () => {
    if (!recRef.current || listening) return;
    lastRef.current = "";
    try {
      recRef.current.start();
      setListening(true);
    } catch {
      /* 무시 */
    }
  };
  const stop = () => {
    try {
      recRef.current?.stop();
    } catch {
      /* 무시 */
    }
    setListening(false);
  };

  /** 텍스트를 한국어 음성으로 읽어준다. 끝나면 onDone 호출. */
  const speak = (text: string, onDone?: () => void) => {
    const synth = (window as any).speechSynthesis;
    if (!synth || !text) {
      onDone?.();
      return;
    }
    try {
      synth.cancel();
      const u = new (window as any).SpeechSynthesisUtterance(text);
      u.lang = "ko-KR";
      u.rate = 1.05;
      u.onend = () => onDone?.();
      u.onerror = () => onDone?.();
      synth.speak(u);
    } catch {
      onDone?.();
    }
  };
  const cancelSpeak = () => {
    try {
      (window as any).speechSynthesis?.cancel();
    } catch {
      /* 무시 */
    }
  };

  const ttsSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  return { supported, ttsSupported, listening, start, stop, speak, cancelSpeak };
}
