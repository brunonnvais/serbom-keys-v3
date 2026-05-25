import { supabase } from './supabaseClient';

export async function createSystemUser(payload: {
    full_name: string;
    email: string;
    password: string;
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

    const { data, error } = await supabase.functions.invoke('create-user', {
        body: payload,
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
    });

    if (error) {
        throw new Error(error.message || 'Erro ao criar usuário.');
    }

    if (!data?.success) {
        throw new Error(data?.error || 'Erro ao criar usuário.');
    }

    return data;
}