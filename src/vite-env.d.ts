/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string
  // 更多环境变量可以在这里添加...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
