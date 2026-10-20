import { createClient } from '@supabase/supabase-js';

// Variáveis de ambiente - configure no arquivo .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Verificação de configuração
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Cliente Supabase (funcional apenas quando as variáveis estiverem configuradas)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// Helper para checar se está autenticado
export const getCurrentUser = async () => {
  if (!isSupabaseConfigured) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};
