
import { UserRole, Key, User, Movement } from './types';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Ricardo Administrador', role: UserRole.ADMIN, email: 'admin@condominio.com' },
  { id: 'u2', name: 'João Operador', role: UserRole.OPERADOR, email: 'joao@logistica.com' },
  { id: 'u3', name: 'Maria Consulta', role: UserRole.CONSULTA, email: 'maria@seguranca.com' },
];

export const MOCK_KEYS: Key[] = [
  { id: 'k1', code: 'A101', label: 'Galpão Principal 01', description: 'Acesso doca 1 a 10', sector: 'Setor Norte', status: 'DISPONIVEL' },
  { id: 'k2', code: 'P202', label: 'Portaria Leste', description: 'Chave mestre portaria 2', sector: 'Segurança', status: 'EM_USO' },
  { id: 'k3', code: 'ADM01', label: 'Escritório Central', description: 'Sala da diretoria', sector: 'Administrativo', status: 'DISPONIVEL' },
  { id: 'k4', code: 'E10', label: 'Depósito Manutenção', description: 'Ferramentas gerais', sector: 'Manutenção', status: 'DISPONIVEL' },
  { id: 'k5', code: 'G03', label: 'Geradores', description: 'Acesso subestação', sector: 'Infra', status: 'MANUTENCAO' },
];

export const MOCK_MOVEMENTS: Movement[] = [
  {
    id: 'm1',
    keyId: 'k2',
    userId: 'u2',
    authorizedBy: 'u1',
    withdrawnAt: new Date(Date.now() - 3600000).toISOString(),
    observations: 'Ronda periódica'
  }
];
