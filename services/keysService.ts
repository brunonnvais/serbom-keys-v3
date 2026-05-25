import { supabase } from "./supabaseClient";
import type { Key } from "../types";

function mapKey(data: any): Key {
  return {
    id: String(data.id),
    code: data.code,
    label: data.label,
    description: data.description,
    sector: data.sectors?.name ?? data.sector ?? "",
    sector_id: data.sector_id ?? data.sectors?.id ?? null,
    sector_name: data.sectors?.name ?? data.sector ?? "Sem setor",
    cabinet_id: data.cabinet_id ?? null,
    status: data.status,
    lastMovementId: data.last_movement_id ?? data.lastMovementId ?? undefined,
    borrowed_at: data.borrowed_at ?? null,
  } as Key;
}

export async function dbListKeys(): Promise<Key[]> {
  const { data, error } = await supabase
    .from("keys")
    .select(`
  *,
  sectors:sector_id (
    id,
    name
  ),
  cabinets:cabinet_id (
    id,
    name
  )
`)
    .is("archived_at", null)
    .order("code", { ascending: true });

  if (error) throw error;

  console.log(
    "RETORNO DO BANCO:",
    (data ?? []).map((r: any) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      sector: r.sector,
      sector_id: r.sector_id,
      sectors: r.sectors,
      sector_name: r.sectors?.name ?? r.sector ?? "Sem setor",
      cabinet_id: r.cabinet_id,
      archived_at: r.archived_at,
    }))
  );

  return (data ?? []).map(mapKey);
}

export async function dbUpdateKeyStatus(
  keyId: string,
  status: Key["status"],
  lastMovementId?: string
) {
  const payload: any = { status };

  if (lastMovementId) {
    payload.last_movement_id = lastMovementId;
  }

  const { data, error } = await supabase
    .from("keys")
    .update(payload)
    .eq("id", keyId)
    .select("*")
    .single();

  if (error) throw error;

  return data;
}

export async function dbCreateKey(
  key: Partial<Key> & {
    cabinet_name?: string | null;
    cabinet_id?: string | null;
    sector_id?: string | null;
  }
) {
  const insertPayload: any = {
    code: key.code,
    label: key.label,
    description: key.description ?? "",
    sector: key.sector ?? "",
    cabinet_id: key.cabinet_id ?? null,
    status: "DISPONIVEL",
  };

  if (key.sector_id !== undefined) {
    insertPayload.sector_id = key.sector_id;
  }

  const { data, error } = await supabase
    .from("keys")
    .insert([insertPayload])
    .select(`
      *,
      sectors:sector_id (
        id,
        name
      )
    `)
    .single();

  if (error) throw error;

  return mapKey(data);
}

export async function dbUpdateKey(
  id: string,
  payload: {
    code: string;
    label: string;
    description?: string;
    sector?: string;
    sector_id?: string | null;
    cabinet_id?: string | null;
  }
) {
  const updatePayload: any = {
    code: payload.code,
    label: payload.label,
    description: payload.description ?? "",
  };

  if (payload.sector !== undefined) {
    updatePayload.sector = payload.sector;
  }

  if (payload.sector_id !== undefined) {
    updatePayload.sector_id = payload.sector_id;
  }

  if (payload.cabinet_id !== undefined) {
    updatePayload.cabinet_id = payload.cabinet_id;
  }

  const { data, error } = await supabase
    .from("keys")
    .update(updatePayload)
    .eq("id", id)
    .select(`
      *,
      sectors:sector_id (
        id,
        name
      )
    `)
    .single();

  if (error) throw error;

  return mapKey(data);
}

export async function dbDeleteKey(id: string) {
  const { error } = await supabase.from("keys").delete().eq("id", id);

  if (error) throw error;
}

export async function rpcCheckoutKey(
  keyId: string,
  userId: string,
  userName: string,
  authorizedBy: string,
  signatureBase64: string
) {
  const { error } = await supabase.rpc("checkout_key", {
    p_key_id: keyId,
    p_user_id: userId,
    p_user_name: userName,
    p_authorized_by: authorizedBy,
    p_signature_base64: signatureBase64,
  });

  if (error) throw error;
}

export async function rpcReturnKey(keyId: string, userName: string) {
  const { error } = await supabase.rpc("return_key", {
    p_key_id: keyId,
    p_user_name: userName,
  });

  if (error) throw error;
}

export async function rpcArchiveKey(keyId: string) {
  const { error } = await supabase.rpc("archive_key", {
    p_key_id: keyId,
  });

  if (error) throw error;
}