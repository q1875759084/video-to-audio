import { useEffect, useRef, useCallback } from 'react';
import { fetchEventSource } from '@microsoft/fetch-event-source';
import { getAccessToken } from '@/utils/token';
import type { SSEProgressData, SSEDoneData, SSEErrorData } from '@/types/sse';

const MAX_RETRY_COUNT = 3;
const RETRY_BASE_DELAY = 1000;
const RETRY_MAX_DELAY = 15000;

/** 指数退避 + 随机抖动：min(base * 2^n, max) * (1 ~ 1.5) */
function calcRetryDelay(attempt: number): number {
  const exp = Math.min(RETRY_BASE_DELAY * Math.pow(2, attempt), RETRY_MAX_DELAY);
  return Math.floor(exp * (1 + Math.random() * 0.5));
}

interface UseSSEOptions {
  onProgress?: (data: SSEProgressData) => void;
  onDone?: (data: SSEDoneData) => void;
  onError?: (data: SSEErrorData) => void;
}

export function useSSE(options: UseSSEOptions) {
  const ctrlRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const disconnect = useCallback(() => {
    ctrlRef.current?.abort();
    ctrlRef.current = null;
    retryCountRef.current = 0;
  }, []);

  const connect = useCallback((taskId: string) => {
    disconnect();
    ctrlRef.current = new AbortController();

    fetchEventSource(`/api/convert/progress/${taskId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${getAccessToken() ?? ''}` },
      signal: ctrlRef.current.signal,
      openWhenHidden: true,
      async onopen(response) {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        retryCountRef.current = 0;
      },
      onmessage(ev) {
        try {
          const data = JSON.parse(ev.data);
          if (ev.event === 'progress') {
            optionsRef.current.onProgress?.(data as SSEProgressData);
          } else if (ev.event === 'done') {
            optionsRef.current.onDone?.(data as SSEDoneData);
            ctrlRef.current?.abort();
          } else if (ev.event === 'error') {
            optionsRef.current.onError?.(data as SSEErrorData);
            ctrlRef.current?.abort();
          }
        } catch { /* JSON 解析失败静默处理 */ }
      },
      onerror(err) {
        if (retryCountRef.current >= MAX_RETRY_COUNT) {
          optionsRef.current.onError?.({ message: `连接失败，已重试 ${MAX_RETRY_COUNT} 次` });
          throw err;
        }
        const delay = calcRetryDelay(retryCountRef.current++);
        return delay;
      },
    }).catch((err) => {
      if (err?.name !== 'AbortError') {
        console.error('[useSSE]', err);
      }
    });
  }, [disconnect]);

  useEffect(() => () => disconnect(), [disconnect]);

  return { connect, disconnect };
}
