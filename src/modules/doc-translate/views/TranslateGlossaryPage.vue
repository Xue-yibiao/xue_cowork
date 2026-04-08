<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Download, Plus, Edit, Upload } from "@element-plus/icons-vue";
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
type TranslationPairValue = "en_zh" | "zh_en" | "es_zh" | "zh_es" | "it_zh" | "zh_it" | "ru_zh" | "zh_ru";
type CsvImportPairValue = "en_zh" | "zh_en";
const downloadExcel = () => {
  const link = document.createElement('a')
  link.href = '/files/template.xlsx'
  link.download = '数据模板.xlsx'
  link.click()
}
const authStore = useAuthStore();
const accessToken = computed(() => authStore.accessToken || "");
const isTermbaseAdmin = computed(() => {
  const roleSet = new Set(authStore.user?.roles || []);
  return roleSet.has("admin") || roleSet.has("super_admin");
});

const translationPairOptions: Array<{ label: string; value: TranslationPairValue; src_lang: string; tgt_lang: string }> = [
  { label: "英文 -> 简体中文", value: "en_zh", src_lang: "en", tgt_lang: "zh" },
  { label: "简体中文 -> 英文", value: "zh_en", src_lang: "zh", tgt_lang: "en" },
  { label: "西班牙语 -> 简体中文", value: "es_zh", src_lang: "es", tgt_lang: "zh" },
  { label: "简体中文 -> 西班牙语", value: "zh_es", src_lang: "zh", tgt_lang: "es" },
  { label: "意大利语 -> 简体中文", value: "it_zh", src_lang: "it", tgt_lang: "zh" },
  { label: "简体中文 -> 意大利语", value: "zh_it", src_lang: "zh", tgt_lang: "it" },
  { label: "俄文 -> 简体中文", value: "ru_zh", src_lang: "ru", tgt_lang: "zh" },
  { label: "简体中文 -> 俄文", value: "zh_ru", src_lang: "zh", tgt_lang: "ru" },
];

const csvImportPairOptions: Array<{ label: string; value: CsvImportPairValue; src_lang: "en" | "zh"; tgt_lang: "en" | "zh" }> = [
  { label: "英文 -> 简体中文", value: "en_zh", src_lang: "en", tgt_lang: "zh" },
  { label: "简体中文 -> 英文", value: "zh_en", src_lang: "zh", tgt_lang: "en" },
];

const defaultTranslationPairOption = translationPairOptions[0]!;
const defaultCsvImportPairOption = csvImportPairOptions[0]!;

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
  lang_pair: "en_zh" as TranslationPairValue,
  description: "",
  visibility: "private",
  is_active: true,
});

const entryDialogVisible = ref(false);
const entryDialogMode = ref<DialogMode>("create");
const entryDialogSubmitting = ref(false);
const editingEntryId = ref<number | null>(null);
const entryForm = ref({
  lang_pair: "en_zh" as TranslationPairValue,
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
  lang_pair: "zh_en" as CsvImportPairValue,
  description: "",
  visibility: "private",
  bidirectional: true,
});

const currentSet = computed(() => setOptions.value.find((item) => Number(item.id) === Number(selectedSetId.value)) || null);

function canViewTermbaseSet(item: TermbaseSetItem): boolean {
  if (isTermbaseAdmin.value) {
    return true;
  }
  return String(item.visibility || "private").toLowerCase() !== "public";
}

function getTranslationPairConfig(value: TranslationPairValue) {
  return translationPairOptions.find((item) => item.value === value) || defaultTranslationPairOption;
}

function getCsvImportPairConfig(value: CsvImportPairValue) {
  return csvImportPairOptions.find((item) => item.value === value) || defaultCsvImportPairOption;
}

function toTranslationPairValue(srcLang?: string | null, tgtLang?: string | null): TranslationPairValue {
  const pair = translationPairOptions.find((item) => item.src_lang === srcLang && item.tgt_lang === tgtLang);
  return pair?.value || "en_zh";
}

function toCsvImportPairValue(srcLang?: string | null, tgtLang?: string | null): CsvImportPairValue {
  const pair = csvImportPairOptions.find((item) => item.src_lang === srcLang && item.tgt_lang === tgtLang);
  return pair?.value || "zh_en";
}

function formatTranslationPairLabel(srcLang?: string | null, tgtLang?: string | null): string {
  const pair = translationPairOptions.find((item) => item.src_lang === srcLang && item.tgt_lang === tgtLang);
  if (pair) {
    return pair.label;
  }
  const src = srcLang || "-";
  const tgt = tgtLang || "-";
  return `${src} -> ${tgt}`;
}

function resetSetForm() {
  setForm.value = {
    set_name: "",
    lang_pair: toTranslationPairValue(currentSet.value?.src_lang, currentSet.value?.tgt_lang),
    description: "",
    visibility: currentSet.value?.visibility || "private",
    is_active: true,
  };
}

