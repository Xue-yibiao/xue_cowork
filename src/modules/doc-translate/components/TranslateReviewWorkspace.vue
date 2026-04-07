<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { CircleCheckFilled, Close, Search, WarningFilled } from "@element-plus/icons-vue";

import { useAuthStore } from "../../../stores/auth";
import {
  applyContractWorkflowPatch,
  fetchContractWorkflowArtifactText,
  fetchContractWorkflowReviewIndex,
  getContractWorkflowDetail,
  type ReviewIndexItem,
} from "../api";

type Dict = Record<string, unknown>;
type ReviewTab = "translations" | "patched";
type BlockElementsIndex = Map<string, HTMLElement[]>;

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
const reviewItems = ref<ReviewIndexItem[]>([]);
const sourceHtml = ref("");
const translatedHtml = ref("");
const searchKeyword = ref("");
const pendingPatches = ref<Record<string, string>>({});
const activeBlockId = ref("");
const editingText = ref("");
const reviewDataReady = ref(false);

const sourcePaneRef = ref<HTMLDivElement | null>(null);
const translatedPaneRef = ref<HTMLDivElement | null>(null);
const sourceViewportRef = ref<HTMLDivElement | null>(null);
const translatedViewportRef = ref<HTMLDivElement | null>(null);
const translatedShellRef = ref<HTMLDivElement | null>(null);
const floatingEditorRef = ref<HTMLTextAreaElement | null>(null);
const masterScrollbarRef = ref<HTMLDivElement | null>(null);
const masterScrollbarSpacerRef = ref<HTMLDivElement | null>(null);
const overlayStyle = ref<Record<string, string> | null>(null);

let pollTimer: ReturnType<typeof setInterval> | null = null;
let resizeObserver: ResizeObserver | null = null;
let masterMetricsFrame: number | null = null;
let syncingMasterScroll = false;
let lastMasterScrollbarTop = 0;
let sourceBlockElements: BlockElementsIndex = new Map();
let translatedBlockElements: BlockElementsIndex = new Map();
let dirtyMarkedBlockIds = new Set<string>();
let lastMarkedActiveBlockId = "";
let loadReviewToken = 0;
let postMountSetupFrame: number | null = null;

