import { http } from "../../shared/http";

type Dict = Record<string, unknown>;
type AuthHeaders = Partial<Record<"Authorization", string>>;

interface TermbaseSetItem {
  id: number;
  name: string;
  src_lang?: string;
  tgt_lang?: string;
  version?: number;
  visibility?: string;
  is_owner?: boolean;
  description?: string | null;
  is_active?: boolean | null;
}

interface TermbaseEntryItem {
  id: number;
  set_id: number;
  category_id?: number | null;
  src_lang?: string | null;
  tgt_lang?: string | null;
  src_raw?: string | null;
  src_key?: string | null;
  tgt?: string | null;
  priority?: number | null;
  match_mode?: string | null;
  case_sensitive?: boolean | null;
  is_safe?: boolean | null;
  notes?: string | null;
  source_seq?: number | null;
  is_active?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface TermbaseEntryListResponse {
  set?: Dict;
  items: TermbaseEntryItem[];
  total: number;
  limit: number;
  offset: number;
}

interface TermbaseEntryCreatePayload {
  src_lang: string;
  tgt_lang: string;
  src_raw: string;
  tgt: string;
  category_id?: number;
  priority?: number;
  match_mode?: string;
  case_sensitive?: boolean;
  is_safe?: boolean;
  notes?: string;
  source_seq?: number;
}

interface TermbaseEntryUpdatePayload {
  src_lang?: string;
  tgt_lang?: string;
  src_raw?: string;
  tgt?: string;
  category_id?: number;
  priority?: number;
  match_mode?: string;
  case_sensitive?: boolean;
  is_safe?: boolean;
  notes?: string;
  source_seq?: number;
  is_active?: boolean;
}

interface TermbaseSetCreatePayload {
  set_name: string;
  src_lang: string;
  tgt_lang: string;
  description?: string;
  visibility?: string;
}

interface TermbaseSetUpdatePayload {
  set_name?: string;
  src_lang?: string;
  tgt_lang?: string;
  description?: string;
  visibility?: string;
  is_active?: boolean;
}

interface ContractSubmitResponse {
  workflow_id: string;
  status: string;
  state_url?: string;
  manifest_url?: string;
  enable_tb?: boolean;
  tb_set_id?: number | null;
  tb_set_name?: string | null;
}

interface InstantTextTranslateResponse {
  translation: string;
  engine: string;
  src_lang: string;
  tgt_lang: string;
  tb_enabled?: boolean;
  tb_set_name?: string | null;
  tb_version?: number | null;
  tb_rules?: number | null;
  tb_hits?: number;
}

interface ContractInlineTranslateResponse {
  translation: string;
  engine_used: string;
  primary_engine: string;
  fallback_engine: string;
  src_lang: string;
  tgt_lang: string;
  tb_enabled?: boolean;
  tb_set_id?: number | null;
  tb_set_name?: string | null;
  tb_hits?: number;
  tb_version?: number | null;
  tb_rules?: number | null;
  route?: string;
}

interface WorkflowQueryItem {
  workflow_id: string;
  source_filename?: string | null;
  status?: string | null;
  mode?: string | null;
  language_pair?: string | null;
  src_lang?: string | null;
  tgt_lang?: string | null;
  created_at?: number | null;
  updated_at?: number | null;
  has_source_pdf?: boolean;
  has_translated_pdf?: boolean;
  has_translated_docx?: boolean;

