<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Download, Plus, Upload } from "@element-plus/icons-vue";
import type { UploadProps } from "element-plus";

import { useAuthStore } from "../../../stores/auth";
import {
  createTermbaseEntry,
  createTermbaseSet,
  deleteTermbaseEntry,
  deleteTermbaseSet,
  importTermbaseCsv,
  listTermbaseEntries,
  listTermbaseSets,
  updateTermbaseEntry,
  updateTermbaseSet,
  type TermbaseEntryItem,
  type TermbaseSetItem,
} from "../api";

type DialogMode = "create" | "edit";

const authStore = useAuthStore();
const accessToken = computed(() => authStore.accessToken || "");

const langOptions = [
  { label: "英文", value: "en" },
  { label: "简体中文", value: "zh" },
];

const setOptions = ref<TermbaseSetItem[]>([]);
const loadingSets = ref(false);
const selectedSetId = ref<number | null>(null);

const entryItems = ref<TermbaseEntryItem[]>([]);
const entryLoading = ref(false);
const entryKeyword = ref("");
const entryActive = ref<"" | "true" | "false">("true");
const entryPage = ref(1);
const entryPageSize = ref(20);
const entryTotal = ref(0);

const setDialogVisible = ref(false);
const setDialogMode = ref<DialogMode>("create");
const setDialogSubmitting = ref(false);
const editingSetId = ref<number | null>(null);
const setForm = ref({
  set_name: "",
  src_lang: "en",
  tgt_lang: "zh",
  description: "",
  visibility: "private",
  is_active: true,
});

const entryDialogVisible = ref(false);
const entryDialogMode = ref<DialogMode>("create");
const entryDialogSubmitting = ref(false);
const editingEntryId = ref<number | null>(null);
const entryForm = ref({
  src_lang: "en",
  tgt_lang: "zh",
  src_raw: "",
  tgt: "",
  priority: 100,
  match_mode: "substring",
  case_sensitive: false,
  is_safe: true,
  notes: "",
  is_active: true,
});

const importDialogVisible = ref(false);
const importDialogSubmitting = ref(false);
const importFile = ref<File | null>(null);
const importForm = ref({
  set_name: "",
  src_lang: "en",
  tgt_lang: "zh",
  description: "",
  visibility: "private",
  bidirectional: true,
});

const currentSet = computed(() => setOptions.value.find((item) => Number(item.id) === Number(selectedSetId.value)) || null);

function resetSetForm() {
  setForm.value = {
    set_name: "",
    src_lang: currentSet.value?.src_lang || "en",
    tgt_lang: currentSet.value?.tgt_lang || "zh",
    description: "",
    visibility: currentSet.value?.visibility || "private",
    is_active: true,
  };
}

function resetEntryForm() {
  entryForm.value = {
    src_lang: currentSet.value?.src_lang || "en",
    tgt_lang: currentSet.value?.tgt_lang || "zh",
    src_raw: "",
    tgt: "",
    priority: 100,
    match_mode: "substring",
    case_sensitive: false,
    is_safe: true,
    notes: "",
    is_active: true,
  };
}

function resetImportForm() {
  importForm.value = {
    set_name: currentSet.value?.name || "",
    src_lang: currentSet.value?.src_lang || "en",
    tgt_lang: currentSet.value?.tgt_lang || "zh",
    description: currentSet.value?.description || "",
    visibility: currentSet.value?.visibility || "private",
    bidirectional: true,
  };
  importFile.value = null;
}

async function loadSets() {
  loadingSets.value = true;
  try {
    const items = await listTermbaseSets(accessToken.value);
    setOptions.value = items;
    const exists = items.some((item) => Number(item.id) === Number(selectedSetId.value));
    if (!exists) {
      const firstItem = items[0];
      selectedSetId.value = firstItem ? Number(firstItem.id) : null;
    }
  } catch (error) {
    console.error(error);
    ElMessage.error("加载术语库失败");
  } finally {
    loadingSets.value = false;
  }
}

async function loadEntries() {
  if (!selectedSetId.value) {
    entryItems.value = [];
    entryTotal.value = 0;
    return;
  }

  entryLoading.value = true;
  try {
    const offset = (entryPage.value - 1) * entryPageSize.value;
    const isActiveParam = entryActive.value === "true" ? true : entryActive.value === "false" ? false : undefined;
    const resp = await listTermbaseEntries(accessToken.value, Number(selectedSetId.value), {
      q: entryKeyword.value.trim() || undefined,
      is_active: isActiveParam,
      limit: entryPageSize.value,
      offset,
    });
    entryItems.value = resp.items || [];
    entryTotal.value = Number(resp.total || 0);
  } catch (error) {
    console.error(error);
    ElMessage.error("加载术语条目失败");
  } finally {
    entryLoading.value = false;
  }
}

