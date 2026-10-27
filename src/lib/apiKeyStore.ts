// API Key 本地存储管理
const NS = 'paper-rag-assistant';
const KEY_NAME = 'deepseek-api-key';
const REMEMBER_NAME = 'remember-api-key';
export const API_KEY_CHANGED_EVENT = 'paper-rag:api-key-changed';

export function getApiKey(): string {
  try {
    return sessionStorage.getItem(`${NS}:${KEY_NAME}`)
      || localStorage.getItem(`${NS}:${KEY_NAME}`)
      || '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string, remember = false): void {
  try {
    sessionStorage.removeItem(`${NS}:${KEY_NAME}`);
    localStorage.removeItem(`${NS}:${KEY_NAME}`);
    if (remember) {
      localStorage.setItem(`${NS}:${KEY_NAME}`, key);
      localStorage.setItem(`${NS}:${REMEMBER_NAME}`, 'true');
    } else {
      sessionStorage.setItem(`${NS}:${KEY_NAME}`, key);
      localStorage.removeItem(`${NS}:${REMEMBER_NAME}`);
    }
    window.dispatchEvent(new Event(API_KEY_CHANGED_EVENT));
  } catch {
    // 隐私模式静默失败
  }
}

export function clearApiKey(): void {
  try {
    sessionStorage.removeItem(`${NS}:${KEY_NAME}`);
    localStorage.removeItem(`${NS}:${KEY_NAME}`);
    localStorage.removeItem(`${NS}:${REMEMBER_NAME}`);
    window.dispatchEvent(new Event(API_KEY_CHANGED_EVENT));
  } catch {
    // 隐私模式静默失败
  }
}

export function isApiKeyRemembered(): boolean {
  try {
    return localStorage.getItem(`${NS}:${REMEMBER_NAME}`) === 'true';
  } catch {
    return false;
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 10;
}