const workflowStatus = computed(() => String(workflowDetail.value?.status || "-"));
const isEditable = computed(() => workflowStatus.value === "WAIT_REVIEW");
const dirtyCount = computed(() => Object.keys(pendingPatches.value).length);
const reviewReadyNotice = computed(() => {
  if (!isEditable.value) {
    return null;
  }
  if (!reviewDataReady.value) {
    return {
      text: "人工修订数据仍在初始化，请稍候再编辑",
      tone: "warning" as const,
      icon: WarningFilled,
    };
  }
  return {
    text: "人工修订数据已准备就绪，可以开始编辑",
    tone: "success" as const,
    icon: CircleCheckFilled,
  };
});
const reviewItemById = computed(() => {
  const next = new Map<string, ReviewIndexItem>();
  for (const item of reviewItems.value) {
    const blockId = String(item.block_id || "").trim();
    if (!blockId) {
      continue;
    }
    next.set(blockId, item);
  }
  return next;
});
const patchedItems = computed(() =>
  reviewItems.value
    .filter((item) => Object.prototype.hasOwnProperty.call(pendingPatches.value, item.block_id))
    .map((item) => ({
      ...item,
      mergedTranslation: pendingPatches.value[item.block_id],
    })),
);

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function safeSelector(blockId: string) {
  return `[data-block-id="${blockId.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

function normalizeReviewHtml(raw: string) {
  const text = String(raw || "").trim();
  if (!text) {
    return "";
  }
  const styleMatches = Array.from(text.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)).map((match) => match[0]);
  const bodyMatch = text.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch?.[1] || text;
  return `${styleMatches.join("\n")}${body}`;
}

function translationForBlock(blockId: string) {
  const item = reviewItemById.value.get(blockId);
  return String(item?.translation || "");
}

function resetBlockElementIndexes() {
  sourceBlockElements = new Map();
  translatedBlockElements = new Map();
  dirtyMarkedBlockIds = new Set();
  lastMarkedActiveBlockId = "";
}

function buildBlockElementsIndex(host: HTMLElement | null): BlockElementsIndex {
  const next: BlockElementsIndex = new Map();
  if (!host) {
    return next;
  }

  host.querySelectorAll("[data-block-id]").forEach((node) => {
    const el = node as HTMLElement;
    const blockId = String(el.dataset.blockId || "").trim();
    if (!blockId) {
      return;
    }
    const bucket = next.get(blockId);
    if (bucket) {
      bucket.push(el);
      return;
    }
    next.set(blockId, [el]);
  });

  return next;
}

function rebuildBlockElementIndexes() {
  sourceBlockElements = buildBlockElementsIndex(sourcePaneRef.value);
  translatedBlockElements = buildBlockElementsIndex(translatedPaneRef.value);
  dirtyMarkedBlockIds = new Set();
  lastMarkedActiveBlockId = "";
}

function queryBlockElements(host: HTMLElement | null, blockId: string) {
  if (!host || !blockId) {
    return [];
  }
  if (host === sourcePaneRef.value && sourceBlockElements.size) {
    return sourceBlockElements.get(blockId) || [];
  }
  if (host === translatedPaneRef.value && translatedBlockElements.size) {
    return translatedBlockElements.get(blockId) || [];
  }
  return Array.from(host.querySelectorAll(safeSelector(blockId))) as HTMLElement[];
}

function toggleBlockClass(elements: HTMLElement[], className: string, enabled: boolean) {
  for (const el of elements) {
    el.classList.toggle(className, enabled);
  }
}

function scrollBlockWithinViewport(viewport: HTMLElement | null, target: HTMLElement | undefined) {
  if (!viewport || !target) {
    return;
  }
  const viewportRect = viewport.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const desiredTop = viewport.scrollTop + (targetRect.top - viewportRect.top) - Math.max((viewport.clientHeight - targetRect.height) / 2, 64);
  viewport.scrollTo({
    top: Math.max(0, desiredTop),
    behavior: "smooth",
  });
}

function getViewportMaxScrollTop(viewport: HTMLElement | null) {
  if (!viewport) {
    return 0;
  }
  return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
}

function applyMasterScrollbarDelta(delta: number) {
  if (!delta) {
    return;
  }
  syncingMasterScroll = true;
  if (sourceViewportRef.value) {
    sourceViewportRef.value.scrollTop += delta;
  }
  if (translatedViewportRef.value) {
    translatedViewportRef.value.scrollTop += delta;
  }
  syncingMasterScroll = false;

  refreshOverlayLayout();
}

function syncMasterScrollbarMetrics() {
  masterMetricsFrame = null;
  const masterScrollbar = masterScrollbarRef.value;
  const spacer = masterScrollbarSpacerRef.value;
  if (!masterScrollbar || !spacer || activeTab.value !== "translations") {
    return;
  }

  const sourceViewport = sourceViewportRef.value;
  const translatedViewport = translatedViewportRef.value;
  const viewportHeight = Math.max(sourceViewport?.clientHeight || 0, translatedViewport?.clientHeight || 0, masterScrollbar.clientHeight || 0);
  const maxScrollTop = Math.max(getViewportMaxScrollTop(sourceViewport), getViewportMaxScrollTop(translatedViewport));
  spacer.style.height = `${Math.max(viewportHeight + maxScrollTop, viewportHeight, 1)}px`;
  const masterMaxScrollTop = getViewportMaxScrollTop(masterScrollbar);
  if (masterScrollbar.scrollTop > masterMaxScrollTop) {
    syncingMasterScroll = true;
    masterScrollbar.scrollTop = masterMaxScrollTop;
    syncingMasterScroll = false;
  }
  lastMasterScrollbarTop = masterScrollbar.scrollTop;
}

function scheduleMasterScrollbarMetricsSync() {
  if (masterMetricsFrame !== null) {
    cancelAnimationFrame(masterMetricsFrame);
  }
  masterMetricsFrame = window.requestAnimationFrame(() => {
    syncMasterScrollbarMetrics();
  });
}

function queuePostMountSetup(options?: { syncDom?: boolean }) {
  if (postMountSetupFrame !== null) {
    cancelAnimationFrame(postMountSetupFrame);
  }
  postMountSetupFrame = window.requestAnimationFrame(() => {
    postMountSetupFrame = null;
    rebuildBlockElementIndexes();
    if (options?.syncDom) {
      syncDomState();
    }
    scheduleMasterScrollbarMetricsSync();
  });
}

function syncTranslatedBlockText(blockId: string, text: string) {
  const elements = queryBlockElements(translatedPaneRef.value, blockId);
  for (const el of elements) {
    if (el.textContent !== text) {
      el.textContent = text;
    }
  }
}

function restoreTranslatedDomText(blockIds?: Iterable<string>) {
  const ids = blockIds ? Array.from(blockIds) : Object.keys(pendingPatches.value);
  for (const blockId of ids) {
    const item = reviewItemById.value.get(blockId);
    const nextText = pendingPatches.value[blockId] ?? String(item?.translation || "");
    syncTranslatedBlockText(blockId, nextText);
  }
}

function refreshOverlayLayout() {
  const blockId = activeBlockId.value;
  if (!blockId || !translatedShellRef.value || !translatedViewportRef.value || !translatedPaneRef.value) {
    overlayStyle.value = null;
    return;
  }

  const target = queryBlockElements(translatedPaneRef.value, blockId)[0];
  if (!target) {
    overlayStyle.value = null;
    return;
  }

  const shellRect = translatedShellRef.value.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const top = targetRect.top - shellRect.top;
  const left = targetRect.left - shellRect.left;
  const availableWidth = Math.max(200, translatedShellRef.value.clientWidth - left - 20);
  const width = Math.min(Math.max(targetRect.width + 8, 220), availableWidth);
  const minHeight = Math.max(targetRect.height + 8, 84);

  overlayStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${width}px`,
    minHeight: `${minHeight}px`,
  };
}

