import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from '../types';
import { supabase } from '../services/supabaseClient';
import { signInWithEmail, signOut } from '../services/authService';
import {
  dbListKeys,
  rpcCheckoutKey,
  rpcReturnKey,
} from '../services/keysService';
import { saveInventory, type InventoryItemInput } from '../services/inventoryService';
import { Html5Qrcode } from 'html5-qrcode';
import acessaLogo from './assets/acessa/acessa_horizontal.png';
import vsaLogo from './assets/vsa-logo.png';

type SheetMode = 'identify' | 'retirar' | 'devolver';

const normalize = (s?: string) => {
  if (!s) return 'DISPONIVEL';
  const v = s.toUpperCase().trim();
  if (v === 'AVAILABLE') return 'DISPONIVEL';
  if (v === 'IN_USE') return 'EM_USO';
  if (v === 'MAINTENANCE') return 'MANUTENCAO';
  return v;
};

const statusLabel = (s?: string) => {
  const v = normalize(s);
  if (v === 'DISPONIVEL') return 'Disponível';
  if (v === 'EM_USO') return 'Em uso';
  if (v === 'MANUTENCAO') return 'Manutenção';
  if (v === 'PERDIDA') return 'Perdida';
  return v;
};

const statusClass = (s?: string) => {
  const v = normalize(s);
  if (v === 'DISPONIVEL') return 'bg-emerald-100 text-emerald-700';
  if (v === 'EM_USO') return 'bg-orange-100 text-orange-700';
  return 'bg-slate-200 text-slate-600';
};

// Busca inteligente: ignora acento/maiúscula e exige todos os termos digitados.
const stripAccents = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const smartSearch = (
  query: string,
  ...fields: (string | number | null | undefined)[]
) => {
  const q = stripAccents(String(query || '').trim());
  if (!q) return true;
  const haystack = stripAccents(
    fields.filter((f) => f !== null && f !== undefined).join(' ')
  );
  return q.split(/\s+/).every((token) => haystack.includes(token));
};

const friendlyAuthError = (error: any): string => {
  const msg = String(error?.message || error || '').toLowerCase();
  if (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('load failed') ||
    msg.includes('fetch') ||
    error?.name === 'TypeError'
  ) {
    return 'Sem conexão com o servidor. Verifique sua internet e tente novamente.';
  }
  if (
    msg.includes('invalid login') ||
    msg.includes('invalid credentials') ||
    msg.includes('email or password')
  ) {
    return 'E-mail ou senha incorretos.';
  }
  if (msg.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado.';
  }
  return error?.message || 'Não foi possível entrar. Tente novamente.';
};

