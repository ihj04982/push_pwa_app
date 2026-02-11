import { useCallback, useEffect, useMemo, useState } from "react";

function getIsStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true)
    return true;
  return false;
}

function getIsIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    return true;
  return false;
}

function getIsInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const inAppPatterns = [
    /KAKAOTALK/i,
    /Instagram/i,
    /FBAN|FBAV/i,
    /NAVER/i,
    /Line\//i,
    /Twitter/i,
  ];
  return inAppPatterns.some((p) => p.test(ua));
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  const isIOS = useMemo(getIsIOS, []);
  const isInAppBrowser = useMemo(getIsInAppBrowser, []);

  useEffect(() => {
    setIsStandalone(getIsStandalone());
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const canPrompt = Boolean(deferredPrompt);
  const showAddToHome = !isStandalone;

  return {
    canPrompt,
    triggerInstall,
    isStandalone,
    isIOS,
    isInAppBrowser,
    showAddToHome,
  };
}
