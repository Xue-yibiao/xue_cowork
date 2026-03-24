<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { RefreshRight, Search } from "@element-plus/icons-vue";

import { useAuthStore } from "../../../stores/auth";
import {
  applyContractWorkflowPatch,
  getContractWorkflowDetail,
  getContractWorkflowDraft,
  getContractWorkflowReviewPayload,
  type WorkflowDraftItem,
} from "../api";

type Dict = Record<string, unknown>;
type ReviewTab = "translations" | "patched" | "notes";
type FilterMode = "all" | "qa" | "dirty" | "applied";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const accessToken = computed(() => authStore.accessToken || "");
const workflowId = computed(() => String(route.params.workflowId || "").trim());

const activeTab = ref<ReviewTab>("translations");
const filterMode = ref<FilterMode>("qa");
const loading = ref(false);
const submitting = ref(false);
const draftItems = ref<WorkflowDraftItem[]>([]);
const workflowDetail = ref<Dict | null>(null);
const reviewPayload = ref<Dict | null>(null);
const searchKeyword = ref("");

const pendingPatches = ref<Record<string, string>>({});
const selectedBlockId = ref("");
const currentEditText = ref("");

const reviewFailures = computed(() => {
  const failures = reviewPayload.value?.failures;
  return Array.isArray(failures) ? failures : [];
});

const reviewSummary = computed(() => {
  const summary = reviewPayload.value?.summary;
  return summary && typeof summary === "object" ? (summary as Dict) : {};
});

const fileName = computed(() => {
  const artifacts = workflowDetail.value?.artifacts;
  if (artifacts && typeof artifacts === "object") {
    return String((artifacts as Dict).source_filename || workflowId.value || "未命名任务");
  }
  return workflowId.value || "未命名任务";
});

const mergedDraftItems = computed(() =>
  draftItems.value.map((item) => ({
    ...item,
    merged_translation: pendingPatches.value[item.block_id] ?? item.translation ?? "",
  })),
);

const qaSuggestionsByBlockId = computed(() => {
  const map = new Map<string, Dict[]>();
  for (const failure of reviewFailures.value) {
    if (!failure || typeof failure !== "object") {
      continue;
    }
    const blockId = String((failure as Dict).block_id || "").trim();
    if (!blockId) {
      continue;
    }
    const bucket = map.get(blockId) || [];
    bucket.push(failure as Dict);
    map.set(blockId, bucket);
  }
  return map;
});

const qaHitSet = computed(() => new Set(Array.from(qaSuggestionsByBlockId.value.keys())));
const qaHitCount = computed(() => qaHitSet.value.size);
const dirtyCount = computed(() => Object.keys(pendingPatches.value).length);
const appliedCount = computed(() => draftItems.value.filter((item) => Boolean(item.manual_patch_id)).length);

function matchFilter(item: WorkflowDraftItem & { merged_translation?: string }) {
  if (filterMode.value === "qa") {
    return qaHitSet.value.has(item.block_id);
  }
  if (filterMode.value === "dirty") {
    return Object.prototype.hasOwnProperty.call(pendingPatches.value, item.block_id);
  }
  if (filterMode.value === "applied") {
    return Boolean(item.manual_patch_id);
  }
  return true;
}

function matchSearch(item: WorkflowDraftItem & { merged_translation?: string }) {
  const needle = searchKeyword.value.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  const hay = `${item.block_id} ${item.source_text || ""} ${item.merged_translation || ""}`.toLowerCase();
  return hay.includes(needle);
}

const filteredDraftItems = computed(() =>
  mergedDraftItems.value.filter((item) => matchFilter(item) && matchSearch(item)),
);

const selectedBlock = computed(() =>
  mergedDraftItems.value.find((item) => item.block_id === selectedBlockId.value) || null,
);

const selectedBlockSuggestions = computed(() => {
  if (!selectedBlockId.value) {
    return [];
  }
  return qaSuggestionsByBlockId.value.get(selectedBlockId.value) || [];
});

