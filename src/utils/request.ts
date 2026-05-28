import axios, { type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { getToken, setToken, clearToken } from './token';

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
  const token = getToken();
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

// 响应拦截：401 时自动刷新 AccessToken 并重试
request.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const { data } = response;
    if (data.code !== 200) {
      return Promise.reject(new Error(data.message || '请求失败'));
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // 等待刷新完成后重试
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
        const resp = await axios.post<ApiResponse<{ accessToken: string }>>(
          '/api/user/refresh',
          {},
          { withCredentials: true }
        );
        const newToken = resp.data.data.accessToken;
        setToken(newToken);
        processPendingQueue(newToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        return request(originalRequest);
      } catch {
        // 刷新失败：清除 token，跳转登录页
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