export default function MobileApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [keys, setKeys] = useState<Key[]>([]);
  const keysRef = useRef<Key[]>([]);
  const [search, setSearch] = useState('');

  const [scanning, setScanning] = useState(false);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const scanModeRef = useRef<'action' | 'inventory'>('action');
  const lastScanRef = useRef<{ id: string; t: number }>({ id: '', t: 0 });

  // Conferência de inventário
  const [conf, setConf] = useState<null | {
    expected: Key[];
    presentIds: string[];
    unexpected: Key[];
  }>(null);
  const [confSummary, setConfSummary] = useState<null | {
    present: number;
    missing: Key[];
    unexpected: Key[];
  }>(null);

  const [sheet, setSheet] = useState<{ key: Key; mode: SheetMode } | null>(null);
  const [checkoutName, setCheckoutName] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Assinatura (tela cheia própria, fora do bottom-sheet)
  const [signing, setSigning] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(
    null
  );

  const notify = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    keysRef.current = keys;
  }, [keys]);

  const loadProfile = async (uid: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();
    setProfile(data ?? null);
  };

  const loadKeys = async () => {
    try {
      const k = await dbListKeys();
      setKeys(k ?? []);
    } catch (e) {
      console.error('Erro ao carregar chaves:', e);
    }
  };

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data.session);
        if (data.session?.user) {
          await loadProfile(data.session.user.id);
          loadKeys();
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        loadProfile(s.user.id);
        loadKeys();
      } else {
        setProfile(null);
        setKeys([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const doLogin = async () => {
    setLoginError('');
    setLoggingIn(true);
    try {
      await signInWithEmail(email.trim(), pass);
      setEmail('');
      setPass('');
    } catch (e: any) {
      setLoginError(friendlyAuthError(e));
    } finally {
      setLoggingIn(false);
    }
  };

  const openSheet = (key: Key, mode: SheetMode) => {
    setCheckoutName('');
    setSignature(null);
    setSheet({ key, mode });
  };

  const onTapKey = (key: Key) => {
    const st = normalize(key.status);
    if (st === 'DISPONIVEL') openSheet(key, 'retirar');
    else if (st === 'EM_USO') openSheet(key, 'devolver');
    else openSheet(key, 'identify');
  };

  // ---------- Scanner (camera traseira direta) ----------
  const handleDecoded = (decoded: string) => {
    try {
      const url = new URL(decoded);
      const keyId = url.pathname.replace('/key/', '');
      const isPorta = url.searchParams.get('porta');
      const found = keysRef.current.find(
        (k) => String(k.id) === String(keyId)
      );

      // Modo conferência: câmera fica aberta, vai marcando as chaves.
      if (scanModeRef.current === 'inventory') {
        const now = Date.now();
        if (
          lastScanRef.current.id === keyId &&
          now - lastScanRef.current.t < 2500
        ) {
          return; // evita contar o mesmo QR repetido
        }
        lastScanRef.current = { id: keyId, t: now };

        if (!found) {
          notify('Chave não encontrada no sistema.', 'err');
          return;
        }
        markPresent(found);
        if (normalize(found.status) === 'DISPONIVEL') {
          notify(`✓ ${found.code} conferida`, 'ok');
        } else {
          notify(`⚠ ${found.code} estava EM USO no sistema`, 'err');
        }
        return;
      }

      // Modo ação (retirar/devolver): fecha a câmera após 1 leitura.
      setScanning(false);

      if (!found) {
        notify('Chave não encontrada no sistema.', 'err');
        return;
      }

      if (isPorta) {
        openSheet(found, 'identify');
        return;
      }

      const st = normalize(found.status);
      if (st === 'DISPONIVEL') openSheet(found, 'retirar');
      else if (st === 'EM_USO') openSheet(found, 'devolver');
      else notify('Chave indisponível para ação.', 'err');
    } catch {
      notify('QR Code inválido.', 'err');
    }
  };

  // ---------- Conferência de inventário ----------
  const startConference = () => {
    const expected = keys.filter((k) => normalize(k.status) === 'DISPONIVEL');
    setConf({ expected, presentIds: [], unexpected: [] });
  };

  const markPresent = (key: Key) => {
    setConf((c) => {
      if (!c) return c;
      const id = String(key.id);
      const isExpected = c.expected.some((k) => String(k.id) === id);
      if (isExpected) {
        if (c.presentIds.includes(id)) return c;
        return { ...c, presentIds: [...c.presentIds, id] };
      }
      if (c.unexpected.some((k) => String(k.id) === id)) return c;
      return { ...c, unexpected: [...c.unexpected, key] };
    });
  };

  const togglePresent = (key: Key) => {
    setConf((c) => {
      if (!c) return c;
      const id = String(key.id);
      return c.presentIds.includes(id)
        ? { ...c, presentIds: c.presentIds.filter((x) => x !== id) }
        : { ...c, presentIds: [...c.presentIds, id] };
    });
  };

  const finalizeConference = async () => {
    if (!conf) return;
    setBusy(true);
    try {
      const presentSet = new Set(conf.presentIds.map(String));
      const missing = conf.expected.filter(
        (k) => !presentSet.has(String(k.id))
      );

      const items: InventoryItemInput[] = [
        ...conf.expected.map((k) => ({
          key_id: String(k.id),
          key_code: k.code || '',
          key_label: k.label || '',
          result: presentSet.has(String(k.id))
            ? ('present' as const)
            : ('missing' as const),
        })),
        ...conf.unexpected.map((k) => ({
          key_id: String(k.id),
          key_code: k.code || '',
          key_label: k.label || '',
          result: 'unexpected' as const,
        })),
      ];

      await saveInventory({
        performedBy: session?.user?.id ?? null,
        performedByName: profile?.full_name || 'Operador',
        items,
      });

      setConfSummary({
        present: presentSet.size,
        missing,
        unexpected: conf.unexpected,
      });
      setConf(null);
      notify('Conferência salva com sucesso.', 'ok');
    } catch (e: any) {
      notify(`Erro ao salvar conferência: ${e?.message ?? 'erro'}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!scanning) return;

    const qr = new Html5Qrcode('m-qr-reader');
    html5QrRef.current = qr;

    qr
      .start(
        { facingMode: 'environment' }, // câmera traseira
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => handleDecoded(decoded),
        () => {}
      )
      .catch((err) => {
        console.error('Erro ao abrir câmera:', err);
        notify(
          'Não foi possível abrir a câmera. Verifique a permissão do navegador.',
          'err'
        );
        setScanning(false);
      });

    return () => {
      const inst = html5QrRef.current;
      html5QrRef.current = null;
      if (inst) {
        inst
          .stop()
          .then(() => inst.clear())
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  // ---------- Assinatura ----------
  useEffect(() => {
    if (!signing) return;
    const c = sigCanvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000';
    }
    setHasInk(false);
  }, [signing]);

  const sigPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = sigCanvasRef.current!;
    const r = c.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  };

  const sigDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const c = sigCanvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = sigPoint(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const sigMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = sigCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = sigPoint(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setHasInk(true);
  };

  const sigUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = false;
    try {
      sigCanvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const sigClear = () => {
    const c = sigCanvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) {
      ctx.clearRect(0, 0, c.width, c.height);
      setHasInk(false);
    }
  };

  const sigConfirm = () => {
    const c = sigCanvasRef.current;
    if (!c || !hasInk) return;
    setSignature(c.toDataURL('image/png'));
    setSigning(false);
  };

  // ---------- Ações ----------
  const confirmRetirar = async () => {
    if (!sheet || !checkoutName.trim() || !signature) return;
    if (!session?.user?.id) {
      notify('Sessão inválida. Entre novamente.', 'err');
      return;
    }
    setBusy(true);
    try {
      await rpcCheckoutKey(
        sheet.key.id,
        session.user.id,
        checkoutName.trim(),
        session.user.id,
        signature
      );
      await loadKeys();
      setSheet(null);
      notify('Chave retirada com sucesso.');
    } catch (e: any) {
      notify(`Erro ao retirar: ${e?.message ?? 'erro'}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  const confirmDevolver = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      await rpcReturnKey(sheet.key.id, profile?.full_name || 'Usuário');
      await loadKeys();
      setSheet(null);
      notify('Chave devolvida com sucesso.');
    } catch (e: any) {
      notify(`Erro ao devolver: ${e?.message ?? 'erro'}`, 'err');
    } finally {
      setBusy(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return keys;
    return keys.filter((k) =>
      smartSearch(
        search,
        k.code,
        k.label,
        k.description,
        k.sector_name,
        k.sector,
        statusLabel(k.status)
      )
    );
  }, [keys, search]);

  // ---------- RENDER ----------
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Carregando…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center p-6">
        <div className="bg-white rounded-3xl shadow-xl p-6">
          <div className="flex items-center justify-center gap-3 mb-6">
            <img src={acessaLogo} alt="ACESSA" className="h-10 object-contain" />
            <div className="w-px h-8 bg-slate-200" />
            <img src={vsaLogo} alt="VSA" className="h-7 object-contain" />
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
          <p className="text-slate-500 text-sm mb-5">Acesso do operador</p>

          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full mb-3 p-4 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Senha"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full mb-3 p-4 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
          />

          {loginError && (
            <p className="text-rose-600 text-sm mb-3">{loginError}</p>
          )}

          <button
            onClick={doLogin}
            disabled={loggingIn || !email.trim() || !pass}
            className="w-full bg-[#BA7517] text-white font-bold py-4 rounded-xl disabled:bg-slate-300"
          >
            {loggingIn ? 'Entrando…' : 'Entrar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-10">
      {/* Topo */}
      <header className="sticky top-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-10">
        <img src={acessaLogo} alt="ACESSA" className="h-7 object-contain" />
        <button
          onClick={() => signOut()}
          className="text-rose-600 font-bold text-sm"
        >
          Sair
        </button>
      </header>

      <div className="p-4 space-y-4">
        <button
          onClick={() => {
            scanModeRef.current = 'action';
            setScanning(true);
          }}
          className="w-full bg-[#BA7517] text-white font-bold py-5 rounded-2xl text-lg shadow-lg active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          📷 Escanear QR
        </button>

        <button
          onClick={startConference}
          className="w-full bg-white border-2 border-[#BA7517] text-[#BA7517] font-bold py-4 rounded-2xl active:scale-[0.99] transition flex items-center justify-center gap-2"
        >
          📋 Conferência de Inventário
        </button>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar chave por código, nome ou setor…"
          className="w-full p-4 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
        />

        <div className="space-y-3">
          {filtered.map((key) => (
            <button
              key={key.id}
              onClick={() => onTapKey(key)}
              className="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between gap-3 active:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{key.code}</p>
                <p className="text-sm text-slate-500 truncate">{key.label}</p>
              </div>
              <span
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold ${statusClass(
                  key.status
                )}`}
              >
                {statusLabel(key.status)}
              </span>
            </button>
          ))}

          {filtered.length === 0 && (
            <p className="text-center text-slate-400 text-sm py-10">
              Nenhuma chave encontrada.
            </p>
          )}
        </div>
      </div>

      {/* Scanner full-screen */}
      {scanning && (
        <div className="fixed inset-0 bg-white z-40 flex flex-col">
          <header className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h1 className="font-bold text-slate-900">
              {conf ? 'Conferência' : 'Escanear QR'}
            </h1>
            <button
              onClick={() => setScanning(false)}
              className="text-slate-500 font-bold"
            >
              {conf ? 'Concluir leitura' : 'Fechar'}
            </button>
          </header>
          <div className="p-4">
            <div
              id="m-qr-reader"
              className="w-full rounded-2xl overflow-hidden border border-slate-200"
            />
            {conf ? (
              <div className="text-center mt-4">
                <p className="text-lg font-bold text-slate-900">
                  Conferidas: {conf.presentIds.length} / {conf.expected.length}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Escaneie as chaves que estão no claviculário.
                </p>
              </div>
            ) : (
              <p className="text-center text-xs text-slate-500 mt-4">
                🚪 QR da <b>porta</b> identifica a chave &nbsp;·&nbsp; 🔑 QR da{' '}
                <b>chave</b> libera a ação.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Conferência de inventário */}
      {conf && !scanning && (
        <div className="fixed inset-0 bg-slate-50 z-30 flex flex-col">
          <header className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
            <h1 className="font-bold text-slate-900">Conferência de Inventário</h1>
            <button
              onClick={() => setConf(null)}
              className="text-slate-500 font-bold text-sm"
            >
              Cancelar
            </button>
          </header>

          <div className="px-4 py-3 bg-white border-b border-slate-100">
            <p className="text-sm text-slate-500">
              Conferidas{' '}
              <b className="text-slate-900">
                {conf.presentIds.length} / {conf.expected.length}
              </b>
            </p>
            <div className="h-2 bg-slate-200 rounded-full mt-2 overflow-hidden">
              <div
                className="h-full bg-emerald-500"
                style={{
                  width: `${
                    conf.expected.length
                      ? (conf.presentIds.length / conf.expected.length) * 100
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {conf.unexpected.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-orange-700 text-sm">
                ⚠ {conf.unexpected.length} chave(s) escaneada(s) estavam{' '}
                <b>EM USO</b> no sistema (devolvidas sem registrar).
              </div>
            )}

            {conf.expected.map((key) => {
              const present = conf.presentIds.includes(String(key.id));
              return (
                <button
                  key={key.id}
                  onClick={() => togglePresent(key)}
                  className={`w-full text-left rounded-xl border p-3 flex items-center justify-between gap-3 ${
                    present
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{key.code}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {key.label}
                    </p>
                  </div>
                  <span className="shrink-0 text-lg">
                    {present ? '✅' : '⬜'}
                  </span>
                </button>
              );
            })}

            {conf.expected.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-10">
                Nenhuma chave disponível para conferir no momento.
              </p>
            )}
          </div>

          <div className="p-4 bg-white border-t border-slate-200 space-y-3">
            <button
              onClick={() => {
                scanModeRef.current = 'inventory';
                setScanning(true);
              }}
              className="w-full bg-[#BA7517] text-white font-bold py-4 rounded-xl"
            >
              📷 Escanear chaves
            </button>
            <button
              onClick={finalizeConference}
              disabled={busy}
              className="w-full bg-emerald-600 text-white font-bold py-4 rounded-xl disabled:bg-slate-300"
            >
              {busy ? 'Salvando…' : 'Finalizar e salvar'}
            </button>
          </div>
        </div>
      )}

      {/* Resumo da conferência */}
      {confSummary && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-end">
          <div className="bg-white w-full rounded-t-3xl max-h-[92vh] overflow-y-auto p-5">
            <h2 className="text-xl font-bold text-slate-900 mb-4">
              Resultado da Conferência
            </h2>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-emerald-700">
                  {confSummary.present}
                </p>
                <p className="text-xs text-emerald-700">Presentes</p>
              </div>
              <div className="bg-rose-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-rose-700">
                  {confSummary.missing.length}
                </p>
                <p className="text-xs text-rose-700">Sumidas</p>
              </div>
              <div className="bg-orange-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-extrabold text-orange-700">
                  {confSummary.unexpected.length}
                </p>
                <p className="text-xs text-orange-700">Divergentes</p>
              </div>
            </div>

            {confSummary.missing.length > 0 && (
              <div className="mb-4">
                <p className="font-bold text-rose-700 mb-2">
                  🔴 Não encontradas (sumidas)
                </p>
                <div className="space-y-1">
                  {confSummary.missing.map((k) => (
                    <div
                      key={k.id}
                      className="text-sm bg-rose-50 rounded-lg px-3 py-2"
                    >
                      <b>{k.code}</b> — {k.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {confSummary.unexpected.length > 0 && (
              <div className="mb-4">
                <p className="font-bold text-orange-700 mb-2">
                  🟠 Estavam EM USO no sistema (devolvidas sem registrar)
                </p>
                <div className="space-y-1">
                  {confSummary.unexpected.map((k) => (
                    <div
                      key={k.id}
                      className="text-sm bg-orange-50 rounded-lg px-3 py-2"
                    >
                      <b>{k.code}</b> — {k.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {confSummary.missing.length === 0 &&
              confSummary.unexpected.length === 0 && (
                <p className="text-center text-emerald-700 font-bold py-4">
                  ✅ Tudo certo! Todas as chaves conferem com o sistema.
                </p>
              )}

            <button
              onClick={() => setConfSummary(null)}
              className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl mt-2"
            >
              Concluir
            </button>
          </div>
        </div>
      )}

      {/* Bottom sheet de ação */}
      {sheet && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end"
          onClick={() => !busy && setSheet(null)}
        >
          <div
            className="bg-white w-full rounded-t-3xl max-h-[92vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-400 uppercase">
                  Chave
                </p>
                <p className="text-2xl font-extrabold text-slate-900">
                  {sheet.key.code}
                </p>
                <p className="text-slate-600">{sheet.key.label}</p>
              </div>
              <button
                onClick={() => setSheet(null)}
                className="text-slate-400 text-2xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {sheet.mode === 'identify' && (
              <>
                <div className="mb-4">
                  <span
                    className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${statusClass(
                      sheet.key.status
                    )}`}
                  >
                    {statusLabel(sheet.key.status)}
                  </span>
                </div>
                <button
                  onClick={() => setSheet(null)}
                  className="w-full bg-slate-100 font-bold py-4 rounded-xl"
                >
                  Fechar
                </button>
              </>
            )}

            {sheet.mode === 'retirar' && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-bold text-slate-700">
                    Nome de quem está retirando
                  </label>
                  <input
                    value={checkoutName}
                    onChange={(e) => setCheckoutName(e.target.value)}
                    placeholder="Ex: Carlos Silva"
                    className="w-full mt-1 p-4 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-700">
                    Assinatura
                  </label>
                  {signature ? (
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-emerald-600 font-bold text-sm">
                        ✓ Assinatura capturada
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSignature(null);
                          setSigning(true);
                        }}
                        className="text-slate-500 underline text-sm"
                      >
                        Refazer
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSigning(true)}
                      className="w-full mt-1 bg-blue-600 text-white font-bold py-4 rounded-xl"
                    >
                      ✍️ Assinar
                    </button>
                  )}
                </div>

                <button
                  onClick={confirmRetirar}
                  disabled={!checkoutName.trim() || !signature || busy}
                  className="w-full bg-[#BA7517] text-white font-bold py-4 rounded-xl disabled:bg-slate-300"
                >
                  {busy ? 'Salvando…' : 'Confirmar Retirada'}
                </button>
              </div>
            )}

            {sheet.mode === 'devolver' && (
              <div className="space-y-4">
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-orange-700 text-sm">
                  Esta chave está em uso. Deseja confirmar a devolução?
                </div>
                <button
                  onClick={confirmDevolver}
                  disabled={busy}
                  className="w-full bg-orange-500 text-white font-bold py-4 rounded-xl disabled:bg-slate-300"
                >
                  {busy ? 'Salvando…' : 'Confirmar Devolução'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assinatura tela cheia (fora do sheet para não quebrar) */}
      {signing && (
        <div
          className="fixed inset-0 z-[70] bg-white flex flex-col p-3"
          style={{ touchAction: 'none', overscrollBehavior: 'none' }}
        >
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Assinatura</h2>
              <p className="text-xs text-slate-500">Assine dentro do campo.</p>
            </div>
            <button
              type="button"
              onClick={() => setSigning(false)}
              className="bg-slate-100 px-4 py-2 rounded-xl font-bold text-slate-600"
            >
              Fechar
            </button>
          </div>

          <div
            className="flex-1 min-h-0 rounded-xl border-2 border-slate-300 overflow-hidden bg-white"
            style={{ touchAction: 'none', overscrollBehavior: 'none' }}
          >
            <canvas
              ref={sigCanvasRef}
              width={900}
              height={500}
              className="block h-full w-full"
              style={{
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
              onPointerDown={sigDown}
              onPointerMove={sigMove}
              onPointerUp={sigUp}
              onPointerCancel={sigUp}
              onPointerLeave={sigUp}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 shrink-0">
            <button
              type="button"
              onClick={sigClear}
              className="bg-slate-100 py-4 rounded-xl font-bold text-slate-600"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={sigConfirm}
              disabled={!hasInk}
              className="bg-blue-600 text-white py-4 rounded-xl font-bold disabled:bg-slate-300"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 left-4 right-4 z-[80] rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === 'ok'
              ? 'bg-emerald-600 text-white'
              : 'bg-rose-600 text-white'
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
