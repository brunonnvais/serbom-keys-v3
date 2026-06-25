import { supabase } from './supabaseClient';

export type InventoryResult = 'present' | 'missing' | 'unexpected';

export type InventoryItemInput = {
  key_id: string;
  key_code: string;
  key_label: string;
  result: InventoryResult;
};

export async function saveInventory(params: {
  performedBy: string | null;
  performedByName: string;
  items: InventoryItemInput[];
}): Promise<string> {
  const present = params.items.filter((i) => i.result === 'present').length;
  const missing = params.items.filter((i) => i.result === 'missing').length;
  const unexpected = params.items.filter(
    (i) => i.result === 'unexpected'
  ).length;
  const expected = present + missing;

  const { data: inv, error } = await supabase
    .from('inventories')
    .insert({
      performed_by: params.performedBy,
      performed_by_name: params.performedByName,
      total_expected: expected,
      total_present: present,
      total_missing: missing,
      total_unexpected: unexpected,
    })
    .select('id')
    .single();

  if (error) throw error;

  const rows = params.items.map((i) => ({ ...i, inventory_id: inv.id }));

  if (rows.length) {
    const { error: e2 } = await supabase.from('inventory_items').insert(rows);
    if (e2) throw e2;
  }

  return inv.id as string;
}
