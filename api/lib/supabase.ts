import { createClient } from "@supabase/supabase-js";

const getEnv = (key: string) => {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
      return process.env[key];
    }
  } catch (e) {}
  return "";
};

const supabaseUrl = getEnv("VITE_SUPABASE_URL");
const supabaseServiceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("VITE_SUPABASE_ANON_KEY");

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("Supabase environment variables are missing. Database operations will fail.");
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co", 
  supabaseServiceKey || "placeholder-key"
);
