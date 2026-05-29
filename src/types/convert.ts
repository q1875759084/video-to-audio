export type OutputFormat = 'mp3' | 'aac' | 'wav';

// 转换任务的状态机
export type ConvertStatus =
  | 'idle'        // 初始态，等待用户操作
  | 'uploading'   // 分片上传中（仅文件上传模式）
  | 'submitting'  // URL 提交中
  | 'queued'      // 任务已提交，在全局队列中等待执行
  | 'converting'  // 转码中（SSE 推送进度）
  | 'done'        // 转换完成
  | 'blocked'     // 并发超限（刷新页面后有任务仍在跑，展示任务信息供用户恢复监听）
  | 'error';      // 转换失败

export type ConvertMode = 'url' | 'file';

export type ConvertStage = 'downloading' | 'converting';

export interface ConvertState {
  status: ConvertStatus;
  mode: ConvertMode;
  uploadProgress: number;   // 上传进度 0-100（仅 file 模式）
  convertProgress: number;  // 转码进度 0-100
  convertStage: ConvertStage | null;
  taskId: string | null;
  result: ConvertResult | null;
  errorMessage: string | null;
  /** 并发超限时，后端返回的「占用配额」任务列表（用于 blocked 状态展示） */
  activeTasks: ActiveTaskSummary[] | null;
}

export interface ConvertResult {
  fileId: string;
  format: OutputFormat;
}

// useReducer action 类型
export type ConvertAction =
  | { type: 'START_UPLOAD' }
  | { type: 'SET_UPLOAD_PROGRESS'; payload: number }
  | { type: 'START_SUBMITTING' }
  | { type: 'START_QUEUED'; payload: { taskId: string } }
  | { type: 'START_CONVERTING'; payload: { taskId: string } }
  | { type: 'SET_CONVERT_PROGRESS'; payload: { percent: number; stage: ConvertStage } }
  | { type: 'DONE'; payload: ConvertResult }
  | { type: 'ERROR'; payload: string }
  | { type: 'BLOCKED'; payload: ActiveTaskSummary[] }
  | { type: 'RESET' }
  | { type: 'SET_MODE'; payload: ConvertMode };

/** 429 响应中返回的「正在占用配额」的任务摘要 */
export interface ActiveTaskSummary {
  taskId: string;
  source: string;   // URL 或原始文件名
  type: 'url' | 'upload';
  format: OutputFormat;
  status: string;
}

export interface SubmitUrlRequest {
  url: string;
  format: OutputFormat;
}

export interface UploadInitRequest {
  filename: string;
  totalChunks: number;
  format: OutputFormat;
}

export interface MergeRequest {
  uploadId: string;
}
