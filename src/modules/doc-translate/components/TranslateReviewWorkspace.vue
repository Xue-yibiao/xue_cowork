<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { Close, Delete, DocumentCopy, Search } from "@element-plus/icons-vue";

import { useAuthStore } from "../../../stores/auth";
import {
  applyContractWorkflowPatch,
  getContractWorkflowDetail,
  getContractWorkflowDraft,
  getContractWorkflowReviewPayload,
  type WorkflowDraftItem,
} from "../api";

type Dict = Record<string, unknown>;
type ReviewTab = "translations" | "patched";

const props = withDefaults(
  defineProps<{
    workflowId: string;
    floating?: boolean;
  }>(),
  {
    floating: false,
  },
);

const emit = defineEmits<{
  close: [];
  submitted: [];
  dragStart: [event: MouseEvent];
}>();

const authStore = useAuthStore();
const accessToken = computed(() => authStore.accessToken || "");
const normalizedWorkflowId = computed(() => String(props.workflowId || "").trim());

const activeTab = ref<ReviewTab>("translations");
const loading = ref(false);
const submitting = ref(false);
const workflowDetail = ref<Dict | null>(null);
const reviewPayload = ref<Dict | null>(null);
const draftItems = ref<WorkflowDraftItem[]>([]);
const searchKeyword = ref("");
const pendingPatches = ref<Record<string, string>>({});
const editingBlockId = ref("");
const editingText = ref("");
const currentPage = ref(1);
const pageSize = ref(10);
const fontScale = ref(1);
const importInputRef = ref<HTMLInputElement | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;

const workflowStatus = computed(() => String(workflowDetail.value?.status || "-"));
const isEditable = computed(() => workflowStatus.value === "WAIT_REVIEW");
const dirtyCount = computed(() => Object.keys(pendingPatches.value).length);

const qaSuggestionsByBlockId = computed(() => {
  const map = new Map<string, Dict[]>();
  const failures = reviewPayload.value?.failures;
  if (!Array.isArray(failures)) {
    return map;
  }
  for (const failure of failures) {
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

const mergedDraftItems = computed(() =>
  draftItems.value.map((item) => ({
    ...item,
    mergedTranslation: pendingPatches.value[item.block_id] ?? item.translation ?? "",
  })),
);

const revisedItems = computed(() =>
  mergedDraftItems.value.filter((item) => Object.prototype.hasOwnProperty.call(pendingPatches.value, item.block_id)),
);

const filteredDraftItems = computed(() => {
  const needle = searchKeyword.value.trim().toLowerCase();
  if (!needle) {
    return mergedDraftItems.value;
  }
  return mergedDraftItems.value.filter((item) => {
    const haystack = `${item.block_id} ${item.source_text || ""} ${item.translation || ""} ${item.mergedTranslation || ""}`.toLowerCase();
    return haystack.includes(needle);
  });
});

const paginatedDraftItems = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredDraftItems.value.slice(start, start + pageSize.value);
});

const currentPageOffset = computed(() => (currentPage.value - 1) * pageSize.value);
const typographyStyle = computed(() => ({ "--review-font-scale": String(fontScale.value) }));

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function translationForBlock(blockId: string): string {
  const item = draftItems.value.find((row) => row.block_id === blockId);
  return String(item?.translation || "");
}

function isDirty(blockId: string): boolean {
  return Object.prototype.hasOwnProperty.call(pendingPatches.value, blockId);
}

function hasPendingEditChanges(): boolean {
  if (!editingBlockId.value) {
    return false;
  }
  const currentMerged = pendingPatches.value[editingBlockId.value] ?? translationForBlock(editingBlockId.value);
  return editingText.value !== currentMerged;
}

function applyEditingToDirtyMap(options?: { clearAfter?: boolean; silent?: boolean }) {
  const blockId = editingBlockId.value;
  if (!blockId) {
    return;
  }

  const baseTranslation = translationForBlock(blockId);
  if (editingText.value === baseTranslation) {
    const next = { ...pendingPatches.value };
    delete next[blockId];
    pendingPatches.value = next;
  } else {
    pendingPatches.value = {
      ...pendingPatches.value,
      [blockId]: editingText.value,
    };
  }

  if (options?.clearAfter) {
    editingBlockId.value = "";
    editingText.value = "";
  }

  if (!options?.silent) {
    ElMessage.success("已保存当前修订");
  }
}

function beginEditing(blockId: string) {
  if (!isEditable.value) {
    ElMessage.warning("当前任务不在可修订状态");
    return;
  }

  if (editingBlockId.value && editingBlockId.value !== blockId && hasPendingEditChanges()) {
    applyEditingToDirtyMap({ silent: true });
  }

  editingBlockId.value = blockId;
  editingText.value = pendingPatches.value[blockId] ?? translationForBlock(blockId);
  nextTick(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>(".translation-card.is-editing textarea");
    textarea?.focus();
  });
}