const patchedItems = computed(() =>
  mergedDraftItems.value.filter((item) => Object.prototype.hasOwnProperty.call(pendingPatches.value, item.block_id) || Boolean(item.manual_patch_id)),
);

function suggestionText(suggestion: Dict | undefined): string {
  if (!suggestion) {
    return "";
  }
  const expected = suggestion.expected_tgts;
  if (Array.isArray(expected) && expected.length > 0) {
    return String(expected[0] || "").trim();
  }
  return String(suggestion.expected_tgt || suggestion.suggestion || "").trim();
}

function currentBaseTranslation(blockId: string): string {
  const item = draftItems.value.find((row) => row.block_id === blockId);
  return String(item?.translation || "");
}

function persistCurrentEdit() {
  const blockId = selectedBlockId.value;
  if (!blockId) {
    return;
  }
  const base = currentBaseTranslation(blockId);
  if (currentEditText.value === base) {
    const next = { ...pendingPatches.value };
    delete next[blockId];
    pendingPatches.value = next;
    return;
  }
  pendingPatches.value = {
    ...pendingPatches.value,
    [blockId]: currentEditText.value,
  };
}

function selectBlock(blockId: string) {
  persistCurrentEdit();
  selectedBlockId.value = blockId;
}

function restoreCurrentBlock() {
  if (!selectedBlock.value) {
    return;
  }
  const next = { ...pendingPatches.value };
  delete next[selectedBlock.value.block_id];
  pendingPatches.value = next;
  currentEditText.value = String(selectedBlock.value.translation || "");
  ElMessage.success("已还原本块");
}

function applyCurrentSuggestion(suggestion?: Dict) {
  if (!selectedBlock.value) {
    return;
  }
  const next = suggestionText(suggestion || selectedBlockSuggestions.value[0]);
  if (!next) {
    ElMessage.warning("当前块没有可直接套用的建议");
    return;
  }
  currentEditText.value = next;
  persistCurrentEdit();
  ElMessage.success("已套用建议译文");
}

function clearLocalPatches() {
  pendingPatches.value = {};
  if (selectedBlock.value) {
    currentEditText.value = String(selectedBlock.value.translation || "");
  }
  ElMessage.success("本地待提交修订已清空");
}

async function loadReviewData() {
  if (!workflowId.value) {
    return;
  }
  loading.value = true;
  try {
    const [detail, draft] = await Promise.all([
      getContractWorkflowDetail(accessToken.value, workflowId.value),
      getContractWorkflowDraft(accessToken.value, workflowId.value, {
        offset: 0,
        limit: 1000,
      }),
    ]);
    workflowDetail.value = detail;
    draftItems.value = draft.items || [];

    try {
      reviewPayload.value = await getContractWorkflowReviewPayload(accessToken.value, workflowId.value);
    } catch {
      reviewPayload.value = null;
    }
  } catch (error) {
    console.error(error);
    ElMessage.error("加载人工校验数据失败");
  } finally {
    loading.value = false;
  }
}

async function submitReview() {
  persistCurrentEdit();
  const patches = Object.entries(pendingPatches.value).map(([block_id, translation]) => ({
    block_id,
    translation,
  }));
  if (patches.length === 0) {
    ElMessage.warning("请先至少修改一条译文再提交人工校验");
    return;
  }

  submitting.value = true;
  try {
    await applyContractWorkflowPatch(accessToken.value, workflowId.value, {
      patches,
      resolved_by: "manual",
      comment: "frontend review submit",
    });
    ElMessage.success("人工校验已提交，任务将重新生成译文");
    pendingPatches.value = {};
    router.push(`/doc-translate/task/${encodeURIComponent(workflowId.value)}`);
  } catch (error) {
    console.error(error);
    ElMessage.error("提交人工校验失败");
  } finally {
    submitting.value = false;
  }
}