function syncDirtyMarks() {
  const nextDirtyBlockIds = new Set(Object.keys(pendingPatches.value));

  for (const blockId of dirtyMarkedBlockIds) {
    if (nextDirtyBlockIds.has(blockId)) {
      continue;
    }
    toggleBlockClass(queryBlockElements(sourcePaneRef.value, blockId), "is-review-dirty", false);
    toggleBlockClass(queryBlockElements(translatedPaneRef.value, blockId), "is-review-dirty", false);
  }

  for (const blockId of nextDirtyBlockIds) {
    if (dirtyMarkedBlockIds.has(blockId)) {
      continue;
    }
    toggleBlockClass(queryBlockElements(sourcePaneRef.value, blockId), "is-review-dirty", true);
    toggleBlockClass(queryBlockElements(translatedPaneRef.value, blockId), "is-review-dirty", true);
  }

  dirtyMarkedBlockIds = nextDirtyBlockIds;
}

function syncActiveMarks() {
  const nextActiveBlockId = String(activeBlockId.value || "").trim();
  if (lastMarkedActiveBlockId && lastMarkedActiveBlockId !== nextActiveBlockId) {
    toggleBlockClass(queryBlockElements(sourcePaneRef.value, lastMarkedActiveBlockId), "is-review-active", false);
    toggleBlockClass(queryBlockElements(translatedPaneRef.value, lastMarkedActiveBlockId), "is-review-active", false);
  }

  if (nextActiveBlockId && lastMarkedActiveBlockId !== nextActiveBlockId) {
    toggleBlockClass(queryBlockElements(sourcePaneRef.value, nextActiveBlockId), "is-review-active", true);
    toggleBlockClass(queryBlockElements(translatedPaneRef.value, nextActiveBlockId), "is-review-active", true);
  }

  lastMarkedActiveBlockId = nextActiveBlockId;
}

