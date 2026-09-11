/// <reference types="vite/client" />

// Build stamp injected by vite.config `define` (shown in the admin sidebar).
declare const __APP_VERSION__: string;
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  // MSG91 OTP widget — public, build-time. Unset → app uses the demo OTP path.
  readonly VITE_MSG91_WIDGET_ID?: string;
  readonly VITE_MSG91_TOKEN_AUTH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
