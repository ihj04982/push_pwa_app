/* eslint-disable no-undef */
importScripts("https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js");
importScripts(
  "https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js"
);

let messaging = null;
let firebaseInitialized = false;

function initializeFirebase(config) {
  if (firebaseInitialized || !config) {
    return;
  }

  firebase.initializeApp(config);
  messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const title = payload?.notification?.title || "피스피킹 솔루션 원격 제어";
    const options = {
      body: payload?.notification?.body || "새 알림을 받았습니다.",
      icon: "/icons/pwa-192x192.png",
      data: payload?.data || {}
    };
    self.registration.showNotification(title, options);
  });
  firebaseInitialized = true;
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "INIT_FIREBASE_CONFIG") {
    return;
  }

  initializeFirebase(event.data.payload);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";
  event.waitUntil(clients.openWindow(targetUrl));
});
