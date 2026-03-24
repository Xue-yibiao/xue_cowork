<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";

import { useAuthStore } from "../../../stores/auth";
import { getMyProfile, updateMyProfile } from "../api";
import type { IamUserItem } from "../types";

const authStore = useAuthStore();

const loading = ref(false);
const saving = ref(false);
const profile = ref<IamUserItem | null>(null);

const form = reactive({
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

function fillForm(data: IamUserItem) {
  form.username = data.username || "";
  form.email = data.email || "";
  form.phone = data.phone || "";
  form.first_name = data.first_name || "";
  form.last_name = data.last_name || "";
  form.tenant_name = data.tenant_name || "";
  form.company_name = data.company_name || "";
  form.department_name = data.department_name || "";
  form.specialty_name = data.specialty_name || "";
}

async function loadProfile() {
  loading.value = true;
  try {
    const token = requireAccessToken();
    const data = await getMyProfile(token);
    profile.value = data;
    fillForm(data);
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    loading.value = false;
  }
}

async function saveProfile() {
  saving.value = true;
  try {
    const token = requireAccessToken();
    const data = await updateMyProfile(token, {
      username: form.username,
      email: form.email,
      phone: form.phone,
      first_name: form.first_name,
      last_name: form.last_name,
      tenant_name: form.tenant_name,
      company_name: form.company_name,
      department_name: form.department_name,
      specialty_name: form.specialty_name,
    });
    profile.value = data;
    fillForm(data);
    ElMessage.success("个人信息已更新");
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadProfile();
});
</script>

<template>
  <div class="profile-page" v-loading="loading">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>个人信息设置</span>
          <span class="sub">用于统一工程服务平台账号资料</span>
        </div>
      </template>

      <el-form label-width="100px" class="profile-form">
        <el-form-item label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="邮箱"><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="手机号"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="名"><el-input v-model="form.first_name" /></el-form-item>
        <el-form-item label="姓"><el-input v-model="form.last_name" /></el-form-item>
        <el-divider>组织信息</el-divider>
        <el-form-item label="租户"><el-input v-model="form.tenant_name" /></el-form-item>
        <el-form-item label="公司"><el-input v-model="form.company_name" /></el-form-item>
        <el-form-item label="部门"><el-input v-model="form.department_name" /></el-form-item>
        <el-form-item label="专业"><el-input v-model="form.specialty_name" /></el-form-item>

        <el-form-item label="当前角色">
          <el-space wrap>
            <el-tag v-for="item in profile?.iam_roles || []" :key="item" size="small">{{ item }}</el-tag>
            <span v-if="!(profile?.iam_roles || []).length" class="placeholder">-</span>
          </el-space>
        </el-form-item>
        <el-form-item label="当前权限">
          <el-space wrap>
            <el-tag v-for="item in profile?.permissions || []" :key="item" type="success" size="small">{{ item }}</el-tag>
            <span v-if="!(profile?.permissions || []).length" class="placeholder">-</span>
          </el-space>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveProfile">保存修改</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.profile-page {
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

.profile-form {
  max-width: 720px;
}

.placeholder {
  color: var(--text-500);
}
</style>