function cancelEditing() {
  if (!editingBlockId.value) {
    return;
  }
  editingBlockId.value = "";
  editingText.value = "";
}

function confirmEditing() {
  if (!editingBlockId.value) {
    return;
  }
  applyEditingToDirtyMap({ clearAfter: true });
}

async function copyBaseTranslation() {
  if (!editingBlockId.value) {
    return;
  }
  const baseTranslation = translationForBlock(editingBlockId.value);
  editingText.value = baseTranslation;
  try {
    await navigator.clipboard.writeText(baseTranslation);
    ElMessage.success("已复制原译文");
  } catch {
    ElMessage.success("已恢复原译文");
  }
}

function removeCurrentRevision() {
  if (!editingBlockId.value) {
    return;
  }
  const blockId = editingBlockId.value;
  const next = { ...pendingPatches.value };
  delete next[blockId];
  pendingPatches.value = next;
  editingText.value = translationForBlock(blockId);
  ElMessage.success("已移除当前修订");
}

function clearAllRevisions() {
  pendingPatches.value = {};
  if (editingBlockId.value) {
    editingText.value = translationForBlock(editingBlockId.value);
  }
  ElMessage.success("已清除所有本地修订");
}

function exportRevisions() {
  if (!dirtyCount.value) {
    ElMessage.warning("当前没有可导出的修订");
    return;
  }
  const payload = {
    workflow_id: normalizedWorkflowId.value,
    exported_at: new Date().toISOString(),
    patches: Object.entries(pendingPatches.value).map(([block_id, translation]) => ({ block_id, translation })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${normalizedWorkflowId.value || "review"}-patches.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}

function triggerImport() {
  importInputRef.value?.click();
}

function parseImportedPatches(raw: unknown): Array<{ block_id: string; translation: string }> {
  if (Array.isArray(raw)) {
    return raw
      .map((item) => ({
        block_id: String((item as Dict)?.block_id || "").trim(),
        translation: String((item as Dict)?.translation || ""),
      }))
      .filter((item) => item.block_id);
  }

  if (raw && typeof raw === "object") {
    const dict = raw as Dict;
    if (Array.isArray(dict.patches)) {
      return parseImportedPatches(dict.patches);
    }
    if (Array.isArray(dict.items)) {
      return parseImportedPatches(dict.items);
    }
  }

  return [];
}

async function onImportFileChange(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const content = await file.text();
    const parsed = JSON.parse(content);
    const importedPatches = parseImportedPatches(parsed);
    if (!importedPatches.length) {
      ElMessage.warning("导入文件中没有可识别的修订");
      return;
    }

    const availableIds = new Set(draftItems.value.map((item) => item.block_id));
    const next = { ...pendingPatches.value };
    let applied = 0;
    for (const item of importedPatches) {
      if (!availableIds.has(item.block_id)) {
        continue;
      }
      next[item.block_id] = item.translation;
      applied += 1;
    }

    if (!applied) {
      ElMessage.warning("导入的修订没有匹配到当前任务块");
      return;
    }

    pendingPatches.value = next;
    activeTab.value = "patched";
    ElMessage.success(`已导入 ${applied} 条修订`);
  } catch (error) {
    console.error(error);
    ElMessage.error("导入修订失败，请检查 JSON 格式");
  } finally {
    if (target) {
      target.value = "";
    }
  }
}

function closePanel() {
  if (editingBlockId.value && hasPendingEditChanges()) {
    applyEditingToDirtyMap({ silent: true });
  }
  emit("close");
}

async function loadReviewData() {
  if (!normalizedWorkflowId.value) {
    return;
  }

  loading.value = true;
  try {
    const detail = await getContractWorkflowDetail(accessToken.value, normalizedWorkflowId.value);
    workflowDetail.value = detail;
    if (String(detail.status || "") === "RUNNING") {
      startPolling();
    } else {
      stopPolling();
    }

    const [draft, payload] = await Promise.all([
      getContractWorkflowDraft(accessToken.value, normalizedWorkflowId.value, {
        offset: 0,
        limit: 1000,
      }),
      (detail.status === "WAIT_REVIEW" || detail.review
        ? getContractWorkflowReviewPayload(accessToken.value, normalizedWorkflowId.value).catch(() => null)
        : Promise.resolve(null)) as Promise<Dict | null>,
    ]);

    draftItems.value = draft.items || [];
    reviewPayload.value = payload;
  } catch (error) {
    console.error(error);
    ElMessage.error("加载人工校验数据失败");
  } finally {
    loading.value = false;
  }
}

async function pollWorkflowAfterSubmit() {
  if (!normalizedWorkflowId.value) {
    return;
  }

  try {
    const detail = await getContractWorkflowDetail(accessToken.value, normalizedWorkflowId.value);
    workflowDetail.value = detail;
    const status = String(detail.status || "");
    if (["WAIT_REVIEW", "SUCCEEDED", "FAILED", "CANCELLED"].includes(status)) {
      stopPolling();
      await loadReviewData();
    }
  } catch (error) {
    console.error(error);
  }
}

function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    void pollWorkflowAfterSubmit();
  }, 2500);
}

