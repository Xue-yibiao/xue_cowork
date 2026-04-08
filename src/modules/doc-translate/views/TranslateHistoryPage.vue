<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { Search } from "@element-plus/icons-vue";

import { useAuthStore } from "../../../stores/auth";
import {
  queryContractWorkflows,
  type WorkflowQueryItem,
} from "../api";

type LangPairFilterValue = "" | "en_zh" | "zh_en" | "es_zh" | "zh_es" | "it_zh" | "zh_it"| "ru_zh" | "zh_ru";

const router = useRouter();
const authStore = useAuthStore();
const accessToken = computed(() => authStore.accessToken || "");

const keyword = ref("");
const status = ref("");
const langPair = ref<LangPairFilterValue>("en_zh");
const dateRange = ref<[Date, Date] | null>(null);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const items = ref<WorkflowQueryItem[]>([]);

const langPairOptions: Array<{ label: string; value: LangPairFilterValue; src_lang?: string; tgt_lang?: string }> = [
  { label: "全部方向", value: "" },
  { label: "英文 -> 简体中文", value: "en_zh", src_lang: "en", tgt_lang: "zh" },
  { label: "简体中文 -> 英文", value: "zh_en", src_lang: "zh", tgt_lang: "en" },
  { label: "西班牙语 -> 简体中文", value: "es_zh", src_lang: "es", tgt_lang: "zh" },
  { label: "简体中文 -> 西班牙语", value: "zh_es", src_lang: "zh", tgt_lang: "es" },
  { label: "意大利语 -> 简体中文", value: "it_zh", src_lang: "it", tgt_lang: "zh" },
  { label: "简体中文 -> 意大利语", value: "zh_it", src_lang: "zh", tgt_lang: "it" },
  { label: "俄文 -> 简体中文", value: "ru_zh", src_lang: "ru", tgt_lang: "zh" },
  { label: "简体中文 -> 俄文", value: "zh_ru", src_lang: "zh", tgt_lang: "ru" },
];

const defaultLangPairFilterOption = langPairOptions[0]!;

function normalizeWorkflowStatus(statusValue: unknown): string {
  return String(statusValue || "").trim().toUpperCase();
}

function formatWorkflowStatusLabel(statusValue: unknown): string {
  const normalized = normalizeWorkflowStatus(statusValue);
  if (normalized === "WAIT_REVIEW") {
    return "已完成";
  }
  return normalized || "-";
}

function getWorkflowStatusTagType(statusValue: unknown): "success" | "danger" | "info" {
  const normalized = normalizeWorkflowStatus(statusValue);
  if (normalized === "SUCCEEDED" || normalized === "WAIT_REVIEW") {
    return "success";
  }
  if (normalized === "FAILED") {
    return "danger";
  }
  return "info";
}

function getLangPairFilterConfig(value: LangPairFilterValue) {
  return langPairOptions.find((item) => item.value === value) || defaultLangPairFilterOption;
}

function formatLangPairLabel(srcLang?: string | null, tgtLang?: string | null): string {
  const pair = langPairOptions.find((item) => item.src_lang === srcLang && item.tgt_lang === tgtLang);
  if (pair) {
    return pair.label;
  }
  const src = srcLang || "-";
  const tgt = tgtLang || "-";
  return `${src} -> ${tgt}`;
}

function formatUnixTs(v: unknown): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) {
    return "-";
  }
  return new Date(n * 1000).toLocaleString();
}

async function loadHistory() {
  const langPairConfig = getLangPairFilterConfig(langPair.value);
  loading.value = true;
  try {
    const offset = (currentPage.value - 1) * pageSize.value;
    const resp = await queryContractWorkflows(accessToken.value, {
      q: keyword.value.trim() || undefined,
      status: status.value || undefined,
      src_lang: langPairConfig.src_lang,
      tgt_lang: langPairConfig.tgt_lang,
      date_from: dateRange.value?.[0] ? dateRange.value[0].toISOString().slice(0, 10) : undefined,
      date_to: dateRange.value?.[1] ? dateRange.value[1].toISOString().slice(0, 10) : undefined,
      limit: pageSize.value,
      offset,
    });
    items.value = resp.items || [];
    total.value = Number(resp.total || 0);
  } catch (error) {
    console.error(error);
    ElMessage.error("加载历史任务失败");
  } finally {
    loading.value = false;
  }
}

function openWorkflow(row: WorkflowQueryItem) {
  const workflowId = String(row.workflow_id || "").trim();
  if (!workflowId) {
    return;
  }
  router.push(`/doc-translate/task/${encodeURIComponent(workflowId)}`);
}

onMounted(() => {
  void loadHistory();
});
</script>