function resetEntryForm() {
  entryForm.value = {
    lang_pair: toTranslationPairValue(currentSet.value?.src_lang, currentSet.value?.tgt_lang),
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
    lang_pair: toCsvImportPairValue(currentSet.value?.src_lang, currentSet.value?.tgt_lang),
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
    const visibleItems = items.filter(canViewTermbaseSet);
    setOptions.value = visibleItems;
    const exists = visibleItems.some((item) => Number(item.id) === Number(selectedSetId.value));
    if (!exists) {
      const firstItem = visibleItems[0];
      selectedSetId.value = firstItem ? Number(firstItem.id) : null;
    }
  } catch (error) {
    console.error(error);
    ElMessage.error("加载词库失败");
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
    ElMessage.warning("请先选择词库");
    return;
  }
  setDialogMode.value = "edit";
  editingSetId.value = Number(currentSet.value.id);
  setForm.value = {
    set_name: currentSet.value.name,
    lang_pair: toTranslationPairValue(currentSet.value.src_lang, currentSet.value.tgt_lang),
    description: String(currentSet.value.description || ""),
    visibility: currentSet.value.visibility || "private",
    is_active: currentSet.value.is_active === false ? false : true,
  };
  setDialogVisible.value = true;
}

async function submitSetDialog() {
  const setName = setForm.value.set_name.trim();
  if (!setName) {
    ElMessage.warning("词库名称不能为空");
    return;
  }
  const langPair = getTranslationPairConfig(setForm.value.lang_pair);

  setDialogSubmitting.value = true;
  try {
    if (setDialogMode.value === "create") {
      const resp = await createTermbaseSet(accessToken.value, {
        set_name: setName,
        src_lang: langPair.src_lang,
        tgt_lang: langPair.tgt_lang,
        description: setForm.value.description.trim() || undefined,
        visibility: setForm.value.visibility,
      });
      selectedSetId.value = Number(resp.item?.id || 0) || selectedSetId.value;
      ElMessage.success("词库创建成功");
    } else {
      if (!editingSetId.value) {
        return;
      }
      await updateTermbaseSet(accessToken.value, editingSetId.value, {
        set_name: setName,
        src_lang: langPair.src_lang,
        tgt_lang: langPair.tgt_lang,
        description: setForm.value.description.trim() || undefined,
        visibility: setForm.value.visibility,
        is_active: setForm.value.is_active,
      });
      ElMessage.success("词库更新成功");
    }

    setDialogVisible.value = false;
    await loadSets();
    await loadEntries();
  } catch (error) {
    console.error(error);
    ElMessage.error(setDialogMode.value === "create" ? "创建词库失败" : "更新词库失败");
  } finally {
    setDialogSubmitting.value = false;
  }
}

async function handleDeleteSet() {
  if (!currentSet.value) {
    ElMessage.warning("请先选择词库");
    return;
  }

  try {
    await ElMessageBox.confirm(`确认停用词库“${currentSet.value.name}”？`, "停用词库", {
      type: "warning",
      confirmButtonText: "确认停用",
      cancelButtonText: "取消",
    });
    await deleteTermbaseSet(accessToken.value, Number(currentSet.value.id));
    ElMessage.success("词库已停用");
    await loadSets();
    await loadEntries();
  } catch (error) {
    if ((error as { message?: string })?.message?.includes("cancel")) {
      return;
    }
    console.error(error);
    ElMessage.error("停用词库失败");
  }
}

