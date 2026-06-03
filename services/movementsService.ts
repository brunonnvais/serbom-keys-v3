import { supabase } from "./supabaseClient";
import type { Movement } from "../types";

export async function dbListMovements(): Promise<Movement[]> {
  const { data, error } = await supabase
    .from("movements")
    .select("*")
    .order("withdrawn_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: String(r.id),
    keyId: String(r.key_id),
    userId: String(r.user_id),
    userName: r.user_name ?? undefined,
    authorizedBy: String(r.authorized_by),
    authorizedByName: r.authorized_by_name ?? undefined,
    withdrawnAt: r.withdrawn_at,
    returnedAt: r.returned_at ?? undefined,
    signatureBase64: r.signature_base64 ?? undefined,
  })) as Movement[];
}
export async function dbCheckoutKey(params: {
  keyId: string;
  userId: string;
  authorizedBy: string;
  signatureBase64: string;
}): Promise<{ movementId: string }> {
  const { data, error } = await supabase.rpc("checkout_key", {
    p_key_id: params.keyId,
    p_user_id: params.userId,
    p_authorized_by: params.authorizedBy,
    p_signature_base64: params.signatureBase64,
  });

  if (error) throw error;

  // data vem como array por ser "returns table"
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.movement_id) throw new Error("RPC checkout_key não retornou movement_id");

  return { movementId: String(row.movement_id) };
}

export async function dbReturnKey(keyId: string): Promise<void> {
  const { error } = await supabase.rpc("return_key", { p_key_id: keyId });
  if (error) throw error;
}

export async function dbCreateMovement(payload: Omit<Movement, "id">): Promise<Movement> {
  const { data, error } = await supabase
    .from("movements")
    .insert([{
      key_id: payload.keyId,
      user_id: payload.userId,
      authorized_by: payload.authorizedBy,
      withdrawn_at: payload.withdrawnAt,
      returned_at: payload.returnedAt ?? null,
      signature_base64: payload.signatureBase64 ?? null,
    }])
    .select("*")
    .single();

  if (error) throw error;

  return {
    id: String(data.id),
    keyId: String(data.key_id),
    userId: String(data.user_id),
    authorizedBy: String(data.authorized_by),
    withdrawnAt: data.withdrawn_at,
    returnedAt: data.returned_at ?? undefined,
    signatureBase64: data.signature_base64 ?? undefined,
  };
}

/**
 * ✅ Método MAIS SEGURO: devolve pela movimentação (movementId)
 */
export async function dbReturnMovementById(movementId: string): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("movements")
    .update({ returned_at: now })
    .eq("id", movementId);

  if (error) throw error;
}

/**
 * ✅ Seu método atual (pode manter): devolve a movimentação aberta pela keyId
 */
export async function dbReturnMovementOpenForKey(keyId: string): Promise<void> {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("movements")
    .update({ returned_at: now })
    .eq("key_id", keyId)
    .is("returned_at", null);

  if (error) throw error;
}
