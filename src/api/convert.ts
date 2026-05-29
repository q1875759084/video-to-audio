import request, { ApiError } from '@/utils/request';
import type { ApiResponse } from '@/utils/request';
import type { SubmitUrlRequest, UploadInitRequest, MergeRequest, ActiveTaskSummary } from '@/types/convert';

/** 并发超限错误，携带后端返回的活跃任务列表 */
export class TaskLimitError extends Error {
  activeTasks: ActiveTaskSummary[];
  constructor(message: string, activeTasks: ActiveTaskSummary[]) {
    super(message);
    this.name = 'TaskLimitError';
    this.activeTasks = activeTasks;
  }
}

/**
 * 提交 URL 转换任务，返回 taskId
 * @throws TaskLimitError 并发超限时，携带后端返回的 activeTasks
 */
export async function submitUrlConvert(data: SubmitUrlRequest): Promise<{ taskId: string }> {
  try {
    const resp = await request.post<ApiResponse<{ taskId: string }>>('/convert/url', data);
    return resp.data.data;
  } catch (err) {
    // 拦截器抛出的 ApiError 携带完整 response，可读取 429 的 activeTasks
    if (err instanceof ApiError && err.response.data.code === 429) {
      const data = err.response.data as ApiResponse<{ activeTasks?: ActiveTaskSummary[] }>;
      throw new TaskLimitError(data.message, data.data?.activeTasks ?? []);
    }
    throw err;
  }
}

/** 初始化分片上传，返回 uploadId */
export async function initUpload(data: UploadInitRequest): Promise<{ uploadId: string }> {
  const resp = await request.post<ApiResponse<{ uploadId: string }>>('/convert/upload/init', data);
  return resp.data.data;
}

/** 上传单个分片 */
export async function uploadChunk(params: {
  uploadId: string;
  chunkIndex: number;
  chunk: Blob;
}): Promise<void> {
  const formData = new FormData();
  formData.append('uploadId', params.uploadId);
  formData.append('chunkIndex', String(params.chunkIndex));
  formData.append('chunk', params.chunk);
  await request.post('/convert/upload/chunk', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

/**
 * 所有分片上传完成后触发合并 + 转码，返回 taskId
 * @throws TaskLimitError 并发超限时，携带后端返回的 activeTasks
 */
export async function mergeUpload(data: MergeRequest): Promise<{ taskId: string }> {
  try {
    const resp = await request.post<ApiResponse<{ taskId: string }>>('/convert/upload/merge', data);
    return resp.data.data;
  } catch (err) {
    if (err instanceof ApiError && err.response.data.code === 429) {
      const respData = err.response.data as ApiResponse<{ activeTasks?: ActiveTaskSummary[] }>;
      throw new TaskLimitError(respData.message, respData.data?.activeTasks ?? []);
    }
    throw err;
  }
}