function openCreateEntryDialog() {
  if (!selectedSetId.value) {
    ElMessage.warning("请先创建词库");
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
    lang_pair: toTranslationPairValue(row.src_lang, row.tgt_lang),
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
  const langPair = getTranslationPairConfig(entryForm.value.lang_pair);

  entryDialogSubmitting.value = true;
  try {
    if (entryDialogMode.value === "create") {
      await createTermbaseEntry(accessToken.value, Number(selectedSetId.value), {
        src_lang: langPair.src_lang,
        tgt_lang: langPair.tgt_lang,
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
        src_lang: langPair.src_lang,
        tgt_lang: langPair.tgt_lang,
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
    ElMessage.warning("词库名称不能为空");
    return;
  }
  const langPair = getCsvImportPairConfig(importForm.value.lang_pair);

  importDialogSubmitting.value = true;
  try {
    const resp = await importTermbaseCsv(accessToken.value, {
      file,
      set_name: setName,
      src_lang: langPair.src_lang,
      tgt_lang: langPair.tgt_lang,
      description: importForm.value.description.trim() || undefined,
      visibility: importForm.value.visibility,
      bidirectional: importForm.value.bidirectional,
    });
    selectedSetId.value = Number(resp.item?.id || 0) || selectedSetId.value;
    importDialogVisible.value = false;
    ElMessage.success("词库导入成功");
    await loadSets();
    await loadEntries();
  } catch (error) {
    console.error(error);
    ElMessage.error("导入词库失败");
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
        <el-select v-model="selectedSetId" class="set-selector" :loading="loadingSets"
          @change="() => { entryPage = 1; loadEntries(); }">
          <el-option v-for="item in setOptions" :key="item.id" :label="item.name" :value="item.id" />
        </el-select>
        <!-- <button class="action-link" type="button" @click="openCreateSetDialog">新建词库</button> -->
        <el-button :icon="Plus" @click="openCreateSetDialog">添加新词库</el-button>
        <el-button :icon="Edit" @click="openEditSetDialog">重命名词库</el-button>
      </div>

      <!-- <div class="toolbar-right">
        
        <el-button :icon="Upload" @click="openImportDialog">从表格导入</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreateEntryDialog">添加术语</el-button>
      </div> -->
    </section>

    <section class="glossary-body">
      <el-empty v-if="!selectedSetId" description="还没有词库">
        <template #image>
          <div class="glossary-empty-icon">术</div>
        </template>
        <p class="empty-tip">词库适合维护公司名、产品名、人名或专业词汇，翻译时会自动辅助一致性。</p>
        <div class="empty-actions">
          <el-button type="primary" @click="openCreateSetDialog">新建词库</el-button>
          <el-button :icon="Upload" @click="openImportDialog">从表格导入</el-button>
        </div>
      </el-empty>

      <template v-else>
        <div class="glossary-summary">
          <div>
            <h2>{{ currentSet?.name }}</h2>
            <p>{{ currentSet?.description || "当前词库已接入文档翻译与文本翻译流程。" }}</p>
          </div>
          <div class="summary-tags">
            <el-tag>{{ formatTranslationPairLabel(currentSet?.src_lang, currentSet?.tgt_lang) }}</el-tag>
            <el-tag :type="currentSet?.is_active === false ? 'info' : 'success'">{{ currentSet?.is_active === false ?
              "停用" : "活跃" }}</el-tag>
          </div>
        </div>

        <div class="entry-filters">
          <el-input v-model="entryKeyword" placeholder="搜索术语原文/译文" clearable
            @keyup.enter="() => { entryPage = 1; loadEntries(); }" />
          <el-select v-model="entryActive" style="width: 160px">
            <el-option label="仅活跃" value="true" />
            <el-option label="仅停用" value="false" />
            <el-option label="全部" value="" />
          </el-select>

          <el-button @click="() => { entryPage = 1; loadEntries(); }">查询</el-button>
          <el-button @click="handleDeleteSet">停用词库</el-button>
          <el-button :icon="Upload" @click="openImportDialog">从表格导入</el-button>
          <el-button type="primary" :icon="Plus" @click="openCreateEntryDialog">添加术语</el-button>
        </div>

        <el-empty v-if="!entryLoading && entryItems.length === 0" description="当前词库还没有术语">
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
            <template #default="{ row }">{{ formatTranslationPairLabel(row.src_lang, row.tgt_lang) }}</template>
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
          <el-pagination v-model:current-page="entryPage" v-model:page-size="entryPageSize"
            layout="total, sizes, prev, pager, next" :page-sizes="[10, 20, 50, 100]" :total="entryTotal"
            @current-change="loadEntries" @size-change="() => { entryPage = 1; loadEntries(); }" />
        </div>
      </template>
    </section>

    <el-dialog v-model="setDialogVisible" :title="setDialogMode === 'create' ? '添加新词库' : '重命名词库'" width="560px">
      <el-form label-width="92px">
        <el-form-item label="名称">
          <el-input v-model="setForm.set_name" maxlength="120" />
        </el-form-item>
        <el-form-item label="翻译方向">
          <el-select v-model="setForm.lang_pair">
            <el-option v-for="item in translationPairOptions" :key="item.value" :label="item.label"
              :value="item.value" />
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
          <el-form-item label="翻译方向">
            <el-select v-model="entryForm.lang_pair">
              <el-option v-for="item in translationPairOptions" :key="item.value" :label="item.label"
                :value="item.value" />
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
        <el-upload drag :auto-upload="false" accept=".csv,text/csv" :before-upload="beforeUploadCsv"
          :on-remove="onCsvRemove">
          <el-icon class="import-icon">
            <Upload />
          </el-icon>
          <div class="import-title">上传 `.csv` 术语文件</div>
          <div class="import-note">上传格式为csv，模版从下方下载</div>
        </el-upload>
        <el-button :icon="Download" @click="downloadExcel"  class="Download-btn">下载模板</el-button>
        <el-form label-width="92px">
          <el-form-item label="词库名称">
            <el-input v-model="importForm.set_name" />
          </el-form-item>
          <div class="form-grid">
            <el-form-item label="翻译方向">
              <el-select v-model="importForm.lang_pair">
                <el-option v-for="item in csvImportPairOptions" :key="item.value" :label="item.label"
                  :value="item.value" />
              </el-select>
            </el-form-item>
          </div>
          <el-form-item label="导入限制">
            <div class="import-limit-note">CSV 导入当前仅支持中英双语列；其他语言术语请先用手工创建方式维护。</div>
          </el-form-item>
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
  max-width: 1600px;
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
  /* grid-template-columns: 1fr 160px auto auto auto auto; */
  grid-template-columns: 1fr 160px auto auto auto auto;
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

.import-limit-note {
  color: var(--text-500);
  line-height: 1.6;
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
.Download-btn {
  width: 120px; 
  color: #fff;
  background-color: #1890ff;
}
</style>
