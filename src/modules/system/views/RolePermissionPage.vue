<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";

import { useAuthStore } from "../../../stores/auth";
import {
  createIamPermission,
  createIamRole,
  listIamPermissions,
  listIamRoles,
  updateIamPermission,
  updateIamRole,
  updateIamRolePermissions,
} from "../api";
import type { IamPermissionItem, IamRoleItem } from "../types";

const authStore = useAuthStore();

const canManage = computed(() => {
  const roleSet = new Set(authStore.user?.roles || []);
  return roleSet.has("admin") || roleSet.has("super_admin");
});

const activeTab = ref("roles");
const loadingRoles = ref(false);
const loadingPermissions = ref(false);

const roles = ref<IamRoleItem[]>([]);
const permissions = ref<IamPermissionItem[]>([]);

const roleDialogVisible = ref(false);
const roleSaving = ref(false);
const roleEditId = ref<number | null>(null);
const roleForm = reactive({
  code: "",
  name: "",
  description: "",
  status: "active",
});

const permissionDialogVisible = ref(false);
const permissionSaving = ref(false);
const permissionEditId = ref<number | null>(null);
const permissionForm = reactive({
  code: "",
  name: "",
  resource: "",
  action: "",
  description: "",
  status: "active",
});

const grantDialogVisible = ref(false);
const grantSaving = ref(false);
const grantRole = ref<IamRoleItem | null>(null);
const grantPermissionCodes = ref<string[]>([]);

function parseError(error: unknown): string {
  const maybe = error as {
    response?: { data?: { detail?: unknown } };
    message?: string;
  };
  const detail = maybe?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail.map((item) => JSON.stringify(item)).join("; ");
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }
  return maybe?.message || "请求失败";
}

function requireAccessToken(): string {
  const token = String(authStore.accessToken || "").trim();
  if (!token) {
    throw new Error("当前会话缺少 Bearer Token，请重新登录后重试");
  }
  return token;
}

async function loadRoles() {
  if (!canManage.value) {
    roles.value = [];
    return;
  }
  loadingRoles.value = true;
  try {
    const token = requireAccessToken();
    roles.value = await listIamRoles(token);
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    loadingRoles.value = false;
  }
}

async function loadPermissions() {
  if (!canManage.value) {
    permissions.value = [];
    return;
  }
  loadingPermissions.value = true;
  try {
    const token = requireAccessToken();
    permissions.value = await listIamPermissions(token);
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    loadingPermissions.value = false;
  }
}

function openCreateRole() {
  roleEditId.value = null;
  roleForm.code = "";
  roleForm.name = "";
  roleForm.description = "";
  roleForm.status = "active";
  roleDialogVisible.value = true;
}

function openEditRole(item: IamRoleItem) {
  roleEditId.value = item.id;
  roleForm.code = item.code;
  roleForm.name = item.name;
  roleForm.description = item.description || "";
  roleForm.status = item.status || "active";
  roleDialogVisible.value = true;
}

async function saveRole() {
  roleSaving.value = true;
  try {
    const token = requireAccessToken();
    if (roleEditId.value == null) {
      await createIamRole(token, {
        code: roleForm.code,
        name: roleForm.name,
        description: roleForm.description,
        status: roleForm.status,
      });
      ElMessage.success("角色已创建");
    } else {
      await updateIamRole(token, roleEditId.value, {
        name: roleForm.name,
        description: roleForm.description,
        status: roleForm.status,
      });
      ElMessage.success("角色已更新");
    }
    roleDialogVisible.value = false;
    await loadRoles();
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    roleSaving.value = false;
  }
}

function openGrantPermissions(item: IamRoleItem) {
  grantRole.value = item;
  grantPermissionCodes.value = [...(item.permission_codes || [])];
  grantDialogVisible.value = true;
}

async function saveGrantPermissions() {
  if (!grantRole.value) {
    return;
  }
  grantSaving.value = true;
  try {
    const token = requireAccessToken();
    await updateIamRolePermissions(token, grantRole.value.id, {
      permission_codes: grantPermissionCodes.value,
    });
    ElMessage.success("角色权限已更新");
    grantDialogVisible.value = false;
    await Promise.all([loadRoles(), loadPermissions()]);
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    grantSaving.value = false;
  }
}

function openCreatePermission() {
  permissionEditId.value = null;
  permissionForm.code = "";
  permissionForm.name = "";
  permissionForm.resource = "";
  permissionForm.action = "";
  permissionForm.description = "";
  permissionForm.status = "active";
  permissionDialogVisible.value = true;
}