function syncDomState(options?: { scroll?: boolean; focus?: boolean }) {
  syncDirtyMarks();
  syncActiveMarks();

  if (activeBlockId.value) {
    const sourceEls = queryBlockElements(sourcePaneRef.value, activeBlockId.value);
    const translatedEls = queryBlockElements(translatedPaneRef.value, activeBlockId.value);

    if (options?.scroll) {
      scrollBlockWithinViewport(sourceViewportRef.value, sourceEls[0]);
      scrollBlockWithinViewport(translatedViewportRef.value, translatedEls[0]);
    }
  }

  refreshOverlayLayout();

  if (options?.focus && floatingEditorRef.value) {
    floatingEditorRef.value.focus({ preventScroll: true });
    floatingEditorRef.value.selectionStart = floatingEditorRef.value.value.length;
    floatingEditorRef.value.selectionEnd = floatingEditorRef.value.value.length;
  }
}

function activateBlock(blockId: string, options?: { scroll?: boolean; focus?: boolean }) {
  if (!blockId) {
    return;
  }
  if (!reviewDataReady.value) {
    ElMessage.warning("人工修订数据仍在初始化，请稍候再编辑");
    return;
  }
  if (!isEditable.value) {
    ElMessage.warning("当前任务不在可修订状态");
    return;
  }

  activeBlockId.value = blockId;
  editingText.value = pendingPatches.value[blockId] ?? translationForBlock(blockId);

  nextTick(() => {
    syncDomState({
      scroll: options?.scroll ?? true,
      focus: options?.focus ?? true,
    });
  });
}

function updateEditingValue(value: string) {
  const blockId = activeBlockId.value;
  if (!blockId) {
    return;
  }

  editingText.value = value;
  const baseTranslation = translationForBlock(blockId);
  if (value === baseTranslation) {
    const next = { ...pendingPatches.value };
    delete next[blockId];
    pendingPatches.value = next;
  } else {
    pendingPatches.value = {
      ...pendingPatches.value,
      [blockId]: value,
    };
  }

  syncTranslatedBlockText(blockId, value);
  nextTick(() => {
    syncDomState();
    scheduleMasterScrollbarMetricsSync();
  });
}

function closeOverlay() {
  activeBlockId.value = "";
  overlayStyle.value = null;
}

function onEditorBlur(closedBlockId: string) {
  window.setTimeout(() => {
    if (!closedBlockId || activeBlockId.value !== closedBlockId) {
      return;
    }
    const activeEl = document.activeElement as HTMLElement | null;
    if (activeEl && floatingEditorRef.value && (activeEl === floatingEditorRef.value || floatingEditorRef.value.contains(activeEl))) {
      return;
    }
    closeOverlay();
    nextTick(() => syncDomState());
  }, 0);
}

function clearAllRevisions() {
  const dirtyBlockIds = Object.keys(pendingPatches.value);
  pendingPatches.value = {};
  if (activeBlockId.value) {
    editingText.value = translationForBlock(activeBlockId.value);
  }
  nextTick(() => {
    restoreTranslatedDomText(dirtyBlockIds);
    syncDomState();
    scheduleMasterScrollbarMetricsSync();
  });
  ElMessage.success("已清除所有本地修订");
}

function closePanel() {
  emit("close");
}

function onTranslatedPaneClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const blockEl = target?.closest("[data-block-id]") as HTMLElement | null;
  if (!blockEl) {
    return;
  }
  const blockId = String(blockEl.dataset.blockId || "").trim();
  if (!blockId) {
    return;
  }
  activateBlock(blockId, { scroll: true, focus: true });
}

function jumpToBlock(blockId: string) {
  activeTab.value = "translations";
  nextTick(() => activateBlock(blockId, { scroll: true, focus: true }));
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!activeBlockId.value) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (!target) {
    return;
  }
  if (floatingEditorRef.value && (target === floatingEditorRef.value || floatingEditorRef.value.contains(target))) {
    return;
  }
  if (target.closest("[data-block-id]")) {
    return;
  }
  closeOverlay();
  nextTick(() => syncDomState());
}

