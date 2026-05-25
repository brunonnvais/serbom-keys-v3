import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

type Sector = {
  id: string;
  name: string;
};

type Props = {
  onClose: () => void;
  onSave: (data: {
    code: string;
    label: string;
    description?: string;
    sector?: string;
    sector_id?: string | null;
  }) => Promise<void>;
};

const CreateKeyForm: React.FC<Props> = ({ onClose, onSave }) => {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');

  const [sectorId, setSectorId] = useState('');
  const [sectorName, setSectorName] = useState('');

  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadSectors() {
      const { data, error } = await supabase
        .from('sectors')
        .select('id, name')
        .order('name', { ascending: true });

      if (error) {
        console.error('Erro ao carregar setores:', error);
        return;
      }

      setSectors(data ?? []);
    }

    loadSectors();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!code || !label) {
      alert('Preencha código e nome.');
      return;
    }

    if (!sectorId) {
      alert('Selecione um setor.');
      return;
    }

    try {
      setLoading(true);

      await onSave({
        code,
        label,
        description,
        sector: sectorName,
        sector_id: sectorId,
      });

      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h2 className="text-xl font-bold mb-4">Nova Chave</h2>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Código"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
          />

          <input
            placeholder="Nome"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
          />

          <input
            placeholder="Descrição"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border rounded-xl px-3 py-2"
          />

          <select
            value={sectorId}
            onChange={(e) => {
              const id = e.target.value;
              const selectedSector = sectors.find((s) => s.id === id);

              setSectorId(id);
              setSectorName(selectedSector?.name ?? '');
            }}
            className="w-full border rounded-xl px-3 py-2 bg-white"
          >
            <option value="">Selecione um setor</option>

            {sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
              </option>
            ))}
          </select>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded-xl"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateKeyForm;