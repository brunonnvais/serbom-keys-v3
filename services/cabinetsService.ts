// services/cabinetsService.ts
import { supabase } from './supabaseClient';

export type Cabinet = {
  id: string;
  code: string;        // "G1", "G2"...
  name: string;        // "Armário G1"
  description?: string | null;
  created_at?: string;
};

export async function dbListCabinets(): Promise<Cabinet[]> {
  const { data, error } = await supabase
    .from('cabinets')
    .select('*')
    .order('code', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((c: any) => ({
    id: String(c.id),
    code: String(c.code),
    name: String(c.name),
    description: c.description ?? null,
    created_at: c.created_at,
  }));
}

export async function dbCreateCabinet(params: {
  code: string;
  name: string;
  description?: string;
}): Promise<Cabinet> {
  const { data, error } = await supabase
    .from('cabinets')
    .insert([{
      code: params.code.trim().toUpperCase(),
      name: params.name.trim(),
      description: params.description?.trim() || null,
    }])
    .select('*')
    .single();

  if (error) throw error;

  return {
    id: String(data.id),
    code: String(data.code),
    name: String(data.name),
    description: data.description ?? null,
    created_at: data.created_at,
  };
}
