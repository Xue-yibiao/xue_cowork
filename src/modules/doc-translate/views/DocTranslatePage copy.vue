<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowUp } from "@element-plus/icons-vue";
import type { UploadInstance, UploadProps, UploadUserFile } from "element-plus";

import { useAuthStore } from "../../../stores/auth";
import {
  listTermbaseSets,
  queryContractWorkflows,
  submitContractDocx,
  submitContractText,
  type TermbaseSetItem,
  type WorkflowQueryItem,
} from "../api";

// 表删实隐列表
import { updateContractWorkflow } from "../api";
import {  Delete } from "@element-plus/icons-vue";

type WorkspaceMode = "upload" | "text";

const authStore = useAuthStore();
const router = useRouter();
const accessToken = computed(() => authStore.accessToken || "");

const workspaceMode = ref<WorkspaceMode>("upload");
const srcLang = ref("en");
const tgtLang = ref("zh");

const enableTb = ref(true);
const tbSetId = ref<number | null>(null);
const tbSetOptions = ref<TermbaseSetItem[]>([]);
const loadingTb = ref(false);

const uploadRef = ref<UploadInstance>();
const uploadList = ref<UploadUserFile[]>([]);
const selectedDocx = ref<File | null>(null);
const submittingDoc = ref(false);
const submittingText = ref(false);
const textInput = ref("");

const recentLoading = ref(false);
const recentItems = ref<WorkflowQueryItem[]>([]);

// const langOptions = [
//   { label: "英文", value: "en" },
//   { label: "简体中文", value: "zh" },
// ];
// 语言对选项（支持所有语言组合）
const languagePairs = [
  { label: "英文 → 简体中文", value: "en->zh" },
  { label: "简体中文 → 英文", value: "zh->en" },
];
const selectedPair = ref("en->zh"); // 默认英文 → 简体中文

// 监听语言方向变化，同步更新源语言和目标语言
// watch(selectedPair, (newPair) => {
//   const [src, tgt] = newPair.split("->");
//   srcLang.value = src;
//   tgtLang.value = tgt;
// });
watch(selectedPair, (newPair) => {
  const parts = newPair.split("->");
  if (parts.length >= 2) {
    // 由于启用了 noUncheckedIndexedAccess，使用非空断言
    const src = parts[0]!;
    const tgt = parts[1]!;
    srcLang.value = src;
    tgtLang.value = tgt;
  }
});

function isDocxFilename(name: string): boolean {
  return String(name || "").trim().toLowerCase().endsWith(".docx");
}

async function loadTermbaseOptions() {
  loadingTb.value = true;
  try {
    const items = await listTermbaseSets(accessToken.value, {
      src_lang: srcLang.value,
      tgt_lang: tgtLang.value,
    });
    tbSetOptions.value = items;
    const hasCurrent = items.some((item) => Number(item.id) === Number(tbSetId.value));
    if (!hasCurrent) {
      const firstItem = items[0];
      tbSetId.value = firstItem ? Number(firstItem.id) : null;
    }
  } catch (error) {
    console.error(error);
    tbSetOptions.value = [];
    tbSetId.value = null;
    ElMessage.error("加载术语表失败");
  } finally {
    loadingTb.value = false;
  }
}

async function loadRecentTasks() {
  recentLoading.value = true;
  try {
    const resp = await queryContractWorkflows(accessToken.value, {
      limit: 6,
      offset: 0,
    });
    recentItems.value = resp.items || [];
  } catch (error) {
    console.error(error);
    ElMessage.error("加载最近任务失败");
  } finally {
    recentLoading.value = false;
  }
}


// 隐藏任务（调用后端更新接口，设置 is_hidden = true）
async function hideRecentTask(workflowId: string) {
  try {
    // 调用更新接口，将 is_hidden 设置为 true
    await updateContractWorkflow(accessToken.value, workflowId, { is_hidden: true });
    
    // 从当前列表中移除该任务
    const index = recentItems.value.findIndex(item => item.workflow_id === workflowId);
    if (index !== -1) {
      recentItems.value.splice(index, 1);
    }
    // 不弹出任何提示，静默完成
  } catch (error) {
    console.error('隐藏任务失败', error);
    // 可选：静默失败或简单提示，根据需求决定
    // ElMessage.error('操作失败，请稍后重试');
  }
}







