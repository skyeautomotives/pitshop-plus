import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.skyeautomotives.pitstopplus",
  appName: "Pitshop Plus",
  webDir: "dist",
  android: {
    // Supabase is reached over HTTPS; nothing is loaded over plain HTTP.
    allowMixedContent: false,
  },
};

export default config;
