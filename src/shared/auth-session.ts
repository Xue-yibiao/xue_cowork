type StoredAuthSnapshot = {
  mode?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  user?: unknown;
};

const STORAGE_KEY = "platform_auth_state_v1";

function readAuthSnapshot(): StoredAuthSnapshot | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredAuthSnapshot;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function writeAuthSnapshot(next: StoredAuthSnapshot): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function patchBearerTokens(tokens: {
  accessToken?: string | null;
  refreshToken?: string | null;
}): StoredAuthSnapshot | null {
  const current = readAuthSnapshot();
  if (!current) {
    return null;
  }

  const next: StoredAuthSnapshot = {
    ...current,
    mode: "bearer",
    accessToken: tokens.accessToken ?? current.accessToken ?? null,
    refreshToken: tokens.refreshToken ?? current.refreshToken ?? null,
  };
  writeAuthSnapshot(next);
  return next;
}

function clearAuthSnapshot(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export {
  STORAGE_KEY,
  clearAuthSnapshot,
  patchBearerTokens,
  readAuthSnapshot,
  writeAuthSnapshot,
};
