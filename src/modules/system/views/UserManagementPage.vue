<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";

import { useAuthStore } from "../../../stores/auth";
import {
  getIamUserDetail,
  listIamRoles,
  listIamUsers,
  updateIamUserProfile,
  updateIamUserRoles,
} from "../api";
import type { IamRoleItem, IamUserItem, UserProfileUpdatePayload } from "../types";

const authStore = useAuthStore();

const loading = ref(false);
const users = ref<IamUserItem[]>([]);
const roles = ref<IamRoleItem[]>([]);

const filterForm = reactive({
  keyword: "",
  role: "",
});

const page = ref(1);
const pageSize = ref(20);
const total = ref(0);

const canManage = computed(() => {
  const roleSet = new Set(authStore.user?.roles || []);
  return roleSet.has("admin") || roleSet.has("super_admin");
});

const profileDialogVisible = ref(false);
const profileSaving = ref(false);
const profileTarget = ref<IamUserItem | null>(null);
const profileForm = reactive<UserProfileUpdatePayload>({
  username: "",
  email: "",
  phone: "",
  first_name: "",
  last_name: "",
  tenant_name: "",
  company_name: "",
  department_name: "",
  specialty_name: "",
});

const roleDialogVisible = ref(false);
const roleSaving = ref(false);
const roleTarget = ref<IamUserItem | null>(null);
const selectedRoleCodes = ref<string[]>([]);

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
  try {
    const token = requireAccessToken();
    roles.value = await listIamRoles(token);
  } catch (error) {
    ElMessage.error(parseError(error));
  }
}

async function loadUsers() {
  if (!canManage.value) {
    users.value = [];
    total.value = 0;
    return;
  }
  loading.value = true;
  try {
    const token = requireAccessToken();
    const data = await listIamUsers(token, {
      keyword: filterForm.keyword.trim() || undefined,
      role: filterForm.role || undefined,
      page: page.value,
      page_size: pageSize.value,
    });
    users.value = data.items || [];
    total.value = data.total || 0;
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    loading.value = false;
  }
}

async function handleSearch() {
  page.value = 1;
  await loadUsers();
}

async function handlePageChange(val: number) {
  page.value = val;
  await loadUsers();
}

async function handlePageSizeChange(val: number) {
  pageSize.value = val;
  page.value = 1;
  await loadUsers();
}

async function openProfileDialog(row: IamUserItem) {
  try {
    const token = requireAccessToken();
    const detail = await getIamUserDetail(token, row.id);
    profileTarget.value = detail;
    profileForm.username = detail.username || "";
    profileForm.email = detail.email || "";
    profileForm.phone = detail.phone || "";
    profileForm.first_name = detail.first_name || "";
    profileForm.last_name = detail.last_name || "";
    profileForm.tenant_name = detail.tenant_name || "";
    profileForm.company_name = detail.company_name || "";
    profileForm.department_name = detail.department_name || "";
    profileForm.specialty_name = detail.specialty_name || "";
    profileDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(parseError(error));
  }
}

async function saveProfile() {
  if (!profileTarget.value) {
    return;
  }
  profileSaving.value = true;
  try {
    const token = requireAccessToken();
    await updateIamUserProfile(token, profileTarget.value.id, {
      username: profileForm.username,
      email: profileForm.email,
      phone: profileForm.phone,
      first_name: profileForm.first_name,
      last_name: profileForm.last_name,
      tenant_name: profileForm.tenant_name,
      company_name: profileForm.company_name,
      department_name: profileForm.department_name,
      specialty_name: profileForm.specialty_name,
    });
    profileDialogVisible.value = false;
    ElMessage.success("用户资料已更新");
    await loadUsers();
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    profileSaving.value = false;
  }
}

async function openRoleDialog(row: IamUserItem) {
  try {
    const token = requireAccessToken();
    const detail = await getIamUserDetail(token, row.id);
    roleTarget.value = detail;
    selectedRoleCodes.value = [...(detail.iam_roles || [])];
    roleDialogVisible.value = true;
  } catch (error) {
    ElMessage.error(parseError(error));
  }
}

