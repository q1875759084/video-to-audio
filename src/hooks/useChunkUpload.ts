import { useState, useCallback, useRef } from 'react';
import { initUpload, uploadChunk, mergeUpload } from '@/api/convert';
import type { OutputFormat } from '@/types/convert';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per chunk
const CONCURRENT_LIMIT = 3;          // 最多 3 个分片并发上传

interface UseChunkUploadOptions {
  onProgress?: (percent: number) => void;
  onComplete?: (taskId: string) => void;
  onError?: (message: string) => void;
}

/**
 * 分片上传 Hook
 *
 * 技术要点：
 * 1. File.slice() 切分文件为固定大小分片
 * 2. 并发控制：同时最多上传 CONCURRENT_LIMIT 个分片（用滑动窗口实现）
 * 3. 进度聚合：每个分片完成后更新总进度（分片完成数 / 总分片数）
 * 4. 全部完成后自动调用 merge 接口触发转码
 */
export function useChunkUpload(options: UseChunkUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  const abortRef = useRef(false);

  const upload = useCallback(async (file: File, format: OutputFormat) => {
    abortRef.current = false;
    setIsUploading(true);

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    try {
      // Step 1: 初始化上传，获取 uploadId
      const { uploadId } = await initUpload({
        filename: file.name,
        totalChunks,
        format,
      });

      // Step 2: 并发分片上传（滑动窗口）
      let completedChunks = 0;

      // 将所有分片索引打包成任务
      const chunkIndices = Array.from({ length: totalChunks }, (_, i) => i);

      // 滑动窗口并发上传：每次最多同时 CONCURRENT_LIMIT 个请求
      const uploadWithConcurrency = async () => {
        let index = 0;
        const workers = Array.from({ length: CONCURRENT_LIMIT }, async () => {
          while (index < chunkIndices.length) {
            if (abortRef.current) return;

            const chunkIndex = chunkIndices[index++];
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            await uploadChunk({ uploadId, chunkIndex, chunk });

            completedChunks++;
            // 上传进度占总进度的 90%，merge 后转码进度由 SSE 推送
            const percent = Math.floor((completedChunks / totalChunks) * 90);
            options.onProgress?.(percent);
          }
        });

        await Promise.all(workers);
      };

      await uploadWithConcurrency();

      if (abortRef.current) return;

      // Step 3: 触发合并 + 转码，返回 taskId
      options.onProgress?.(95);
      const { taskId } = await mergeUpload({ uploadId });
      options.onProgress?.(100);
      options.onComplete?.(taskId);
    } catch (err) {
      const message = err instanceof Error ? err.message : '上传失败，请重试';
      options.onError?.(message);
    } finally {
      setIsUploading(false);
    }
  }, [options]);

  const abort = useCallback(() => {
    abortRef.current = true;
    setIsUploading(false);
  }, []);

  return { upload, abort, isUploading };
}
