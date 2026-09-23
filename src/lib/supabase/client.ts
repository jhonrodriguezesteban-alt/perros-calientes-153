import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL } from "./config";

let cliente: ReturnType<typeof createBrowserClient> | undefined;

export function supabaseNavegador() {
  cliente ??= createBrowserClient(
    SUPABASE_URL,
    SUPABASE_KEY,
  );
  return cliente;
}