<template>
  <div class="history-page">
    <section class="history-toolbar">
      <div class="toolbar-tabs">
        <button class="toolbar-tab is-active" type="button">翻译记录</button>
        <button class="toolbar-tab is-disabled" type="button">批量翻译</button>
      </div>

      <div class="toolbar-filters">
        <el-input v-model="keyword" placeholder="搜索文件名" clearable @keyup.enter="loadHistory">
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          value-format=""
          unlink-panels
        />
        <el-select v-model="langPair">
          <el-option v-for="item in langPairOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
<!--        <el-select v-model="status">-->
<!--          <el-option label="全部状态" value="" />-->
<!--          <el-option label="RUNNING" value="RUNNING" />-->
<!--          <el-option label="已完成" value="WAIT_REVIEW" />-->
<!--          <el-option label="FAILED" value="FAILED" />-->
<!--          <el-option label="SUCCEEDED" value="SUCCEEDED" />-->
<!--          <el-option label="CANCELLED" value="CANCELLED" />-->
<!--        </el-select>-->
        <el-button :icon="Search" :loading="loading" @click="loadHistory">搜索</el-button>
      </div>
    </section>

    <section class="history-body">
      <el-empty v-if="!loading && items.length === 0" description="您还没有上传文档">
        <template #image>
          <div class="empty-folder">
            <span></span>
          </div>
        </template>
        <el-button type="primary" @click="router.push('/doc-translate/translate')">上传文档，立即翻译</el-button>
      </el-empty>

      <div v-else class="history-list" v-loading="loading">
        <button
          v-for="row in items"
          :key="row.workflow_id"
          class="history-card"
          type="button"
          @click="openWorkflow(row)"
        >
          <div class="history-meta">
            <div>
              <p class="meta-file">{{ row.source_filename || row.workflow_id }}</p>
              <p class="meta-sub">
                {{ formatLangPairLabel(row.src_lang, row.tgt_lang) }}
                <span class="dot">·</span>
                {{ formatUnixTs(row.updated_at || row.created_at) }}
              </p>
            </div>
            <el-tag :type="getWorkflowStatusTagType(row.status)">
              {{ formatWorkflowStatusLabel(row.status) }}
            </el-tag>
          </div>
        </button>
      </div>
    </section>

    <div class="pager-row">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        layout="total, prev, pager, next"
        :total="total"
        @current-change="loadHistory"
      />
    </div>
  </div>
</template>

<style scoped>
.history-page {
  display: grid;
  gap: 18px;
}

.history-toolbar,
.history-body {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.86);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
}

.toolbar-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  border-radius: 14px;
  background: #f5f2ff;
}

.toolbar-tab {
  border: 0;
  background: transparent;
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  color: var(--text-700);
  cursor: pointer;
}

.toolbar-tab.is-active {
  background: #fff;
  color: var(--brand-500);
  font-weight: 600;
}

.toolbar-tab.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.toolbar-filters {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 1.3fr 1.2fr repeat(2, minmax(0, 0.8fr)) auto;
  gap: 12px;
}

.empty-folder {
  width: 112px;
  height: 88px;
  margin: 0 auto;
  position: relative;
}

.empty-folder span,
.empty-folder span::before {
  position: absolute;
  inset: 0;
  border: 6px solid rgba(147, 136, 178, 0.5);
  border-radius: 10px;
  content: "";
}

.empty-folder span::before {
  height: 26px;
  width: 42px;
  top: -12px;
  left: 10px;
  right: auto;
  border-bottom: 0;
  border-radius: 10px 10px 0 0;
}

.history-list {
  display: grid;
  gap: 14px;
}

.history-card {
  border: 1px solid rgba(103, 80, 164, 0.12);
  outline: none;
  width: 100%;
  text-align: left;
  cursor: pointer;
  border: 1px solid rgba(103, 80, 164, 0.12);
  border-radius: 18px;
  padding: 18px;
  background: linear-gradient(180deg, #fff 0%, #fcfbff 100%);
  transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.history-card:hover {
  transform: translateY(-1px);
  border-color: rgba(103, 80, 164, 0.22);
  box-shadow: 0 12px 28px rgba(69, 52, 132, 0.08);
}

.history-card:focus-visible {
  border-color: rgba(95, 69, 198, 0.45);
  box-shadow: 0 0 0 3px rgba(95, 69, 198, 0.12);
}

.history-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.meta-file {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-900);
}

.meta-sub {
  margin: 8px 0 0;
  color: var(--text-500);
}

.dot {
  margin: 0 6px;
}

.pager-row {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 1200px) {
  .toolbar-filters {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 768px) {
  .history-toolbar,
  .history-body {
    padding: 18px;
    border-radius: 18px;
  }

  .toolbar-filters {
    grid-template-columns: 1fr;
  }
}
</style>
