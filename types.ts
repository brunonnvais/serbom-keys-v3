
export enum UserRole {
  ADMIN = 'ADMIN',
  OPERADOR = 'OPERADOR', // Gravação
  CONSULTA = 'CONSULTA'  // Leitura
}

export type User = {
  id: string;
  name: string;
  role: UserRole;
  email: string;
};

export type KeyStatus = 'DISPONIVEL' | 'EM_USO' | 'MANUTENCAO' | 'PERDIDA';

export type Key = {
  cabinet_name?: string | null;
  sector_name?: string | null;
  id: string;
  code: string;
  label: string;
  description: string;
  sector: string; // Ex: Galpão A, Portaria 2
  status: KeyStatus;
  lastMovementId?: string;

  cabinet_id?: string | null;
  sector_id?: string | null;
  borrowed_at?: string | null;
};

export type Movement = {
  id: string;
  keyId: string;
  userId: string;
  userName?: string;

  authorizedBy: string;
  authorizedByName?: string;

  withdrawnAt: string;
  returnedAt?: string;
  signatureBase64?: string;
  observations?: string;
};

export type AppState = {
  currentUser: User | null;
  keys: Key[];
  movements: Movement[];
  users: User[];
};