function openTask(row: WorkflowQueryItem) {
  const workflowId = String(row.workflow_id || "").trim();
  if (!workflowId) {
    return;
  }
  router.push(`/doc-translate/task/${encodeURIComponent(workflowId)}`);
}

function openHistory() {
  router.push("/doc-translate/history");
}

function openGlossary() {
  router.push("/doc-translate/glossary");
}

const beforeUploadDocx: UploadProps["beforeUpload"] = (rawFile) => {
  if (!isDocxFilename(rawFile.name)) {
    ElMessage.error("当前前端仅支持上传 .docx 文件");
    return false;
  }
  return false;
};

const handleUploadChange: UploadProps["onChange"] = (file, files) => {
  const raw = file.raw as File | undefined;
  if (!raw || !isDocxFilename(raw.name)) {
    selectedDocx.value = null;
    uploadList.value = [];
    uploadRef.value?.clearFiles();
    return;
  }
  selectedDocx.value = raw;
  uploadList.value = files.slice(-1);
};

const handleUploadRemove: UploadProps["onRemove"] = () => {
  selectedDocx.value = null;
};

const handleUploadExceed: UploadProps["onExceed"] = () => {
  ElMessage.warning("一次仅支持上传 1 个 docx 文件");
};

async function handleSubmitDocx() {
  const file = selectedDocx.value;
  if (!file) {
    ElMessage.warning("请先选择 .docx 文件");
    return;
  }

  submittingDoc.value = true;
  try {
    const resp = await submitContractDocx(accessToken.value, {
      file,
      src_lang: srcLang.value,
      tgt_lang: tgtLang.value,
      
      enable_tb: enableTb.value,
      tb_set_id: tbSetId.value,
    });
    ElMessage.success(`任务已提交：${resp.workflow_id}`);
    selectedDocx.value = null;
    uploadList.value = [];
    uploadRef.value?.clearFiles();
    await loadRecentTasks();
  } catch (error) {
    console.error(error);
    ElMessage.error("提交文档翻译失败");
  } finally {
    submittingDoc.value = false;
  }
}

async function handleSubmitText() {
  const text = textInput.value.trim();
  if (!text) {
    ElMessage.warning("请输入待翻译文本");
    return;
  }

  submittingText.value = true;
  try {
    const resp = await submitContractText(accessToken.value, {
      text,
      src_lang: srcLang.value,
      tgt_lang: tgtLang.value,
      enable_tb: enableTb.value,
      tb_set_id: tbSetId.value,
     
    });
    ElMessage.success(`文本任务已提交：${resp.workflow_id}`);
    textInput.value = "";
    await loadRecentTasks();
  } catch (error) {
    console.error(error);
    ElMessage.error("提交文本翻译失败");
  } finally {
    submittingText.value = false;
  }
}

function formatUnixTs(v: unknown): string {
  const n = Number(v || 0);
  if (!Number.isFinite(n) || n <= 0) {
    return "-";
  }
  return new Date(n * 1000).toLocaleString();
}

watch([srcLang, tgtLang], () => {
  void loadTermbaseOptions();
});

onMounted(async () => {
  await loadTermbaseOptions();
  await loadRecentTasks();
});
</script>

<template>
  <div class="translate-page">
    <section class="compose-panel">
      <div class="mode-switch">
        <button :class="['mode-pill', { 'is-active': workspaceMode === 'upload' }]" type="button" @click="workspaceMode = 'upload'">
          文档翻译
        </button>
        <button :class="['mode-pill', { 'is-active': workspaceMode === 'text' }]" type="button" @click="workspaceMode = 'text'">
          语句翻译
        </button>
      </div>

      <!-- <div class="translate-setting">
        <el-select v-model="srcLang" placeholder="源语言">
          <el-option v-for="item in langOptions" :key="`src-${item.value}`" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="tgtLang" placeholder="目标语言">
          <el-option v-for="item in langOptions" :key="`tgt-${item.value}`" :label="item.label" :value="item.value" />
        </el-select>
        <el-checkbox v-model="enableTb">使用术语表</el-checkbox>
        <el-select v-model="tbSetId" placeholder="选择术语表" clearable :disabled="!enableTb || loadingTb">
          <el-option v-for="item in tbSetOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <button class="glossary-link" type="button" @click="openGlossary">管理术语表</button>
      </div> -->