function openCreateSetDialog() {
  setDialogMode.value = "create";
  editingSetId.value = null;
  resetSetForm();
  setDialogVisible.value = true;
}

function openEditSetDialog() {
  if (!currentSet.value) {
    ElMessage.warning("请先选择术语库");
    return;
  }
  setDialogMode.value = "edit";
  editingSetId.value = Number(currentSet.value.id);
  setForm.value = {
    set_name: currentSet.value.name,
    src_lang: currentSet.value.src_lang || "en",
    tgt_lang: currentSet.value.tgt_lang || "zh",
    description: String(currentSet.value.description || ""),
    visibility: currentSet.value.visibility || "private",
    is_active: currentSet.value.is_active === false ? false : true,
  };
  setDialogVisible.value = true;
}

async function submitSetDialog() {
  const setName = setForm.value.set_name.trim();
  if (!setName) {
    ElMessage.warning("术语库名称不能为空");
    return;
  }

  setDialogSubmitting.value = true;
  try {
    if (setDialogMode.value === "create") {
      const resp = await createTermbaseSet(accessToken.value, {
        set_name: setName,
        src_lang: setForm.value.src_lang,
        tgt_lang: setForm.value.tgt_lang,
        description: setForm.value.description.trim() || undefined,
        visibility: setForm.value.visibility,
      });
      selectedSetId.value = Number(resp.item?.id || 0) || selectedSetId.value;
      ElMessage.success("术语库创建成功");
    } else {
      if (!editingSetId.value) {
        return;
      }
      await updateTermbaseSet(accessToken.value, editingSetId.value, {
        set_name: setName,
        src_lang: setForm.value.src_lang,
        tgt_lang: setForm.value.tgt_lang,
        description: setForm.value.description.trim() || undefined,
        visibility: setForm.value.visibility,
        is_active: setForm.value.is_active,
      });
      ElMessage.success("术语库更新成功");
    }

    setDialogVisible.value = false;
    await loadSets();
    await loadEntries();
  } catch (error) {
    console.error(error);
    ElMessage.error(setDialogMode.value === "create" ? "创建术语库失败" : "更新术语库失败");
  } finally {
    setDialogSubmitting.value = false;
  }
}

async function handleDeleteSet() {
  if (!currentSet.value) {
    ElMessage.warning("请先选择术语库");
    return;
  }

  try {
    await ElMessageBox.confirm(`确认停用术语库“${currentSet.value.name}”？`, "停用术语库", {
      type: "warning",
      confirmButtonText: "确认停用",
      cancelButtonText: "取消",
    });
    await deleteTermbaseSet(accessToken.value, Number(currentSet.value.id));
    ElMessage.success("术语库已停用");
    await loadSets();
    await loadEntries();
  } catch (error) {
    if ((error as { message?: string })?.message?.includes("cancel")) {
      return;
    }
    console.error(error);
    ElMessage.error("停用术语库失败");
  }
}

function openCreateEntryDialog() {
  if (!selectedSetId.value) {
    ElMessage.warning("请先创建术语库");
    return;
  }
  entryDialogMode.value = "create";
  editingEntryId.value = null;
  resetEntryForm();
  entryDialogVisible.value = true;
}

function openEditEntryDialog(row: TermbaseEntryItem) {
  entryDialogMode.value = "edit";
  editingEntryId.value = Number(row.id);
  entryForm.value = {
    src_lang: String(row.src_lang || currentSet.value?.src_lang || "en"),
    tgt_lang: String(row.tgt_lang || currentSet.value?.tgt_lang || "zh"),
    src_raw: String(row.src_raw || ""),
    tgt: String(row.tgt || ""),
    priority: Number(row.priority ?? 100),
    match_mode: String(row.match_mode || "substring"),
    case_sensitive: Boolean(row.case_sensitive),
    is_safe: row.is_safe === false ? false : true,
    notes: String(row.notes || ""),
    is_active: row.is_active === false ? false : true,
  };
  entryDialogVisible.value = true;
}

