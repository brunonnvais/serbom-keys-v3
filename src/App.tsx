import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import type { Key, Movement, User } from '../types';
import { MOCK_USERS } from '../constants';
import { getSmartKeyReport, askAssistant } from '../services/geminiService';
import SignaturePad from '../components/SignaturePad';
import {
  dbCreateKey,
  dbListKeys,
  rpcCheckoutKey,
  rpcReturnKey,
} from '../services/keysService';
import { dbListMovements } from '../services/movementsService';
import { listInventories, getInventoryItems } from '../services/inventoryService';
import { supabase } from '../services/supabaseClient';
import { signInWithEmail, signOut } from '../services/authService';
import { createSystemUser } from '../services/userService';
import {
  updateSystemUser,
  resetSystemUserPassword,
} from '../services/userAdminService';
import { QRCodeCanvas } from 'qrcode.react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import acessaLogo from "./assets/acessa/acessa_horizontal.png";
import vsaLogo from "./assets/vsa-logo.png";
// Busca inteligente: ignora acentos/maiúsculas e exige que TODOS os termos
// digitados apareçam em qualquer um dos campos informados.
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

// Traduz erros de login para mensagens amigáveis (sem "Failed to fetch" cru).
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

const SidebarItem: React.FC<{
  active: boolean;
  label: string;
  icon: string;
  onClick: () => void;
}> = ({ active, label, icon, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${active
      ? 'bg-[#BA7517] text-white shadow-lg'
      : 'text-slate-600 hover:bg-blue-50 hover:text-blue-600'
      }`}
  >
    <span className="text-xl">{icon}</span>
    <span className="font-medium">{label}</span>
  </button>
);

const KeyQrPage = ({ keys }: any) => {
  const { id } = useParams();

  const key = keys.find((k: any) => k.id === id);

  if (!key) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Chave não encontrada
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {key.code}
        </h1>

        <p className="text-slate-500 mb-6">
          {key.label}
        </p>

        <div className="mb-6">
          <span className="inline-flex px-4 py-2 rounded-full bg-emerald-100 text-emerald-700 font-bold">
            {key.status}
          </span>
        </div>

        <button className="w-full bg-[#BA7517] text-white font-bold py-4 rounded-xl">
          Retirar Chave
        </button>
      </div>
    </div>
  );
};
const App: React.FC = () => {
  const [view, setView] = useState<
    | 'login'
    | 'dashboard'
    | 'keys'
    | 'history'
    | 'assistant'
    | 'key_admin'
    | 'users'
    | 'cabinet_g1'
    | 'cabinet_g1_new_key'
    | 'scanner'
    | 'change-password'
    | 'inventories'
  >('dashboard');

  const [hasOpenedQrKey, setHasOpenedQrKey] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isCreatingSystemUser, setIsCreatingSystemUser] = useState(false);

  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'manager' | 'operator'>('operator');
  const [newUserIsActive, setNewUserIsActive] = useState(true);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [loadingSystemUsers, setLoadingSystemUsers] = useState(false);

  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [isUpdatingSystemUser, setIsUpdatingSystemUser] = useState(false);
  const [editingSystemUser, setEditingSystemUser] = useState<any | null>(null);

  const [editUserFullName, setEditUserFullName] = useState('');
  const [editUserRole, setEditUserRole] = useState<'admin' | 'manager' | 'operator'>('operator');
  const [editUserIsActive, setEditUserIsActive] = useState(true);

  const [keys, setKeys] = useState<Key[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [users] = useState<User[]>(MOCK_USERS);

  const [isCheckOutModalOpen, setIsCheckOutModalOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<Key | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [checkoutUser, setCheckoutUser] = useState('');

  const [smartReport, setSmartReport] = useState<string | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const [assistantQuery, setAssistantQuery] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [loadingAssistant, setLoadingAssistant] = useState(false);

  const [g1KeyTag, setG1KeyTag] = useState('');
  const [g1KeyLocal, setG1KeyLocal] = useState('');
  const [g1KeyDesc, setG1KeyDesc] = useState('');

  const [isKeyMenuOpenId, setIsKeyMenuOpenId] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editKey, setEditKey] = useState<Key | null>(null);
  const [editTag, setEditTag] = useState('');
  const [editLocal, setEditLocal] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSectorId, setEditSectorId] = useState('');

  const menuWrapperRef = useRef<HTMLDivElement | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newKeyCode, setNewKeyCode] = useState('');
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyDescription, setNewKeyDescription] = useState('');
  const [newKeySector, setNewKeySector] = useState('');
  const [newKeyCabinetId, setNewKeyCabinetId] = useState('');

  // Notificações (toasts) bonitas no lugar dos alerts nativos
  const [toasts, setToasts] = useState<
    { id: number; type: 'success' | 'error' | 'info'; message: string }[]
  >([]);

  // Modal de confirmação bonito no lugar do window.confirm nativo
  const [confirmState, setConfirmState] = useState<{
    message: string;
    confirmLabel: string;
    danger: boolean;
    resolve: (value: boolean) => void;
  } | null>(null);

  // Pré-visualização ampliada da assinatura (auditoria)
  const [previewSignature, setPreviewSignature] = useState<string | null>(null);

  // Inventários (conferências)
  const [inventories, setInventories] = useState<any[]>([]);
  const [loadingInventories, setLoadingInventories] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<any | null>(null);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loadingInventoryItems, setLoadingInventoryItems] = useState(false);

  const loadInventories = async () => {
    try {
      setLoadingInventories(true);
      const data = await listInventories();
      setInventories(data ?? []);
    } catch (e: any) {
      console.error('Erro ao carregar inventários:', e);
      notify(e?.message || 'Erro ao carregar inventários.');
    } finally {
      setLoadingInventories(false);
    }
  };

  const openInventory = async (inv: any) => {
    setSelectedInventory(inv);
    setInventoryItems([]);
    try {
      setLoadingInventoryItems(true);
      const items = await getInventoryItems(inv.id);
      setInventoryItems(items ?? []);
    } catch (e: any) {
      console.error('Erro ao carregar itens do inventário:', e);
      notify(e?.message || 'Erro ao carregar itens.');
    } finally {
      setLoadingInventoryItems(false);
    }
  };

  const handleExportInventoryPdf = (inv: any, items: any[]) => {
    const doc = new jsPDF();
    const date = new Date(inv.created_at);

    doc.setFontSize(16);
    doc.text('Conferência de Inventário - ACESSA', 14, 18);

    doc.setFontSize(10);
    doc.text(`Data: ${date.toLocaleString('pt-BR')}`, 14, 27);
    doc.text(`Conferente: ${inv.performed_by_name || '—'}`, 14, 33);
    doc.text(
      `Presentes: ${inv.total_present}   |   Sumidas: ${inv.total_missing}   |   Divergentes: ${inv.total_unexpected}   |   Esperadas: ${inv.total_expected}`,
      14,
      39
    );

    const label = (r: string) =>
      r === 'present'
        ? 'Presente'
        : r === 'missing'
          ? 'SUMIDA'
          : 'DIVERGENTE';

    const order = (r: string) =>
      r === 'missing' ? 0 : r === 'unexpected' ? 1 : 2;

    const rows = [...items]
      .sort((a, b) => order(a.result) - order(b.result))
      .map((it) => [it.key_code || '', it.key_label || '', label(it.result)]);

    autoTable(doc, {
      startY: 45,
      head: [['Código', 'Chave', 'Resultado']],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [186, 117, 23] },
    });

    doc.save(`inventario-${date.toISOString().slice(0, 10)}.pdf`);
  };
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [cabinets, setCabinets] = useState<any[]>([]);
  const [showCreateCabinet, setShowCreateCabinet] = useState(false);

  const [cabinetName, setCabinetName] = useState('');
  const [cabinetLocation, setCabinetLocation] = useState('');
  const [cabinetDescription, setCabinetDescription] = useState('');
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [keySearch, setKeySearch] = useState('');

  const [sectors, setSectors] = useState<any[]>([]);
  const [showCreateSector, setShowCreateSector] = useState(false);
  const [sectorName, setSectorName] = useState('');
  const [sectorDescription, setSectorDescription] = useState('');

  const [g1KeySectorId, setG1KeySectorId] = useState<string>("");
  const [g1KeySectorName, setG1KeySectorName] = useState<string>("");

  const [isCabinetMenuOpenId, setIsCabinetMenuOpenId] = useState<string | null>(null);

  // Abas da tela de Cadastros
  const [cadastroTab, setCadastroTab] = useState<'cabinets' | 'sectors' | 'keys'>('cabinets');

  // Edição de armário
  const [showEditCabinet, setShowEditCabinet] = useState(false);
  const [editingCabinetId, setEditingCabinetId] = useState<string | null>(null);
  const [editCabinetName, setEditCabinetName] = useState('');
  const [editCabinetDescription, setEditCabinetDescription] = useState('');

  // Setores: menu de ações + edição
  const [isSectorMenuOpenId, setIsSectorMenuOpenId] = useState<string | null>(null);
  const [showEditSector, setShowEditSector] = useState(false);
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [editSectorName, setEditSectorName] = useState('');
  const [editSectorDescription, setEditSectorDescription] = useState('');
  const [printKey, setPrintKey] = useState<Key | null>(null);
  const [shouldPrint, setShouldPrint] = useState(false);

  // Chave identificada ao escanear o QR de uma PORTA (apenas mostra, não libera retirada)
  const [doorKey, setDoorKey] = useState<Key | null>(null);

  // Modal para exibir o QR (da chave ou da porta) sob demanda
  const [qrModal, setQrModal] = useState<{ key: Key; type: 'chave' | 'porta' } | null>(null);

  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('ALL');
  const APP_URL = "https://serbom-keys-v3.vercel.app";

  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState('');
  const mustChangePassword = profile?.must_change_password === true;


  const handleOpenEditUserModal = (user: any) => {
    setEditingSystemUser(user);
    setEditUserFullName(user.full_name || '');
    setEditUserRole((user.role || 'operator') as 'admin' | 'manager' | 'operator');
    setEditUserIsActive(!!user.is_active);
    setIsEditUserModalOpen(true);
  };

  const handleCloseEditUserModal = () => {
    setIsEditUserModalOpen(false);
    setEditingSystemUser(null);
    setEditUserFullName('');
    setEditUserRole('operator');
    setEditUserIsActive(true);
  };

  const handleUpdateSystemUser = async () => {
    if (!editingSystemUser?.id) {
      notify('Usuário inválido.');
      return;
    }

    if (!editUserFullName.trim()) {
      notify('Informe o nome completo.');
      return;
    }

    try {
      setIsUpdatingSystemUser(true);

      await updateSystemUser({
        user_id: editingSystemUser.id,
        full_name: editUserFullName.trim(),
        role: editUserRole,
        is_active: editUserIsActive,
      });

      await loadSystemUsers();
      handleCloseEditUserModal();
      notify('Usuário atualizado com sucesso.');
    } catch (error: any) {
      console.error('Erro ao atualizar usuário:', error);
      notify(error?.message || 'Erro ao atualizar usuário.');
    } finally {
      setIsUpdatingSystemUser(false);
    }

  };
  const handleResetUserPassword = async () => {
    if (!editingSystemUser?.id) {
      notify('Usuário inválido.');
      return;
    }

    const temporaryPassword = prompt(
      'Informe a senha provisória.\n\nExemplo: Serbom@2026'
    );

    if (!temporaryPassword) {
      return;
    }

    if (
      temporaryPassword.length < 8 ||
      !/[A-Z]/.test(temporaryPassword) ||
      !/[a-z]/.test(temporaryPassword) ||
      !/[0-9]/.test(temporaryPassword) ||
      !/[^A-Za-z0-9]/.test(temporaryPassword)
    ) {
      notify(
        'A senha deve conter no mínimo 8 caracteres, letra maiúscula, letra minúscula, número e caractere especial.'
      );
      return;
    }

    try {
      await resetSystemUserPassword({
        user_id: editingSystemUser.id,
        temporary_password: temporaryPassword,
        must_change_password: true,
      });

      notify(
        'Senha redefinida com sucesso. O usuário será obrigado a trocar a senha no próximo login.'
      );
    } catch (error: any) {
      console.error(error);
      notify(error?.message || 'Erro ao redefinir senha.');
    }
  };
  const confirmDialog = (
    message: string,
    options?: { confirmLabel?: string; danger?: boolean }
  ) =>
    new Promise<boolean>((resolve) => {
      setConfirmState({
        message,
        confirmLabel: options?.confirmLabel ?? 'Confirmar',
        danger: options?.danger ?? true,
        resolve,
      });
    });

  const notify = (
    message: string,
    type?: 'success' | 'error' | 'info'
  ) => {
    const resolved: 'success' | 'error' | 'info' =
      type ?? (/sucesso/i.test(message) ? 'success' : 'error');

    const id = Date.now() + Math.random();

    setToasts((prev) => [...prev, { id, type: resolved, message }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const reloadAll = async () => {
    try {
      const [
        keysData,
        movementsData,
        cabinetsResponse,
        sectorsResponse
      ] = await Promise.all([
        dbListKeys(),
        dbListMovements(),
        supabase
          .from('cabinets')
          .select('*')
          .is('archived_at', null)
          .order('name'),
        supabase
          .from('sectors')
          .select('*')
          .is('archived_at', null)
          .order('name'),
      ]);

      setKeys(keysData ?? []);
      setMovements(movementsData ?? []);
      setCabinets(cabinetsResponse.data ?? []);
      setSectors(sectorsResponse.data ?? []);

    } catch (e) {
      console.error('Erro ao carregar do Supabase:', e);
    }
  };

  const loadSystemUsers = async () => {
    try {
      setLoadingSystemUsers(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setSystemUsers(data ?? []);
    } catch (err) {
      console.error('Erro ao carregar usuários:', err);
      setSystemUsers([]);
    } finally {
      setLoadingSystemUsers(false);
    }
  };
  const resetUserModalForm = () => {
    setNewUserFullName('');
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserRole('operator');
    setNewUserIsActive(true);
  };

  const handleOpenUserModal = () => {
    resetUserModalForm();
    setIsUserModalOpen(true);
  };

  const handleCloseUserModal = () => {
    setIsUserModalOpen(false);
    resetUserModalForm();
  };
  const handleCreateSystemUser = async () => {
    if (!newUserFullName.trim()) {
      notify('Informe o nome completo.');
      return;
    }

    const email = newUserEmail.trim().toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!emailOk) {
      notify('Informe um e-mail válido.');
      return;
    }

    if (!newUserPassword.trim() || newUserPassword.length < 6) {
      notify('A senha temporária deve ter pelo menos 6 caracteres.');
      return;
    }

    try {
      setIsCreatingSystemUser(true);

      await createSystemUser({
        full_name: newUserFullName.trim(),
        email,
        password: newUserPassword,
        role: newUserRole,
        is_active: newUserIsActive,
      });

      await loadSystemUsers();
      handleCloseUserModal();
      notify('Usuário criado com sucesso.');
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      notify(error?.message || 'Erro ao criar usuário.');
    } finally {
      setIsCreatingSystemUser(false);
    }
  };
  const loadUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;

      setProfile(data ?? null);

      if (data?.role === 'admin') {
        await loadSystemUsers();
      } else {
        setSystemUsers([]);
      }
    } catch (err) {
      console.error('Erro ao carregar profile:', err);
      setProfile(null);
      setSystemUsers([]);
    }
  };
  useEffect(() => {
    if (!shouldPrint) return;

    const timer = setTimeout(() => {
      window.print();
      setShouldPrint(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [shouldPrint, printKey]);
  useEffect(() => {
    let mounted = true;

    const realtimeChannel = supabase
      .channel("db-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "keys" },
        async (payload) => {
          console.log("REALTIME KEYS:", payload);
          await reloadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "movements" },
        async (payload) => {
          console.log("REALTIME MOVEMENTS:", payload);
          await reloadAll();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cabinets" },
        async (payload) => {
          console.log("REALTIME CABINETS:", payload);
          await reloadAll();
        }
      )
      .subscribe((status) => {
        console.log("REALTIME STATUS:", status);
      });

    const init = async () => {
      try {
        const sessionResult = await supabase.auth.getSession();
        const currentSession = sessionResult.data.session;

        if (!mounted) return;

        setSession(currentSession);

        if (currentSession?.user) {
          await loadUserProfile(currentSession.user.id);
        } else {
          setProfile(null);
          setSystemUsers([]);
        }

        // Carrega os dados (chaves, movimentações, etc.) em segundo plano,
        // sem travar a tela de carregamento.
        reloadAll();
      } catch (err) {
        console.error("Erro inicial:", err);
      } finally {
        if (mounted) {
          setAuthLoading(false);
        }
      }
    };

    init();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);

      setTimeout(async () => {
        try {
          if (nextSession?.user) {
            await loadUserProfile(nextSession.user.id);
          } else {
            setProfile(null);
            setSystemUsers([]);
          }

          await reloadAll();
        } catch (err) {
          console.error("Erro no onAuthStateChange:", err);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
      supabase.removeChannel(realtimeChannel);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!menuWrapperRef.current) return;
      if (!menuWrapperRef.current.contains(event.target as Node)) {
        setIsKeyMenuOpenId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  useEffect(() => {
    if (hasOpenedQrKey) return;
    if (!keys.length) return;

    const path = window.location.pathname;

    if (!path.startsWith('/key/')) return;

    const keyId = path.replace('/key/', '');
    const foundKey = keys.find((k) => k.id === keyId);

    if (!foundKey) return;

    setHasOpenedQrKey(true);
    setView('keys');

    // QR da PORTA: só identifica qual chave abre, não libera a retirada.
    const isPorta = new URLSearchParams(window.location.search).get('porta');
    if (isPorta) {
      setDoorKey(foundKey);
      return;
    }

    setSelectedKey(foundKey);

    if (normalizeStatus(foundKey.status) === 'DISPONIVEL') {
      setCheckoutUser('');
      setSignature(null);
      setIsCheckOutModalOpen(true);
    } else if (normalizeStatus(foundKey.status) === 'EM_USO') {
      confirmDialog(
        `A chave ${foundKey.code} está em uso. Deseja devolver agora?`,
        { confirmLabel: 'Devolver', danger: false }
      ).then((confirmReturn) => {
        if (confirmReturn) {
          handleReturn(foundKey.id);
        }
      });
    }
  }, [keys, hasOpenedQrKey]);

  useEffect(() => {
    if (view !== 'scanner') return;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: {
          width: 280,
          height: 280,
        },
        rememberLastUsedCamera: true,
        supportedScanTypes: [],
      },
      false
    );

    scanner.render(
      (decodedText) => {
        console.log('QR Lido:', decodedText);

        scanner.clear().catch(console.error);

        try {
          const url = new URL(decodedText);

          const keyId = url.pathname.replace('/key/', '');

          const foundKey = keys.find((k) => k.id === keyId);

          if (!foundKey) {
            notify('Chave não encontrada no sistema.');
            setView('keys');
            return;
          }

          setView('keys');

          // QR da PORTA: só identifica qual chave abre, não libera a retirada.
          const isPorta = url.searchParams.get('porta');
          if (isPorta) {
            setDoorKey(foundKey);
            return;
          }

          setSelectedKey(foundKey);

          if (normalizeStatus(foundKey.status) === 'DISPONIVEL') {
            setCheckoutUser('');
            setSignature(null);
            setIsCheckOutModalOpen(true);
          } else {
            confirmDialog(
              `A chave ${foundKey.code} está em uso. Deseja devolver agora?`,
              { confirmLabel: 'Devolver', danger: false }
            ).then((confirmReturn) => {
              if (confirmReturn) {
                handleReturn(foundKey.id);
              }
            });
          }
        } catch (err) {
          console.error(err);
          notify('QR Code inválido.');
        }
      },
      (error) => {
        console.warn(error);
      }
    );

    return () => {
      scanner.clear().catch(console.error);
    };
  }, [view]);

  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const isOperator = profile?.role === 'operator';
  const canOperateKeys = isAdmin || isManager || isOperator;
  console.log('PROFILE LOGADO:', profile);
  console.log('PERMISSÕES:', { isAdmin, isManager, isOperator });

  const stats = useMemo(() => {
    const normalize = (status?: string) => {
      if (!status) return 'DISPONIVEL';

      const value = status.toUpperCase().trim();

      if (value === 'AVAILABLE') return 'DISPONIVEL';
      if (value === 'IN_USE') return 'EM_USO';
      if (value === 'MAINTENANCE') return 'MANUTENCAO';

      return value;
    };

    const delayed = (borrowedAt?: string | null) => {
      if (!borrowedAt) return false;

      const borrowedTime = new Date(borrowedAt).getTime();
      const now = Date.now();

      const diffHours = (now - borrowedTime) / (1000 * 60 * 60);

      return diffHours >= 4;
    };

    return {
      total: keys.length,

      inUse: keys.filter(
        (k) => normalize(k.status) === 'EM_USO'
      ).length,

      available: keys.filter(
        (k) => normalize(k.status) === 'DISPONIVEL'
      ).length,

      delayed: keys.filter(
        (k) =>
          normalize(k.status) === 'EM_USO' &&
          delayed(k.borrowed_at)
      ).length,

      alert: keys.filter(
        (k) =>
          normalize(k.status) === 'PERDIDA' ||
          normalize(k.status) === 'MANUTENCAO'
      ).length,
    };
  }, [keys]);

  // Dados para os gráficos do dashboard
  const dashboardCharts = useMemo(() => {
    const statusData = [
      { name: 'Disponíveis', value: stats.available, color: '#10b981' },
      { name: 'Em uso', value: Math.max(stats.inUse - stats.delayed, 0), color: '#3b82f6' },
      { name: 'Atrasadas', value: stats.delayed, color: '#ef4444' },
      { name: 'Manutenção', value: stats.alert, color: '#f59e0b' },
    ].filter((d) => d.value > 0);

    // Retiradas nos últimos 7 dias
    const days: { label: string; key: string; retiradas: number }[] = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      });
      days.push({ label, key, retiradas: 0 });
    }

    (movements || []).forEach((m: any) => {
      const w = m.withdrawnAt || m.withdrawn_at;
      if (!w) return;
      const key = new Date(w).toISOString().slice(0, 10);
      const day = days.find((d) => d.key === key);
      if (day) day.retiradas += 1;
    });

    return { statusData, days };
  }, [stats, movements]);

  const g1Keys = useMemo(() => {
    return keys.filter((k) => (k.sector || '').toUpperCase() === 'G1');
  }, [keys]);

  const normalizeStatus = (status: string) => {
    if (!status) return 'DISPONIVEL';

    const value = status.toUpperCase().trim();

    if (value === 'AVAILABLE') return 'DISPONIVEL';
    if (value === 'IN_USE') return 'EM_USO';
    if (value === 'MAINTENANCE') return 'MANUTENCAO';

    return value;
  };

  const formatStatusLabel = (status: string) => {
    const normalized = normalizeStatus(status);

    if (normalized === 'DISPONIVEL') return 'DISPONÍVEL';
    if (normalized === 'EM_USO') return 'EM USO';
    if (normalized === 'MANUTENCAO') return 'MANUTENÇÃO';

    return normalized;
  };
  const getStatusClass = (status: string) => {
    const normalized = normalizeStatus(status);

    if (normalized === 'DISPONIVEL') return 'bg-emerald-100 text-emerald-700';
    if (normalized === 'EM_USO') return 'bg-orange-100 text-orange-700';

    return 'bg-slate-100 text-slate-700';
  };

  async function handleCreateG1Key() {
    const tag = g1KeyTag.trim().toUpperCase();
    if (!tag) return;

    const exists = keys.some((k) => k.code.toUpperCase() === tag);
    if (exists) {
      notify(`A chave "${tag}" já existe.`);
      return;
    }

    try {
      console.log("SETOR ESCOLHIDO:", {
        g1KeySectorId,
        g1KeySectorName,
      });
      console.log("ANTES DE SALVAR:", {
        g1KeySectorId,
        g1KeySectorName,
      });

      if (!g1KeySectorId) {
        notify("Selecione um setor antes de salvar.");
        return;
      }
      await dbCreateKey({
        code: tag,
        label: g1KeyLocal.trim() || 'Sem local',
        description: g1KeyDesc.trim(),
        sector: g1KeySectorName,
        sector_id: g1KeySectorId,
        cabinet_id: selectedCabinetId,
        status: 'DISPONIVEL',
      });

      await reloadAll();

      // limpa formulário
      setG1KeyTag('');
      setG1KeyLocal('');
      setG1KeyDesc('');
      setG1KeySectorId('');
      setG1KeySectorName('');

      setView('cabinet_g1');

    } catch (err: any) {
      console.error('Erro ao salvar chave no Supabase:', err);
      notify(err?.message ?? JSON.stringify(err));
    }
  }

  const handleGenerateReport = async () => {
    setLoadingReport(true);
    const report = await getSmartKeyReport(keys, movements, users);
    setSmartReport((report as any)?.summary || 'Falha ao gerar relatório.');
    setLoadingReport(false);
  };

  const handleAskAssistant = async () => {
    if (!assistantQuery) return;
    setLoadingAssistant(true);
    const res = await askAssistant(
      assistantQuery,
      keys,
      movements
    );
    setAssistantResponse(res || '');
    setLoadingAssistant(false);
  };

  const handleCheckOut = async () => {
    if (!selectedKey || !checkoutUser.trim() || !signature) return;

    if (!session?.user?.id) {
      notify('Sessão inválida. Faça login novamente.');
      return;
    }

    try {
      await rpcCheckoutKey(
        selectedKey.id,
        session.user.id,
        checkoutUser.trim(),
        session.user.id,
        signature
      );

      await reloadAll();

      setIsCheckOutModalOpen(false);
      setSelectedKey(null);
      setCheckoutUser('');
      setSignature(null);
    } catch (err: any) {
      console.error('Erro ao retirar chave:', err);
      notify(`Erro ao retirar chave: ${err?.message ?? 'erro desconhecido'}`);
    }
  };

  const handleReturn = async (keyId: string) => {
    try {
      await rpcReturnKey(keyId, profile?.full_name || 'Usuário');
      await reloadAll();
    } catch (err) {
      console.error('Erro ao devolver chave:', err);
      notify('Erro ao devolver chave.');
    }
  };
  const handleCreateSector = async () => {
    if (!sectorName.trim()) {
      notify('Digite o nome do setor.');
      return;
    }

    try {
      const { error } = await supabase
        .from('sectors')
        .insert({
          name: sectorName.trim(),
          description: sectorDescription.trim(),
        });

      if (error) throw error;

      setSectorName('');
      setSectorDescription('');
      setShowCreateSector(false);

      await reloadAll();
    } catch (err: any) {
      console.error('Erro ao criar setor:', err);
      notify(err?.message || 'Erro ao criar setor.');
    }
  };
  const handleCreateCabinet = async () => {
    try {

      if (!cabinetName.trim()) {
        notify('Digite o nome do armário');
        return;
      }

      const { error } = await supabase
        .from('cabinets')
        .insert({
          name: cabinetName.trim(),
          description: cabinetDescription.trim() || cabinetLocation.trim(),
        });

      if (error) throw error;

      setCabinetName('');
      setCabinetLocation('');
      setCabinetDescription('');

      setShowCreateCabinet(false);

      await reloadAll();

    } catch (err: any) {
      console.error(err);
      notify(err.message);
    }
  };
  // Ao abrir o modal de Nova Chave, pré-seleciona o armário do contexto atual.
  useEffect(() => {
    if (isCreateModalOpen) {
      setNewKeyCabinetId(selectedCabinetId ?? '');
    }
  }, [isCreateModalOpen]);

  const handleCreateKey = async () => {
    if (!newKeyCode.trim() || !newKeyLabel.trim()) {
      notify('Preencha código e nome.');
      return;
    }

    if (!newKeySector) {
      notify('Selecione um setor.');
      return;
    }

    const selectedSector = sectors.find(
      (s: any) => String(s.id) === String(newKeySector)
    );

    try {
      setIsCreatingKey(true);

      await dbCreateKey({
        code: newKeyCode.trim(),
        label: newKeyLabel.trim(),
        description: newKeyDescription.trim(),
        sector: selectedSector?.name ?? '',
        sector_id: newKeySector,
        cabinet_id: newKeyCabinetId || null,
        status: 'DISPONIVEL',
      });

      setIsCreateModalOpen(false);
      setNewKeyCode('');
      setNewKeyLabel('');
      setNewKeyDescription('');
      setNewKeySector('');
      setNewKeyCabinetId('');

      await reloadAll();
    } catch (err) {
      console.error('Erro ao criar chave:', err);
      notify('Erro ao criar chave.');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleArchiveKey = async (keyId: string, keyCode: string) => {
    try {
      const confirmed = await confirmDialog(`Arquivar a chave "${keyCode}"?`);
      if (!confirmed) return;

      const { data, error } = await supabase
        .from('keys')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', keyId)
        .select('id, code, archived_at');

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('Nenhuma linha foi atualizada no banco.');
      }

      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      notify('Chave arquivada com sucesso.');
    } catch (err: any) {
      console.error('Erro ao arquivar chave:', err);
      notify(err?.message ?? 'Erro ao arquivar chave.');
    }
  };

  const handleDeleteKey = async (keyId: string, keyCode: string) => {
    try {
      const confirmed = await confirmDialog(
        `Excluir permanentemente a chave "${keyCode}"?`
      );
      if (!confirmed) return;

      const { data, error } = await supabase
        .from('keys')
        .delete()
        .eq('id', keyId)
        .select('id, code');

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('Nenhuma linha foi excluída no banco.');
      }

      setKeys((prev) => prev.filter((k) => k.id !== keyId));
      notify('Chave excluída com sucesso.');
    } catch (err: any) {
      console.error('Erro ao excluir chave:', err);
      notify(err?.message ?? 'Erro ao excluir chave.');
    }
  };
  const handleDeleteCabinet = async (
    cabinetId: string,
    cabinetName: string
  ) => {
    const confirmed = await confirmDialog(
      `Excluir o armário "${cabinetName}"?`
    );

    if (!confirmed) return;

    try {
      // verifica se existem chaves nesse armário
      const { data: keysInside, error: keysError } = await supabase
        .from('keys')
        .select('id')
        .eq('cabinet_id', cabinetId)
        .is('archived_at', null);

      if (keysError) throw keysError;

      // impede exclusão
      if (keysInside && keysInside.length > 0) {
        notify(
          'Não é possível excluir este armário porque existem chaves cadastradas nele.'
        );
        return;
      }

      // exclui armário
      const { data, error } = await supabase
        .from('cabinets')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', cabinetId)
        .select('id, name, archived_at');

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('Nenhum armário foi arquivado. Verifique se o ID existe ou se há bloqueio de permissão.');
      }

      if (error) throw error;

      setIsCabinetMenuOpenId(null);

      await reloadAll();

      notify('Armário excluído com sucesso.');

    } catch (err: any) {
      console.error('Erro ao excluir armário:', err);
      notify(err?.message || 'Erro ao excluir armário.');
    }
  };

  // ----- Armários: editar -----
  const openEditCabinet = (cabinet: any) => {
    setIsCabinetMenuOpenId(null);
    setEditingCabinetId(cabinet.id);
    setEditCabinetName(cabinet.name ?? '');
    setEditCabinetDescription(cabinet.description ?? '');
    setShowEditCabinet(true);
  };

  const handleUpdateCabinet = async () => {
    if (!editingCabinetId) return;

    if (!editCabinetName.trim()) {
      notify('Digite o nome do armário.');
      return;
    }

    try {
      const { error } = await supabase
        .from('cabinets')
        .update({
          name: editCabinetName.trim(),
          description: editCabinetDescription.trim(),
        })
        .eq('id', editingCabinetId);

      if (error) throw error;

      setShowEditCabinet(false);
      setEditingCabinetId(null);

      await reloadAll();
    } catch (err: any) {
      console.error('Erro ao atualizar armário:', err);
      notify(err?.message || 'Erro ao atualizar armário.');
    }
  };

  // ----- Setores: editar e excluir -----
  const openEditSector = (sector: any) => {
    setIsSectorMenuOpenId(null);
    setEditingSectorId(sector.id);
    setEditSectorName(sector.name ?? '');
    setEditSectorDescription(sector.description ?? '');
    setShowEditSector(true);
  };

  const handleUpdateSector = async () => {
    if (!editingSectorId) return;

    if (!editSectorName.trim()) {
      notify('Digite o nome do setor.');
      return;
    }

    try {
      const { error } = await supabase
        .from('sectors')
        .update({
          name: editSectorName.trim(),
          description: editSectorDescription.trim(),
        })
        .eq('id', editingSectorId);

      if (error) throw error;

      setShowEditSector(false);
      setEditingSectorId(null);

      await reloadAll();
    } catch (err: any) {
      console.error('Erro ao atualizar setor:', err);
      notify(err?.message || 'Erro ao atualizar setor.');
    }
  };

  const handleDeleteSector = async (sectorId: string, sectorName: string) => {
    const confirmed = await confirmDialog(`Excluir o setor "${sectorName}"?`);
    if (!confirmed) return;

    try {
      // valida se existem chaves vinculadas a esse setor
      const { data: keysInside, error: keysError } = await supabase
        .from('keys')
        .select('id')
        .eq('sector_id', sectorId)
        .is('archived_at', null);

      if (keysError) throw keysError;

      // impede exclusão se houver chaves vinculadas
      if (keysInside && keysInside.length > 0) {
        notify(
          'Não é possível excluir este setor porque existem chaves vinculadas a ele. Reatribua ou remova as chaves antes de excluir.'
        );
        return;
      }

      const { data, error } = await supabase
        .from('sectors')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', sectorId)
        .select('id, name, archived_at');

      if (error) throw error;

      if (!data || data.length === 0) {
        throw new Error('Nenhum setor foi excluído. Verifique se o ID existe ou se há bloqueio de permissão.');
      }

      setIsSectorMenuOpenId(null);

      await reloadAll();

      notify('Setor excluído com sucesso.');
    } catch (err: any) {
      console.error('Erro ao excluir setor:', err);
      notify(err?.message || 'Erro ao excluir setor.');
    }
  };

  const openEditModal = (key: Key) => {
    setIsKeyMenuOpenId(null);
    setEditKey(key);
    setEditTag(key.code);
    setEditLocal(key.label);
    setEditDesc(key.description || '');
    setEditSectorId((key as any).sector_id || '');
    setIsEditModalOpen(true);
  };

  const handleSaveEditKey = async () => {
    if (!editKey) return;

    const newCode = editTag.trim().toUpperCase();
    if (!newCode) {
      notify('Informe a TAG da chave.');
      return;
    }

    const duplicate = keys.some(
      (k) => k.id !== editKey.id && k.code.toUpperCase() === newCode
    );

    if (duplicate) {
      notify(`Já existe outra chave com TAG "${newCode}".`);
      return;
    }

    try {
      const { error } = await supabase
        .from('keys')
        .update({
          code: newCode,
          label: editLocal.trim() || 'Sem local',
          description: editDesc.trim(),
          sector_id: editSectorId || null,
          sector:
            sectors.find((s: any) => String(s.id) === String(editSectorId))?.name ||
            editKey.sector ||
            '',
        })
        .eq('id', editKey.id);

      if (error) throw error;

      await reloadAll();

      setIsEditModalOpen(false);
      setEditKey(null);
      setEditTag('');
      setEditLocal('');
      setEditDesc('');
      setEditSectorId('');
    } catch (err) {
      console.error('Erro ao salvar alterações:', err);
      notify('Erro ao salvar alterações.');
    }
  };

  const handleLogin = async () => {
    setLoginError('');

    try {
      await signInWithEmail(loginUser, loginPass);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        throw new Error('Usuário autenticado não encontrado.');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('must_change_password')
        .eq('id', user.id)
        .single();

      if (profileError) {
        throw new Error(profileError.message);
      }

      setLoginUser('');
      setLoginPass('');

      if (profile?.must_change_password) {
        setView('change-password');
        return;
      }

      setView('dashboard');
    } catch (error: any) {
      console.error('Erro no login:', error);
      setLoginError(friendlyAuthError(error));
    }
  };
  const handleChangePassword = async () => {
    console.log('CLICOU EM ALTERAR SENHA');

    setChangePasswordError('');

    if (newPassword.length < 8) {
      setChangePasswordError('A senha deve possuir pelo menos 8 caracteres.');
      return;
    }

    if (!/[A-Z]/.test(newPassword)) {
      setChangePasswordError('A senha deve possuir pelo menos uma letra maiúscula.');
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setChangePasswordError('A senha deve possuir pelo menos uma letra minúscula.');
      return;
    }

    if (!/[0-9]/.test(newPassword)) {
      setChangePasswordError('A senha deve possuir pelo menos um número.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setChangePasswordError('As senhas não conferem.');
      return;
    }

    try {
      setIsChangingPassword(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      console.log('USUARIO ATUAL:', user);
      console.log('ERRO USUARIO:', userError);

      if (userError) throw userError;

      if (!user?.id) {
        throw new Error('Usuário não encontrado.');
      }

      const { error: passwordError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      console.log('ERRO UPDATE SENHA:', passwordError);

      if (passwordError) {
        throw passwordError;
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({
          must_change_password: false,
        })
        .eq('id', user.id);

      setProfile((prev: any) =>
        prev
          ? {
            ...prev,
            must_change_password: false,
          }
          : prev
      );
      setView('dashboard');

      console.log('ERRO UPDATE PROFILE:', profileError);

      if (profileError) {
        throw profileError;
      }

      setNewPassword('');
      setConfirmNewPassword('');

      setProfile((prev: any) =>
        prev
          ? {
            ...prev,
            must_change_password: false,
          }
          : prev
      );

      notify('Senha alterada com sucesso.');

      setView('dashboard');
    } catch (error: any) {
      console.error('ERRO GERAL ALTERAR SENHA:', error);
      setChangePasswordError(error.message || 'Erro ao alterar senha.');
    } finally {
      setIsChangingPassword(false);
    }
  };
  const handleLogout = async () => {
    try {
      await signOut();
      setProfile(null);
      setSession(null);
      setSystemUsers([]);
      setView('login');
    } catch (error) {
      console.error('Erro ao sair:', error);
    }
  };
  const handleExportKeysExcel = async () => {
    try {
      // Import dinâmico: a lib só carrega quando o usuário clica em exportar.
      const XLSX = await import('xlsx');

      const rows = keys.map((k: any) => ({
        'Código': k.code ?? '',
        'Nome': k.label ?? '',
        'Descrição': k.description ?? '',
        'Armário':
          cabinets.find((c: any) => String(c.id) === String(k.cabinet_id))
            ?.name ?? '',
        'Setor': k.sector_name ?? k.sector ?? '',
        'Status': formatStatusLabel(k.status),
      }));

      if (rows.length === 0) {
        notify('Não há chaves para exportar.');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 12 },
        { wch: 32 },
        { wch: 32 },
        { wch: 16 },
        { wch: 20 },
        { wch: 14 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Chaves');

      XLSX.writeFile(wb, `chaves-${new Date().toISOString().slice(0, 10)}.xlsx`);

      notify('Exportação concluída.', 'success');
    } catch (err) {
      console.error('Erro ao exportar Excel:', err);
      notify('Erro ao exportar para Excel.');
    }
  };

  const handleExportHistoryPdf = async () => {
    const doc = new jsPDF();

    let y = 20;

    doc.setFontSize(20);
    doc.setTextColor(186, 117, 23);
    doc.text('Relatorio de Auditoria - ACESSA', 14, y);

    y += 10;

    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, y);

    y += 15;

    for (const movement of movements) {
      const key = keys.find((k: any) => k.id === movement.keyId);

      const movementAny = movement as any;

      const responsibleName =
        movementAny.user_name ||
        movementAny.userName ||
        movementAny.withdrawn_by_name ||
        'Não informado';

      const authorizedName =
        movementAny.authorized_by_name ||
        movementAny.authorizedByName ||
        'Não informado';

      const status = movement.returnedAt ? 'CONCLUÍDO' : 'EM ABERTO';

      doc.setDrawColor(220);
      doc.setTextColor(0);
      doc.roundedRect(10, y, 190, 75, 4, 4);

      doc.setFontSize(14);
      doc.setTextColor(186, 117, 23);
      doc.text(
        `CHAVE: ${key?.code || '—'} - ${key?.label || 'Sem identificação'}`,
        14,
        y + 10
      );

      doc.setTextColor(0);
      doc.setFontSize(11);

      doc.text(`Responsável: ${responsibleName}`, 14, y + 25);

      doc.text(
        `Retirada: ${movement.withdrawnAt
          ? new Date(movement.withdrawnAt).toLocaleString('pt-BR')
          : '—'
        }`,
        14,
        y + 37
      );

      doc.text(
        `Devolução: ${movement.returnedAt
          ? new Date(movement.returnedAt).toLocaleString('pt-BR')
          : 'Em aberto'
        }`,
        14,
        y + 49
      );

      doc.text(`Status: ${status}`, 14, y + 61);

      doc.text(`Autorizado por: ${authorizedName}`, 105, y + 25);

      if (movementAny.signatureBase64) {
        try {
          doc.text('Assinatura:', 120, y + 37);

          doc.addImage(
            movementAny.signatureBase64,
            'PNG',
            120,
            y + 42,
            55,
            20
          );
        } catch (err) {
          console.error('Erro assinatura PDF:', err);
        }
      } else {
        doc.text('Assinatura: N/A', 120, y + 37);
      }

      y += 90; 0

      if (y > 250) {
        doc.addPage();
        y = 20;
      }
    }

    doc.save(
      `relatorio-auditoria-${new Date().toISOString().slice(0, 10)}.pdf`
    );
  };

  const formatUsageTime = (borrowedAt?: string | null) => {
    if (!borrowedAt) return '';

    const borrowedTime = new Date(borrowedAt).getTime();
    const now = Date.now();

    const diffMs = now - borrowedTime;

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor(
      (diffMs % (1000 * 60 * 60)) / (1000 * 60)
    );

    return `${hours}h ${minutes}min`;
  };
  const isKeyDelayed = (borrowedAt?: string | null) => {
    if (!borrowedAt) return false;

    const borrowedTime = new Date(borrowedAt).getTime();
    const now = Date.now();

    const diffHours = (now - borrowedTime) / (1000 * 60 * 60);

    return diffHours >= 4;
  };
  if (authLoading) {
    return <div style={{ padding: 20 }}>Carregando usuário...</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl px-8 py-6">

          <div className="mb-10 border-b border-slate-200 pb-8">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center">
              <div className="flex justify-center pr-6">
                <img
                  src={acessaLogo}
                  alt="ACESSA"
                  className="w-52 object-contain"
                />
              </div>

              <div className="h-24 w-px bg-slate-300" />

              <div className="flex justify-center pl-6">
                <img
                  src={vsaLogo}
                  alt="VSA Anhanguera"
                  className="w-32 object-contain"
                />
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900">
            Entrar
          </h1>

          <p className="text-slate-500 text-sm mt-1">
            Use seu e-mail e senha para acessar o sistema.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                E-mail
              </label>

              <input
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="seuemail@empresa.com"
                className="mt-2 w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase">
                Senha
              </label>

              <input
                type="password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="••••••••"
                className="mt-2 w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleLogin();
                }}
              />
            </div>

            {loginError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl p-3">
                {loginError}
              </div>
            )}

            <button
              onClick={handleLogin}
              disabled={!loginUser.trim() || !loginPass}
              className="w-full bg-[#BA7517] hover:bg-[#9c6112] disabled:bg-slate-300 text-white font-bold py-3 rounded-xl shadow-lg transition-all"
            >
              Entrar
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200 p-6 flex flex-col space-y-8 hidden md:flex h-screen sticky top-0">
        <div className="px-1 py-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <div className="flex justify-center">
              <img
                src={acessaLogo}
                alt="ACESSA"
                className="w-full max-w-[110px] object-contain"
              />
            </div>

            <div className="h-12 w-px bg-slate-200" />

            <div className="flex justify-center">
              <img
                src={vsaLogo}
                alt="VSA Anhanguera"
                className="w-full max-w-[70px] object-contain"
              />
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto space-y-2">
          <SidebarItem
            active={view === 'dashboard'}
            label="Dashboard"
            icon="📊"
            onClick={() => {
              if (profile?.must_change_password) return;
              setView('dashboard');
            }}
          />
          <SidebarItem
            active={view === 'key_admin'}
            label="Cadastros"
            icon="🗂️"
            onClick={() => setView('key_admin')}
          />
          <SidebarItem
            active={view === 'keys'}
            label="Gestão de Chaves"
            icon="🔑"
            onClick={() => setView('keys')}
          />
          <SidebarItem
            active={view === 'history'}
            label="Histórico / Auditoria"
            icon="📋"
            onClick={() => setView('history')}
          />
          {(isAdmin || isManager) && (
            <SidebarItem
              active={view === 'inventories'}
              label="Inventários"
              icon="📦"
              onClick={() => {
                setView('inventories');
                loadInventories();
              }}
            />
          )}
          {isAdmin && (
            <SidebarItem
              active={view === 'users'}
              label="Gestão de Usuários"
              icon="👥"
              onClick={async () => {
                setView('users');
                await loadSystemUsers();
              }}
            />
          )}
          <SidebarItem
            active={view === 'assistant'}
            label="Assistente IA"
            icon="✨"
            onClick={() => setView('assistant')}
          />
        </nav>

        <div className="border-t pt-6 space-y-4 shrink-0">
          <div className="flex items-center space-x-3 px-2">
            <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center">
              👤
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">
                {profile?.full_name || 'Usuário'}
              </span>
              <span className="text-xs text-slate-500 uppercase font-bold">
                {profile?.role || '...'}
              </span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full mt-2 bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold py-2 rounded-xl transition"
          >
            🚪 Sair
          </button>
        </div>
      </aside>

      <main
        className="flex-1 overflow-auto p-4 pb-28 md:p-8"
        ref={menuWrapperRef}
      >

        {mustChangePassword && (
          <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-2xl shadow">
            <h1 className="text-2xl font-bold mb-6">
              Alteração obrigatória de senha
            </h1>

            <input
              type="password"
              placeholder="Nova senha"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border p-3 rounded mb-4"
            />

            <input
              type="password"
              placeholder="Confirmar nova senha"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className="w-full border p-3 rounded mb-6"
            />

            <button
              type="button"
              onClick={handleChangePassword}
              disabled={isChangingPassword}
              className="w-full bg-[#BA7517] text-white rounded-xl py-3 font-bold disabled:bg-slate-300"
            >
              {isChangingPassword ? 'Alterando...' : 'Alterar senha'}
            </button>
          </div>
        )}

        {!mustChangePassword && view === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Visão Geral</h1>
                <p className="text-slate-500">
                  Monitoramento em tempo real do claviculário logístico.
                </p>
              </div>
              <button
                onClick={handleGenerateReport}
                className="bg-[#BA7517] hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all flex items-center space-x-2"
              >
                <span>✨</span>
                <span>Gerar Insight IA</span>
              </button>
            </header>
            {stats.delayed > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center text-2xl">
                    🚨
                  </div>

                  <div>
                    <h2 className="text-lg font-extrabold text-red-700">
                      {stats.delayed} chave{stats.delayed > 1 ? 's' : ''} atrasada
                      {stats.delayed > 1 ? 's' : ''}
                    </h2>

                    <p className="text-sm text-red-600">
                      Existem chaves em uso há mais de 4 horas. Verifique a devolução.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setView('keys')}
                  className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl font-bold"
                >
                  Ver chaves
                </button>
              </div>
            )}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Retirada rápida</h2>
                  <p className="text-sm text-slate-500">
                    Selecione uma chave disponível para retirar com assinatura.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {keys
                  .filter((k) => k.status === 'DISPONIVEL')
                  .slice(0, 9)
                  .map((key) => (
                    <button
                      key={key.id}
                      onClick={() => {
                        setSelectedKey(key);
                        setCheckoutUser('');
                        setSignature(null);
                        setIsCheckOutModalOpen(true);
                      }}
                      className="text-left rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50 transition"
                    >
                      <div className="font-bold text-slate-900">{key.code}</div>
                      <div className="text-sm text-slate-500">{key.label}</div>
                      <div className="mt-2 text-xs font-bold text-emerald-600">
                        DISPONÍVEL
                      </div>
                    </button>
                  ))}
              </div>

              {keys.filter((k) => k.status === 'DISPONIVEL').length === 0 && (
                <p className="text-sm text-slate-500">
                  Nenhuma chave disponível para retirada.
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total de Chaves', val: stats.total },
                { label: 'Em Uso', val: stats.inUse },
                { label: 'Atrasadas', val: stats.delayed },
                { label: 'Disponíveis', val: stats.available },
                { label: 'Alertas/Manutenção', val: stats.alert },
              ].map((s, i) => (
                <div
                  key={i}
                  className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100"
                >
                  <p className="text-slate-500 text-sm font-medium uppercase tracking-wider">
                    {s.label}
                  </p>
                  <p className="text-3xl font-bold mt-1 text-slate-900">{s.val}</p>
                </div>
              ))}
            </div>

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h3 className="font-bold text-slate-800 text-lg mb-4">
                  Distribuição das chaves
                </h3>
                {dashboardCharts.statusData.length === 0 ? (
                  <p className="text-sm text-slate-500">Sem dados para exibir.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={dashboardCharts.statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={3}
                      >
                        {dashboardCharts.statusData.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h3 className="font-bold text-slate-800 text-lg mb-4">
                  Retiradas nos últimos 7 dias
                </h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dashboardCharts.days}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar
                      dataKey="retiradas"
                      name="Retiradas"
                      fill="#BA7517"
                      radius={[6, 6, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {loadingReport && (
              <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm animate-pulse flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-blue-600 font-medium">
                  A IA está analisando seus dados de segurança...
                </p>
              </div>
            )}

            {smartReport && !loadingReport && (
              <div className="bg-blue-50 p-8 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <span className="text-8xl">✨</span>
                </div>
                <h2 className="text-xl font-bold text-blue-900 mb-4 flex items-center space-x-2">
                  <span>✨</span>
                  <span>Relatório Operacional Inteligente</span>
                </h2>
                <div className="prose prose-blue prose-sm max-w-none text-blue-800 leading-relaxed whitespace-pre-wrap">
                  {smartReport}
                </div>
                <button
                  onClick={() => setSmartReport(null)}
                  className="mt-6 text-sm font-bold text-blue-600 hover:text-blue-800 underline"
                >
                  Fechar Relatório
                </button>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-bold text-slate-800 text-lg">
                  Movimentações Recentes
                </h3>
                <button
                  onClick={() => setView('history')}
                  className="text-blue-600 font-semibold text-sm hover:underline"
                >
                  Ver tudo
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">
                        Chave
                      </th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">
                        Responsável
                      </th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">
                        Retirada em
                      </th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase text-right">
                        Ação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {movements.slice(0, 5).map((m: any) => {
                      const key = keys.find((k) => k.id === m.keyId);
                      const fallbackUser = users.find((u) => u.id === m.userId);
                      const responsibleName =
                        m.user_name ||
                        m.userName ||
                        m.withdrawn_by_name ||
                        fallbackUser?.name ||
                        '—';

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">{key?.code}</div>
                            <div className="text-xs text-slate-500">{key?.label}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium">{responsibleName}</div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">
                            {new Date(m.withdrawnAt).toLocaleString('pt-BR')}
                          </td>
                          <td className="px-6 py-4">
                            {m.returnedAt ? (
                              <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full">
                                Devolvida
                              </span>
                            ) : (
                              <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">
                                Em Aberto
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {!m.returnedAt && canOperateKeys && (
                              <button
                                onClick={() => handleReturn(m.keyId)}
                                className="text-blue-600 hover:text-blue-800 font-bold text-sm"
                              >
                                Devolver
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!mustChangePassword && view === 'users' && isAdmin && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  Gestão de Usuários
                </h1>
                <p className="text-slate-500">
                  Gerencie os acessos e funções dos usuários do sistema.
                </p>
              </div>

              <button
                className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg"
                onClick={handleOpenUserModal}
              >
                + Novo Usuário
              </button>
            </header>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Nome
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Função
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Criado em
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase text-right">
                        Ações
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-50">
                    {loadingSystemUsers ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-slate-500"
                        >
                          Carregando usuários...
                        </td>
                      </tr>
                    ) : systemUsers.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-6 py-8 text-center text-slate-500"
                        >
                          Nenhum usuário encontrado.
                        </td>
                      </tr>
                    ) : (
                      systemUsers.map((user) => (
                        <tr
                          key={user.id}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">
                              {user.full_name || 'Sem nome'}
                            </div>
                            <div className="text-xs text-slate-500 break-all">

                            </div>
                          </td>

                          <td className="px-6 py-4">
                            <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 uppercase">
                              {user.role}
                            </span>
                          </td>

                          <td className="px-6 py-4">
                            {user.is_active ? (
                              <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                                Ativo
                              </span>
                            ) : (
                              <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                                Inativo
                              </span>
                            )}
                          </td>

                          <td className="px-6 py-4 text-sm text-slate-600">
                            {user.created_at
                              ? new Date(user.created_at).toLocaleString('pt-BR')
                              : '-'}
                          </td>

                          <td className="px-6 py-4 text-right">
                            <button
                              className="text-blue-600 hover:text-blue-800 font-bold text-sm"
                              onClick={() => handleOpenEditUserModal(user)}
                            >
                              Editar
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!mustChangePassword && view === 'keys' && (

          <div className="space-y-6 animate-in slide-in-from-bottom duration-500">
            <header className="flex items-center justify-between">

              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  Gestão de Chaves
                </h1>
                <p className="text-slate-500">
                  Cadastre e controle todas as chaves do condomínio.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExportKeysExcel}
                  className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow"
                >
                  📊 Exportar Excel
                </button>

                <button
                  onClick={() => {
                    setPrintKey(null);
                    setShouldPrint(true);
                  }}
                  className="bg-white border border-slate-300 text-slate-700 px-6 py-2 rounded-xl font-bold hover:bg-slate-50 transition-colors shadow"
                >
                  🖨️ Imprimir QR Codes
                </button>

                {(isAdmin || isManager) && (
                  <button
                    onClick={() => {
                      setIsCreateModalOpen(true);
                    }}
                    className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg"
                  >
                    + Nova Chave
                  </button>
                )}
              </div>

            </header>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <input
                type="text"
                value={keySearch}
                onChange={(e) => setKeySearch(e.target.value)}
                placeholder="Buscar por qualquer informação: código, nome, setor, armário, status…"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {isCreateModalOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
                  <h2 className="mb-4 text-xl font-bold text-slate-900">
                    Nova Chave
                  </h2>

                  <div className="space-y-3">
                    <input
                      placeholder="Código"
                      value={newKeyCode}
                      onChange={(e) => setNewKeyCode(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />

                    <input
                      placeholder="Nome"
                      value={newKeyLabel}
                      onChange={(e) => setNewKeyLabel(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />

                    <input
                      placeholder="Descrição"
                      value={newKeyDescription}
                      onChange={(e) => setNewKeyDescription(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2"
                    />

                    <select
                      value={newKeyCabinetId}
                      onChange={(e) => setNewKeyCabinetId(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      <option value="">Selecione um armário</option>

                      {cabinets.map((cabinet: any) => (
                        <option key={cabinet.id} value={cabinet.id}>
                          {cabinet.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={newKeySector}
                      onChange={(e) => setNewKeySector(e.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2 bg-white"
                    >
                      <option value="">Selecione um setor</option>

                      {sectors.map((sector: any) => (
                        <option key={sector.id} value={sector.id}>
                          {sector.name}
                        </option>
                      ))}
                    </select>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsCreateModalOpen(false)}
                        className="rounded-xl border border-slate-300 px-4 py-2"
                      >
                        Cancelar
                      </button>

                      <button
                        type="button"
                        onClick={handleCreateKey}
                        disabled={isCreatingKey}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-white"
                      >
                        {isCreatingKey ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6">
              {keys
                .filter((key: any) => {
                  if (selectedCabinetId) {
                    const cabinet = cabinets.find(
                      (c: any) => c.id === selectedCabinetId
                    );

                    const sameCabinet =
                      key.cabinet_id === selectedCabinetId ||
                      key.sector?.toUpperCase() === cabinet?.name?.toUpperCase();

                    if (!sameCabinet) return false;
                  }

                  const cabinetName = cabinets.find(
                    (c: any) => String(c.id) === String(key.cabinet_id)
                  )?.name;

                  return smartSearch(
                    keySearch,
                    key.code,
                    key.label,
                    key.description,
                    key.sector,
                    key.sector_name,
                    cabinetName,
                    formatStatusLabel(key.status)
                  );
                })
                .map((key) => (

                  <div
                    key={key.id}
                    className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow relative overflow-visible"
                  >
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-2xl shrink-0">
                        {normalizeStatus(key.status) === 'DISPONIVEL'
                          ? '✅'
                          : normalizeStatus(key.status) === 'EM_USO'
                            ? '🔑'
                            : '🛠️'}
                      </div>

                      <div className="flex items-center justify-end gap-2 min-w-0">
                        <span
                          className={`inline-flex h-8 max-w-[130px] items-center justify-center truncate whitespace-nowrap rounded-full px-3 text-xs font-bold ${getStatusClass(
                            key.status
                          )}`}
                        >
                          {normalizeStatus(key.status) === 'EM_USO'
                            ? isKeyDelayed(key.borrowed_at)
                              ? 'ATRASADA'
                              : 'EM USO'
                            : formatStatusLabel(key.status)}
                        </span>
                        {(isAdmin || isManager) && (
                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsKeyMenuOpenId((prev) =>
                                  prev === key.id ? null : key.id
                                );
                              }}
                              className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              title="Ações"
                            >
                              ⋮

                            </button>

                            {isKeyMenuOpenId === key.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
                              >
                                <button
                                  onClick={() => openEditModal(key)}
                                  className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
                                >
                                  ✏️ Editar
                                </button>

                                <button
                                  onClick={async () => {
                                    setIsKeyMenuOpenId(null);
                                    await handleArchiveKey(key.id, key.code);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-amber-700 hover:bg-amber-50"
                                >
                                  🗄️ Arquivar
                                </button>

                                <button
                                  onClick={async () => {
                                    setIsKeyMenuOpenId(null);
                                    await handleDeleteKey(key.id, key.code);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50"
                                >
                                  🗑️ Excluir
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <h3 className="text-lg font-bold text-slate-900 break-words">
                      {key.code} - {key.label}
                    </h3>

                    <p className="text-sm text-slate-500 mb-4 break-words">
                      {key.description || 'Sem descrição'}
                    </p>

                    <div className="flex flex-col gap-1 text-xs text-slate-500 mb-6">
                      <span>
                        🗄️ Armário:{' '}
                        {cabinets.find((c: any) => c.id === key.cabinet_id)?.name || 'Sem armário'}
                      </span>
                      {normalizeStatus(key.status) === 'EM_USO' && (
                        <span
                          className={`font-bold ${isKeyDelayed(key.borrowed_at)
                            ? 'text-red-600'
                            : 'text-orange-600'
                            }`}
                        >
                          ⏱️ {formatUsageTime(key.borrowed_at)}
                        </span>
                      )}
                      <span>
                        🏷️ Setor:{' '}
                        {sectors.find((s: any) => s.id === key.sector_id)?.name ||
                          key.sector_name ||
                          key.sector ||
                          'Sem setor'}
                      </span>
                    </div>
                    <div className="mb-4 flex justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => setQrModal({ key, type: 'chave' })}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm transition-colors"
                      >
                        📱 QR Chave
                      </button>
                      <button
                        type="button"
                        onClick={() => setQrModal({ key, type: 'porta' })}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-sm transition-colors"
                      >
                        🚪 QR Porta
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setPrintKey(key);
                        setShouldPrint(true);
                      }}
                      className="mt-3 w-full bg-white border border-slate-300 text-slate-700 font-bold py-2 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      🖨️ Imprimir QR Code
                    </button>
                    <div className="border-t pt-4 flex justify-between">
                      {normalizeStatus(key.status) === 'DISPONIVEL' && canOperateKeys && (
                        <button
                          onClick={() => {
                            setSelectedKey(key);
                            setCheckoutUser('');
                            setSignature(null);
                            setIsCheckOutModalOpen(true);
                          }}
                          className="w-full bg-[#BA7517] text-white font-bold py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          Retirar Chave
                        </button>
                      )}

                      {normalizeStatus(key.status) === 'EM_USO' && canOperateKeys && (
                        <button
                          onClick={() => handleReturn(key.id)}
                          className="w-full bg-orange-500 text-white font-bold py-2 rounded-lg hover:bg-orange-600 transition-colors"
                        >
                          Devolver Chave
                        </button>
                      )}

                      {normalizeStatus(key.status) === 'MANUTENCAO' && (
                        <button
                          disabled
                          className="w-full bg-slate-200 text-slate-500 font-bold py-2 rounded-lg cursor-not-allowed"
                        >
                          Indisponível
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
        {view === 'scanner' && (
          <div className="min-h-screen bg-slate-50 p-4">
            <div className="max-w-xl mx-auto">
              <div className="bg-white rounded-3xl shadow-xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                      Escanear QR Code
                    </h1>
                    <p className="text-slate-500 text-sm">
                      Aponte a câmera para o QR da chave ou da porta.
                    </p>
                  </div>
                  <div className="text-3xl">📷</div>
                </div>

                <div
                  id="qr-reader"
                  className="overflow-hidden rounded-2xl border border-slate-200"
                />

                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3 text-center text-xs text-slate-500">
                  🚪 QR da <b>porta</b> mostra qual chave abre &nbsp;·&nbsp; 🔑 QR da <b>chave</b> libera a retirada.
                </div>

                <button
                  onClick={() => {
                    if (profile?.must_change_password) return;
                    setView('dashboard');
                  }}
                  className="mt-4 w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-4 rounded-xl"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
        {!mustChangePassword && view === 'assistant' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-in zoom-in duration-300">
            <header className="text-center space-y-2">
              <h1 className="text-3xl font-bold text-slate-900">
                Assistente Inteligente ✨
              </h1>
              <p className="text-slate-500">
                Pergunte qualquer coisa sobre as chaves, retiradas ou segurança.
              </p>
            </header>

            <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-6 space-y-6">
              <div className="flex flex-col space-y-4">
                <textarea
                  placeholder="Ex: Quem retirou a chave do Galpão 01 por último? Ou, liste as chaves indisponíveis."
                  className="w-full h-32 p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-slate-800"
                  value={assistantQuery}
                  onChange={(e) => setAssistantQuery(e.target.value)}
                />
                <button
                  onClick={handleAskAssistant}
                  disabled={loadingAssistant || !assistantQuery}
                  className="bg-[#BA7517] disabled:bg-slate-400 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center space-x-2"
                >
                  {loadingAssistant ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Perguntar à IA</span>
                      <span>✨</span>
                    </>
                  )}
                </button>
              </div>

              {assistantResponse && (
                <div className="mt-8 bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <div className="prose prose-slate max-w-none whitespace-pre-wrap">
                    {assistantResponse}
                  </div>
                </div>
              )}

              {!assistantResponse && !loadingAssistant && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                  {[
                    'Quais chaves estão fora agora?',
                    'Resumo de hoje',
                    'Quem mais usa as chaves da segurança?',
                    'Sugestões de auditoria',
                  ].map((q, i) => (
                    <button
                      key={i}
                      onClick={() => setAssistantQuery(q)}
                      className="text-left p-4 rounded-xl border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-all text-slate-600 text-sm font-medium"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!mustChangePassword && view === 'key_admin' && (

          <div className="space-y-6 animate-in fade-in duration-300">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  Cadastros
                </h1>
                <p className="text-slate-500">
                  Administre armários, setores e chaves.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCabinetId(null);
                    setView('keys');
                  }}
                  className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg"
                >
                  🔑 Visualizar Todas
                </button>

                {(isAdmin || isManager) && cadastroTab === 'cabinets' && (
                  <button
                    type="button"
                    onClick={() => setShowCreateCabinet(true)}
                    className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg"
                  >
                    + Novo Armário
                  </button>
                )}
                {(isAdmin || isManager) && cadastroTab === 'sectors' && (
                  <button
                    type="button"
                    onClick={() => setShowCreateSector(true)}
                    className="bg-[#BA7517] text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg"
                  >
                    + Novo Setor
                  </button>
                )}
                {(isAdmin || isManager) && cadastroTab === 'keys' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCabinetId(null);
                      setView('keys');
                      setIsCreateModalOpen(true);
                    }}
                    className="bg-[#BA7517] text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg"
                  >
                    + Nova Chave
                  </button>
                )}
              </div>
            </header>

            {/* Abas: Armários / Setores / Chaves */}
            <div className="flex gap-1 border-b border-slate-200">
              {[
                { id: 'cabinets', label: 'Armários', icon: '🗄️' },
                { id: 'sectors', label: 'Setores', icon: '🏷️' },
                { id: 'keys', label: 'Chaves', icon: '🔑' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setCadastroTab(tab.id as 'cabinets' | 'sectors' | 'keys')
                  }
                  className={`px-5 py-3 -mb-px font-bold text-sm rounded-t-xl border-b-2 transition ${
                    cadastroTab === tab.id
                      ? 'border-[#BA7517] text-[#BA7517] bg-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Aba: Armários */}
            {cadastroTab === 'cabinets' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                {cabinets.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    Nenhum armário cadastrado ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {cabinets.map((cabinet) => (
                      <button
                        key={cabinet.id}
                        type="button"
                        onClick={() => {
                          setSelectedCabinetId(cabinet.id);
                          setView('keys');
                        }}
                        className="bg-white rounded-2xl border border-slate-200 p-6 text-left shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-slate-400 uppercase">
                              Armário
                            </p>

                            <h2 className="text-2xl font-extrabold text-slate-900">
                              {cabinet.name}
                            </h2>

                            <p className="text-slate-500 mt-1 text-sm">
                              {cabinet.description || 'Armário de chaves'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-3xl">🗄️</div>

                            {isAdmin && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCabinetMenuOpenId((prev) =>
                                      prev === cabinet.id ? null : cabinet.id
                                    );
                                  }}
                                  className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700"
                                >
                                  ⋮
                                </button>

                                {isCabinetMenuOpenId === cabinet.id && (
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="absolute right-0 top-full mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditCabinet(cabinet);
                                      }}
                                      className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
                                    >
                                      ✏️ Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteCabinet(cabinet.id, cabinet.name);
                                      }}
                                      className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50"
                                    >
                                      🗑️ Excluir
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="mt-6">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700">
                            Abrir
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Aba: Setores */}
            {cadastroTab === 'sectors' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                {sectors.length === 0 ? (
                  <div className="text-sm text-slate-500">
                    Nenhum setor cadastrado ainda.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {sectors.map((sector: any) => (
                      <div
                        key={sector.id}
                        className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm"
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-400 uppercase">
                              Setor
                            </p>
                            <h2 className="text-2xl font-extrabold text-slate-900 break-words">
                              {sector.name}
                            </h2>
                            <p className="text-slate-500 mt-1 text-sm break-words">
                              {sector.description || 'Setor'}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-3xl">🏷️</div>

                            {isAdmin && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setIsSectorMenuOpenId((prev) =>
                                      prev === sector.id ? null : sector.id
                                    )
                                  }
                                  className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700"
                                >
                                  ⋮
                                </button>

                                {isSectorMenuOpenId === sector.id && (
                                  <div className="absolute right-0 top-full mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                                    <button
                                      type="button"
                                      onClick={() => openEditSector(sector)}
                                      className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
                                    >
                                      ✏️ Editar
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDeleteSector(sector.id, sector.name)
                                      }
                                      className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50"
                                    >
                                      🗑️ Excluir
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Aba: Chaves */}
            {cadastroTab === 'keys' && (
              <div className="bg-white rounded-2xl border border-slate-100 p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Chaves</h2>
                    <p className="text-sm text-slate-500">
                      Total de chaves cadastradas: {keys.length}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCabinetId(null);
                        setView('keys');
                      }}
                      className="bg-emerald-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-emerald-700 shadow-lg"
                    >
                      🔑 Visualizar Todas
                    </button>

                    {(isAdmin || isManager) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCabinetId(null);
                          setView('keys');
                          setIsCreateModalOpen(true);
                        }}
                        className="bg-[#BA7517] text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg"
                      >
                        + Nova Chave
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {view === 'cabinet_g1' && (
          <div className="relative space-y-6 animate-in fade-in duration-300">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Armário G1</h1>
                <p className="text-slate-500">
                  Gerencie as chaves cadastradas no G1.
                </p>
              </div>

              <button
                onClick={() => setView('key_admin')}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
              >
                ← Voltar
              </button>
            </header>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 overflow-visible">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-900">Chaves do G1</h2>
                <span className="text-sm text-slate-500">Total: {g1Keys.length}</span>
              </div>

              {g1Keys.length === 0 ? (
                <div className="text-sm text-slate-500">
                  Nenhuma chave cadastrada no G1 ainda.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {g1Keys.map((k) => (
                    <div
                      key={k.id}
                      className="py-4 flex items-start justify-between gap-4 relative overflow-visible"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-900 break-words">
                          {k.code}
                        </span>
                        <span className="text-sm text-slate-600 break-words">
                          📍 {k.label}
                        </span>
                        {k.description && (
                          <span className="text-xs text-slate-400 break-words">
                            {k.description}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`inline-flex h-8 max-w-[130px] items-center justify-center truncate whitespace-nowrap rounded-full px-3 text-xs font-bold ${normalizeStatus(k.status) === 'EM_USO' &&
                            isKeyDelayed(k.borrowed_at)
                            ? 'bg-red-100 text-red-700'
                            : getStatusClass(k.status)
                            }`}
                        >
                          {normalizeStatus(k.status) === 'EM_USO'
                            ? isKeyDelayed(k.borrowed_at)
                              ? 'ATRASADA'
                              : 'EM USO'
                            : formatStatusLabel(k.status)}
                        </span>
                        {(isAdmin || isManager) && (
                          <div className="relative shrink-0">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsKeyMenuOpenId((prev) =>
                                  prev === k.id ? null : k.id
                                );
                              }}
                              className="w-9 h-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 flex items-center justify-center text-slate-700"
                              title="Ações"
                            >
                              ⋮
                            </button>

                            {isKeyMenuOpenId === k.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
                              >
                                <button
                                  onClick={() => openEditModal(k)}
                                  className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50"
                                >
                                  ✏️ Editar
                                </button>

                                <button
                                  onClick={async () => {
                                    setIsKeyMenuOpenId(null);
                                    await handleArchiveKey(k.id, k.code);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-amber-700 hover:bg-amber-50"
                                >
                                  🗄️ Arquivar
                                </button>

                                <button
                                  onClick={async () => {
                                    setIsKeyMenuOpenId(null);
                                    await handleDeleteKey(k.id, k.code);
                                  }}
                                  className="w-full text-left px-4 py-3 text-sm text-rose-600 hover:bg-rose-50"
                                >
                                  🗑️ Excluir
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setView('cabinet_g1_new_key')}
              className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-red-600 text-white text-3xl font-bold shadow-2xl hover:bg-blue-700 transition flex items-center justify-center"
              aria-label="Adicionar chave no G1"
              title="Adicionar chave no G1"
            >
              +
            </button>
          </div>
        )}

        {view === 'cabinet_g1_new_key' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  Cadastrar Chave - G1
                </h1>
                <p className="text-slate-500">
                  Preencha as informações da chave para adicionar no armário G1.
                </p>
              </div>

              <button
                onClick={() => setView('cabinet_g1')}
                className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
              >
                ← Voltar
              </button>
            </header>

            <div className="bg-white rounded-2xl border border-slate-100 p-6 max-w-2xl">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  TAG da chave
                </label>

                <input
                  value={g1KeyTag}
                  onChange={(e) => setG1KeyTag(e.target.value)}
                  placeholder="Ex: P202, ADM01, A101..."
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />

                <div className="space-y-2 mt-6">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    Local (ex: Sala de Máquinas)
                  </label>

                  <input
                    value={g1KeyLocal}
                    onChange={(e) => setG1KeyLocal(e.target.value)}
                    placeholder="Ex: Sala de Máquinas, Docas, ADM..."
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="space-y-2 mt-6">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    Observação / Descrição
                  </label>

                  <input
                    value={g1KeyDesc}
                    onChange={(e) => setG1KeyDesc(e.target.value)}
                    placeholder="Ex: porta 03, acesso restrito..."
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div className="space-y-2 mt-6">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    Setor
                  </label>

                  <select
                    value={g1KeySectorId}
                    onChange={(e) => {
                      const selectedId = e.target.value;

                      const selectedSector = sectors.find(
                        (s: any) => String(s.id) === String(selectedId)
                      );

                      setG1KeySectorId(selectedId);
                      setG1KeySectorName(selectedSector?.name ?? '');
                    }}
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="">Selecione um setor</option>

                    {sectors.map((sector: any) => (
                      <option key={sector.id} value={sector.id}>
                        {sector.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-400">
                  Essa TAG é o identificador principal (ex: etiqueta da chave).
                </p>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setG1KeyTag('');
                    setG1KeyLocal('');
                    setG1KeyDesc('');
                    setView('cabinet_g1');
                  }}
                  className="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                >
                  Cancelar
                </button>

                <button
                  disabled={!g1KeyTag.trim()}
                  onClick={handleCreateG1Key}
                  className="px-6 py-3 rounded-xl font-bold text-white bg-[#BA7517] hover:bg-blue-700 disabled:bg-slate-300 transition"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {!mustChangePassword && view === 'history' && (

          <div className="space-y-6 animate-in fade-in duration-500">
            <header className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  Histórico de Auditoria
                </h1>
                <p className="text-slate-500">
                  Registro completo e imutável de todas as chaves.
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportHistoryPdf}
                className="flex items-center space-x-2 text-slate-600 bg-white border px-4 py-2 rounded-lg hover:bg-slate-50"
              >
                <span>📥</span>
                <span>Exportar PDF</span>
              </button>
            </header>
            <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Buscar por responsável, autorizador, chave ou setor…"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="border border-slate-200 rounded-lg px-4 py-2 text-sm flex-1 min-w-[220px]"
              />

              <select
                value={historyStatus}
                onChange={(e) => setHistoryStatus(e.target.value)}
                className="border border-slate-200 rounded-lg px-4 py-2 text-sm"
              >
                <option value="ALL">Todos</option>
                <option value="OPEN">Em aberto</option>
                <option value="DONE">Concluído</option>
              </select>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Data/Hora
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Chave
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Responsável
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Status Movimento
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                        Assinatura
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {movements
                      .filter((m: any) => {
                        const key = keys.find((k) => k.id === m.keyId);

                        const responsibleName =
                          m.user_name ||
                          m.userName ||
                          m.withdrawn_by_name ||
                          '';

                        const authorizedName =
                          m.authorized_by_name ||
                          m.authorizedByName ||
                          '';

                        const matchesSearch = smartSearch(
                          historySearch,
                          responsibleName,
                          authorizedName,
                          key?.code,
                          key?.label,
                          key?.sector_name,
                          key?.sector
                        );

                        const matchesStatus =
                          historyStatus === 'ALL'
                            ? true
                            : historyStatus === 'OPEN'
                              ? !m.returnedAt
                              : !!m.returnedAt;

                        return matchesSearch && matchesStatus;
                      })
                      .map((m: any) => {
                        const key = keys.find((k) => k.id === m.keyId);
                        const fallbackUser = users.find((u) => u.id === m.userId);
                        const fallbackAuthUser = users.find(
                          (u) => u.id === m.authorizedBy
                        );

                        const responsibleName =
                          m.user_name ||
                          m.userName ||
                          m.withdrawn_by_name ||
                          fallbackUser?.name ||
                          '—';

                        const authorizedName =
                          m.authorized_by_name ||
                          m.authorizedByName ||
                          m.userName ||
                          fallbackAuthUser?.name ||
                          '-';

                        return (
                          <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium">
                              <div className="text-slate-900 font-bold">
                                {new Date(m.withdrawnAt).toLocaleDateString('pt-BR')}
                              </div>
                              <div className="text-xs text-slate-400">
                                {new Date(m.withdrawnAt).toLocaleTimeString('pt-BR')}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <div className="font-bold">{key?.code}</div>
                              <div className="text-xs text-slate-500 italic">
                                {key?.label}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm">
                              <div className="font-medium text-slate-800">
                                {responsibleName}
                              </div>
                              <div className="text-xs text-slate-400 italic">
                                Auth por: {authorizedName}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {m.returnedAt ? (
                                <div className="flex flex-col">
                                  <span className="text-emerald-600 font-bold text-xs uppercase">
                                    Concluído
                                  </span>
                                  <span className="text-[10px] text-slate-400">
                                    Ret: {new Date(m.returnedAt).toLocaleString('pt-BR')}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-orange-600 font-bold text-xs uppercase animate-pulse">
                                  Em aberto
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {m.signatureBase64 ? (
                                <img
                                  src={m.signatureBase64}
                                  alt="Assinatura"
                                  onClick={() => setPreviewSignature(m.signatureBase64)}
                                  title="Clique para ampliar"
                                  className="h-8 border rounded bg-slate-50 opacity-80 hover:opacity-100 transition-opacity cursor-zoom-in"
                                />
                              ) : (
                                <span className="text-xs text-slate-300">N/A</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {!mustChangePassword && view === 'inventories' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <header>
              <h1 className="text-3xl font-bold text-slate-900">Inventários</h1>
              <p className="text-slate-500">
                Histórico das conferências físicas das chaves.
              </p>
            </header>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {loadingInventories ? (
                <div className="p-8 text-center text-slate-500">
                  Carregando inventários...
                </div>
              ) : inventories.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  Nenhuma conferência registrada ainda. Faça a conferência pelo
                  app do operador (celular).
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                          Data
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                          Conferente
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                          Presentes
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                          Sumidas
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase">
                          Divergentes
                        </th>
                        <th className="px-6 py-4" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {inventories.map((inv) => (
                        <tr
                          key={inv.id}
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4 text-sm">
                            <div className="font-bold text-slate-900">
                              {new Date(inv.created_at).toLocaleDateString(
                                'pt-BR'
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              {new Date(inv.created_at).toLocaleTimeString(
                                'pt-BR'
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">
                            {inv.performed_by_name || '—'}
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                              {inv.total_present}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-bold ${
                                inv.total_missing > 0
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {inv.total_missing}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-bold ${
                                inv.total_unexpected > 0
                                  ? 'bg-orange-100 text-orange-700'
                                  : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {inv.total_unexpected}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              onClick={() => openInventory(inv)}
                              className="text-blue-600 font-bold text-sm hover:underline"
                            >
                              Ver detalhes
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
      {
        showCreateCabinet && (
          <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">

            <div className="bg-white rounded-3xl p-6 w-full max-w-lg">

              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                Novo Armário
              </h2>

              <div className="space-y-4">

                <input
                  type="text"
                  placeholder="Nome do armário"
                  value={cabinetName}
                  onChange={(e) => setCabinetName(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />

                <input
                  type="text"
                  placeholder="Localização"
                  value={cabinetLocation}
                  onChange={(e) => setCabinetLocation(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3"
                />

                <textarea
                  placeholder="Descrição"
                  value={cabinetDescription}
                  onChange={(e) => setCabinetDescription(e.target.value)}
                  className="w-full border border-slate-300 rounded-xl px-4 py-3 h-28"
                />

              </div>

              <div className="flex justify-end gap-3 mt-6">

                <button
                  onClick={() => setShowCreateCabinet(false)}
                  className="px-5 py-3 rounded-xl bg-slate-100 font-bold"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleCreateCabinet}
                  className="px-5 py-3 rounded-xl bg-[#BA7517] text-white font-bold"
                >
                  Salvar Armário
                </button>

              </div>

            </div>
          </div>
        )
      }
      {showCreateSector && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Novo Setor
            </h2>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Nome do setor"
                value={sectorName}
                onChange={(e) => setSectorName(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />

              <textarea
                placeholder="Descrição"
                value={sectorDescription}
                onChange={(e) => setSectorDescription(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 h-28"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => setShowCreateSector(false)}
                className="px-5 py-3 rounded-xl bg-slate-100 font-bold"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleCreateSector}
                className="px-5 py-3 rounded-xl bg-[#BA7517] text-white font-bold"
              >
                Salvar Setor
              </button>
            </div>
          </div>
        </div>
      )}
      {qrModal && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setQrModal(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">
                {qrModal.type === 'porta' ? '🚪 QR da Porta' : '📱 QR da Chave'}
              </h2>
              <button
                type="button"
                onClick={() => setQrModal(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="flex justify-center">
              <QRCodeCanvas
                value={
                  qrModal.type === 'porta'
                    ? `${APP_URL}/key/${qrModal.key.id}?porta=1`
                    : `${APP_URL}/key/${qrModal.key.id}`
                }
                size={240}
              />
            </div>

            <p className="text-2xl font-extrabold text-slate-900 mt-4">
              {qrModal.key.code}
            </p>
            <p className="text-slate-600">{qrModal.key.label}</p>

            <p className="text-xs text-slate-500 mt-3">
              {qrModal.type === 'porta'
                ? 'Cole este QR na PORTA — ele identifica a chave (não libera a retirada).'
                : 'Cole este QR na CHAVE — usado para retirar.'}
            </p>
          </div>
        </div>
      )}

      {doorKey && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDoorKey(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in duration-200 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">
                🚪 Chave desta porta
              </h2>
              <button
                type="button"
                onClick={() => setDoorKey(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <p className="text-xs font-bold text-slate-400 uppercase">Código</p>
            <p className="text-4xl font-extrabold text-slate-900">
              {doorKey.code}
            </p>
            <p className="text-lg text-slate-600 mt-2">{doorKey.label}</p>

            <button
              type="button"
              onClick={() => setDoorKey(null)}
              className="mt-6 w-full px-5 py-3 rounded-xl bg-slate-100 font-bold hover:bg-slate-200"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {selectedInventory && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setSelectedInventory(null)}
        >
          <div
            className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between sticky top-0 bg-white">
              <div>
                <h2 className="text-xl font-bold text-slate-900">
                  Conferência de{' '}
                  {new Date(selectedInventory.created_at).toLocaleDateString(
                    'pt-BR'
                  )}
                </h2>
                <p className="text-sm text-slate-500">
                  Conferente: {selectedInventory.performed_by_name || '—'}
                </p>
              </div>
              <button
                onClick={() => setSelectedInventory(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-emerald-700">
                    {selectedInventory.total_present}
                  </p>
                  <p className="text-xs text-emerald-700">Presentes</p>
                </div>
                <div className="bg-rose-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-rose-700">
                    {selectedInventory.total_missing}
                  </p>
                  <p className="text-xs text-rose-700">Sumidas</p>
                </div>
                <div className="bg-orange-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-extrabold text-orange-700">
                    {selectedInventory.total_unexpected}
                  </p>
                  <p className="text-xs text-orange-700">Divergentes</p>
                </div>
              </div>

              {loadingInventoryItems ? (
                <p className="text-center text-slate-500 py-4">
                  Carregando itens...
                </p>
              ) : (
                <>
                  {(['missing', 'unexpected', 'present'] as const).map(
                    (res) => {
                      const list = inventoryItems.filter(
                        (it) => it.result === res
                      );
                      if (list.length === 0) return null;
                      const title =
                        res === 'missing'
                          ? '🔴 Sumidas (não encontradas)'
                          : res === 'unexpected'
                            ? '🟠 Divergentes (estavam EM USO no sistema)'
                            : '🟢 Presentes';
                      return (
                        <div key={res}>
                          <p className="font-bold text-slate-800 mb-2">
                            {title}
                          </p>
                          <div className="space-y-1">
                            {list.map((it) => (
                              <div
                                key={it.id}
                                className="text-sm bg-slate-50 rounded-lg px-3 py-2"
                              >
                                <b>{it.key_code}</b> — {it.key_label}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }
                  )}
                </>
              )}

              <button
                onClick={() =>
                  handleExportInventoryPdf(selectedInventory, inventoryItems)
                }
                disabled={loadingInventoryItems}
                className="w-full bg-[#BA7517] text-white font-bold py-3 rounded-xl hover:bg-blue-700 disabled:bg-slate-300"
              >
                📥 Exportar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {previewSignature && (
        <div
          className="fixed inset-0 z-[95] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setPreviewSignature(null)}
        >
          <div
            className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-slate-900">Assinatura</h2>
              <button
                type="button"
                onClick={() => setPreviewSignature(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center justify-center">
              <img
                src={previewSignature}
                alt="Assinatura ampliada"
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {confirmState && (
        <div className="fixed inset-0 z-[95] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in duration-200">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{confirmState.danger ? '🗑️' : '❓'}</span>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-slate-900">
                  Confirmar ação
                </h2>
                <p className="text-slate-600 mt-1 text-sm break-words">
                  {confirmState.message}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
                className="px-5 py-3 rounded-xl bg-slate-100 font-bold hover:bg-slate-200"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
                className={`px-5 py-3 rounded-xl text-white font-bold ${
                  confirmState.danger
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-[#BA7517] hover:bg-blue-700'
                }`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 shadow-lg border animate-in slide-in-from-right fade-in duration-300 ${
                t.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : t.type === 'error'
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
              }`}
            >
              <span className="text-lg leading-none">
                {t.type === 'success' ? '✅' : t.type === 'error' ? '⚠️' : 'ℹ️'}
              </span>
              <p className="text-sm font-medium flex-1 break-words">{t.message}</p>
              <button
                type="button"
                onClick={() =>
                  setToasts((prev) => prev.filter((x) => x.id !== t.id))
                }
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {showEditCabinet && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Editar Armário
            </h2>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Nome do armário"
                value={editCabinetName}
                onChange={(e) => setEditCabinetName(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />

              <textarea
                placeholder="Descrição"
                value={editCabinetDescription}
                onChange={(e) => setEditCabinetDescription(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 h-28"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowEditCabinet(false);
                  setEditingCabinetId(null);
                }}
                className="px-5 py-3 rounded-xl bg-slate-100 font-bold"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleUpdateCabinet}
                className="px-5 py-3 rounded-xl bg-[#BA7517] text-white font-bold"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditSector && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg">
            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Editar Setor
            </h2>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Nome do setor"
                value={editSectorName}
                onChange={(e) => setEditSectorName(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3"
              />

              <textarea
                placeholder="Descrição"
                value={editSectorDescription}
                onChange={(e) => setEditSectorDescription(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-4 py-3 h-28"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setShowEditSector(false);
                  setEditingSectorId(null);
                }}
                className="px-5 py-3 rounded-xl bg-slate-100 font-bold"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleUpdateSector}
                className="px-5 py-3 rounded-xl bg-[#BA7517] text-white font-bold"
              >
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {isCheckOutModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-xl max-h-[94vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in duration-200">
            <div className="px-5 py-4 sm:px-8 sm:py-6 bg-slate-50 border-b flex justify-between items-center sticky top-0 z-10">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">
                  Protocolo de Retirada
                </h2>
                <p className="text-slate-500 text-sm">
                  Confirmação de responsabilidade sobre a chave.
                </p>
              </div>
              <button
                onClick={() => setIsCheckOutModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="p-4 sm:p-8 space-y-5">
              <div className="bg-blue-50 p-4 rounded-xl flex items-center space-x-4 border border-blue-100">
                <div className="text-3xl">🔑</div>
                <div>
                  <p className="text-xs text-blue-600 font-bold uppercase tracking-wider">
                    Chave Selecionada
                  </p>
                  <p className="text-lg font-bold text-blue-900">
                    {selectedKey?.code} - {selectedKey?.label}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  Nome de quem está retirando
                </label>

                <input
                  type="text"
                  value={checkoutUser}
                  onChange={(e) => setCheckoutUser(e.target.value)}
                  placeholder="Ex: Carlos Silva"
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  Registrado por
                </label>

                <div className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-700">
                  {profile?.full_name || 'Usuário'}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  Assinatura Digital
                </label>
                <SignaturePad onSave={(base64) => setSignature(base64)} />
                {signature && (
                  <p className="text-emerald-600 text-xs font-bold text-center">
                    ✓ Assinatura capturada com sucesso!
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4 pb-1 sticky bottom-0 bg-white -mx-4 sm:-mx-8 px-4 sm:px-8 border-t border-slate-100">
                <button
                  onClick={() => setIsCheckOutModalOpen(false)}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCheckOut}
                  disabled={!checkoutUser.trim() || !signature}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-white bg-[#BA7517] hover:bg-blue-700 disabled:bg-slate-300 transition-all shadow-lg shadow-blue-200"
                >
                  Confirmar Retirada
                </button>
              </div>
            </div>
          </div>
        </div>

      )}

      {isEditUserModalOpen && editingSystemUser && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Editar Usuário</h2>
                <p className="text-slate-500 text-sm">
                  Atualize nome, função e status do usuário.
                </p>
              </div>
              <button
                onClick={handleCloseEditUserModal}
                className="text-slate-400 hover:text-slate-600 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="p-8 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  Nome completo
                </label>
                <input
                  value={editUserFullName}
                  onChange={(e) => setEditUserFullName(e.target.value)}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  Função
                </label>
                <select
                  value={editUserRole}
                  onChange={(e) =>
                    setEditUserRole(e.target.value as 'admin' | 'manager' | 'operator')
                  }
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="operator">Operator</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-800">Usuário ativo</div>
                  <div className="text-sm text-slate-500">
                    Usuários inativos não devem acessar o sistema.
                  </div>
                </div>

                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editUserIsActive}
                    onChange={(e) => setEditUserIsActive(e.target.checked)}
                    className="w-5 h-5"
                  />
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleResetUserPassword}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  Redefinir senha
                </button>

                <button
                  onClick={handleCloseEditUserModal}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleUpdateSystemUser}
                  disabled={isUpdatingSystemUser}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300"
                >
                  {isUpdatingSystemUser ? 'Salvando...' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200">
            <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Novo Usuário</h2>
                <p className="text-slate-500 text-sm">
                  Cadastre um novo acesso ao sistema.
                </p>
              </div>
              <button
                onClick={handleCloseUserModal}
                className="text-slate-400 hover:text-slate-600 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="p-8 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    Nome completo
                  </label>
                  <input
                    value={newUserFullName}
                    onChange={(e) => setNewUserFullName(e.target.value)}
                    placeholder="Ex: João da Silva"
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    E-mail
                  </label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="usuario@empresa.com"
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    Senha temporária
                  </label>
                  <input
                    type="password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                    Função
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) =>
                      setNewUserRole(e.target.value as 'admin' | 'manager' | 'operator')
                    }
                    className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    <option value="operator">Operator</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-800">Usuário ativo</div>
                  <div className="text-sm text-slate-500">
                    Usuários inativos não devem acessar o sistema.
                  </div>
                </div>

                <label className="inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newUserIsActive}
                    onChange={(e) => setNewUserIsActive(e.target.checked)}
                    className="w-5 h-5"
                  />
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleCloseUserModal}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleCreateSystemUser}
                  disabled={isCreatingSystemUser}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 transition-all shadow-lg"
                >
                  {isCreatingSystemUser ? 'Salvando...' : 'Salvar usuário'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isEditModalOpen && editKey && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Editar chave</h2>
                <p className="text-slate-500 text-sm">
                  Atualize TAG, local e informações.
                </p>
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditKey(null);
                }}
                className="text-slate-400 hover:text-slate-600 text-2xl"
              >
                &times;
              </button>
            </div>

            <div className="p-8 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  TAG (código)
                </label>
                <input
                  value={editTag}
                  onChange={(e) => setEditTag(e.target.value)}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  Local
                </label>
                <input
                  value={editLocal}
                  onChange={(e) => setEditLocal(e.target.value)}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  Descrição
                </label>
                <input
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 uppercase tracking-tight">
                  Setor
                </label>

                <select
                  value={editSectorId}
                  onChange={(e) => setEditSectorId(e.target.value)}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                >
                  <option value="">Selecione um setor</option>

                  {sectors.map((sector: any) => (
                    <option key={sector.id} value={sector.id}>
                      {sector.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditKey(null);
                  }}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleSaveEditKey}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-white bg-[#BA7517] hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                >
                  Salvar alterações
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex justify-around p-3 z-40">
        <button
          onClick={() => setView('keys')}
          className={`flex flex-col items-center ${view === 'keys' ? 'text-blue-600' : 'text-slate-400'
            }`}
        >
          <span className="text-xl">🔑</span>
          <span className="text-[10px] font-bold">Chaves</span>
        </button>

        <button
          onClick={() => setView('scanner')}
          className={`flex flex-col items-center ${view === 'scanner' ? 'text-blue-600' : 'text-slate-400'
            }`}
        >
          <span className="text-xl">📷</span>
          <span className="text-[10px] font-bold">Scanner</span>
        </button>

        <button
          onClick={handleLogout}
          className="flex flex-col items-center text-rose-500"
        >
          <span className="text-xl">🚪</span>
          <span className="text-[10px] font-bold">Sair</span>
        </button>
      </nav>
      {/* AREA DE IMPRESSÃO */}
      <div className="print-area">
        {printKey ? (
          <div style={{ padding: '4mm' }}>
            <h1 style={{ fontSize: '14pt', fontWeight: 800, marginBottom: '3mm' }}>
              Etiqueta da Chave — recorte e cole na chave
            </h1>

            <div
              style={{
                width: '50mm',
                height: '20mm',
                border: '1px dashed #94a3b8',
                borderRadius: '1.5mm',
                display: 'flex',
                alignItems: 'center',
                gap: '2mm',
                padding: '1.5mm',
                boxSizing: 'border-box',
                pageBreakInside: 'avoid',
                overflow: 'hidden',
              }}
            >
              <QRCodeCanvas
                value={`${APP_URL}/key/${printKey.id}`}
                size={220}
                style={{ width: '16mm', height: '16mm', flexShrink: 0 }}
              />
              <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '11pt',
                    lineHeight: 1,
                    color: '#0f172a',
                  }}
                >
                  {printKey.code}
                </div>
                <div
                  style={{
                    fontSize: '6.5pt',
                    fontWeight: 600,
                    color: '#1e293b',
                    lineHeight: 1.15,
                    marginTop: '0.5mm',
                    wordBreak: 'break-word',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {printKey.label}
                </div>
              </div>
            </div>

            <h1
              style={{
                fontSize: '14pt',
                fontWeight: 800,
                margin: '10mm 0 3mm',
              }}
            >
              QR da Porta — cole na porta
            </h1>

            <div
              style={{
                width: '50mm',
                border: '1px dashed #94a3b8',
                borderRadius: '2mm',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '3mm',
                boxSizing: 'border-box',
                pageBreakInside: 'avoid',
              }}
            >
              <QRCodeCanvas
                value={`${APP_URL}/key/${printKey.id}?porta=1`}
                size={400}
                style={{ width: '40mm', height: '40mm' }}
              />
              <div style={{ fontWeight: 800, fontSize: '12pt', marginTop: '2mm' }}>
                {printKey.code}
              </div>
              <div
                style={{
                  fontSize: '8pt',
                  color: '#475569',
                  textAlign: 'center',
                }}
              >
                {printKey.label}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: '2mm' }}>
            {/* Etiquetas das chaves (cortar e colar na chave) */}
            <h1 style={{ fontSize: '14pt', fontWeight: 800, marginBottom: '4mm' }}>
              Etiquetas das Chaves — recorte e cole na chave
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4mm' }}>
              {keys.map((key) => (
                <div
                  key={key.id}
                  style={{
                    width: '50mm',
                    height: '20mm',
                    border: '1px dashed #94a3b8',
                    borderRadius: '1.5mm',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2mm',
                    padding: '1.5mm',
                    boxSizing: 'border-box',
                    pageBreakInside: 'avoid',
                    overflow: 'hidden',
                  }}
                >
                  <QRCodeCanvas
                    value={`${APP_URL}/key/${key.id}`}
                    size={220}
                    style={{ width: '16mm', height: '16mm', flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: '11pt',
                        lineHeight: 1,
                        color: '#0f172a',
                      }}
                    >
                      {key.code}
                    </div>
                    <div
                      style={{
                        fontSize: '6.5pt',
                        fontWeight: 600,
                        color: '#1e293b',
                        lineHeight: 1.15,
                        marginTop: '0.5mm',
                        wordBreak: 'break-word',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {key.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* QR das portas (maiores, em nova página) */}
            <h1
              style={{
                fontSize: '14pt',
                fontWeight: 800,
                margin: '0 0 4mm',
                pageBreakBefore: 'always',
              }}
            >
              QR das Portas — cole na porta
            </h1>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5mm' }}>
              {keys.map((key) => (
                <div
                  key={key.id}
                  style={{
                    width: '46mm',
                    border: '1px dashed #94a3b8',
                    borderRadius: '2mm',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: '3mm',
                    boxSizing: 'border-box',
                    pageBreakInside: 'avoid',
                  }}
                >
                  <QRCodeCanvas
                    value={`${APP_URL}/key/${key.id}?porta=1`}
                    size={340}
                    style={{ width: '34mm', height: '34mm' }}
                  />
                  <div
                    style={{ fontWeight: 800, fontSize: '11pt', marginTop: '2mm' }}
                  >
                    {key.code}
                  </div>
                  <div
                    style={{
                      fontSize: '8pt',
                      color: '#475569',
                      textAlign: 'center',
                    }}
                  >
                    {key.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


export default App;
