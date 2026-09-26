// Persistência local (localStorage): progresso por perfil, sessão em andamento e código de acesso.
import { createInitialProgress } from '../../shared/progress.js';

export const PROFILES = [
  { id: 'lucas', nome: 'Lucas' },
  { id: 'eduarda', nome: 'Eduarda' },
];

const KEYS = {
  progress: (id) => `ft.progress.${id}`,
  session: (id) => `ft.session.${id}`,
  lastProfile: 'ft.lastProfile',
  accessCode: 'ft.accessCode',
};

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error('Falha ao salvar no armazenamento local', err);
  }
}

export function loadProgress(profile) {
  return read(KEYS.progress(profile.id)) ?? createInitialProgress(profile.nome);
}

export const saveProgress = (profileId, progress) => write(KEYS.progress(profileId), progress);
export const loadSession = (profileId) => read(KEYS.session(profileId));
export const saveSession = (profileId, session) => write(KEYS.session(profileId), session);
export const loadLastProfileId = () => read(KEYS.lastProfile);
export const saveLastProfileId = (id) => write(KEYS.lastProfile, id);
export const loadAccessCode = () => read(KEYS.accessCode) ?? '';
export const saveAccessCode = (code) => write(KEYS.accessCode, code || null);
