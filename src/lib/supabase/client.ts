import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

let cliente: SupabaseClient | undefined;

export function supabaseNavegador() {
  cliente ??= createBrowserClient(
    SUPABASE_URL,
    SUPABASE_KEY,
  );
  return cliente;
}
