import { supabase } from './supabaseClient';

export async function updateSystemUser(payload: {
  user_id: string;
  full_name: string;
  role: 'admin' | 'manager' | 'operator';
  is_active: boolean;
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.access_token) {
    throw new Error('Sessão inválida. Faça login novamente.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/update-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `Erro ${response.status} ao editar usuário.`);
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Erro ao editar usuário.');
  }

  return data;
}

export async function resetSystemUserPassword(payload: {
  user_id: string;
  temporary_password: string;
  must_change_password: boolean;
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  if (!session?.access_token) {
    throw new Error('Sessão inválida. Faça login novamente.');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing');
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/reset-user-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `Erro ${response.status} ao redefinir senha.`);
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Erro ao redefinir senha.');
  }

  return data;
}