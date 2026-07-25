/// <reference types="vite/client" />

interface ImportMetaEnv {
  // MSG91 OTP widget — public, build-time. Unset → app uses the demo OTP path.
  readonly VITE_MSG91_WIDGET_ID?: string;
  readonly VITE_MSG91_TOKEN_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