function handleTranslatedViewportScroll() {
  if (activeTab.value !== "translations") {
    return;
  }
  refreshOverlayLayout();
}

function handleMasterScrollbarScroll() {
  if (syncingMasterScroll || activeTab.value !== "translations") {
    return;
  }
  const masterScrollbar = masterScrollbarRef.value;
  if (!masterScrollbar) {
    return;
  }
  const delta = masterScrollbar.scrollTop - lastMasterScrollbarTop;
  lastMasterScrollbarTop = masterScrollbar.scrollTop;
  applyMasterScrollbarDelta(delta);
}

async function loadReviewData() {
  if (!normalizedWorkflowId.value) {
    return;
  }

  const token = ++loadReviewToken;
  reviewDataReady.value = false;
  loading.value = true;
  try {
    const detail = await getContractWorkflowDetail(accessToken.value, normalizedWorkflowId.value);
    if (token !== loadReviewToken) {
      return;
    }
    workflowDetail.value = detail;
    if (String(detail.status || "") === "RUNNING") {
      startPolling();
    } else {
      stopPolling();
    }

    const [sourceHtmlText, translatedHtmlText] = await Promise.all([
      fetchContractWorkflowArtifactText(accessToken.value, normalizedWorkflowId.value, "source_review_html"),
      fetchContractWorkflowArtifactText(accessToken.value, normalizedWorkflowId.value, "translated_review_html"),
    ]);
    if (token !== loadReviewToken) {
      return;
    }

    sourceHtml.value = normalizeReviewHtml(sourceHtmlText);
    translatedHtml.value = normalizeReviewHtml(translatedHtmlText);

    await nextTick();
    if (token !== loadReviewToken) {
      return;
    }
    loading.value = false;
    queuePostMountSetup();

    const reviewIndex = await fetchContractWorkflowReviewIndex(accessToken.value, normalizedWorkflowId.value);
    if (token !== loadReviewToken) {
      return;
    }
    reviewItems.value = reviewIndex.items || [];
    reviewDataReady.value = true;
    await nextTick();
    if (token !== loadReviewToken) {
      return;
    }
    queuePostMountSetup({ syncDom: true });
  } catch (error) {
    console.error(error);
    ElMessage.error("加载人工修订 HTML 视图失败");
  } finally {
    if (token === loadReviewToken) {
      loading.value = false;
    }
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
  const patches = Object.entries(pendingPatches.value).map(([block_id, translation]) => ({
    block_id,
    translation,
  }));

  if (!patches.length) {
    ElMessage.warning("请先至少修改一条译文再统一应用");
    return;
  }

  submitting.value = true;
  try {
    await applyContractWorkflowPatch(accessToken.value, normalizedWorkflowId.value, {
      patches,
      resolved_by: "manual",
      comment: "review html pane submit",
    });
    pendingPatches.value = {};
    activeBlockId.value = "";
    editingText.value = "";
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

function handleHeaderMouseDown(event: MouseEvent) {
  if (!props.floating) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, textarea, .el-input, .el-textarea")) {
    return;
  }
  emit("dragStart", event);
}

const filteredPatchedItems = computed(() => {
  const needle = searchKeyword.value.trim().toLowerCase();
  if (!needle) {
    return patchedItems.value;
  }
  return patchedItems.value.filter((item) => {
    const haystack = `${item.block_id} ${item.source_text || ""} ${item.mergedTranslation || ""}`.toLowerCase();
    return haystack.includes(needle);
  });
});

watch(
  () => normalizedWorkflowId.value,
  async () => {
    stopPolling();
    activeTab.value = "translations";
    searchKeyword.value = "";
    activeBlockId.value = "";
    editingText.value = "";
    pendingPatches.value = {};
    reviewItems.value = [];
    sourceHtml.value = "";
    translatedHtml.value = "";
    reviewDataReady.value = false;
    resetBlockElementIndexes();
    await loadReviewData();
  },
  { immediate: true },
);

watch(searchKeyword, async (keyword) => {
  const needle = keyword.trim().toLowerCase();
  if (!needle || activeTab.value !== "translations" || !reviewDataReady.value) {
    return;
  }
  const firstHit = reviewItems.value.find((item) => {
    const haystack = `${item.block_id} ${item.source_text || ""} ${pendingPatches.value[item.block_id] ?? item.translation ?? ""}`.toLowerCase();
    return haystack.includes(needle);
  });
  if (firstHit) {
    activateBlock(firstHit.block_id, { scroll: true, focus: false });
  }
});

watch(activeTab, () => {
  nextTick(() => {
    if (activeTab.value === "translations") {
      rebuildBlockElementIndexes();
    } else {
      resetBlockElementIndexes();
    }
    syncDomState();
    scheduleMasterScrollbarMetricsSync();
  });
});

function handleWindowResize() {
  refreshOverlayLayout();
  scheduleMasterScrollbarMetricsSync();
}

onMounted(() => {
  if (workflowStatus.value === "RUNNING") {
    startPolling();
  }
  window.addEventListener("resize", handleWindowResize);
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);

  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      scheduleMasterScrollbarMetricsSync();
      refreshOverlayLayout();
    });
    [sourceViewportRef.value, translatedViewportRef.value, sourcePaneRef.value, translatedPaneRef.value].forEach((element) => {
      if (element) {
        resizeObserver?.observe(element);
      }
    });
  }
});

