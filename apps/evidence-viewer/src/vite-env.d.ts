/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANCHOR_ONBOARDING_URL?: string;
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