async function submitReview() {
  if (editingBlockId.value && hasPendingEditChanges()) {
    applyEditingToDirtyMap({ silent: true, clearAfter: true });
  }

  const patches = Object.entries(pendingPatches.value).map(([block_id, translation]) => ({
    block_id,
    translation,
  }));

  if (!patches.length) {
    ElMessage.warning("请先至少修改一条译文再重新生成");
    return;
  }

  submitting.value = true;
  try {
    await applyContractWorkflowPatch(accessToken.value, normalizedWorkflowId.value, {
      patches,
      resolved_by: "manual",
      comment: "floating review submit",
    });
    pendingPatches.value = {};
    activeTab.value = "translations";
    emit("submitted");
    ElMessage.success("修订已提交，正在重新生成译文");
    startPolling();
  } catch (error) {
    console.error(error);
    ElMessage.error("重新生成译文失败");
  } finally {
    submitting.value = false;
  }
}

function decreaseFontScale() {
  fontScale.value = Math.max(0.9, Number((fontScale.value - 0.05).toFixed(2)));
}

function resetFontScale() {
  fontScale.value = 1;
}

function increaseFontScale() {
  fontScale.value = Math.min(1.2, Number((fontScale.value + 0.05).toFixed(2)));
}

function handleHeaderMouseDown(event: MouseEvent) {
  if (!props.floating) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, textarea, .el-input, .el-textarea, .pagination-shell, .translation-toolbar")) {
    return;
  }
  emit("dragStart", event);
}

watch(
  () => normalizedWorkflowId.value,
  async () => {
    stopPolling();
    activeTab.value = "translations";
    searchKeyword.value = "";
    currentPage.value = 1;
    editingBlockId.value = "";
    editingText.value = "";
    pendingPatches.value = {};
    await loadReviewData();
  },
  { immediate: true },
);

watch(searchKeyword, () => {
  if (editingBlockId.value && hasPendingEditChanges()) {
    applyEditingToDirtyMap({ silent: true });
  }
  currentPage.value = 1;
});

watch(pageSize, () => {
  if (editingBlockId.value && hasPendingEditChanges()) {
    applyEditingToDirtyMap({ silent: true });
  }
  currentPage.value = 1;
});

