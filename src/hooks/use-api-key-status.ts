import { useEffect, useState } from "react";
import { API_KEY_CHANGED_EVENT, hasApiKey } from "@/lib/apiKeyStore";

export function useApiKeyStatus(): boolean {
  const [configured, setConfigured] = useState(hasApiKey());

  useEffect(() => {
    const update = () => setConfigured(hasApiKey());
    window.addEventListener(API_KEY_CHANGED_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(API_KEY_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  return configured;
}
