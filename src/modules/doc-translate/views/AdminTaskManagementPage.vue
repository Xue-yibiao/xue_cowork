<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { RefreshRight, Search } from "@element-plus/icons-vue";

import { useAuthStore } from "../../../stores/auth";
import { listIamUsers } from "../../system/api";
import type { IamUserItem } from "../../system/types";
import {
  deleteContractAdminWorkflowById,
  deleteContractAdminWorkflowForOwner,
  deleteContractAdminWorkflowsForOwner,
  queryContractAdminWorkflowsByOwner,
  type AdminWorkflowQueryItem,
} from "../api";

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);
const deletingWorkflowId = ref("");
const deletingOwner = ref(false);
const items = ref<AdminWorkflowQueryItem[]>([]);
const total = ref(0);
const skippedInvalidState = ref(0);
const ownerOptionsLoading = ref(false);

interface OwnerOptionItem {
  subject: string;
  label: string;
}

const ownerOptions = ref<OwnerOptionItem[]>([]);

const filterForm = reactive({
  ownerSubject: "",
  status: "",
  ownerMissing: false,
});

const page = ref(1);
const pageSize = ref(20);

const canManageTasks = computed(() => {
  const roleSet = new Set(authStore.user?.roles || []);
  return roleSet.has("admin") || roleSet.has("super_admin");
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

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function buildPersonName(user: Partial<IamUserItem> | Partial<AdminWorkflowQueryItem>): string {
  const iamUser = user as Partial<IamUserItem>;
  const workflowUser = user as Partial<AdminWorkflowQueryItem>;
  const firstName = normalizeText(iamUser.first_name);
  const lastName = normalizeText(iamUser.last_name);
  const displayName = normalizeText(workflowUser.owner_display_name);
  return displayName || [lastName, firstName].filter(Boolean).join(" ").trim();
}

function buildOwnerOptionLabel(user: Partial<IamUserItem> | Partial<AdminWorkflowQueryItem>): string {
  const iamUser = user as Partial<IamUserItem>;
  const workflowUser = user as Partial<AdminWorkflowQueryItem>;
  const personName = buildPersonName(user);
  const username = normalizeText(iamUser.username || workflowUser.owner_username);
  const email = normalizeText(iamUser.email || workflowUser.owner_email);
  const secondary = email || username;
  if (personName && secondary && personName !== secondary) {
    return `${personName} (${secondary})`;
  }
  return personName || secondary || normalizeText(workflowUser.owner_subject) || "-";
}

function mergeOwnerOptions(nextOptions: OwnerOptionItem[]) {
  const merged = new Map<string, OwnerOptionItem>();
  for (const option of ownerOptions.value) {
    if (option.subject) {
      merged.set(option.subject, option);
    }
  }
  for (const option of nextOptions) {
    if (option.subject) {
      merged.set(option.subject, option);
    }
  }
  ownerOptions.value = Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

function syncOwnerOptionsFromRows(rows: AdminWorkflowQueryItem[]) {
  const nextOptions = rows
    .map((row) => ({
      subject: normalizeText(row.owner_subject),
      label: buildOwnerOptionLabel({
        owner_subject: row.owner_subject,
        owner_display_name: row.owner_display_name,
        owner_username: row.owner_username,
        owner_email: row.owner_email,
      }),
    }))
    .filter((option) => option.subject);
  mergeOwnerOptions(nextOptions);
}

async function loadOwnerOptions(keyword = "") {
  if (!canManageTasks.value) {
    ownerOptions.value = [];
    return;
  }

  ownerOptionsLoading.value = true;
  try {
    const token = requireAccessToken();
    const data = await listIamUsers(token, {
      keyword: keyword.trim() || undefined,
      page: 1,
      page_size: 50,
    });
    const nextOptions = (data.items || [])
      .map((user) => {
        const subject = normalizeText(user.keycloak_user_id);
        if (!subject) {
          return null;
        }
        return {
          subject,
          label: buildOwnerOptionLabel(user),
        };
      })
      .filter((option): option is OwnerOptionItem => Boolean(option?.subject));
    mergeOwnerOptions(nextOptions);
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    ownerOptionsLoading.value = false;
  }
}

async function handleOwnerRemoteSearch(query: string) {
  await loadOwnerOptions(query);
}

function formatUnixTs(value: unknown): string {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) {
    return "-";
  }
  return new Date(n * 1000).toLocaleString();
}

function statusTagType(status: unknown): "success" | "warning" | "danger" | "info" {
  const normalized = String(status || "").trim().toUpperCase();
  if (normalized === "SUCCEEDED") {
    return "success";
  }
  if (normalized === "WAIT_REVIEW") {
    return "warning";
  }
  if (normalized === "FAILED") {
    return "danger";
  }
  return "info";
}

async function loadTasks() {
  if (!canManageTasks.value) {
    items.value = [];
    total.value = 0;
    skippedInvalidState.value = 0;
    return;
  }

  loading.value = true;
  try {
    const token = requireAccessToken();
    const offset = (page.value - 1) * pageSize.value;
    const data = await queryContractAdminWorkflowsByOwner(token, {
      owner_subject: filterForm.ownerSubject.trim() || undefined,
      owner_missing: filterForm.ownerMissing ? true : undefined,
      status: filterForm.status || undefined,
      limit: pageSize.value,
      offset,
    });
    items.value = data.items || [];
    total.value = Number(data.total || 0);
    skippedInvalidState.value = Number(data.skipped_invalid_state || 0);
    syncOwnerOptionsFromRows(items.value);
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    loading.value = false;
  }
}

async function handleSearch() {
  page.value = 1;
  await loadTasks();
}

async function handleReset() {
  filterForm.ownerSubject = "";
  filterForm.status = "";
  filterForm.ownerMissing = false;
  page.value = 1;
  await loadTasks();
}

async function handlePageChange(nextPage: number) {
  page.value = nextPage;
  await loadTasks();
}

async function handleDeleteRow(row: AdminWorkflowQueryItem) {
  const ownerSubject = String(row.owner_subject || "").trim();
  const workflowId = String(row.workflow_id || "").trim();
  if (!workflowId) {
    ElMessage.error("当前任务缺少 workflow_id，无法删除");
    return;
  }

  const ownerLabel = formatOwnerLabel(row);
  const targetLabel = ownerSubject ? `用户 ${ownerLabel} 的任务 ${workflowId}` : `无 owner 任务 ${workflowId}`;
  await ElMessageBox.confirm(
    `将删除${targetLabel}。该操作会清理该任务的 workflow 目录，且不可恢复。`,
    "删除任务",
    {
      type: "warning",
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
    },
  );

  deletingWorkflowId.value = workflowId;
  try {
    const token = requireAccessToken();
    if (ownerSubject) {
      await deleteContractAdminWorkflowForOwner(token, ownerSubject, workflowId);
    } else {
      await deleteContractAdminWorkflowById(token, workflowId);
    }
    ElMessage.success("任务已删除");
    await loadTasks();
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    deletingWorkflowId.value = "";
  }
}

function formatOwnerLabel(row: AdminWorkflowQueryItem): string {
  return buildOwnerOptionLabel({
    owner_subject: row.owner_subject,
    owner_display_name: row.owner_display_name,
    owner_username: row.owner_username,
    owner_email: row.owner_email,
  });
}

function isOwnerMissing(row: AdminWorkflowQueryItem): boolean {
  return !String(row.owner_subject || "").trim();
}

async function handleDeleteOwnerAllByRow(row: AdminWorkflowQueryItem) {
  const ownerSubject = String(row.owner_subject || "").trim();
  if (!ownerSubject) {
    ElMessage.error("当前任务缺少 owner_subject，无法批量删除该用户任务");
    return;
  }

  const ownerLabel = formatOwnerLabel(row);

  await ElMessageBox.confirm(
    `将删除用户 ${ownerLabel} 的全部可删除任务。运行中的任务会被跳过。该操作不可恢复。`,
    "批量删除任务",
    {
      type: "warning",
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
    },
  );

  deletingOwner.value = true;
  try {
    const token = requireAccessToken();
    const result = await deleteContractAdminWorkflowsForOwner(token, ownerSubject);
    const skippedCount = Array.isArray(result.skipped) ? result.skipped.length : 0;
    ElMessage.success(`已删除 ${result.deleted_count} 个任务，跳过 ${skippedCount} 个任务`);
    await loadTasks();
  } catch (error) {
    ElMessage.error(parseError(error));
  } finally {
    deletingOwner.value = false;
  }
}

function openWorkflow(row: AdminWorkflowQueryItem) {
  const workflowId = String(row.workflow_id || "").trim();
  if (!workflowId) {
    return;
  }
  router.push(`/doc-translate/task/${encodeURIComponent(workflowId)}`);
}

onMounted(async () => {
  await Promise.all([loadOwnerOptions(), loadTasks()]);
});
</script>

<template>
  <div class="admin-task-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span>任务管理</span>
          <span class="sub">管理员按用户信息查询并清理历史翻译任务</span>
        </div>
      </template>

      <el-alert
        v-if="!canManageTasks"
        title="当前账号无任务管理权限（需 admin / super_admin）"
        type="warning"
        :closable="false"
        show-icon
      />

      <template v-else>
        <div class="toolbar">
          <el-form class="filter-form" :inline="true">
            <el-form-item label="用户">
              <el-select
                v-model="filterForm.ownerSubject"
                filterable
                remote
                reserve-keyword
                clearable
                :disabled="filterForm.ownerMissing"
                placeholder="选择用户"
                style="width: 320px"
                :loading="ownerOptionsLoading"
                :remote-method="handleOwnerRemoteSearch"
                @visible-change="(visible: boolean) => visible && loadOwnerOptions()"
              >
                <template #prefix>
                  <el-icon><Search /></el-icon>
                </template>
                <el-option
                  v-for="option in ownerOptions"
                  :key="option.subject"
                  :label="option.label"
                  :value="option.subject"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="状态">
              <el-select v-model="filterForm.status" clearable placeholder="全部状态" style="width: 180px">
                <el-option label="RUNNING" value="RUNNING" />
                <el-option label="WAIT_REVIEW" value="WAIT_REVIEW" />
                <el-option label="FAILED" value="FAILED" />
                <el-option label="SUCCEEDED" value="SUCCEEDED" />
                <el-option label="CANCELLED" value="CANCELLED" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-checkbox v-model="filterForm.ownerMissing">仅看无 owner 任务</el-checkbox>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleSearch">查询</el-button>
              <el-button @click="handleReset">重置</el-button>
              <el-button :icon="RefreshRight" :loading="loading" @click="loadTasks">刷新</el-button>
            </el-form-item>
          </el-form>

        </div>

        <el-alert
          v-if="skippedInvalidState > 0"
          class="meta-alert"
          type="info"
          :closable="false"
          show-icon
          :title="`检测到 ${skippedInvalidState} 个无效 workflow state，查询时已自动跳过`"
        />

        <el-table class="task-table" :data="items" border stripe v-loading="loading">
          <el-table-column label="用户" min-width="260">
            <template #default="{ row }">
              <div class="owner-cell">
                <strong>{{ formatOwnerLabel(row) }}</strong>
                <span v-if="row.owner_subject" class="owner-meta">subject: {{ row.owner_subject }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="workflow_id" label="Workflow ID" min-width="260" />
          <el-table-column label="状态" width="130">
            <template #default="{ row }">
              <el-tag :type="statusTagType(row.status)">
                {{ row.status || "-" }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="mode" label="模式" width="120" />
          <el-table-column prop="language_pair" label="语种方向" min-width="140" />
          <el-table-column label="更新时间" min-width="180">
            <template #default="{ row }">
              {{ formatUnixTs(row.updated_at || row.created_at) }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="320" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button link type="primary" @click="openWorkflow(row)">查看</el-button>
                <el-button
                  link
                  type="danger"
                  :loading="deletingWorkflowId === row.workflow_id"
                  @click="handleDeleteRow(row)"
                >
                  删除该任务
                </el-button>
                <el-button
                  link
                  type="warning"
                  v-if="!isOwnerMissing(row)"
                  :loading="deletingOwner"
                  @click="handleDeleteOwnerAllByRow(row)"
                >
                  删除该用户全部任务
                </el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager-row">
          <el-pagination
            v-model:current-page="page"
            v-model:page-size="pageSize"
            layout="total, prev, pager, next"
            :total="total"
            @current-change="handlePageChange"
          />
        </div>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.admin-task-page {
  display: grid;
}

.card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.card-header .sub {
  color: #8c85a4;
  font-size: 13px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.filter-form {
  flex: 1;
}

.meta-alert {
  margin-bottom: 16px;
}

.task-table {
  width: 100%;
}

.owner-cell {
  display: grid;
  gap: 4px;
}

.owner-meta {
  color: #8c85a4;
  font-size: 12px;
  line-height: 1.4;
  word-break: break-all;
}

.row-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pager-row {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1200px) {
  .toolbar {
    flex-direction: column;
  }
}
</style>