function openEditPermission(item: IamPermissionItem) {
  permissionEditId.value = item.id;
  permissionForm.code = item.code;
  permissionForm.name = item.name;
  permissionForm.resource = item.resource || "";
  permissionForm.action = item.action || "";
  permissionForm.description = item.description || "";
  permissionForm.status = item.status || "active";
  permissionDialogVisible.value = true;
}

async function savePermission() {
  permissionSaving.value = true;
  try {
    const token = requireAccessToken();
    if (permissionEditId.value == null) {
      await createIamPermission(token, {
        code: permissionForm.code,
        name: permissionForm.name,
        resource: permissionForm.resource,
        action: permissionForm.action,
        description: permissionForm.description,
        status: permissionForm.status,
      });
      ElMessage.success("权限已创建");
    } else {
      await updateIamPermission(token, permissionEditId.value, {
        code: permissionForm.code,
        name: permissionForm.name,
        resource: permissionForm.resource,
        action: permissionForm.action,
        description: permissionForm.description,
        status: permissionForm.status,
      });
      ElMessage.success("权限已更新");
    }
    permissionDialogVisible.value = false;
    await Promise.all([loadRoles(), loadPermissions()]);
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    permissionSaving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadRoles(), loadPermissions()]);
});
</script>

<template>
  <div class="rp-page">
    <el-alert
      v-if="!canManage"
      title="当前账号无角色/权限管理权限（需 admin/super_admin）"
      type="warning"
      :closable="false"
      show-icon
    />

    <el-tabs v-else v-model="activeTab">
      <el-tab-pane label="角色管理" name="roles">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>角色管理</span>
              <el-button type="primary" @click="openCreateRole">新增角色</el-button>
            </div>
          </template>

          <el-table :data="roles" border v-loading="loadingRoles">
            <el-table-column prop="id" label="ID" width="72" />
            <el-table-column prop="code" label="Code" min-width="160" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column label="权限数" width="100">
              <template #default="scope">{{ (scope.row.permission_codes || []).length }}</template>
            </el-table-column>
            <el-table-column label="操作" width="220" fixed="right">
              <template #default="scope">
                <el-button link type="primary" @click="openEditRole(scope.row)">编辑</el-button>
                <el-button link type="primary" @click="openGrantPermissions(scope.row)">权限配置</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="权限管理" name="permissions">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span>权限点管理</span>
              <el-button type="primary" @click="openCreatePermission">新增权限</el-button>
            </div>
          </template>

          <el-table :data="permissions" border v-loading="loadingPermissions">
            <el-table-column prop="id" label="ID" width="72" />
            <el-table-column prop="code" label="Code" min-width="190" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="resource" label="资源" min-width="140" />
            <el-table-column prop="action" label="动作" min-width="120" />
            <el-table-column prop="status" label="状态" width="100" />
            <el-table-column label="操作" width="120" fixed="right">
              <template #default="scope">
                <el-button link type="primary" @click="openEditPermission(scope.row)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="roleDialogVisible" :title="roleEditId == null ? '新增角色' : '编辑角色'" width="560px">
      <el-form label-width="90px">
        <el-form-item label="角色代码">
          <el-input v-model="roleForm.code" :disabled="roleEditId != null" />
        </el-form-item>
        <el-form-item label="角色名称">
          <el-input v-model="roleForm.name" />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="roleForm.status" style="width: 180px">
            <el-option label="active" value="active" />
            <el-option label="disabled" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="roleForm.description" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="roleSaving" @click="saveRole">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="permissionDialogVisible" :title="permissionEditId == null ? '新增权限' : '编辑权限'" width="640px">
      <el-form label-width="90px">
        <el-form-item label="权限代码"><el-input v-model="permissionForm.code" /></el-form-item>
        <el-form-item label="权限名称"><el-input v-model="permissionForm.name" /></el-form-item>
        <el-form-item label="资源"><el-input v-model="permissionForm.resource" /></el-form-item>
        <el-form-item label="动作"><el-input v-model="permissionForm.action" /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="permissionForm.status" style="width: 180px">
            <el-option label="active" value="active" />
            <el-option label="disabled" value="disabled" />
          </el-select>
        </el-form-item>
        <el-form-item label="描述"><el-input v-model="permissionForm.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="permissionDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="permissionSaving" @click="savePermission">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="grantDialogVisible" :title="`配置角色权限 - ${grantRole?.name || ''}`" width="720px">
      <el-checkbox-group v-model="grantPermissionCodes" class="permission-list">
        <el-checkbox v-for="item in permissions" :key="item.code" :label="item.code">
          {{ item.name }} ({{ item.code }})
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="grantDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="grantSaving" @click="saveGrantPermissions">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.rp-page {
  display: grid;
  gap: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.permission-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
</style>