async function submitEntryDialog() {
  if (!selectedSetId.value) {
    return;
  }
  const srcRaw = entryForm.value.src_raw.trim();
  const tgt = entryForm.value.tgt.trim();
  if (!srcRaw || !tgt) {
    ElMessage.warning("原文和译文都不能为空");
    return;
  }

  entryDialogSubmitting.value = true;
  try {
    if (entryDialogMode.value === "create") {
      await createTermbaseEntry(accessToken.value, Number(selectedSetId.value), {
        src_lang: entryForm.value.src_lang,
        tgt_lang: entryForm.value.tgt_lang,
        src_raw: srcRaw,
        tgt,
        priority: Number(entryForm.value.priority || 100),
        match_mode: entryForm.value.match_mode,
        case_sensitive: entryForm.value.case_sensitive,
        is_safe: entryForm.value.is_safe,
        notes: entryForm.value.notes.trim() || undefined,
      });
      ElMessage.success("术语条目新增成功");
    } else {
      if (!editingEntryId.value) {
        return;
      }
      await updateTermbaseEntry(accessToken.value, Number(editingEntryId.value), {
        src_lang: entryForm.value.src_lang,
        tgt_lang: entryForm.value.tgt_lang,
        src_raw: srcRaw,
        tgt,
        priority: Number(entryForm.value.priority || 100),
        match_mode: entryForm.value.match_mode,
        case_sensitive: entryForm.value.case_sensitive,
        is_safe: entryForm.value.is_safe,
        notes: entryForm.value.notes.trim() || undefined,
        is_active: entryForm.value.is_active,
      });
      ElMessage.success("术语条目更新成功");
    }
    entryDialogVisible.value = false;
    await loadEntries();
  } catch (error) {
    console.error(error);
    ElMessage.error(entryDialogMode.value === "create" ? "新增术语条目失败" : "更新术语条目失败");
  } finally {
    entryDialogSubmitting.value = false;
  }
}

async function handleDeleteEntry(row: TermbaseEntryItem) {
  try {
    await ElMessageBox.confirm("删除后将把该条目标记为不活跃，是否继续？", "删除术语", {
      type: "warning",
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
    });
    await deleteTermbaseEntry(accessToken.value, Number(row.id));
    ElMessage.success("术语条目已删除");
    await loadEntries();
  } catch (error) {
    if ((error as { message?: string })?.message?.includes("cancel")) {
      return;
    }
    console.error(error);
    ElMessage.error("删除术语条目失败");
  }
}

function openImportDialog() {
  resetImportForm();
  importDialogVisible.value = true;
}

const beforeUploadCsv: UploadProps["beforeUpload"] = (rawFile) => {
  const filename = String(rawFile.name || "").toLowerCase();
  if (!filename.endsWith(".csv")) {
    ElMessage.error("当前导入接口仅支持 .csv 文件");
    return false;
  }
  importFile.value = rawFile;
  return false;
};

const onCsvRemove: UploadProps["onRemove"] = () => {
  importFile.value = null;
};

async function submitImportDialog() {
  const file = importFile.value;
  if (!file) {
    ElMessage.warning("请先选择要导入的 CSV 文件");
    return;
  }
  const setName = importForm.value.set_name.trim();
  if (!setName) {
    ElMessage.warning("术语库名称不能为空");
    return;
  }

  importDialogSubmitting.value = true;
  try {
    const resp = await importTermbaseCsv(accessToken.value, {
      file,
      set_name: setName,
      src_lang: importForm.value.src_lang,
      tgt_lang: importForm.value.tgt_lang,
      description: importForm.value.description.trim() || undefined,
      visibility: importForm.value.visibility,
      bidirectional: importForm.value.bidirectional,
    });
    selectedSetId.value = Number(resp.item?.id || 0) || selectedSetId.value;
    importDialogVisible.value = false;
    ElMessage.success("术语表导入成功");
    await loadSets();
    await loadEntries();
  } catch (error) {
    console.error(error);
    ElMessage.error("导入术语表失败");
  } finally {
    importDialogSubmitting.value = false;
  }
}

function formatDateTime(v: unknown): string {
  if (v === null || v === undefined || v === "") {
    return "-";
  }
  const text = String(v);
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? text : d.toLocaleString();
}

onMounted(async () => {
  await loadSets();
  await loadEntries();
});
</script>