<div class="translate-settings">
  <!-- 原来的两个 select 删除，替换为一个语言方向选择器 -->
  <el-select v-model="selectedPair" placeholder="语言方向">
    <el-option
      v-for="item in languagePairs"
      :key="item.value"
      :label="item.label"
      :value="item.value"
    />
  </el-select>

  <!-- <el-checkbox v-model="enableTb">使用术语表</el-checkbox>
  <el-select
    v-model="tbSetId"
    placeholder="选择术语表"
    clearable
    :disabled="!enableTb || loadingTb"
  >
    <el-option
      v-for="item in tbSetOptions"
      :key="item.id"
      :label="item.name"
      :value="item.id"
    />
  </el-select> -->
  <button class="glossary-link" type="button" @click="openGlossary">
    管理术语表
  </button>
</div>
      <div class="compose-board">
        <template v-if="workspaceMode === 'upload'">
          <el-upload
            ref="uploadRef"
            v-model:file-list="uploadList"
            class="upload-zone"
            drag
            :auto-upload="false"
            :limit="1"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            :before-upload="beforeUploadDocx"
            :on-change="handleUploadChange"
            :on-remove="handleUploadRemove"
            :on-exceed="handleUploadExceed"
          >
            <el-icon class="upload-icon"><ArrowUp /></el-icon>
            <div class="upload-title">点击选择或拖拽文件到这里</div>
            <div class="upload-note">
              当前前端只允许 `.docx`，后端兼容扩展保持不收窄。
            </div>
          </el-upload>

          <p class="helper-note">文件不能超过 2048MB</p>
          <el-button type="primary" class="submit-btn" :loading="submittingDoc" @click="handleSubmitDocx">
            开始翻译
          </el-button>
        </template>

        <template v-else>
          <el-input
            v-model="textInput"
            class="text-input"
            type="textarea"
            :rows="18"
            maxlength="120000"
            show-word-limit
            placeholder="输入你要翻译的文本（Shift+Enter 换行）"
          />
          <div class="text-actions">
            <el-button type="primary" class="submit-btn" :loading="submittingText" @click="handleSubmitText">开始翻译</el-button>
          </div>
        </template>
      </div>
    </section>

    <aside class="recent-panel">
      <div class="recent-header">
        <div>
          <h3>您之前上传的文档</h3>
          <p>点击任务进入原文/译文预览与人工校验页面</p>
        </div>
        <button class="more-link" type="button" @click="openHistory">查看更多</button>
      </div>

      <div v-if="recentItems.length === 0 && !recentLoading" class="recent-empty">
        <p>还没有历史任务，提交一次翻译后会出现在这里。</p>
      </div>

      <div v-else class="recent-list" v-loading="recentLoading">
        <!-- <button
          v-for="row in recentItems"
          :key="row.workflow_id"
          class="recent-item"
          type="button"
          @click="openTask(row)"
        >
          <div class="recent-meta">
            <div class="file-dot">W</div>
            <div class="recent-copy">
              <p class="recent-name">{{ row.source_filename || row.workflow_id }}</p>
              <p class="recent-sub">{{ formatUnixTs(row.updated_at || row.created_at) }}</p>
            </div>
          </div>
          <el-tag
            size="small"
            :type="row.status === 'SUCCEEDED' ? 'success' : row.status === 'WAIT_REVIEW' ? 'warning' : row.status === 'FAILED' ? 'danger' : 'info'"
          >
            {{ row.status || "-" }}
          </el-tag>
        </button> -->
        <button
  v-for="row in recentItems"
  :key="row.workflow_id"
  class="recent-item"
  type="button"
  @click="openTask(row)"