watch(currentPage, () => {
  if (editingBlockId.value && hasPendingEditChanges()) {
    applyEditingToDirtyMap({ silent: true });
  }
  editingBlockId.value = "";
  editingText.value = "";
});

watch(activeTab, () => {
  if (editingBlockId.value && hasPendingEditChanges()) {
    applyEditingToDirtyMap({ silent: true });
  }
  if (activeTab.value !== "translations") {
    editingBlockId.value = "";
    editingText.value = "";
  }
});

watch(
  filteredDraftItems,
  (rows) => {
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize.value));
    if (currentPage.value > totalPages) {
      currentPage.value = totalPages;
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (workflowStatus.value === "RUNNING") {
    startPolling();
  }
});

onBeforeUnmount(() => {
  stopPolling();
});
</script>

<template>
  <div
    class="review-workspace"
    :class="{ 'is-floating': floating, 'is-readonly': !isEditable }"
    :style="typographyStyle"
    v-loading="loading"
  >
    <div class="workspace-topbar" @mousedown="handleHeaderMouseDown">
      <div class="workspace-tabs">
        <button :class="['workspace-tab', { 'is-active': activeTab === 'translations' }]" type="button" @click="activeTab = 'translations'">
          译文
        </button>
        <button :class="['workspace-tab', { 'is-active': activeTab === 'patched' }]" type="button" @click="activeTab = 'patched'">
          已修订
          <span v-if="dirtyCount" class="tab-count">{{ dirtyCount }}</span>
        </button>
      </div>

      <button v-if="floating" class="panel-close" type="button" @click="closePanel">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="workspace-body">
      <div v-if="!isEditable" class="status-banner">
        当前状态为 {{ workflowStatus }}，修订区暂时只读。系统重新生成完成后会自动刷新。
      </div>

      <template v-if="activeTab === 'translations'">
        <div class="translation-toolbar">
          <div class="search-shell">
            <el-icon><Search /></el-icon>
            <input v-model="searchKeyword" type="text" placeholder="输入关键字搜索" />
          </div>

          <div class="toolbar-meta">
            <button type="button" class="meta-button" @click="decreaseFontScale">Aa</button>
            <button type="button" class="meta-button is-active" @click="resetFontScale">ab</button>
            <button type="button" class="meta-button" @click="increaseFontScale">*</button>
            <span class="meta-count">{{ filteredDraftItems.length }}</span>
          </div>
        </div>

        <div class="translation-flow">
          <article
            v-for="(item, index) in paginatedDraftItems"
            :key="item.block_id"
            class="translation-card"
            :class="{
              'is-editing': item.block_id === editingBlockId,
              'is-dirty': isDirty(item.block_id),
            }"
          >
            <div class="card-title">
              <span>#{{ currentPageOffset + index + 1 }}</span>
              <div class="card-badges">
                <span v-if="qaHitSet.has(item.block_id)" class="badge badge-warning">QA</span>
                <span v-if="item.manual_patch_id" class="badge badge-applied">已应用</span>
                <span v-if="isDirty(item.block_id)" class="badge badge-dirty">已修订</span>
              </div>
            </div>

            <p class="card-source">{{ item.source_text || "-" }}</p>

            <div v-if="item.block_id !== editingBlockId" class="card-translation-shell">
              <button
                :class="['card-translation', { 'is-highlighted': isDirty(item.block_id) || Boolean(item.manual_patch_id) }]"
                type="button"
                :disabled="!isEditable"
                @click="beginEditing(item.block_id)"
              >
                {{ item.mergedTranslation || "暂无译文" }}
              </button>
            </div>

            <div v-else class="card-editor">
              <textarea v-model="editingText" rows="5" />
              <p class="editor-hint">\n 代表换行，且只有当原文译文中 \n 数量相同时才生效；尽可能保留 \t 等特殊字符</p>
              <div class="editor-actions">
                <div class="editor-actions-left">
                  <button type="button" class="ghost-action" @click="copyBaseTranslation">
                    <el-icon><DocumentCopy /></el-icon>
                    <span>复制原译文</span>
                  </button>
                  <button type="button" class="icon-action" @click="removeCurrentRevision">
                    <el-icon><Delete /></el-icon>
                  </button>
                </div>
                <div class="editor-actions-right">
                  <button type="button" class="ghost-action" @click="cancelEditing">取消</button>
                  <button type="button" class="primary-action" @click="confirmEditing">确定</button>
                </div>
              </div>
            </div>
          </article>

          <el-empty v-if="!paginatedDraftItems.length" description="没有匹配到可展示的译文块" />
        </div>
      </template>

      <template v-else-if="activeTab === 'patched'">
        <div class="patched-head">
          <p>共 {{ dirtyCount }} 处修订</p>
          <button type="button" class="danger-action" :disabled="!dirtyCount" @click="clearAllRevisions">清除所有修订</button>
        </div>

        <div class="patched-flow">
          <article v-for="(item, index) in revisedItems" :key="`patched-${item.block_id}`" class="patched-card">
            <div class="card-title">
              <span>#{{ index + 1 }}</span>
            </div>
            <p class="card-source">{{ item.source_text || "-" }}</p>
            <div class="patched-translation">{{ item.mergedTranslation || "-" }}</div>
          </article>

          <el-empty v-if="!revisedItems.length" description="当前还没有本地修订" />
        </div>
      </template>

    </div>

    <div class="workspace-footer">
      <div class="footer-actions">
        <button type="button" class="ghost-action" @click="exportRevisions">导出</button>
        <button type="button" class="ghost-action" @click="triggerImport">导入</button>
        <input ref="importInputRef" class="hidden-input" type="file" accept="application/json" @change="onImportFileChange" />
      </div>

      <div class="pagination-shell">
        <el-pagination
          v-if="activeTab === 'translations' && filteredDraftItems.length"
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          background
          layout="prev, pager, next, sizes"
          :page-sizes="[10, 20, 50, 100]"
          :pager-count="5"
          :total="filteredDraftItems.length"
        />
      </div>

      <button type="button" class="submit-action" :disabled="!dirtyCount || !isEditable" @click="submitReview">
        {{ submitting ? "重新生成中..." : "重新生成译文" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.review-workspace {
  --review-font-scale: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  height: 100%;
  min-height: 100%;
  background: #ffffff;
  border-radius: 24px;
  overflow: hidden;
}

.review-workspace.is-floating {
  box-shadow: 0 22px 54px rgba(36, 26, 74, 0.18);
}

.workspace-topbar {
  min-height: 74px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  border-bottom: 1px solid rgba(103, 80, 164, 0.12);
  user-select: none;
}

.workspace-tabs {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px;
  min-width: 0;
}

.workspace-tab,
.panel-close,
.meta-button,
.ghost-action,
.icon-action,
.primary-action,
.danger-action,
.card-translation,
.submit-action {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.workspace-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 74px;
  padding: 0 4px;
  font-size: 16px;
  color: var(--text-700);
  border-bottom: 2px solid transparent;
}

.workspace-tab.is-active {
  color: var(--brand-500);
  font-weight: 600;
  border-bottom-color: var(--brand-500);
}

.tab-count {
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  padding: 0 5px;
  display: inline-grid;
  place-items: center;
  background: #efe9ff;
  color: var(--brand-500);
  font-size: 12px;
}

.panel-close {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  color: var(--text-700);
}

.panel-close:hover {
  background: rgba(103, 80, 164, 0.08);
}

.workspace-body {
  min-height: 0;
  padding: 18px 24px 16px;
  display: grid;
  grid-auto-rows: min-content;
  gap: 16px;
  overflow-y: auto;
  overflow-x: hidden;
}

.status-banner {
  padding: 10px 14px;
  border-radius: 12px;
  background: #fff7d4;
  color: #7a6214;
  font-size: 13px;
}

.translation-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.search-shell {
  flex: 1;
  min-width: 220px;
  height: 42px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(103, 80, 164, 0.18);
  border-radius: 10px;
  color: var(--text-500);
}

.search-shell input {
  border: 0;
  outline: none;
  background: transparent;
  width: 100%;
  color: var(--text-900);
  font-size: 14px;
}

.toolbar-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
  color: var(--text-700);
}

.meta-button {
  padding: 0;
  color: var(--text-700);
  font-size: 14px;
}

.meta-button.is-active {
  text-decoration: underline;
}

.meta-count {
  min-width: 28px;
  text-align: right;
}

.translation-flow,
.patched-flow,
.notes-list {
  min-height: 0;
  overflow: visible;
  padding-right: 6px;
  display: grid;
  gap: 18px;
  align-content: start;
}

.translation-card,
.patched-card,
.summary-card,
.note-card {
  display: grid;
  gap: 10px;
  font-size: calc(15px * var(--review-font-scale));
}

.card-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  font-weight: 500;
  color: #34303f;
}

