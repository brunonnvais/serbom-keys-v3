import { serve } from 'std/http/server.ts';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get('Authorization');

        if (!authHeader) {
            throw new Error('Token não informado.');
        }

        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const token = authHeader.replace('Bearer ', '');

        const {
            data: { user: loggedUser },
            error: loggedUserError,
        } = await adminClient.auth.getUser(token);

        if (loggedUserError || !loggedUser) {
            throw new Error('Usuário não autenticado.');
        }

        const { data: profile, error: profileError } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', loggedUser.id)
            .single();

        if (profileError || !profile) {
            throw new Error('Perfil do usuário logado não encontrado.');
        }

        if (profile.role !== 'admin') {
            throw new Error('Apenas administradores podem redefinir senhas.');
        }

        const { user_id, temporary_password, must_change_password } = await req.json();

        if (!user_id || !temporary_password) {
            throw new Error('Usuário e senha provisória são obrigatórios.');
        }

        if (
            temporary_password.length < 8 ||
            !/[A-Z]/.test(temporary_password) ||
            !/[a-z]/.test(temporary_password) ||
            !/[0-9]/.test(temporary_password) ||
            !/[^A-Za-z0-9]/.test(temporary_password)
        ) {
            throw new Error(
                'A senha deve conter no mínimo 8 caracteres, letra maiúscula, letra minúscula, número e caractere especial.',
            );
        }

        const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(user_id, {
            password: temporary_password,
        });

        if (updateAuthError) {
            throw new Error(updateAuthError.message);
        }

        const { error: updateProfileError } = await adminClient
            .from('profiles')
            .update({
                must_change_password: Boolean(must_change_password),
            })
            .eq('id', user_id);

        if (updateProfileError) {
            throw new Error(updateProfileError.message);
        }

        return new Response(
            JSON.stringify({
                success: true,
            }),
            {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                },
            },
        );
    } catch (error) {
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Erro desconhecido.',
            }),
            {
                status: 400,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                },
            },
        );
    }
});