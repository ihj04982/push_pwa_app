import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { getToken, onMessage, type MessagePayload } from "firebase/messaging";
import { db, firebaseConfig, getMessagingIfSupported } from "./firebase";

const FCM_TOKENS_COLLECTION = "fcmTokens";
const DEVICE_ID_KEY = "fcm_device_id";

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id && typeof crypto !== "undefined" && crypto.randomUUID) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  if (!id) {
    id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

async function tokenToDocId(token: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );
  const arr = Array.from(new Uint8Array(buf));
  return arr
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 64);
}

const messagingScope = "/firebase-cloud-messaging-push-scope";
const messagingSwUrl = "/firebase-messaging-sw.js";

async function waitForActiveWorker(registration: ServiceWorkerRegistration) {
  if (registration.active) {
    return registration.active;
  }

  const candidate = registration.installing ?? registration.waiting;
  if (!candidate) {
    return null;
  }

  return new Promise<ServiceWorker | null>((resolve) => {
    const timeoutId = window.setTimeout(() => resolve(null), 5000);

    candidate.addEventListener("statechange", () => {
      if (candidate.state === "activated") {
        window.clearTimeout(timeoutId);
        resolve(candidate);
      }
    });
  });
}

async function getMessagingServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("현재 브라우저는 Service Worker를 지원하지 않습니다.");
  }

  const registration = await navigator.serviceWorker.register(messagingSwUrl, {
    scope: messagingScope,
  });

  // `navigator.serviceWorker.ready` can hang when SW scope does not control this page.
  // We only need the FCM registration to become active.
  const activeWorker = await waitForActiveWorker(registration);
  activeWorker?.postMessage({
    type: "INIT_FIREBASE_CONFIG",
    payload: firebaseConfig,
  });

  return registration;
}

export async function requestPermissionAndToken() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return null;
  }

  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    throw new Error("이 환경에서는 Firebase Messaging이 지원되지 않습니다.");
  }

  const registration = await getMessagingServiceWorkerRegistration();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  return getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
}

/** 권한이 이미 허용된 경우에만 토큰을 반환. 권한 요청 팝업을 띄우지 않음. */
export async function getTokenWhenPermissionGranted(): Promise<string | null> {
  if (Notification.permission !== "granted") {
    return null;
  }

  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    return null;
  }

  const registration = await getMessagingServiceWorkerRegistration();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  return getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
}

/**
 * FCM 토큰을 Firestore fcmTokens 컬렉션에 등록.
 * 문서 ID는 토큰 해시로 하여 같은 토큰이 여러 문서로 쌓이지 않도록 함(캠페인 중복 수신 방지).
 */
export async function registerTokenToFirestore(token: string): Promise<void> {
  const docId = await tokenToDocId(token);
  const deviceId = getOrCreateDeviceId();
  await setDoc(
    doc(db, FCM_TOKENS_COLLECTION, docId),
    { token, deviceId, timestamp: serverTimestamp() },
    { merge: true }
  );
}

/** 포그라운드 FCM 메시지 수신. 구독 해제 함수를 반환하며, 미지원 환경이면 null. */
export async function listenForegroundMessages(
  callback: (payload: MessagePayload) => void
): Promise<(() => void) | null> {
  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    return null;
  }

  return onMessage(messaging, callback);
}
