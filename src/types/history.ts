import type { OutputFormat } from './convert';

export interface HistoryItem {
  id: number;
  fileId: string;
  originalName: string;  // 原始文件名或 URL
  format: OutputFormat;
  status: 'done' | 'error';
  fileSize: number;      // 字节
  duration: number;      // 秒
  createdAt: string;     // ISO 时间字符串
}
