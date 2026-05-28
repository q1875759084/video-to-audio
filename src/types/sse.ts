import type { ConvertStage } from './convert';

export interface SSEProgressData {
  percent: number;
  stage: ConvertStage;
}

export interface SSEDoneData {
  fileId: string;
}

export interface SSEErrorData {
  message: string;
}

export type SSEEventType = 'progress' | 'done' | 'error';
