// API Key 本地存储管理
const NS = 'paper-rag-assistant';
const KEY_NAME = 'deepseek-api-key';

export function getApiKey(): string {
  try {
    return localStorage.getItem(`${NS}:${KEY_NAME}`) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key: string): void {
  try {
    localStorage.setItem(`${NS}:${KEY_NAME}`, key);
  } catch {
    // 隐私模式静默失败
  }
}

export function hasApiKey(): boolean {
  return getApiKey().length > 10;
}