<template>
  <div class="glossary-page">
    <section class="glossary-toolbar">
      <div class="toolbar-left">
        <el-select v-model="selectedSetId" class="set-selector" :loading="loadingSets" @change="() => { entryPage = 1; loadEntries(); }">
          <el-option
            v-for="item in setOptions"
            :key="item.id"
            :label="item.name"
            :value="item.id"
          />
        </el-select>
        <button class="action-link" type="button" @click="openCreateSetDialog">添加术语表</button>
      </div>

      <div class="toolbar-right">
        <el-button :icon="Plus" @click="openEditSetDialog">编辑术语库</el-button>
        <el-button :icon="Upload" @click="openImportDialog">从表格导入</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateEntryDialog">添加术语</el-button>
      </div>
    </section>

    <section class="glossary-body">
      <el-empty v-if="!selectedSetId" description="还没有术语表">
        <template #image>
          <div class="glossary-empty-icon">术</div>
        </template>
        <p class="empty-tip">术语库适合维护公司名、产品名、人名或专业词汇，翻译时会自动辅助一致性。</p>
        <div class="empty-actions">
          <el-button type="primary" @click="openCreateSetDialog">添加术语表</el-button>
          <el-button :icon="Upload" @click="openImportDialog">从表格导入</el-button>
        </div>
      </el-empty>

      <template v-else>
        <div class="glossary-summary">
          <div>
            <h2>{{ currentSet?.name }}</h2>
            <p>{{ currentSet?.description || "当前术语表已接入文档翻译与文本翻译流程。" }}</p>
          </div>

          <div class="summary-tags">
            <el-tag>{{ currentSet?.src_lang || "-" }} -> {{ currentSet?.tgt_lang || "-" }}</el-tag>
            <el-tag :type="currentSet?.is_active === false ? 'info' : 'success'">{{ currentSet?.is_active === false ? "停用" : "活跃" }}</el-tag>
          </div>
        </div>

        <div class="entry-filters">
          <el-input v-model="entryKeyword" placeholder="搜索术语原文/译文" clearable @keyup.enter="() => { entryPage = 1; loadEntries(); }" />
          <el-select v-model="entryActive" style="width: 160px">
            <el-option label="仅活跃" value="true" />
            <el-option label="仅停用" value="false" />
            <el-option label="全部" value="" />
          </el-select>
          <el-button @click="() => { entryPage = 1; loadEntries(); }">查询</el-button>
          <el-button @click="handleDeleteSet">停用术语库</el-button>
        </div>

        <el-empty v-if="!entryLoading && entryItems.length === 0" description="当前术语表还没有术语">
          <template #image>
            <div class="glossary-empty-icon soft">语</div>
          </template>
          <div class="empty-actions">
            <el-button type="primary" @click="openCreateEntryDialog">添加术语</el-button>
            <el-button :icon="Download">下载模板</el-button>
          </div>
        </el-empty>

        <el-table v-else :data="entryItems" border size="small" :loading="entryLoading">
          <el-table-column prop="src_raw" label="原文术语" min-width="220" />
          <el-table-column prop="tgt" label="译文术语" min-width="220" />
          <el-table-column label="语言" width="160">
            <template #default="{ row }">{{ row.src_lang || "-" }} -> {{ row.tgt_lang || "-" }}</template>
          </el-table-column>
          <el-table-column prop="priority" label="优先级" width="100" />
          <el-table-column label="更新时间" min-width="170">
            <template #default="{ row }">{{ formatDateTime(row.updated_at) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
            <template #default="{ row }">
              <div class="row-actions">
                <el-button link type="primary" @click="openEditEntryDialog(row)">编辑</el-button>
                <el-button link type="danger" @click="handleDeleteEntry(row)">删除</el-button>
              </div>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager-row">
          <el-pagination
            v-model:current-page="entryPage"
            v-model:page-size="entryPageSize"
            layout="total, sizes, prev, pager, next"
            :page-sizes="[10, 20, 50, 100]"
            :total="entryTotal"
            @current-change="loadEntries"
            @size-change="() => { entryPage = 1; loadEntries(); }"
          />
        </div>
      </template>
    </section>

    <el-dialog v-model="setDialogVisible" :title="setDialogMode === 'create' ? '新建术语库' : '编辑术语库'" width="560px">
      <el-form label-width="92px">
        <el-form-item label="名称">
          <el-input v-model="setForm.set_name" maxlength="120" />
        </el-form-item>
        <el-form-item label="源语言">
          <el-select v-model="setForm.src_lang">
            <el-option v-for="item in langOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标语言">
          <el-select v-model="setForm.tgt_lang">
            <el-option v-for="item in langOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="setForm.description" type="textarea" :rows="3" maxlength="200" show-word-limit />
        </el-form-item>
        <el-form-item label="状态" v-if="setDialogMode === 'edit'">
          <el-switch v-model="setForm.is_active" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="setDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="setDialogSubmitting" @click="submitSetDialog">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="entryDialogVisible" :title="entryDialogMode === 'create' ? '添加术语' : '编辑术语'" width="700px">
      <el-form label-width="90px">
        <div class="form-grid">
          <el-form-item label="源语言">
            <el-select v-model="entryForm.src_lang">
              <el-option v-for="item in langOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="目标语言">
            <el-select v-model="entryForm.tgt_lang">
              <el-option v-for="item in langOptions" :key="item.value" :label="item.label" :value="item.value" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="原文">
          <el-input v-model="entryForm.src_raw" maxlength="500" show-word-limit />
        </el-form-item>
        <el-form-item label="译文">
          <el-input v-model="entryForm.tgt" maxlength="500" show-word-limit />
        </el-form-item>
        <div class="form-grid">
          <el-form-item label="优先级">
            <el-input-number v-model="entryForm.priority" :min="1" :max="999999" style="width: 100%" />
          </el-form-item>
          <el-form-item label="匹配模式">
            <el-select v-model="entryForm.match_mode">
              <el-option label="substring" value="substring" />
              <el-option label="exact" value="exact" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-grid">
          <el-form-item label="区分大小写">
            <el-switch v-model="entryForm.case_sensitive" />
          </el-form-item>
          <el-form-item label="安全词条">
            <el-switch v-model="entryForm.is_safe" />
          </el-form-item>
        </div>
        <el-form-item v-if="entryDialogMode === 'edit'" label="是否活跃">
          <el-switch v-model="entryForm.is_active" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="entryForm.notes" type="textarea" :rows="3" maxlength="300" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="entryDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="entryDialogSubmitting" @click="submitEntryDialog">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importDialogVisible" title="导入术语" width="860px">
      <div class="import-dialog">
        <el-upload
          drag
          :auto-upload="false"
          accept=".csv,text/csv"
          :before-upload="beforeUploadCsv"
          :on-remove="onCsvRemove"
        >
          <el-icon class="import-icon"><Upload /></el-icon>
          <div class="import-title">上传 `.csv` 术语文件</div>
          <div class="import-note">当前合同翻译新接口使用 `import-csv`，前端入口与独立术语页工作流保持一致。</div>
        </el-upload>

        <el-form label-width="92px">
          <el-form-item label="术语库名称">
            <el-input v-model="importForm.set_name" />
          </el-form-item>
          <div class="form-grid">
            <el-form-item label="源语言">
              <el-select v-model="importForm.src_lang">
                <el-option v-for="item in langOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="目标语言">
              <el-select v-model="importForm.tgt_lang">
                <el-option v-for="item in langOptions" :key="item.value" :label="item.label" :value="item.value" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item label="说明">
            <el-input v-model="importForm.description" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item label="双向导入">
            <el-switch v-model="importForm.bidirectional" />
          </el-form-item>
        </el-form>
      </div>
      <template #footer>
        <el-button @click="importDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="importDialogSubmitting" @click="submitImportDialog">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.glossary-page {
  display: grid;
  gap: 18px;
}

