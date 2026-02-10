import { getToken, onMessage, type MessagePayload } from "firebase/messaging";
import { firebaseConfig, getMessagingIfSupported } from "./firebase";

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
    scope: messagingScope
  });

  // `navigator.serviceWorker.ready` can hang when SW scope does not control this page.
  // We only need the FCM registration to become active.
  const activeWorker = await waitForActiveWorker(registration);
  activeWorker?.postMessage({
    type: "INIT_FIREBASE_CONFIG",
    payload: firebaseConfig
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
    serviceWorkerRegistration: registration
  });
}

export async function listenForegroundMessages(
  callback: (payload: MessagePayload) => void
) {
  const messaging = await getMessagingIfSupported();
  if (!messaging) {
    return null;
  }

  return onMessage(messaging, callback);
}
