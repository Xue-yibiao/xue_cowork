import { http } from "../../shared/http";

import type {
  IamPermissionItem,
  IamPermissionListResponse,
  IamRoleItem,
  IamRoleListResponse,
  IamUserItem,
  IamUserListResponse,
  PermissionCreatePayload,
  PermissionUpdatePayload,
  RoleCreatePayload,
  RolePermissionUpdatePayload,
  RoleUpdatePayload,
  UserProfileUpdatePayload,
  UserRoleUpdatePayload,
} from "./types";

function authHeaders(accessToken: string) {
  const token = String(accessToken || "").trim();
  if (!token) {
    throw new Error("当前会话缺少 Bearer Token，请重新登录后再试");
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

async function listIamUsers(
  accessToken: string,
  params?: { keyword?: string; role?: string; page?: number; page_size?: number },
): Promise<IamUserListResponse> {
  const { data } = await http.get<IamUserListResponse>("/iam/admin/users", {
    headers: authHeaders(accessToken),
    params,
  });
  return data;
}

async function getIamUserDetail(accessToken: string, userId: number): Promise<IamUserItem> {
  const { data } = await http.get<IamUserItem>(`/iam/admin/users/${userId}`, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function updateIamUserProfile(
  accessToken: string,
  userId: number,
  payload: UserProfileUpdatePayload,
): Promise<IamUserItem> {
  const { data } = await http.put<IamUserItem>(`/iam/admin/users/${userId}/profile`, payload, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function updateIamUserRoles(
  accessToken: string,
  userId: number,
  payload: UserRoleUpdatePayload,
): Promise<IamUserItem> {
  const { data } = await http.put<IamUserItem>(`/iam/admin/users/${userId}/roles`, payload, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function listIamRoles(accessToken: string): Promise<IamRoleItem[]> {
  const { data } = await http.get<IamRoleListResponse>("/iam/admin/roles", {
    headers: authHeaders(accessToken),
  });
  return data.items || [];
}

async function createIamRole(accessToken: string, payload: RoleCreatePayload): Promise<void> {
  await http.post("/iam/admin/roles", payload, {
    headers: authHeaders(accessToken),
  });
}

async function updateIamRole(accessToken: string, roleId: number, payload: RoleUpdatePayload): Promise<void> {
  await http.put(`/iam/admin/roles/${roleId}`, payload, {
    headers: authHeaders(accessToken),
  });
}

async function updateIamRolePermissions(
  accessToken: string,
  roleId: number,
  payload: RolePermissionUpdatePayload,
): Promise<void> {
  await http.put(`/iam/admin/roles/${roleId}/permissions`, payload, {
    headers: authHeaders(accessToken),
  });
}

async function listIamPermissions(accessToken: string): Promise<IamPermissionItem[]> {
  const { data } = await http.get<IamPermissionListResponse>("/iam/admin/permissions", {
    headers: authHeaders(accessToken),
  });
  return data.items || [];
}

async function createIamPermission(accessToken: string, payload: PermissionCreatePayload): Promise<void> {
  await http.post("/iam/admin/permissions", payload, {
    headers: authHeaders(accessToken),
  });
}

async function updateIamPermission(
  accessToken: string,
  permissionId: number,
  payload: PermissionUpdatePayload,
): Promise<void> {
  await http.put(`/iam/admin/permissions/${permissionId}`, payload, {
    headers: authHeaders(accessToken),
  });
}

async function getMyProfile(accessToken: string): Promise<IamUserItem> {
  const { data } = await http.get<IamUserItem>("/iam/admin/me/profile", {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function updateMyProfile(accessToken: string, payload: UserProfileUpdatePayload): Promise<IamUserItem> {
  const { data } = await http.put<IamUserItem>("/iam/admin/me/profile", payload, {
    headers: authHeaders(accessToken),
  });
  return data;
}

export {
  createIamPermission,
  createIamRole,
  getIamUserDetail,
  getMyProfile,
  listIamPermissions,
  listIamRoles,
  listIamUsers,
  updateIamPermission,
  updateIamRole,
  updateIamRolePermissions,
  updateIamUserProfile,
  updateIamUserRoles,
  updateMyProfile,
};
