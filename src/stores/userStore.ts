import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserState {
  openaiApiKey: string;
  setOpenaiApiKey: (key: string) => void;
  hasValidApiKey: () => boolean;
}

// 从环境变量获取默认的 API Key
const defaultApiKey = import.meta.env.VITE_OPENAI_API_KEY || '';

export const useUserStore = create<UserState>()(
  persist(
    (set, get) => ({
      openaiApiKey: defaultApiKey,
      setOpenaiApiKey: (key: string) => set({ openaiApiKey: key }),
      hasValidApiKey: () => {
        const key = get().openaiApiKey;
        return Boolean(key && key.trim().length > 0);
      },
    }),
    {
      name: 'user-storage', // 本地存储的 key
    }
  )
); 