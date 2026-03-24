<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { useAuthStore } from "../../../stores/auth";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const message = ref("正在处理登录回调...");

function normalizeRedirect(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//")) {
    return "/dashboard";
  }
  return value;
}

onMounted(async () => {
  const redirect = normalizeRedirect(route.query.redirect);
  const ticket = String(route.query.ticket || "").trim();
  const from = String(route.query.from || "").toLowerCase();

  if (ticket) {
    const ok = await authStore.finalizeTicketCallback(ticket);
    if (ok) {
      await router.replace(redirect);
      return;
    }
    message.value = authStore.lastError || "登录票据回调失败";
    return;
  }

  if (from === "wecom") {
    const ok = await authStore.finalizeWecomCallback(redirect);
    if (ok) {
      await router.replace(redirect);
      return;
    }
    message.value = authStore.lastError || "企业微信登录回调失败";
    return;
  }

  await authStore.initialize();
  if (authStore.isAuthenticated) {
    await router.replace(redirect);
    return;
  }

  message.value = "登录信息无效，请重新登录";
  await router.replace({ path: "/login", query: { redirect } });
});
</script>

<template>
  <div class="callback-page">
    <el-card class="callback-card" shadow="never">
      <el-skeleton animated :rows="3" />
      <p>{{ message }}</p>
    </el-card>
  </div>
</template>

<style scoped>
.callback-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--bg-page);
}

.callback-card {
  width: min(520px, calc(100% - 32px));
  border-radius: 16px;
  border: 1px solid var(--border-soft);
}

p {
  margin: 16px 0 0;
  color: var(--text-500);
}
</style>