>
  <div class="recent-meta">
    <div class="file-dot">W</div>
    <div class="recent-copy">
      <p class="recent-name">{{ row.source_filename || row.workflow_id }}</p>
      <p class="recent-sub">{{ formatUnixTs(row.updated_at || row.created_at) }}</p>
    </div>
  </div>
  <div class="recent-actions">
    <el-tag
      size="small"
      :type="row.status === 'SUCCEEDED' ? 'success' : row.status === 'WAIT_REVIEW' ? 'warning' : row.status === 'FAILED' ? 'danger' : 'info'"
    >
      {{ row.status || "-" }}
    </el-tag>
    <el-button
      class="hide-btn"
      size="small"
      text
      @click.stop="hideRecentTask(row.workflow_id)"
    >
      <el-icon><Delete /></el-icon>
    </el-button>
  </div>
</button>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.translate-page {
  min-height: calc(100vh - 140px);
  display: grid;
  grid-template-columns: minmax(0, 1fr) 420px;
  gap: 20px;
}

.compose-panel,
.recent-panel {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.88);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
}

.compose-panel {
  display: grid;
  gap: 20px;
}

.mode-switch {
  margin: 0 auto;
  padding: 4px;
  border-radius: 14px;
  background: #f5f2ff;
  display: inline-flex;
  gap: 4px;
}

.mode-pill {
  border: 0;
  background: transparent;
  height: 36px;
  padding: 0 18px;
  border-radius: 10px;
  color: var(--text-700);
  cursor: pointer;
}

.mode-pill.is-active {
  background: #fff;
  color: var(--brand-500);
  font-weight: 600;
}

.translate-settings {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.glossary-link,
.more-link {
  border: 0;
  background: transparent;
  color: var(--brand-500);
  cursor: pointer;
}

.compose-board {
  flex: 1;
  min-height: 560px;
  display: grid;
  place-items: center;
}

.upload-zone {
  width: min(600px, 100%);
}

.upload-zone :deep(.el-upload-dragger) {
  border: 2px dashed rgba(131, 105, 239, 0.55);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(245, 242, 255, 0.9) 0%, rgba(250, 248, 255, 0.94) 100%);
  padding: 68px 36px;
}

.upload-icon {
  font-size: 40px;
  color: var(--brand-500);
  margin-bottom: 14px;
}

.upload-title {
  font-size: 22px;
  color: var(--text-900);
}

.upload-note,
.helper-note {
  margin: 14px 0 0;
  text-align: center;
  color: var(--text-500);
}

.submit-btn {
  margin-top: 22px;
  height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--brand-500), var(--brand-400));
  border: 0;
}

.text-input {
  width: 100%;
}

.text-input :deep(.el-textarea__inner) {
  min-height: 520px !important;
  border-radius: 22px;
  padding: 24px;
  border-color: rgba(103, 80, 164, 0.24);
  box-shadow: none;
}

.text-actions {
  display: flex;
  justify-content: flex-end;
}

.recent-panel {
  display: grid;
  align-content: start;
  gap: 16px;
}

.recent-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.recent-header h3 {
  margin: 0 0 8px;
  font-size: 20px;
}

.recent-header p {
  margin: 0;
  color: var(--text-500);
  font-size: 13px;
}

.recent-list {
  display: grid;
  gap: 10px;
}

.recent-item {
  width: 100%;
  border: 1px solid rgba(103, 80, 164, 0.1);
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
  min-width: 0;
}

.recent-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.file-dot {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: #e8f0ff;
  color: #2b65d9;
  font-size: 12px;
  font-weight: 700;
}

.recent-copy {
  flex: 1;
  min-width: 0;
}

.recent-name,
.recent-sub {
  margin: 0;
  text-align: left;
}

.recent-name {
  color: var(--text-900);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.recent-item :deep(.el-tag) {
  flex-shrink: 0;
  max-width: 92px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-sub {
  margin-top: 4px;
  color: var(--text-500);
  font-size: 12px;
}

.recent-empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  text-align: center;
  color: var(--text-500);
}

@media (max-width: 1200px) {
  .translate-page {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .compose-panel,
  .recent-panel {
    padding: 18px;
    border-radius: 18px;
  }

  .translate-settings {
    flex-direction: column;
    align-items: stretch;
  }
}
/* 让删除按钮悬停时出现 */
.recent-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.hide-btn {
  opacity: 0;
  transition: opacity 0.2s;
}

.recent-item:hover .hide-btn {
  opacity: 1;
}

</style>