watch(
  filteredDraftItems,
  (rows) => {
    if (!rows.length) {
      selectedBlockId.value = "";
      currentEditText.value = "";
      return;
    }
    const hit = rows.find((item) => item.block_id === selectedBlockId.value);
    if (!hit) {
      const firstRow = rows[0];
      selectedBlockId.value = firstRow ? firstRow.block_id : "";
    }
  },
  { immediate: true },
);

watch(
  selectedBlockId,
  (blockId) => {
    if (!blockId) {
      currentEditText.value = "";
      return;
    }
    const merged = mergedDraftItems.value.find((item) => item.block_id === blockId);
    currentEditText.value = String(merged?.merged_translation || "");
  },
  { immediate: true },
);

watch(filterMode, () => {
  if (activeTab.value === "translations") {
    persistCurrentEdit();
  }
});

onMounted(() => {
  void loadReviewData();
});
</script>

<template>
  <div class="review-page" v-loading="loading">
    <header class="review-header">
      <div>
        <p class="title-eyebrow">人工校验</p>
        <h2>{{ fileName }}</h2>
      </div>
      <div class="header-actions">
        <el-button @click="router.push(`/doc-translate/task/${encodeURIComponent(workflowId)}`)">返回任务详情</el-button>
        <el-button type="primary" :loading="submitting" @click="submitReview">提交人工校验并重新生成</el-button>
      </div>
    </header>

    <section class="review-panel">
      <div class="review-tabs">
        <button :class="['review-tab', { 'is-active': activeTab === 'translations' }]" type="button" @click="activeTab = 'translations'">
          译文
        </button>
        <button :class="['review-tab', { 'is-active': activeTab === 'patched' }]" type="button" @click="activeTab = 'patched'">
          已修订
          <span v-if="patchedItems.length" class="count-badge">{{ patchedItems.length }}</span>
        </button>
        <button :class="['review-tab', { 'is-active': activeTab === 'notes' }]" type="button" @click="activeTab = 'notes'">
          说明
        </button>
      </div>

      <template v-if="activeTab === 'translations'">
        <div class="review-search">
          <el-input v-model="searchKeyword" placeholder="搜索原文/译文" clearable>
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>

        <div class="filter-row">
          <button :class="['filter-chip', { 'is-active': filterMode === 'all' }]" type="button" @click="filterMode = 'all'">全部</button>
          <button :class="['filter-chip', { 'is-active': filterMode === 'qa' }]" type="button" @click="filterMode = 'qa'">QA 命中</button>
          <button :class="['filter-chip', { 'is-active': filterMode === 'dirty' }]" type="button" @click="filterMode = 'dirty'">已修改</button>
          <button :class="['filter-chip', { 'is-active': filterMode === 'applied' }]" type="button" @click="filterMode = 'applied'">已应用</button>
        </div>

        <div class="review-layout">
          <section class="quick-list-card">
            <div class="quick-list-head">
              <div>
                <h3>块列表（{{ filteredDraftItems.length }}/{{ mergedDraftItems.length }}）</h3>
                <p>QA 块: {{ qaHitCount }} / 已修改: {{ dirtyCount }} / 已应用: {{ appliedCount }}</p>
              </div>
              <el-button circle :icon="RefreshRight" @click="loadReviewData" />
            </div>

            <div class="quick-list-body">
              <button
                v-for="item in filteredDraftItems"
                :key="item.block_id"
                :class="['quick-item', { 'is-active': item.block_id === selectedBlockId }]"
                type="button"
                @click="selectBlock(item.block_id)"
              >
                <strong>#{{ item.block_id }}</strong>
                <span>{{ item.source_text || item.merged_translation || "-" }}</span>
              </button>
            </div>
          </section>

          <section class="editor-card">
            <template v-if="selectedBlock">
              <div class="editor-head">
                <div>
                  <h3>当前块：{{ selectedBlock.block_id }}</h3>
                  <p>可直接调整译文，切换块时会自动保存到本地待提交列表。</p>
                </div>
                <el-button text type="primary" @click="restoreCurrentBlock">还原本块</el-button>
              </div>

              <div class="editor-section">
                <label>原文（只读）</label>
                <div class="source-box">{{ selectedBlock.source_text || "-" }}</div>
              </div>

              <div class="editor-section">
                <div class="section-head">
                  <label>译文（可编辑）</label>
                  <div class="qa-inline">
                    <el-tag v-if="qaSuggestionsByBlockId.get(selectedBlock.block_id)?.length" size="small" type="warning">QA 命中</el-tag>
                    <el-tag v-if="pendingPatches[selectedBlock.block_id]" size="small" type="primary">已修改</el-tag>
                  </div>
                </div>
                <el-input v-model="currentEditText" type="textarea" :rows="8" @blur="persistCurrentEdit" />
              </div>

              <div v-if="selectedBlockSuggestions.length" class="editor-section">
                <label>QA 建议</label>
                <div class="suggestion-list">
                  <button
                    v-for="(suggestion, index) in selectedBlockSuggestions"
                    :key="`${selectedBlock.block_id}-${index}`"
                    class="suggestion-card"
                    type="button"
                    @click="applyCurrentSuggestion(suggestion)"
                  >
                    <strong>{{ suggestion.rule || "QA 建议" }}</strong>
                    <span>{{ suggestionText(suggestion) || "暂无直接建议译文" }}</span>
                  </button>
                </div>
              </div>
            </template>

            <el-empty v-else description="当前没有匹配到可编辑块" />
          </section>
        </div>

        <div class="bottom-bar">
          <div class="bottom-actions">
            <el-button disabled>导出</el-button>
            <el-button disabled>导入</el-button>
          </div>
          <el-button type="primary" :loading="submitting" @click="submitReview">Apply 提交</el-button>
        </div>
      </template>

      <template v-else-if="activeTab === 'patched'">
        <div class="patched-toolbar">
          <p>共 {{ patchedItems.length }} 处修订</p>
          <el-button type="danger" plain @click="clearLocalPatches">清除本地待提交修订</el-button>
        </div>
        <div class="block-list">
          <article v-for="item in patchedItems" :key="`patched-${item.block_id}`" class="block-card patched-card">
            <strong>#{{ item.block_id }}</strong>
            <p class="source-line">{{ item.source_text || "-" }}</p>
            <p class="translation-line">{{ pendingPatches[item.block_id] ?? item.translation ?? "-" }}</p>
          </article>
        </div>
      </template>

      <template v-else>
        <div class="notes-panel">
          <div class="summary-card">
            <h3>校验摘要</h3>
            <p>failures_count: {{ reviewSummary.failures_count ?? 0 }}</p>
            <p>total_hits: {{ reviewSummary.total_hits ?? 0 }}</p>
            <p>sample_block_ids: {{ Array.isArray(reviewSummary.sample_block_ids) ? reviewSummary.sample_block_ids.join(", ") : "-" }}</p>
          </div>

          <div class="note-list">
            <article v-for="(failure, index) in reviewFailures" :key="`${failure.block_id || index}`" class="note-card">
              <div class="note-head">
                <strong>#{{ failure.block_id || index + 1 }}</strong>
                <el-tag size="small" type="warning">{{ failure.rule || reviewPayload?.type || "review" }}</el-tag>
              </div>
              <p>术语 / 关键词：{{ failure.src_surface || failure.src_key || "-" }}</p>
              <p>建议译法：{{ Array.isArray(failure.expected_tgts) ? failure.expected_tgts.join(" / ") : failure.expected_tgt || "-" }}</p>
              <p>当前译文片段：{{ failure.translation_head || "-" }}</p>
            </article>
          </div>
        </div>
      </template>
    </section>
  </div>