.card-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
}

.badge-warning {
  background: #fff5e0;
  color: #c78000;
}

.badge-applied {
  background: #eef2ff;
  color: #4a63c7;
}

.badge-dirty {
  background: #e8f7eb;
  color: #2f8f47;
}

.card-source {
  margin: 0;
  padding-left: 12px;
  color: #6e6a78;
  white-space: pre-wrap;
  line-height: 1.7;
}

.card-translation-shell {
  padding-left: 12px;
}

.card-translation,
.patched-translation {
  width: 100%;
  padding: 12px 14px;
  border-radius: 6px;
  background: #f6f7fb;
  color: #38334a;
  text-align: left;
  white-space: pre-wrap;
  line-height: 1.75;
}

.card-translation.is-highlighted,
.patched-translation {
  background: #eaf8ea;
  color: #2f3a33;
}

.card-translation:disabled {
  cursor: not-allowed;
  opacity: 0.78;
}

.translation-card.is-editing .card-translation-shell {
  display: none;
}

.card-editor {
  padding-left: 12px;
  display: grid;
  gap: 12px;
}

.card-editor textarea {
  width: 100%;
  min-height: 112px;
  border-radius: 6px;
  border: 1px solid #7856ff;
  outline: none;
  resize: vertical;
  padding: 14px;
  font: inherit;
  color: var(--text-900);
}

