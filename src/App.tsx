import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { supabase } from '../services/supabaseClient';
import { signInWithEmail, signOut } from '../services/authService';
import { createSystemUser } from '../services/userService';
import { updateSystemUser } from '../services/userAdminService';
import { QRCodeCanvas } from 'qrcode.react';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import serbomLogo from "./assets/serbom-logo.png";
const SidebarItem: React.FC<{
  active: boolean;
  label: string;
  icon: string;
  onClick: () => void;
}> = ({ active, label, icon, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${active
      ? 'bg-blue-600 text-white shadow-lg'
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

        <button className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl">
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
  >('login');
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
  const [printKey, setPrintKey] = useState<Key | null>(null);
  const [shouldPrint, setShouldPrint] = useState(false);

  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('ALL');
  const APP_URL = "https://serbom-keys-v3.vercel.app";

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
      alert('Usuário inválido.');
      return;
    }

    if (!editUserFullName.trim()) {
      alert('Informe o nome completo.');
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
      alert('Usuário atualizado com sucesso.');
    } catch (error: any) {
      console.error('Erro ao atualizar usuário:', error);
      alert(error?.message || 'Erro ao atualizar usuário.');
    } finally {
      setIsUpdatingSystemUser(false);
    }
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
      alert('Informe o nome completo.');
      return;
    }

    const email = newUserEmail.trim().toLowerCase();
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    if (!emailOk) {
      alert('Informe um e-mail válido.');
      return;
    }

    if (!newUserPassword.trim() || newUserPassword.length < 6) {
      alert('A senha temporária deve ter pelo menos 6 caracteres.');
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
      alert('Usuário criado com sucesso.');
    } catch (error: any) {
      console.error('Erro ao criar usuário:', error);
      alert(error?.message || 'Erro ao criar usuário.');
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

        await reloadAll();
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
    setSelectedKey(foundKey);

    if (normalizeStatus(foundKey.status) === 'DISPONIVEL') {
      setCheckoutUser('');
      setSignature(null);
      setIsCheckOutModalOpen(true);
    } else if (normalizeStatus(foundKey.status) === 'EM_USO') {
      const confirmReturn = window.confirm(
        `A chave ${foundKey.code} está em uso. Deseja devolver agora?`
      );

      if (confirmReturn) {
        handleReturn(foundKey.id);
      }
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
            alert('Chave não encontrada no sistema.');
            setView('keys');
            return;
          }

          setSelectedKey(foundKey);
          setView('keys');

          if (normalizeStatus(foundKey.status) === 'DISPONIVEL') {
            setCheckoutUser('');
            setSignature(null);
            setIsCheckOutModalOpen(true);
          } else {
            const confirmReturn = window.confirm(
              `A chave ${foundKey.code} está em uso. Deseja devolver agora?`
            );

            if (confirmReturn) {
              handleReturn(foundKey.id);
            }
          }
        } catch (err) {
          console.error(err);
          alert('QR Code inválido.');
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
      alert(`A chave "${tag}" já existe.`);
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
        alert("Selecione um setor antes de salvar.");
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
      alert(err?.message ?? JSON.stringify(err));
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
      alert('Sessão inválida. Faça login novamente.');
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
      alert(`Erro ao retirar chave: ${err?.message ?? 'erro desconhecido'}`);
    }
  };

  const handleReturn = async (keyId: string) => {
    try {
      await rpcReturnKey(keyId, profile?.full_name || 'Usuário');
      await reloadAll();
    } catch (err) {
      console.error('Erro ao devolver chave:', err);
      alert('Erro ao devolver chave.');
    }
  };
  const handleCreateSector = async () => {
    if (!sectorName.trim()) {
      alert('Digite o nome do setor.');
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
      alert(err?.message || 'Erro ao criar setor.');
    }
  };
  const handleCreateCabinet = async () => {
    try {

      if (!cabinetName.trim()) {
        alert('Digite o nome do armário');
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
      alert(err.message);
    }
  };
  const handleCreateKey = async () => {
    if (!newKeyCode.trim() || !newKeyLabel.trim()) {
      alert('Preencha código e nome.');
      return;
    }

    if (!newKeySector) {
      alert('Selecione um setor.');
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
        cabinet_id: selectedCabinetId,
        status: 'DISPONIVEL',
      });

      setIsCreateModalOpen(false);
      setNewKeyCode('');
      setNewKeyLabel('');
      setNewKeyDescription('');
      setNewKeySector('');

      await reloadAll();
    } catch (err) {
      console.error('Erro ao criar chave:', err);
      alert('Erro ao criar chave.');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleArchiveKey = async (keyId: string, keyCode: string) => {
    try {
      const confirmed = window.confirm(`Arquivar a chave "${keyCode}"?`);
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
      alert('Chave arquivada com sucesso.');
    } catch (err: any) {
      console.error('Erro ao arquivar chave:', err);
      alert(err?.message ?? 'Erro ao arquivar chave.');
    }
  };

  const handleDeleteKey = async (keyId: string, keyCode: string) => {
    try {
      const confirmed = window.confirm(
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
      alert('Chave excluída com sucesso.');
    } catch (err: any) {
      console.error('Erro ao excluir chave:', err);
      alert(err?.message ?? 'Erro ao excluir chave.');
    }
  };
  const handleDeleteCabinet = async (
    cabinetId: string,
    cabinetName: string
  ) => {
    const confirmed = window.confirm(
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
        alert(
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

      alert('Armário excluído com sucesso.');

    } catch (err: any) {
      console.error('Erro ao excluir armário:', err);
      alert(err?.message || 'Erro ao excluir armário.');
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
      alert('Informe a TAG da chave.');
      return;
    }

    const duplicate = keys.some(
      (k) => k.id !== editKey.id && k.code.toUpperCase() === newCode
    );

    if (duplicate) {
      alert(`Já existe outra chave com TAG "${newCode}".`);
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
      alert('Erro ao salvar alterações.');
    }
  };

  const handleLogin = async () => {
    setLoginError('');

    try {
      await signInWithEmail(loginUser, loginPass);
      setView('dashboard');
      setLoginUser('');
      setLoginPass('');
    } catch (error: any) {
      console.error('Erro no login:', error);
      setLoginError(error?.message || 'Erro ao fazer login');
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
  const handleExportHistoryPdf = async () => {
    const doc = new jsPDF();

    let y = 20;

    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text('Relatório de Auditoria - Serbom Keys', 14, y);

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
      doc.setTextColor(37, 99, 235);
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

      y += 90;

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
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-3xl shadow-xl p-8">
          <div className="flex flex-col items-center justify-center mb-8">
            <img
              src={serbomLogo}
              alt="Serbom"
              className="w-40 object-contain mb-4"
            />

            <div className="text-3xl font-extrabold text-slate-900">
              Serbom<span className="text-blue-600">Keys</span>
            </div>

            <div className="text-xs text-slate-500 font-semibold mt-1">
              Sistema Inteligente de Gestão de Chaves
            </div>
          </div>

          <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
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
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all"
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-64 bg-white border-r border-slate-200 p-6 flex flex-col space-y-8 hidden md:flex">
        <div className="flex flex-col items-center justify-center px-2 py-4">
          <img
            src={serbomLogo}
            alt="Serbom"
            className="w-28 object-contain mb-3"
          />

          <span className="text-2xl font-extrabold tracking-tight text-slate-800">
            Serbom<span className="text-blue-600">Keys</span>
          </span>
        </div>

        <nav className="flex-1 space-y-2">
          <SidebarItem
            active={view === 'dashboard'}
            label="Dashboard"
            icon="📊"
            onClick={() => setView('dashboard')}
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

        <div className="border-t pt-6 space-y-4">
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
        {view === 'dashboard' && (
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
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-semibold shadow-lg shadow-blue-200 transition-all flex items-center space-x-2"
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

            {loadingReport && (
              <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm animate-pulse flex flex-col items-center justify-center space-y-4">
                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-blue-600 font-medium">
                  Gemini está analisando seus dados de segurança...
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

        {view === 'users' && isAdmin && (
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
                              {user.id}
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

        {view === 'keys' && (
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
                    if (!selectedCabinetId) {
                      alert('Selecione um armário antes de criar uma chave.');
                      return;
                    }

                    setIsCreateModalOpen(true);
                  }}
                  className="bg-slate-900 text-white px-6 py-2 rounded-xl font-bold hover:bg-slate-800 transition-colors shadow-lg"
                >
                  + Nova Chave
                </button>
              )}

            </header>
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <input
                type="text"
                value={keySearch}
                onChange={(e) => setKeySearch(e.target.value)}
                placeholder="Pesquisar por código, nome, descrição ou setor..."
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

                  const search = keySearch.trim().toLowerCase();

                  if (!search) return true;

                  return (
                    key.code?.toLowerCase().includes(search) ||
                    key.label?.toLowerCase().includes(search) ||
                    key.description?.toLowerCase().includes(search) ||
                    key.sector?.toLowerCase().includes(search)
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
                    <div className="mb-4 flex justify-center">
                      <QRCodeCanvas
                        value={`${APP_URL}/key/${key.id}`}
                        size={96}
                      />
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
                          className="w-full bg-blue-600 text-white font-bold py-2 rounded-lg hover:bg-blue-700 transition-colors"
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
              <div className="bg-white rounded-3xl shadow-xl p-6">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">
                  Scanner QR Code
                </h1>

                <p className="text-slate-500 mb-6">
                  Aponte a câmera para o QR Code da chave.
                </p>

                <div
                  id="qr-reader"
                  className="overflow-hidden rounded-2xl"
                />

                <button
                  onClick={() => setView('dashboard')}
                  className="mt-6 w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-xl"
                >
                  Fechar Scanner
                </button>
              </div>
            </div>
          </div>
        )}
        {view === 'assistant' && (
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
                  className="bg-blue-600 disabled:bg-slate-400 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center space-x-2"
                >
                  {loadingAssistant ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Perguntar ao Gemini</span>
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

        {view === 'key_admin' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-slate-900">
                  Gerenciar Chaves
                </h1>
                <p className="text-slate-500">
                  Configurações e administração das chaves.
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

                {(isAdmin || isManager) && (
                  <button
                    type="button"
                    onClick={() => setShowCreateCabinet(true)}
                    className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-slate-800 shadow-lg"
                  >
                    + Novo Armário
                  </button>
                )}
                {(isAdmin || isManager) && (
                  <button
                    type="button"
                    onClick={() => setShowCreateSector(true)}
                    className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 shadow-lg"
                  >
                    + Novo Setor
                  </button>
                )}
              </div>
            </header>

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
                  className="px-6 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 transition"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'history' && (
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
                placeholder="Pesquisar responsável ou chave..."
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

                        const search = historySearch.toLowerCase();

                        const matchesSearch =
                          responsibleName.toLowerCase().includes(search) ||
                          key?.code?.toLowerCase().includes(search) ||
                          key?.label?.toLowerCase().includes(search);

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
                          fallbackAuthUser?.name ||
                          '—';

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
                  className="px-5 py-3 rounded-xl bg-blue-600 text-white font-bold"
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
                className="px-5 py-3 rounded-xl bg-blue-600 text-white font-bold"
              >
                Salvar Setor
              </button>
            </div>
          </div>
        </div>
      )}
      {isCheckOutModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-y-auto animate-in zoom-in duration-200">
            <div className="px-8 py-6 bg-slate-50 border-b flex justify-between items-center">
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

            <div className="p-4 md:p-8 space-y-5">
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

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setIsCheckOutModalOpen(false)}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCheckOut}
                  disabled={!checkoutUser.trim() || !signature}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 transition-all shadow-lg shadow-blue-200"
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
                  onClick={handleCloseEditUserModal}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleUpdateSystemUser}
                  disabled={isUpdatingSystemUser}
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 transition-all shadow-lg"
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
                  className="flex-1 px-6 py-4 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
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
          <div className="flex flex-col items-center justify-center min-h-screen">
            <h1 className="text-3xl font-bold mb-8">
              QR Code da Chave
            </h1>

            <QRCodeCanvas
              value={`${APP_URL}/key/${printKey.id}`}
              size={260}
            />

            <h2 className="mt-8 text-4xl font-extrabold">
              {printKey.code}
            </h2>

            <p className="text-xl text-slate-700 mt-2">
              {printKey.label}
            </p>

            <p className="text-sm text-slate-500 mt-2">
              Setor: {printKey.sector_name || printKey.sector || 'Sem setor'}
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-8">
              QR Codes das Chaves
            </h1>

            <div className="grid grid-cols-3 gap-6">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="border border-slate-300 rounded-xl p-4 flex flex-col items-center justify-center"
                >
                  <QRCodeCanvas
                    value={`${APP_URL}/key/${key.id}`}
                    size={120}
                  />

                  <div className="mt-4 text-center">
                    <h2 className="font-bold text-lg">
                      {key.code}
                    </h2>

                    <p className="text-sm text-slate-600">
                      {key.label}
                    </p>

                    <p className="text-xs text-slate-500 mt-1">
                      Setor: {key.sector_name || key.sector || 'Sem setor'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;