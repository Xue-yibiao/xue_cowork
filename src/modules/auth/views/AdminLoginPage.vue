<script setup lang="ts">
import { Lock, User } from "@element-plus/icons-vue";
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "../../../stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const form = reactive({
  username: "",
  password: "",
});

function normalizeRedirect(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

function getRedirectTarget(): string {
  return normalizeRedirect(route.query.redirect);
}

async function handlePasswordLogin() {
  loading.value = true;
  const ok = await authStore.loginWithPassword({
    username: form.username,
    password: form.password,
  });
  loading.value = false;
  if (!ok) {
    return;
  }
  await router.replace(getRedirectTarget());
}

async function backToLogin() {
  await router.replace({
    path: "/login",
    query: route.query.redirect ? { redirect: getRedirectTarget() } : {},
  });
}
</script>

<template>
  <div class="admin-login-page">
    <el-card class="admin-login-card" shadow="never">
      <div class="admin-copy">
        <p class="eyebrow">管理员测试入口</p>
        <h1>账号密码登录</h1>
        <p>该入口仅用于管理员或开发测试使用，不作为正式用户默认登录方式。</p>
      </div>

      <el-form @submit.prevent="handlePasswordLogin">
        <el-form-item>
          <el-input
            v-model="form.username"
            placeholder="Keycloak 账号"
            size="large"
            clearable
          >
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-form-item>
          <el-input
            v-model="form.password"
            placeholder="密码"
            size="large"
            show-password
          >
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>

        <el-alert
          v-if="authStore.lastError"
          :title="authStore.lastError"
          type="error"
          show-icon
          :closable="false"
        />

        <div class="actions">
          <el-button size="large" @click="backToLogin">返回主登录页</el-button>
          <el-button type="primary" size="large" :loading="loading" @click="handlePasswordLogin">
            管理员登录
          </el-button>
        </div>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.admin-login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(700px 420px at 20% 0%, rgba(225, 236, 255, 0.95) 0%, transparent 65%),
    linear-gradient(180deg, #f5f7fb 0%, #eef2f7 100%);
}

.admin-login-card {
  width: min(460px, 100%);
  border-radius: 24px;
  border: 1px solid rgba(118, 145, 180, 0.16);
}

.admin-copy {
  margin-bottom: 24px;
}

.eyebrow {
  margin: 0 0 10px;
  color: #336dc4;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

h1 {
  margin: 0;
  font-size: 30px;
  color: #213552;
}

.admin-copy p:last-child {
  margin: 12px 0 0;
  color: var(--text-500);
  line-height: 1.7;
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 20px;
}

.actions .el-button {
  flex: 1;
}

@media (max-width: 520px) {
  .admin-login-page {
    padding: 16px;
  }

  .actions {
    flex-direction: column;
  }
}
</style>
