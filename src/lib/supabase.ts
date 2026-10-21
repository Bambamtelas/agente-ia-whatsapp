import { createClient } from '@supabase/supabase-js';

// Variáveis de ambiente - configure no arquivo .env ou usa as credenciais padrão do projeto
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ndcruioidkfjwwrnlosf.supabase.co';

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_oNACcPiiSm2g-oCiUe3uVg_PDwh5djN';

// Verificação de configuração
export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

// Cliente Supabase conectado ao banco real
export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
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
