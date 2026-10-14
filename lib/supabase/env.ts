const SUPABASE_URL_PLACEHOLDERS = new Set(["https://replace-me.supabase.co", ""]);
const SUPABASE_ANON_KEY_PLACEHOLDERS = new Set(["replace_me", ""]);

/**
 * Shared env readers (no "use client") so middleware, server components,
 * and the browser client can all resolve Supabase config safely.
 */
export function getSupabaseUrl(): string | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url || SUPABASE_URL_PLACEHOLDERS.has(url)) {
    return undefined;
  }
  return url;
}

export function getSupabaseAnonKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!key || SUPABASE_ANON_KEY_PLACEHOLDERS.has(key)) {
    return undefined;
  }
  return key;
}
