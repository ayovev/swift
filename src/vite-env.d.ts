/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** PostHog project key. Empty in .env.example — analytics no-op without it. */
  readonly VITE_PUBLIC_POSTHOG_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