  is_hidden?: boolean;
}

interface WorkflowQueryResponse {
  items: WorkflowQueryItem[];
  total: number;
  limit: number;
  offset: number;
  filters?: Dict;
}

interface AdminWorkflowQueryItem {
  workflow_id: string;
  status?: string | null;
  mode?: string | null;
  language_pair?: string | null;
  owner_subject?: string | null;
  owner_keycloak_user_id?: string | null;
  owner_username?: string | null;
  owner_display_name?: string | null;
  owner_email?: string | null;
  tenant_id?: string | null;
  owner_user_id?: string | number | null;
  created_at?: number | null;
  updated_at?: number | null;
}

interface AdminWorkflowQueryResponse {
  items: AdminWorkflowQueryItem[];
  total: number;
  limit: number;
  offset: number;
  filters?: Dict;
  skipped_invalid_state?: number;
}

interface AdminWorkflowDeleteItem {
  workflow_id: string;
  owner_subject?: string | null;
  status?: string | null;
  deleted?: boolean;
}

interface AdminWorkflowDeleteSingleResponse extends AdminWorkflowDeleteItem {
  ok: boolean;
  requested_owner_subject?: string | null;
}

interface AdminWorkflowDeleteBatchResponse {
  ok: boolean;
  owner_subject: string;
  matched: number;
  deleted_count: number;
  deleted_items: AdminWorkflowDeleteItem[];
  skipped: Array<{ workflow_id: string; status_code?: number; reason?: string | null }>;
  skipped_invalid_state?: number;
}

interface WorkflowDraftItem {
  block_id: string;
  block_type?: string | null;
  source_text?: string | null;
  translation?: string | null;
  loc?: Dict | null;
  meta?: Dict | null;
  manual_patch_id?: string | null;
  manual_patched_by?: string | null;
  manual_patched_at?: string | null;
}

interface WorkflowDraftResponse {
  workflow_id: string;
  draft_path?: string;
  blocks_path?: string;
  total: number;
  offset: number;
  limit: number;
  items: WorkflowDraftItem[];
}

interface ReviewIndexItem {
  block_id: string;
  block_type?: string | null;
  source_text?: string | null;
  translation?: string | null;
  loc?: Dict | null;
}

interface ReviewIndexResponse {
  workflow_id: string;
  doc_type?: string | null;
  counts?: Dict | null;
  items: ReviewIndexItem[];
}

type WorkflowArtifactKey =
  | "source_pdf"
  | "translated_pdf"
  | "translated_docx"
  | "source_review_html"
  | "translated_review_html"
  | "review_index";

interface WorkflowArtifactBlobResponse {
  blob: Blob;
  filename: string | null;
  contentType: string | null;
}

interface WorkflowArtifactDataResponse {
  data: Uint8Array;
  contentType: string | null;
}

interface WorkflowArtifactRequest {
  url: string;
  headers?: Record<string, string>;
}

const WORKFLOW_ARTIFACT_TIMEOUT_MS = 120000;

function authHeaders(accessToken: string | null | undefined): AuthHeaders | undefined {
  const token = String(accessToken || "").trim();
  if (!token) {
    return undefined;
  }
  return {
    Authorization: `Bearer ${token}`,
  };
}

function parseContentDispositionFilename(contentDisposition: unknown): string | null {
  const raw = String(contentDisposition || "").trim();
  if (!raw) {
    return null;
  }

  const utf8Match = raw.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = raw.match(/filename="?([^"]+)"?/i);
  return plainMatch?.[1] || null;
}

async function listTermbaseSets(
  accessToken: string | null | undefined,
  params?: { src_lang?: string; tgt_lang?: string },
): Promise<TermbaseSetItem[]> {
  const { data } = await http.get<{ items?: TermbaseSetItem[] }>("/api/termbase/sets", {
    headers: authHeaders(accessToken),
    params,
  });
  return data.items || [];
}