onBeforeUnmount(() => {
  stopPolling();
  window.removeEventListener("resize", handleWindowResize);
  document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  resizeObserver?.disconnect();
  resizeObserver = null;
  if (postMountSetupFrame !== null) {
    cancelAnimationFrame(postMountSetupFrame);
    postMountSetupFrame = null;
  }
  if (masterMetricsFrame !== null) {
    cancelAnimationFrame(masterMetricsFrame);
    masterMetricsFrame = null;
  }
});
</script>

<template>
  <div
    class="review-workspace"
    :class="{ 'is-floating': floating, 'is-readonly': !isEditable }"
    v-loading="loading"
  >
    <div class="workspace-topbar" @mousedown="handleHeaderMouseDown">
      <div class="topbar-main">
        <div class="workspace-tabs">
          <button :class="['workspace-tab', { 'is-active': activeTab === 'translations' }]" type="button" @click="activeTab = 'translations'">
            修订
          </button>
          <button :class="['workspace-tab', { 'is-active': activeTab === 'patched' }]" type="button" @click="activeTab = 'patched'">
            已修改
            <span v-if="dirtyCount" class="tab-count">{{ dirtyCount }}</span>
          </button>
        </div>

        <div
          v-if="reviewReadyNotice"
          :class="['topbar-notice', `is-${reviewReadyNotice.tone}`]"
        >
          <el-icon><component :is="reviewReadyNotice.icon" /></el-icon>
          <span>{{ reviewReadyNotice.text }}</span>
        </div>

        <div class="topbar-actions">
          <div class="search-shell topbar-search">
            <el-icon><Search /></el-icon>
            <input v-model="searchKeyword" type="text" placeholder="搜索原文、译文或 block_id" />
          </div>
          <div class="status-chip">{{ workflowStatus }}</div>
        </div>
      </div>

      <button v-if="floating" class="panel-close" type="button" @click="closePanel">
        <el-icon><Close /></el-icon>
      </button>
    </div>

    <div class="workspace-body">
      <div v-if="!isEditable" class="status-banner">
        当前状态为 {{ workflowStatus }}，修订区暂时只读。系统重新生成完成后会自动刷新。
      </div>

      <div v-else class="status-banner is-soft">
        请在右侧译文上点击进行编辑，修改完成后统一应用修改。
      </div>

      <div class="review-main">
        <div class="review-main__content">
          <div class="review-headline">
            <div class="headline-left">
              <span class="headline-subtitle" v-if="activeBlockId">当前块：{{ activeBlockId }}</span>
            </div>
            <div class="headline-right">
              <button v-if="activeTab === 'patched'" type="button" class="ghost-action" :disabled="!dirtyCount" @click="clearAllRevisions">
                清除所有修改
              </button>
              <button type="button" class="primary-action" :disabled="!dirtyCount || !isEditable" @click="submitReview">
                {{ submitting ? "应用中..." : "确认并应用修改" }}
              </button>
            </div>
          </div>

          <template v-if="activeTab === 'translations'">
            <div class="pane-grid">
              <section class="doc-card">
                <header class="doc-card__header">原文</header>
                <div ref="sourceViewportRef" class="doc-card__viewport">
                  <div ref="sourcePaneRef" class="review-html-host" v-html="sourceHtml" />
                </div>
              </section>

              <section class="doc-card">
                <header class="doc-card__header">译文</header>
                <div ref="translatedViewportRef" class="doc-card__viewport" @scroll="handleTranslatedViewportScroll">
                  <div ref="translatedShellRef" class="review-html-shell">
                    <div
                      ref="translatedPaneRef"
                      class="review-html-host review-html-host--editable"
                      v-html="translatedHtml"
                      @click="onTranslatedPaneClick"
                    />

                    <div v-if="overlayStyle && activeBlockId && isEditable" class="floating-editor" :style="overlayStyle">
                      <textarea
                        ref="floatingEditorRef"
                        class="floating-editor__textarea"
                        :value="editingText"
                        @input="updateEditingValue(($event.target as HTMLTextAreaElement).value)"
                        @blur="onEditorBlur(activeBlockId)"
                      />
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </template>

          <template v-else>
            <div class="patched-list">
              <article v-for="item in filteredPatchedItems" :key="item.block_id" class="patched-item">
                <div class="patched-item__meta">{{ item.block_id }}</div>
                <p class="patched-item__source">{{ item.source_text || "-" }}</p>
                <p class="patched-item__translation">{{ item.mergedTranslation || "-" }}</p>
                <button type="button" class="ghost-action" @click="jumpToBlock(item.block_id)">定位到正文</button>
              </article>
              <el-empty v-if="!filteredPatchedItems.length" description="当前还没有本地修改" />
            </div>
          </template>
        </div>

        <aside class="review-rail" :class="{ 'is-active': activeTab === 'translations' }" aria-hidden="true">
          <div v-if="activeTab === 'translations'" ref="masterScrollbarRef" class="review-master-scroll" @scroll="handleMasterScrollbarScroll">
            <div ref="masterScrollbarSpacerRef" class="review-master-scroll__spacer" />
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
.review-workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
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
  min-height: 64px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(103, 80, 164, 0.12);
  user-select: none;
}