async function saveRoles() {
  if (!roleTarget.value) {
    return;
  }
  roleSaving.value = true;
  try {
    const token = requireAccessToken();
    await updateIamUserRoles(token, roleTarget.value.id, {
      role_codes: selectedRoleCodes.value,
    });
    roleDialogVisible.value = false;
    ElMessage.success("用户角色已更新");
    await loadUsers();
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    roleSaving.value = false;
  }
}

onMounted(async () => {
  await loadRoles();
  await loadUsers();
});
</script>

<template>
  <div class="user-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>用户管理</span>
          <span class="sub">管理平台账号、角色与基础资料</span>
        </div>
      </template>

      <el-alert
        v-if="!canManage"
        title="当前账号无管理权限（需 admin/super_admin）"
        type="warning"
        :closable="false"
        show-icon
      />

      <template v-else>
        <el-form class="filter-form" :inline="true">
          <el-form-item label="关键词">
            <el-input
              v-model="filterForm.keyword"
              placeholder="用户名/邮箱/手机号"
              clearable
              @keyup.enter="handleSearch"
            />
          </el-form-item>
          <el-form-item label="角色">
            <el-select v-model="filterForm.role" clearable placeholder="全部角色" style="width: 180px">
              <el-option
                v-for="item in roles"
                :key="item.code"
                :label="item.name + ' (' + item.code + ')'"
                :value="item.code"
              />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">查询</el-button>
          </el-form-item>
        </el-form>

        <el-table :data="users" border v-loading="loading">
          <el-table-column prop="id" label="ID" width="76" />
          <el-table-column prop="username" label="用户名" min-width="180" />
          <el-table-column prop="email" label="邮箱" min-width="180" />
          <el-table-column prop="phone" label="手机号" min-width="140" />
          <el-table-column label="角色" min-width="210">
            <template #default="scope">
              <el-space wrap>
                <el-tag v-for="code in scope.row.iam_roles" :key="code" size="small">{{ code }}</el-tag>
                <span v-if="!(scope.row.iam_roles || []).length" class="placeholder">-</span>
              </el-space>
            </template>
          </el-table-column>
          <el-table-column label="权限数" width="90">
            <template #default="scope">{{ (scope.row.permissions || []).length }}</template>
          </el-table-column>
          <el-table-column label="操作" width="200" fixed="right">
            <template #default="scope">
              <el-button link type="primary" @click="openProfileDialog(scope.row)">资料</el-button>
              <el-button link type="primary" @click="openRoleDialog(scope.row)">角色</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager-row">
          <el-pagination
            background
            layout="total, sizes, prev, pager, next"
            :total="total"
            :current-page="page"
            :page-size="pageSize"
            :page-sizes="[10, 20, 50, 100]"
            @current-change="handlePageChange"
            @size-change="handlePageSizeChange"
          />
        </div>
      </template>
    </el-card>

    <el-dialog v-model="profileDialogVisible" title="编辑用户资料" width="620px">
      <el-form label-width="96px">
        <el-form-item label="用户名"><el-input v-model="profileForm.username" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="profileForm.email" /></el-form-item>
        <el-form-item label="手机号"><el-input v-model="profileForm.phone" /></el-form-item>
        <el-form-item label="名"><el-input v-model="profileForm.first_name" /></el-form-item>
        <el-form-item label="姓"><el-input v-model="profileForm.last_name" /></el-form-item>
        <el-divider>组织信息</el-divider>
        <el-form-item label="租户"><el-input v-model="profileForm.tenant_name" /></el-form-item>
        <el-form-item label="公司"><el-input v-model="profileForm.company_name" /></el-form-item>
        <el-form-item label="部门"><el-input v-model="profileForm.department_name" /></el-form-item>
        <el-form-item label="专业"><el-input v-model="profileForm.specialty_name" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="profileDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="profileSaving" @click="saveProfile">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="roleDialogVisible" title="分配用户角色" width="560px">
      <el-checkbox-group v-model="selectedRoleCodes" class="role-list">
        <el-checkbox v-for="item in roles" :key="item.code" :label="item.code">
          {{ item.name }} ({{ item.code }})
        </el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="roleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="roleSaving" @click="saveRoles">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.user-page {
  display: grid;
  gap: 16px;
}

.card-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.sub {
  font-size: 12px;
  color: var(--text-500);
}

.filter-form {
  margin-bottom: 10px;
}

.pager-row {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.placeholder {
  color: var(--text-500);
}

.role-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px 8px;
}
</style>
