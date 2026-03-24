type LoginType = "password" | "wecom";
type AuthMode = "bearer" | "wecom-session";

interface CurrentAppUser {
  id: number;
  keycloak_sub: string;
  username: string;
  email?: string | null;
  roles: string[];
  iam_roles?: string[];
  permissions?: string[];
  tenant_name?: string | null;
  company_name?: string | null;
  department_name?: string | null;
  specialty_name?: string | null;
}

interface PlatformUser {
  id: string;
  username: string;
  displayName: string;
  email?: string;
  roles: string[];
  permissions: string[];
  loginType: LoginType;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  refresh_token?: string | null;
}

interface WecomBootstrapResponse {
  ok: boolean;
  need_login?: boolean;
  login_url?: string;
  proxyBase?: string;
  paddlexProxyBase?: string;
  difyUserId?: string;
  displayName?: string;
}

interface TicketExchangeResponse {
  access_token: string;
  refresh_token?: string | null;
  token_type?: string;
  expires_in?: number;
  refresh_expires_in?: number;
  scope?: string;
  authn_method?: string;
  identity_source?: string | null;
  app_user_id?: number;
  keycloak_user_id?: string;
  username?: string;
  email?: string;
  phone?: string;
}

interface WecomQrUrlResponse {
  ok: boolean;
  qr_url: string;
  expire_in?: number;
  callback?: string;
}

export type {
  AuthMode,
  CurrentAppUser,
  PlatformUser,
  TicketExchangeResponse,
  TokenResponse,
  WecomQrUrlResponse,
  WecomBootstrapResponse,
};
