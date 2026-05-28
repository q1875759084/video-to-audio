import request from '@/utils/request';
import type { ApiResponse } from '@/utils/request';
import type { HistoryItem } from '@/types/history';

export async function getHistory(): Promise<HistoryItem[]> {
  const resp = await request.get<ApiResponse<HistoryItem[]>>('/history');
  return resp.data.data;
}

export async function deleteHistory(id: number): Promise<void> {
  await request.delete(`/history/${id}`);
}
