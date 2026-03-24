import { http } from "../../shared/http";
import type {
  CurrentAppUser,
  TicketExchangeResponse,
  TokenResponse,
  WecomQrUrlResponse,
  WecomBootstrapResponse,
} from "./types";

async function passwordLogin(username: string, password: string): Promise<TokenResponse> {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);

  const { data } = await http.post<TokenResponse>("/auth/token", form.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  return data;
}

async function fetchCurrentUser(accessToken: string): Promise<CurrentAppUser> {
  const { data } = await http.get<CurrentAppUser>("/auth/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return data;
}

async function bootstrapWecomSession(nextPath = "/dashboard"): Promise<WecomBootstrapResponse> {
  const { data } = await http.get<WecomBootstrapResponse>("/wecom/h5/bootstrap", {
    params: {
      next: nextPath,
    },
  });

  return data;
}

async function exchangeLoginTicket(ticket: string): Promise<TicketExchangeResponse> {
  const { data } = await http.post<TicketExchangeResponse>("/auth/ticket/exchange", { ticket });
  return data;
}

async function refreshAccessToken(refreshToken: string): Promise<TicketExchangeResponse> {
  const { data } = await http.post<TicketExchangeResponse>("/auth/refresh", {
    refresh_token: refreshToken,
  });
  return data;
}

async function getWecomQrLoginUrl(params?: {
  redirect?: string;
  callback?: string;
}): Promise<WecomQrUrlResponse> {
  const { data } = await http.get<WecomQrUrlResponse>("/auth/wecom/qr/url", {
    params: {
      redirect: params?.redirect || "/dashboard",
      callback: params?.callback || "/auth/callback",
    },
  });
  return data;
}

export {
  passwordLogin,
  fetchCurrentUser,
  bootstrapWecomSession,
  exchangeLoginTicket,
  getWecomQrLoginUrl,
  refreshAccessToken,
};
