<script setup lang="ts">
import { useAuthStore } from "../../../stores/auth";

const authStore = useAuthStore();

function formatLoginType(type?: string) {
  if (type === "wecom") {
    return "企业微信";
  }
  if (type === "phone") {
    return "手机验证码";
  }
  return "账号密码";
}
</script>

<template>
  <div class="dashboard-grid">
    <el-card class="hero-card" shadow="never">
      <h2>欢迎使用工程服务平台</h2>
      <p>
        当前登录用户：<strong>{{ authStore.user?.displayName || "-" }}</strong>
      </p>
      <p>你可以从左侧导航进入文档翻译模块，后续模块也将复用当前登录态。</p>
    </el-card>

    <el-card shadow="never">
      <template #header>平台状态</template>
      <el-descriptions :column="1" border>
        <el-descriptions-item label="登录方式">
          {{ formatLoginType(authStore.user?.loginType) }}
        </el-descriptions-item>
        <el-descriptions-item label="角色数">
          {{ authStore.user?.roles.length || 0 }}
        </el-descriptions-item>
        <el-descriptions-item label="权限数">
          {{ authStore.user?.permissions.length || 0 }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped>
.dashboard-grid {
  display: grid;
  gap: 16px;
}

.hero-card {
  border-radius: 14px;
}

h2 {
  margin: 0 0 10px;
}

p {
  margin: 0 0 8px;
  color: var(--text-700);
}
</style>
