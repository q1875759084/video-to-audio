export interface UserInfo {
  id: number;
  username: string;
  nickname: string;
}

export interface LoginRequest {
  account: string;
  password: string;
}

export interface LoginResponse {
  userInfo: UserInfo;
  accessToken: string;
}
