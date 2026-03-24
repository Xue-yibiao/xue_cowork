interface IamUserItem {
  id: number;
  keycloak_user_id?: string | null;
  username: string;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  created_at?: string;
  tenant_name?: string | null;
  company_name?: string | null;
  department_name?: string | null;
  specialty_name?: string | null;
  iam_roles: string[];
  permissions: string[];
}

interface IamUserListResponse {
  items: IamUserItem[];
  page: number;
  page_size: number;
  total: number;
}

interface IamRoleItem {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  created_at?: string;
  permission_codes: string[];
}

interface IamRoleListResponse {
  items: IamRoleItem[];
}

interface IamPermissionItem {
  id: number;
  code: string;
  name: string;
  resource?: string | null;
  action?: string | null;
  description?: string | null;
  status: string;
  created_at?: string;
}

interface IamPermissionListResponse {
  items: IamPermissionItem[];
}

interface UserProfileUpdatePayload {
  username?: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  tenant_name?: string;
  company_name?: string;
  department_name?: string;
  specialty_name?: string;
}

interface UserRoleUpdatePayload {
  role_codes: string[];
  tenant_scope?: string;
}

interface RoleCreatePayload {
  code: string;
  name: string;
  description?: string;
  status?: string;
}

interface RoleUpdatePayload {
  name?: string;
  description?: string;
  status?: string;
}

interface RolePermissionUpdatePayload {
  permission_codes: string[];
}

interface PermissionCreatePayload {
  code: string;
  name: string;
  resource?: string;
  action?: string;
  description?: string;
  status?: string;
}

interface PermissionUpdatePayload {
  code?: string;
  name?: string;
  resource?: string;
  action?: string;
  description?: string;
  status?: string;
}

export type {
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
};
