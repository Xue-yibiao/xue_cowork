import axios from "axios";

import { clearAuthSnapshot, patchBearerTokens, readAuthSnapshot } from "./auth-session";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "",
  timeout: 20000,
  withCredentials: true,
});

let refreshPromise: Promise<string | null> | null = null;

function shouldSkipRefresh(url: unknown): boolean {
  const text = String(url || "");
  return text.includes("/auth/token") || text.includes("/auth/refresh");
}

async function refreshBearerToken(): Promise<string | null> {
  const snapshot = readAuthSnapshot();
  const refreshToken = String(snapshot?.refreshToken || "").trim();
  if (!refreshToken) {
    clearAuthSnapshot();
    return null;
  }

  try {
    const { data } = await axios.post(
      `${import.meta.env.VITE_API_BASE_URL || ""}/auth/refresh`,
      { refresh_token: refreshToken },
      {
        timeout: 20000,
        withCredentials: true,
      },
    );

    const nextAccessToken = String(data?.access_token || "").trim();
    if (!nextAccessToken) {
      clearAuthSnapshot();
      return null;
    }

    patchBearerTokens({
      accessToken: nextAccessToken,
      refreshToken: String(data?.refresh_token || "").trim() || refreshToken,
    });
    return nextAccessToken;
  } catch (error) {
    clearAuthSnapshot();
    throw error;
  }
}

http.interceptors.request.use((config) => {
  const snapshot = readAuthSnapshot();
  const token = String(snapshot?.mode === "bearer" ? snapshot?.accessToken || "" : "").trim();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const responseStatus = error?.response?.status;
    const originalRequest = error?.config as (typeof error.config & { _retry?: boolean }) | undefined;

    if (
      responseStatus !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      shouldSkipRefresh(originalRequest.url)
    ) {
      return Promise.reject(error);
    }

    const snapshot = readAuthSnapshot();
    if (snapshot?.mode !== "bearer" || !snapshot?.refreshToken) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      refreshPromise = refreshPromise || refreshBearerToken();
      const nextAccessToken = await refreshPromise;
      refreshPromise = null;

      if (!nextAccessToken) {
        return Promise.reject(error);
      }

      originalRequest.headers = originalRequest.headers || {};
      originalRequest.headers.Authorization = `Bearer ${nextAccessToken}`;
      return http(originalRequest);
    } catch (refreshError) {
      refreshPromise = null;
      return Promise.reject(refreshError);
    }
  },
);

export { http };