.editor-hint {
  margin: 0;
  color: #7a7588;
  font-size: 13px;
}

.editor-actions,
.patched-head,
.workspace-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
}

.editor-actions-left,
.editor-actions-right,
.footer-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.ghost-action,
.primary-action,
.danger-action,
.submit-action,
.icon-action {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 6px;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.ghost-action,
.icon-action {
  background: #f1f1f1;
  color: #625c6d;
}

.icon-action {
  width: 40px;
  padding: 0;
}

.primary-action {
  background: #edf9ed;
  color: #70a96d;
}

.danger-action {
  background: transparent;
  color: #ff6f52;
  border: 1px solid rgba(255, 111, 82, 0.55);
}

.notes-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
}

.summary-card,
.note-card {
  border: 1px solid rgba(103, 80, 164, 0.1);
  border-radius: 16px;
  padding: 18px;
  background: #fff;
}

.summary-card h3 {
  margin: 0 0 10px;
}

.summary-card p,
.note-card p {
  margin: 0;
  color: var(--text-700);
  line-height: 1.6;
}

.patched-head p {
  margin: 0;
  color: #686270;
}

.workspace-footer {
  flex-shrink: 0;
  padding: 14px 24px 18px;
  border-top: 1px solid rgba(103, 80, 164, 0.12);
  background: #ffffff;
}

.pagination-shell {
  flex: 1 1 260px;
  min-width: 0;
  display: flex;
  justify-content: center;
}

.submit-action {
  min-width: 140px;
  background: rgba(110, 86, 207, 0.12);
  color: var(--brand-500);
}

.submit-action:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.hidden-input {
  display: none;
}

@media (max-width: 1100px) {
  .workspace-body,
  .workspace-footer {
    padding-left: 18px;
    padding-right: 18px;
  }

  .translation-toolbar,
  .workspace-footer,
  .editor-actions {
    grid-template-columns: 1fr;
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-meta,
  .footer-actions {
    justify-content: space-between;
  }

  .pagination-shell {
    justify-content: flex-start;
  }
}
</style>
