const ACCESS_TOKEN_KEY = 'vta_access_token';

export function getToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}