.topbar-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.topbar-notice {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 14px;
  flex: 0 1 auto;
  max-width: min(560px, 100%);
  border: 1px solid transparent;
  white-space: nowrap;
}

.topbar-notice.is-warning {
  color: #d58a1e;
  background: rgba(255, 248, 238, 0.96);
  border-color: rgba(239, 182, 89, 0.35);
}

.topbar-notice.is-success {
  color: #2f8f57;
  background: rgba(239, 250, 244, 0.96);
  border-color: rgba(93, 181, 124, 0.32);
}

.workspace-tabs {
  display: flex;
  align-items: center;
  gap: 18px;
  min-width: 0;
  flex-shrink: 0;
}

.workspace-tab,
.panel-close,
.ghost-action,
.primary-action {
  border: 0;
  background: transparent;
  cursor: pointer;
}

.workspace-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 64px;
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

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.search-shell {
  flex: 1 1 320px;
  min-width: 260px;
  max-width: 420px;
  height: 40px;
  padding: 0 12px;
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

.status-chip {
  min-height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  background: #eef3ff;
  color: #5070d7;
  font-size: 12px;
  font-weight: 600;
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
  padding: 14px 20px 18px;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 12px;
  overflow: hidden;
}

.review-main {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 14px;
  gap: 12px;
  overflow: hidden;
}

.review-main__content {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
}

.status-banner {
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(255, 244, 228, 0.9);
  color: #9d6a14;
  font-size: 13px;
}

.status-banner.is-soft {
  background: rgba(236, 241, 255, 0.9);
  color: #4b5f9f;
}

.review-headline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.headline-left,
.headline-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.headline-subtitle {
  font-size: 12px;
  color: #727083;
}

.pane-grid {
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 14px;
  align-items: stretch;
}

.doc-card {
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  border: 1px solid rgba(103, 80, 164, 0.1);
  border-radius: 20px;
  overflow: hidden;
  background: #ffffff;
}

.doc-card__header {
  padding: 14px 18px;
  border-bottom: 1px solid rgba(103, 80, 164, 0.08);
  font-size: 13px;
  font-weight: 700;
  color: #6f6881;
}

.doc-card__viewport {
  min-height: 0;
  height: 100%;
  overflow: auto;
  background: linear-gradient(180deg, #fff 0%, #fcfcff 100%);
}

.review-html-shell {
  position: relative;
  min-height: 100%;
}

.review-html-host {
  min-height: 100%;
  padding: 18px 22px 28px;
  box-sizing: border-box;
}

.review-html-host :deep([data-block-id]) {
  border-radius: 8px;
  transition: background 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}

.review-html-host--editable :deep([data-block-id]) {
  cursor: text;
}

.review-html-host :deep(.is-review-active) {
  background: rgba(92, 124, 255, 0.1);
  box-shadow: inset 0 0 0 1px rgba(92, 124, 255, 0.16);
}

.review-html-host :deep(.is-review-dirty) {
  background: rgba(91, 178, 112, 0.14);
  box-shadow: inset 0 0 0 1px rgba(91, 178, 112, 0.18);
}

.floating-editor {
  position: absolute;
  z-index: 4;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(103, 80, 164, 0.22);
  box-shadow: 0 14px 32px rgba(53, 43, 86, 0.18);
  overflow: hidden;
}

.floating-editor__textarea {
  width: 100%;
  min-height: inherit;
  border: 0;
  outline: none;
  resize: vertical;
  padding: 10px 12px;
  font: inherit;
  color: #2f2c3a;
  line-height: 1.75;
  background: transparent;
}

.patched-list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 12px;
  align-content: start;
  padding-right: 6px;
}

.patched-item {
  padding: 14px 16px;
  border-radius: 16px;
  border: 1px solid rgba(63, 161, 95, 0.14);
  background: rgba(63, 161, 95, 0.04);
}

.patched-item__meta {
  margin-bottom: 8px;
  font-size: 11px;
  color: #8c8798;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.patched-item__source,
.patched-item__translation {
  margin: 0 0 8px;
  line-height: 1.75;
  white-space: pre-wrap;
  color: #2f2c3a;
}

.ghost-action,
.primary-action {
  min-height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 14px;
}

.ghost-action {
  background: rgba(103, 80, 164, 0.08);
  color: #5c566c;
}

.primary-action {
  background: linear-gradient(135deg, #6e56cf 0%, #5c7cff 100%);
  color: #ffffff;
  box-shadow: 0 10px 18px rgba(92, 124, 255, 0.2);
}

.review-rail {
  min-height: 0;
  border-left: 1px solid rgba(103, 80, 164, 0.08);
  display: flex;
  justify-content: center;
}

.review-rail.is-active {
  background: linear-gradient(180deg, rgba(248, 249, 255, 0.95) 0%, rgba(243, 246, 255, 0.98) 100%);
}

.review-master-scroll {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(92, 124, 255, 0.75) transparent;
}

.review-master-scroll::-webkit-scrollbar {
  width: 8px;
}

.review-master-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.review-master-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(92, 124, 255, 0.68);
}

.review-master-scroll__spacer {
  width: 1px;
}

@media (max-width: 720px) {
  .topbar-main,
  .review-headline {
    flex-direction: column;
    align-items: stretch;
  }

  .topbar-notice {
    white-space: normal;
  }

  .pane-grid {
    grid-template-columns: 1fr;
  }

  .review-main {
    grid-template-columns: 1fr;
  }

  .review-rail {
    display: none;
  }
}
</style>
