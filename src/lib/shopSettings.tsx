import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getShopSettings } from "./api";
import { errorMessage } from "./supabase";
import type { ShopSettings } from "./types";

interface SettingsState {
  settings: ShopSettings | null;
  error: string | null;
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsState>({ settings: null, error: null, reload: async () => {} });

export function ShopSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setSettings(await getShopSettings());
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <SettingsContext.Provider value={{ settings, error, reload }}>{children}</SettingsContext.Provider>;
}

export function useShopSettings(): SettingsState {
  return useContext(SettingsContext);
}
