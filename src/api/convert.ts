import request from '@/utils/request';
import type { ApiResponse } from '@/utils/request';
import type { SubmitUrlRequest, UploadInitRequest, MergeRequest } from '@/types/convert';

/** 提交 URL 转换任务，返回 taskId */
export async function submitUrlConvert(data: SubmitUrlRequest): Promise<{ taskId: string }> {
  const resp = await request.post<ApiResponse<{ taskId: string }>>('/convert/url', data);
  return resp.data.data;
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

/** 所有分片上传完成后触发合并 + 转码，返回 taskId */
export async function mergeUpload(data: MergeRequest): Promise<{ taskId: string }> {
  const resp = await request.post<ApiResponse<{ taskId: string }>>('/convert/upload/merge', data);
  return resp.data.data;
}
