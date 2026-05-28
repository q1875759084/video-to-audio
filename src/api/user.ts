import request from '@/utils/request';
import type { ApiResponse } from '@/utils/request';
import type { LoginRequest, LoginResponse } from '@/types/user';

export async function loginApi(data: LoginRequest): Promise<LoginResponse> {
  const resp = await request.post<ApiResponse<LoginResponse>>('/user/login', data);
  return resp.data.data;
}

export async function logoutApi(): Promise<void> {
  await request.post('/user/logout');
}

export async function refreshTokenApi(): Promise<{ accessToken: string }> {
  const resp = await request.post<ApiResponse<{ accessToken: string }>>('/user/refresh');
  return resp.data.data;
}

export async function getProfileApi(): Promise<LoginResponse['userInfo']> {
  const resp = await request.get<ApiResponse<{ userInfo: LoginResponse['userInfo'] }>>('/user/profile');
  return resp.data.data.userInfo;
}
