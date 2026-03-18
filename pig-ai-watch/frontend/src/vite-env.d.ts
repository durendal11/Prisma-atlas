/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Electron API exposed via preload script
interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  onBackendStatus: (callback: (status: string) => void) => void;
  platform: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};