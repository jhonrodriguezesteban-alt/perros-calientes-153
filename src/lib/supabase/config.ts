// Supabase muestra la clave pública como "anon" (proyectos antiguos) o
// "publishable" (proyectos nuevos): se acepta cualquiera de los dos nombres.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_KEY = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!;