</template>

<style scoped>
.review-page {
  display: grid;
  gap: 18px;
}

.review-header,
.review-panel {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.92);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
}

.review-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.title-eyebrow {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--text-500);
}

.review-header h2 {
  margin: 0;
  font-size: 26px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.review-tabs {
  display: flex;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid rgba(103, 80, 164, 0.12);
  padding-bottom: 12px;
}

.review-tab {
  border: 0;
  background: transparent;
  color: var(--text-700);
  font-size: 15px;
  cursor: pointer;
  padding-bottom: 8px;
}

.review-tab.is-active {
  color: var(--brand-500);
  font-weight: 600;
  box-shadow: inset 0 -2px 0 var(--brand-500);
}

.count-badge {
  margin-left: 6px;
  display: inline-block;
  min-width: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: #efe9ff;
  color: var(--brand-500);
  font-size: 12px;
}

.review-search {
  margin-top: 18px;
}

.filter-row {
  margin-top: 14px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.filter-chip {
  border: 1px solid rgba(103, 80, 164, 0.18);
  background: #fff;
  color: var(--text-700);
  border-radius: 14px;
  height: 42px;
  padding: 0 18px;
  cursor: pointer;
}

.filter-chip.is-active {
  background: #dff0ff;
  border-color: #c4e3ff;
  color: #173d61;
  font-weight: 600;
}

.review-layout {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 16px;
}

.quick-list-card,
.editor-card,
.block-card,
.note-card,
.summary-card {
  border: 1px solid rgba(103, 80, 164, 0.1);
  border-radius: 18px;
  padding: 18px;
  background: #fff;
}

.quick-list-head,
.patched-toolbar,
.note-head,
.editor-head,
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.quick-list-head h3,
.editor-head h3,
.summary-card h3 {
  margin: 0 0 8px;
}

.quick-list-head p,
.editor-head p,
.summary-card p,
.note-card p {
  margin: 0;
  color: var(--text-700);
}

.quick-list-body,
.block-list,
.note-list {
  margin-top: 16px;
  display: grid;
  gap: 10px;
  max-height: 58vh;
  overflow: auto;
  padding-right: 4px;
}

.quick-item {
  border: 1px solid rgba(103, 80, 164, 0.1);
  background: #f8fbff;
  border-radius: 14px;
  padding: 12px 14px;
  display: grid;
  gap: 6px;
  text-align: left;
  cursor: pointer;
}

.quick-item strong {
  color: var(--text-900);
}

.quick-item span {
  color: var(--text-700);
  line-height: 1.45;
}

.quick-item.is-active {
  border-color: #b9daf8;
  background: #eef7ff;
}

.editor-card {
  min-height: 0;
  display: grid;
  gap: 18px;
}

.editor-section {
  display: grid;
  gap: 10px;
}

.editor-section label {
  color: var(--text-700);
  font-size: 14px;
}

.source-box {
  min-height: 110px;
  padding: 16px;
  border-radius: 14px;
  background: #f8f9fc;
  color: var(--text-900);
  white-space: pre-wrap;
  line-height: 1.6;
}

.qa-inline {
  display: flex;
  align-items: center;
  gap: 8px;
}

.suggestion-list {
  display: grid;
  gap: 10px;
}

.suggestion-card {
  border: 1px solid rgba(103, 80, 164, 0.1);
  background: #fffdf4;
  border-radius: 14px;
  padding: 12px 14px;
  display: grid;
  gap: 6px;
  text-align: left;
  cursor: pointer;
}

.suggestion-card strong {
  color: #8d6c00;
}

.suggestion-card span {
  color: var(--text-900);
}

.block-card,
.patched-card {
  display: grid;
  gap: 10px;
}

.patched-card {
  background: #eef9ee;
}

.source-line,
.translation-line {
  margin: 0;
  white-space: pre-wrap;
  line-height: 1.65;
}

.translation-line {
  padding: 14px 12px;
  border-radius: 12px;
  background: #edf9ee;
}

.notes-panel {
  margin-top: 18px;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
}

.bottom-bar {
  margin-top: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.bottom-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

@media (max-width: 1100px) {
  .review-header,
  .bottom-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .review-layout,
  .notes-panel {
    grid-template-columns: 1fr;
  }
}
</style>
