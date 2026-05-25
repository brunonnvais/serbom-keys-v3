import { supabase } from './supabaseClient';

export async function signInWithEmail(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) throw error;
    return data;
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

export async function getCurrentSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;
    return data.session;
}

export function onAuthStateChange(
    callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]
) {
    return supabase.auth.onAuthStateChange(callback);
}