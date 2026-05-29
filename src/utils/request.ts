import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { getAccessToken, setAccessToken, clearToken, hasValidToken } from './token';

// 统一响应体结构
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
  withCredentials: true, // 携带 HttpOnly Cookie（refresh_token 依赖）
});

// 请求拦截：自动附加 Authorization header
request.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 是否正在刷新 Token（防止并发请求同时触发刷新）
let isRefreshing = false;
// 等待刷新完成的请求队列
let pendingQueue: Array<(token: string) => void> = [];

function processPendingQueue(newToken: string) {
  pendingQueue.forEach((resolve) => resolve(newToken));
  pendingQueue = [];
}

/**
 * 业务层错误（后端返回 code !== 200 的情况）
 * 携带原始 response，供调用方按需读取 data 字段（如 429 的 activeTasks）
 */
export class ApiError extends Error {
  response: AxiosResponse<ApiResponse<unknown>>;
  constructor(message: string, response: AxiosResponse<ApiResponse<unknown>>) {
    super(message);
    this.name = 'ApiError';
    this.response = response;
  }
}

// 响应拦截：401 时自动刷新 AccessToken 并重试（无感刷新）
request.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const { data } = response;
    if (data.code !== 200) {
      // 保留完整 response，调用方可从 err.response.data 读取扩展字段（如 429 的 activeTasks）
      return Promise.reject(new ApiError(data.message || '请求失败', response));
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      // 无有效 AccessToken，直接跳登录（无需发刷新请求）
      if (!hasValidToken()) {
        clearToken();
        window.location.href = '/login';
        return Promise.reject(new Error('登录状态过期，请重新登录'));
      }

      if (isRefreshing) {
        // 已有刷新在途，将当前请求加入等待队列
        return new Promise((resolve) => {
          pendingQueue.push((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            resolve(request(originalRequest));
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // RefreshToken 通过 HttpOnly Cookie 自动携带，无需手动传递
        const resp = await axios.post<ApiResponse<{ accessToken: string }>>(
          '/api/user/refresh',
          {},
          { withCredentials: true }
        );
        const newToken = resp.data.data.accessToken;
        setAccessToken(newToken);
        processPendingQueue(newToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return request(originalRequest);
      } catch {
        // 刷新失败（RefreshToken 也过期）：清除本地 token，跳转登录
        clearToken();
        pendingQueue = [];
        window.location.href = '/login';
        return Promise.reject(new Error('登录已过期，请重新登录'));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default request;
