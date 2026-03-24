import { defineStore } from "pinia";

import {
  bootstrapWecomSession,
  exchangeLoginTicket,
  fetchCurrentUser,
  passwordLogin,
  refreshAccessToken,
} from "../modules/auth/api";
import type { AuthMode, CurrentAppUser, PlatformUser } from "../modules/auth/types";
import { clearAuthSnapshot, readAuthSnapshot, writeAuthSnapshot } from "../shared/auth-session";

function normalizeRedirect(raw: unknown): string {
  const target = String(raw || "").trim();
  if (!target.startsWith("/")) {
    return "/dashboard";
  }
  if (target.startsWith("//")) {
    return "/dashboard";
  }
  return target;
}

function mapCurrentUserToPlatform(user: CurrentAppUser): PlatformUser {
  const username = user.username || "unknown";
  return {
    id: String(user.id),
    username,
    displayName: username,
    email: user.email || "",
    roles: user.roles || [],
    permissions: user.permissions || [],
    loginType: "password",
  };
}

function mapWecomToPlatform(data: { displayName?: string; difyUserId?: string }): PlatformUser {
  const displayName = (data.displayName || "").trim() || "企业微信用户";
  return {
    id: data.difyUserId || "wecom-session",
    username: displayName,
    displayName,
    roles: [],
    permissions: [],
    loginType: "wecom",
  };
}

interface AuthState {
  status: "unknown" | "authenticated" | "anonymous";
  mode: AuthMode | null;
  accessToken: string | null;
  refreshToken: string | null;
  user: PlatformUser | null;
  lastError: string | null;
}

const BEARER_REFRESH_INTERVAL_MS = 10 * 60 * 1000;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

function isAuthMode(value: unknown): value is AuthMode {
  return value === "bearer" || value === "wecom-session";
}

export const useAuthStore = defineStore("auth", {
  state: (): AuthState => ({
    status: "unknown",
    mode: null,
    accessToken: null,
    refreshToken: null,
    user: null,
    lastError: null,
  }),
  getters: {
    isAuthenticated(state): boolean {
      return state.status === "authenticated" && !!state.user;
    },
  },
  actions: {
    persist() {
      const payload = {
        mode: this.mode,
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        user: this.user,
      };
      writeAuthSnapshot(payload);
    },
    hydrate() {
      const parsed = readAuthSnapshot();
      if (!parsed) {
        return;
      }
      this.mode = isAuthMode(parsed.mode) ? parsed.mode : null;
      this.accessToken = parsed.accessToken || null;
      this.refreshToken = parsed.refreshToken || null;
      this.user = (parsed.user as PlatformUser | null) || null;
    },
    clearAuthState() {
      this.stopRefreshLoop();
      this.status = "anonymous";
      this.mode = null;
      this.accessToken = null;
      this.refreshToken = null;
      this.user = null;
      this.lastError = null;
      clearAuthSnapshot();
    },
    async applyBearerSession(tokens: { access_token: string; refresh_token?: string | null }) {
      const accessToken = String(tokens.access_token || "").trim();
      if (!accessToken) {
        throw new Error("missing access token");
      }

      const me = await fetchCurrentUser(accessToken);
      this.mode = "bearer";
      this.accessToken = accessToken;
      this.refreshToken = tokens.refresh_token || null;
      this.user = mapCurrentUserToPlatform(me);
      this.status = "authenticated";
      this.lastError = null;
      this.persist();
      this.startRefreshLoop();
      return true;
    },
    startRefreshLoop() {
      this.stopRefreshLoop();
      if (this.mode !== "bearer" || !this.refreshToken) {
        return;
      }
      refreshTimer = setInterval(() => {
        void this.tryRefreshBearerSession();
      }, BEARER_REFRESH_INTERVAL_MS);
    },
    stopRefreshLoop() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    },
    async tryRefreshBearerSession() {
      const refreshToken = String(this.refreshToken || "").trim();
      if (!refreshToken) {
        return false;
      }

      try {
        const tokens = await refreshAccessToken(refreshToken);
        await this.applyBearerSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || refreshToken,
        });
        return true;
      } catch (error) {
        console.warn("refresh bearer session failed", error);
        return false;
      }
    },
    async initialize() {
      if (this.status !== "unknown") {
        return this.isAuthenticated;
      }

      this.hydrate();

      if (this.mode === "bearer" && this.accessToken) {
        try {
          const me = await fetchCurrentUser(this.accessToken);
          this.user = mapCurrentUserToPlatform(me);
          this.status = "authenticated";
          this.lastError = null;
          this.persist();
          return true;
        } catch (error) {
          console.warn("restore bearer session failed", error);
          if (await this.tryRefreshBearerSession()) {
            return true;
          }
          this.clearAuthState();
          return false;
        }
      }

      if (this.mode === "bearer" && this.refreshToken) {
        if (await this.tryRefreshBearerSession()) {
          return true;
        }
        this.clearAuthState();
        return false;
      }

      if (this.mode === "wecom-session") {
        this.stopRefreshLoop();
        try {
          const boot = await bootstrapWecomSession(window.location.pathname);
          if (boot.ok) {
            this.user = mapWecomToPlatform(boot);
            this.status = "authenticated";
            this.lastError = null;
            this.persist();
            return true;
          }
        } catch (error) {
          console.warn("restore wecom session failed", error);
        }
      }

      this.status = "anonymous";
      return false;
    },
    async loginWithPassword(payload: { username: string; password: string }) {
      const username = payload.username.trim();
      const password = payload.password;
      if (!username || !password) {
        this.lastError = "请输入账号和密码";
        return false;
      }

      try {
        const tokens = await passwordLogin(username, password);
        return await this.applyBearerSession(tokens);
      } catch (error) {
        console.error("password login failed", error);
        this.lastError = "登录失败，请检查账号、密码或后端服务状态";
        this.clearAuthState();
        return false;
      }
    },
    startWecomLogin(redirect?: string) {
      const next = normalizeRedirect(redirect || "/auth/callback?from=wecom");
      const loginUrl = `/wecom/h5/login?next=${encodeURIComponent(next)}`;
      window.location.href = loginUrl;
    },
    async finalizeWecomCallback(redirect?: string) {
      const next = normalizeRedirect(redirect || "/dashboard");
      try {
        const boot = await bootstrapWecomSession(next);
        if (!boot.ok) {
          if (boot.need_login && boot.login_url) {
            window.location.href = boot.login_url;
            return false;
          }
          this.lastError = "企业微信会话校验失败";
          return false;
        }
        this.mode = "wecom-session";
        this.accessToken = null;
        this.refreshToken = null;
        this.user = mapWecomToPlatform(boot);
        this.status = "authenticated";
        this.lastError = null;
        this.persist();
        return true;
      } catch (error) {
        console.error("finalize wecom callback failed", error);
        this.lastError = "企业微信登录流程失败";
        return false;
      }
    },
    async finalizeTicketCallback(ticket: string) {
      const tk = String(ticket || "").trim();
      if (!tk) {
        this.lastError = "登录票据缺失，请重新扫码登录";
        return false;
      }

      try {
        const result = await exchangeLoginTicket(tk);
        const accessToken = String(result.access_token || "").trim();
        if (!accessToken) {
          this.lastError = "登录票据已失效，请重新扫码登录";
          return false;
        }

        return await this.applyBearerSession({
          access_token: accessToken,
          refresh_token: result.refresh_token || null,
        });
      } catch (error) {
        console.error("finalize ticket callback failed", error);
        this.lastError = "扫码登录回调失败，请重试";
        return false;
      }
    },
    logout() {
      this.clearAuthState();
    },
  },
});