async function createTermbaseSet(
  accessToken: string | null | undefined,
  payload: TermbaseSetCreatePayload,
): Promise<{ ok: boolean; item?: TermbaseSetItem }> {
  const { data } = await http.post<{ ok: boolean; item?: TermbaseSetItem }>("/api/termbase/sets", payload, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function updateTermbaseSet(
  accessToken: string | null | undefined,
  setId: number,
  payload: TermbaseSetUpdatePayload,
): Promise<{ ok: boolean; item?: TermbaseSetItem }> {
  const { data } = await http.patch<{ ok: boolean; item?: TermbaseSetItem }>(`/api/termbase/sets/${setId}`, payload, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function deleteTermbaseSet(
  accessToken: string | null | undefined,
  setId: number,
): Promise<{ ok: boolean }> {
  const { data } = await http.delete<{ ok: boolean }>(`/api/termbase/sets/${setId}`, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function importTermbaseCsv(
  accessToken: string | null | undefined,
  payload: {
    file: File;
    set_name: string;
    src_lang: string;
    tgt_lang: string;
    description?: string;
    visibility?: string;
    bidirectional?: boolean;
  },
): Promise<{ ok: boolean; item?: TermbaseSetItem }> {
  const formData = new FormData();
  formData.append("file", payload.file);
  formData.append("set_name", payload.set_name);
  formData.append("src_lang", payload.src_lang);
  formData.append("tgt_lang", payload.tgt_lang);
  formData.append("bidirectional", String(payload.bidirectional ?? true));
  if (payload.description) {
    formData.append("description", payload.description);
  }
  if (payload.visibility) {
    formData.append("visibility", payload.visibility);
  }

  const { data } = await http.post<{ ok: boolean; item?: TermbaseSetItem }>("/api/termbase/sets/import-csv", formData, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function listTermbaseEntries(
  accessToken: string | null | undefined,
  setId: number,
  params?: {
    q?: string;
    src_lang?: string;
    tgt_lang?: string;
    is_active?: boolean;
    limit?: number;
    offset?: number;
  },
): Promise<TermbaseEntryListResponse> {
  const { data } = await http.get<TermbaseEntryListResponse>(`/api/termbase/sets/${setId}/entries`, {
    headers: authHeaders(accessToken),
    params,
  });
  return {
    set: data.set,
    items: data.items || [],
    total: Number(data.total || 0),
    limit: Number(data.limit || params?.limit || 20),
    offset: Number(data.offset || params?.offset || 0),
  };
}

async function createTermbaseEntry(
  accessToken: string | null | undefined,
  setId: number,
  payload: TermbaseEntryCreatePayload,
): Promise<{ ok: boolean; item?: TermbaseEntryItem }> {
  const { data } = await http.post<{ ok: boolean; item?: TermbaseEntryItem }>(
    `/api/termbase/sets/${setId}/entries`,
    payload,
    { headers: authHeaders(accessToken) },
  );
  return data;
}

async function updateTermbaseEntry(
  accessToken: string | null | undefined,
  entryId: number,
  payload: TermbaseEntryUpdatePayload,
): Promise<{ ok: boolean; item?: TermbaseEntryItem }> {
  const { data } = await http.patch<{ ok: boolean; item?: TermbaseEntryItem }>(
    `/api/termbase/entries/${entryId}`,
    payload,
    { headers: authHeaders(accessToken) },
  );
  return data;
}

async function deleteTermbaseEntry(
  accessToken: string | null | undefined,
  entryId: number,
): Promise<{ ok: boolean }> {
  const { data } = await http.delete<{ ok: boolean }>(`/api/termbase/entries/${entryId}`, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function submitContractDocx(
  accessToken: string | null | undefined,
  payload: {
    file: File;
    src_lang: string;
    tgt_lang: string;
    profile?: string;
    primary_engine?: string;
    fallback_engine?: string;
    enable_tb?: boolean;
    tb_set_id?: number | null;
  },
): Promise<ContractSubmitResponse> {
  const fd = new FormData();
  fd.append("file", payload.file);
  fd.append("src_lang", payload.src_lang);
  fd.append("tgt_lang", payload.tgt_lang);
  fd.append("profile", payload.profile || "base");
  fd.append("primary_engine", payload.primary_engine || "llm");
  fd.append("fallback_engine", payload.fallback_engine || "madlad");
  fd.append("enable_tb", String(Boolean(payload.enable_tb)));
  if (payload.tb_set_id) {
    fd.append("tb_set_id", String(payload.tb_set_id));
  }

  const { data } = await http.post<ContractSubmitResponse>("/api/contract-translate/upload", fd, {
    headers: authHeaders(accessToken),
    timeout: 180000,
  });
  return data;
}

async function submitContractText(
  accessToken: string | null | undefined,
  payload: {
    text: string;
    src_lang: string;
    tgt_lang: string;
    profile?: string;
    primary_engine?: string;
    fallback_engine?: string;
    enable_tb?: boolean;
    tb_set_id?: number | null;
  },
): Promise<ContractSubmitResponse> {
  const body: Dict = {
    text: payload.text,
    src_lang: payload.src_lang,
    tgt_lang: payload.tgt_lang,
    profile: payload.profile || "base",
    primary_engine: payload.primary_engine || "llm",
    fallback_engine: payload.fallback_engine || "madlad",
    enable_tb: Boolean(payload.enable_tb),
  };
  if (payload.tb_set_id) {
    body.tb_set_id = payload.tb_set_id;
  }

  const { data } = await http.post<ContractSubmitResponse>("/api/contract-translate/text", body, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function translateNmtText(
  accessToken: string | null | undefined,
  payload: {
    text: string;
    src_lang: string;
    tgt_lang: string;
    tb_set_name?: string | null;
    enable_tb?: boolean;
  },
): Promise<InstantTextTranslateResponse> {
  const body: Dict = {
    text: payload.text,
    src_lang: payload.src_lang,
    tgt_lang: payload.tgt_lang,
    engine: "madlad",
    enable_tb: Boolean(payload.enable_tb),
  };

  if (payload.tb_set_name) {
    body.tb_set_name = payload.tb_set_name;
  }

  const { data } = await http.post<InstantTextTranslateResponse>("/nmt/translate_text", body, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function translateContractTextInline(
  accessToken: string | null | undefined,
  payload: {
    text: string;
    src_lang: string;
    tgt_lang: string;
    primary_engine?: string;
    fallback_engine?: string;
    enable_tb?: boolean;
    tb_set_id?: number | null;
  },
): Promise<ContractInlineTranslateResponse> {
  const body: Dict = {
    text: payload.text,
    src_lang: payload.src_lang,
    tgt_lang: payload.tgt_lang,
    primary_engine: payload.primary_engine || "llm",
    fallback_engine: payload.fallback_engine || "madlad",
    enable_tb: Boolean(payload.enable_tb),
  };

  if (payload.tb_set_id) {
    body.tb_set_id = payload.tb_set_id;
  }

  const { data } = await http.post<ContractInlineTranslateResponse>("/api/contract-translate/text-inline", body, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function getContractWorkflowDetail(
  accessToken: string | null | undefined,
  workflowId: string,
): Promise<Dict> {
  const { data } = await http.get<Dict>(`/api/contract-translate/workflows/${encodeURIComponent(workflowId)}`, {
    headers: authHeaders(accessToken),
  });
  return data;
}

function buildContractWorkflowArtifactUrl(workflowId: string, artifactKey: WorkflowArtifactKey): string {
  return `/api/contract-translate/workflows/${encodeURIComponent(workflowId)}/files/${encodeURIComponent(artifactKey)}`;
}

function buildContractWorkflowArtifactRequest(
  accessToken: string | null | undefined,
  workflowId: string,
  artifactKey: WorkflowArtifactKey,
): WorkflowArtifactRequest {
  return {
    url: buildContractWorkflowArtifactUrl(workflowId, artifactKey),
    headers: authHeaders(accessToken) as Record<string, string> | undefined,
  };
}

async function queryContractWorkflows(
  accessToken: string | null | undefined,
  params?: {
    q?: string;
    status?: string;
    src_lang?: string;
    tgt_lang?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
    offset?: number;
  },
): Promise<WorkflowQueryResponse> {
  const { data } = await http.get<WorkflowQueryResponse>("/api/contract-translate/workflows/query", {
    headers: authHeaders(accessToken),
    params,
  });
  return data;
}

async function fetchContractWorkflowArtifactBlob(
  accessToken: string | null | undefined,
  workflowId: string,
  artifactKey: WorkflowArtifactKey,
): Promise<WorkflowArtifactBlobResponse> {
  const resp = await http.get<Blob>(
    buildContractWorkflowArtifactUrl(workflowId, artifactKey),
    {
      headers: authHeaders(accessToken),
      responseType: "blob",
      timeout: WORKFLOW_ARTIFACT_TIMEOUT_MS,
    },
  );

  return {
    blob: resp.data,
    filename: parseContentDispositionFilename(resp.headers["content-disposition"]),
    contentType: String(resp.headers["content-type"] || "") || null,
  };
}

async function fetchContractWorkflowArtifactData(
  accessToken: string | null | undefined,
  workflowId: string,
  artifactKey: WorkflowArtifactKey,
): Promise<WorkflowArtifactDataResponse> {
  const resp = await http.get<ArrayBuffer>(
    buildContractWorkflowArtifactUrl(workflowId, artifactKey),
    {
      headers: authHeaders(accessToken),
      responseType: "arraybuffer",
      timeout: WORKFLOW_ARTIFACT_TIMEOUT_MS,
    },
  );

  return {
    data: new Uint8Array(resp.data),
    contentType: String(resp.headers["content-type"] || "") || null,
  };
}

async function fetchContractWorkflowArtifactText(
  accessToken: string | null | undefined,
  workflowId: string,
  artifactKey: WorkflowArtifactKey,
): Promise<string> {
  const { blob } = await fetchContractWorkflowArtifactBlob(accessToken, workflowId, artifactKey);
  return await blob.text();
}

async function fetchContractWorkflowReviewIndex(
  accessToken: string | null | undefined,
  workflowId: string,
): Promise<ReviewIndexResponse> {
  const text = await fetchContractWorkflowArtifactText(accessToken, workflowId, "review_index");
  const raw = JSON.parse(text || "{}") as ReviewIndexResponse;
  return {
    workflow_id: String(raw.workflow_id || workflowId),
    doc_type: String(raw.doc_type || ""),
    counts: raw.counts || {},
    items: raw.items || [],
  };
}

async function getContractWorkflowReviewPayload(
  accessToken: string | null | undefined,
  workflowId: string,
): Promise<Dict> {
  const { data } = await http.get<Dict>(`/api/contract-translate/workflows/${encodeURIComponent(workflowId)}/review/payload`, {
    headers: authHeaders(accessToken),
  });
  return data;
}

async function getContractWorkflowDraft(
  accessToken: string | null | undefined,
  workflowId: string,
  params?: {
    q?: string;
    offset?: number;
    limit?: number;
    only_changed?: boolean;
  },
): Promise<WorkflowDraftResponse> {
  const { data } = await http.get<WorkflowDraftResponse>(`/api/contract-translate/workflows/${encodeURIComponent(workflowId)}/draft`, {
    headers: authHeaders(accessToken),
    params,
  });
  return {
    workflow_id: String(data.workflow_id || workflowId),
    draft_path: String(data.draft_path || ""),
    blocks_path: String(data.blocks_path || ""),
    total: Number(data.total || 0),
    offset: Number(data.offset || params?.offset || 0),
    limit: Number(data.limit || params?.limit || 100),
    items: data.items || [],
  };
}

async function applyContractWorkflowPatch(
  accessToken: string | null | undefined,
  workflowId: string,
  payload: {
    patches: Array<{ block_id: string; translation: string }>;
    resolved_by?: string;
    comment?: string;
  },
): Promise<Dict> {
  const { data } = await http.post<Dict>(
    `/api/contract-translate/workflows/${encodeURIComponent(workflowId)}/apply-patch`,
    payload,
    {
      headers: authHeaders(accessToken),
    },
  );
  return data;
}

async function queryContractAdminWorkflowsByOwner(
  accessToken: string | null | undefined,
  params?: {
    owner_subject?: string;
    owner_keyword?: string;
    owner_missing?: boolean;
    status?: string;
    limit?: number;
    offset?: number;
  },
): Promise<AdminWorkflowQueryResponse> {
  const { data } = await http.get<AdminWorkflowQueryResponse>("/api/contract-translate/admin/workflows/owners", {
    headers: authHeaders(accessToken),
    params,
  });
  return {
    items: data.items || [],
    total: Number(data.total || 0),
    limit: Number(data.limit || params?.limit || 20),
    offset: Number(data.offset || params?.offset || 0),
    filters: data.filters || {},
    skipped_invalid_state: Number(data.skipped_invalid_state || 0),
  };
}

async function deleteContractAdminWorkflowById(
  accessToken: string | null | undefined,
  workflowId: string,
): Promise<AdminWorkflowDeleteSingleResponse> {
  const { data } = await http.delete<AdminWorkflowDeleteSingleResponse>(
    `/api/contract-translate/admin/workflows/${encodeURIComponent(workflowId)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
  return data;
}

async function deleteContractAdminWorkflowForOwner(
  accessToken: string | null | undefined,
  ownerSubject: string,
  workflowId: string,
): Promise<AdminWorkflowDeleteSingleResponse> {
  const { data } = await http.delete<AdminWorkflowDeleteSingleResponse>(
    `/api/contract-translate/admin/workflows/by-owner/${encodeURIComponent(ownerSubject)}/${encodeURIComponent(workflowId)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
  return data;
}

async function deleteContractAdminWorkflowsForOwner(
  accessToken: string | null | undefined,
  ownerSubject: string,
): Promise<AdminWorkflowDeleteBatchResponse> {
  const { data } = await http.delete<AdminWorkflowDeleteBatchResponse>(
    `/api/contract-translate/admin/workflows/by-owner/${encodeURIComponent(ownerSubject)}`,
    {
      headers: authHeaders(accessToken),
    },
  );
  return {
    ok: Boolean(data.ok),
    owner_subject: String(data.owner_subject || ownerSubject),
    matched: Number(data.matched || 0),
    deleted_count: Number(data.deleted_count || 0),
    deleted_items: data.deleted_items || [],
    skipped: data.skipped || [],
    skipped_invalid_state: Number(data.skipped_invalid_state || 0),
  };
}
// 隐藏（软删除）一个合同翻译任务
async function hideContractWorkflow(
  accessToken: string | null | undefined,
  workflowId: string,
): Promise<{ ok: boolean }> {
  const { data } = await http.patch<{ ok: boolean }>(
    `/api/contract-translate/workflows/${encodeURIComponent(workflowId)}/hide`,
    { is_hidden: true },
    { headers: authHeaders(accessToken) }
  );
  return data;
}

export type {
  AdminWorkflowDeleteBatchResponse,
  AdminWorkflowDeleteItem,
  AdminWorkflowDeleteSingleResponse,
  AdminWorkflowQueryItem,
  AdminWorkflowQueryResponse,
  ContractSubmitResponse,
  ContractInlineTranslateResponse,
  InstantTextTranslateResponse,
  TermbaseEntryCreatePayload,
  TermbaseEntryItem,
  TermbaseEntryListResponse,
  TermbaseEntryUpdatePayload,
  TermbaseSetCreatePayload,
  TermbaseSetItem,
  TermbaseSetUpdatePayload,
  WorkflowArtifactBlobResponse,
  WorkflowArtifactKey,
  WorkflowArtifactRequest,
  WorkflowDraftItem,
  WorkflowDraftResponse,
  ReviewIndexItem,
  ReviewIndexResponse,
  WorkflowQueryItem,
  WorkflowQueryResponse,
};

export {
  applyContractWorkflowPatch,
  buildContractWorkflowArtifactRequest,
  buildContractWorkflowArtifactUrl,
  createTermbaseEntry,
  createTermbaseSet,
  deleteContractAdminWorkflowById,
  deleteContractAdminWorkflowForOwner,
  deleteContractAdminWorkflowsForOwner,
  deleteTermbaseEntry,
  deleteTermbaseSet,
  fetchContractWorkflowArtifactBlob,
  fetchContractWorkflowArtifactData,
  fetchContractWorkflowArtifactText,
  fetchContractWorkflowReviewIndex,
  getContractWorkflowDetail,
  getContractWorkflowDraft,
  getContractWorkflowReviewPayload,
  importTermbaseCsv,
  listTermbaseEntries,
  listTermbaseSets,
  queryContractAdminWorkflowsByOwner,
  queryContractWorkflows,
  submitContractDocx,
  submitContractText,
  translateContractTextInline,
  translateNmtText,
  updateTermbaseEntry,
  updateTermbaseSet,

  hideContractWorkflow,
};