.glossary-toolbar,
.glossary-body {
  border: 1px solid rgba(103, 80, 164, 0.12);
  background: rgba(255, 255, 255, 0.88);
  border-radius: 24px;
  padding: 24px;
  box-shadow: var(--shadow-soft);
}

.glossary-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.toolbar-left,
.toolbar-right,
.empty-actions,
.row-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.set-selector {
  width: 240px;
}

.action-link {
  border: 0;
  background: transparent;
  color: var(--brand-500);
  cursor: pointer;
}

.glossary-summary {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}

.glossary-summary h2 {
  margin: 0 0 8px;
  font-size: 26px;
}

.glossary-summary p {
  margin: 0;
  color: var(--text-500);
}

.summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.entry-filters {
  margin: 20px 0;
  display: grid;
  grid-template-columns: 1fr 160px auto auto;
  gap: 12px;
}

.pager-row {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}

.glossary-empty-icon {
  width: 92px;
  height: 92px;
  margin: 0 auto;
  border-radius: 24px;
  display: grid;
  place-items: center;
  background: #f2efff;
  color: var(--brand-500);
  font-size: 38px;
  font-weight: 700;
}

.glossary-empty-icon.soft {
  background: #f8f7ff;
  color: #a89ccc;
}

.empty-tip {
  margin: 0 0 16px;
  color: var(--text-500);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.import-dialog {
  display: grid;
  gap: 20px;
}

.import-icon {
  font-size: 36px;
  color: var(--brand-500);
}

.import-title {
  font-size: 20px;
  color: var(--text-900);
}

.import-note {
  margin-top: 8px;
  color: var(--text-500);
}

@media (max-width: 1024px) {
  .glossary-toolbar,
  .toolbar-left,
  .toolbar-right {
    flex-direction: column;
    align-items: stretch;
  }

  .entry-filters {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .glossary-toolbar,
  .glossary-body {
    padding: 18px;
    border-radius: 18px;
  }

  .glossary-summary,
  .form-grid {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>
