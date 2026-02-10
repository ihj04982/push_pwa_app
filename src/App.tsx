import { useEffect, useMemo, useState } from "react";
import type { MessagePayload } from "firebase/messaging";
import {
  listenForegroundMessages,
  requestPermissionAndToken
} from "./notifications";

function App() {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("알림 권한을 요청해 주세요.");
  const [lastMessage, setLastMessage] = useState<MessagePayload | null>(null);

  useEffect(() => {
    const unsubscribePromise = listenForegroundMessages((payload) => {
      setLastMessage(payload);
      const title = payload.notification?.title ?? "새 알림";
      const body = payload.notification?.body ?? "메시지를 수신했습니다.";
      setStatus(`포그라운드 알림 수신: ${title} - ${body}`);
    });

    return () => {
      unsubscribePromise
        .then((unsubscribe) => unsubscribe?.())
        .catch(() => undefined);
    };
  }, []);

  const formattedMessage = useMemo(() => {
    if (!lastMessage) {
      return "아직 수신된 포그라운드 메시지가 없습니다.";
    }
    return JSON.stringify(lastMessage, null, 2);
  }, [lastMessage]);

  const handleEnableNotification = async () => {
    setStatus("권한 요청 중...");
    try {
      const nextToken = await requestPermissionAndToken();
      if (!nextToken) {
        setStatus("토큰 발급 실패: Firebase 설정값과 VAPID 키를 확인해 주세요.");
        return;
      }
      setToken(nextToken);
      setStatus("알림 권한 허용 및 FCM 토큰 발급 완료");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setStatus(`알림 설정 실패: ${message}`);
    }
  };

  return (
    <main className="app">
      <h1>Push PWA App</h1>
      <p className="status">{status}</p>
      <button type="button" onClick={handleEnableNotification}>
        알림 권한 요청 및 토큰 발급
      </button>

      <section className="panel">
        <h2>FCM Token</h2>
        <pre>{token || "아직 토큰이 없습니다."}</pre>
      </section>

      <section className="panel">
        <h2>Last Foreground Message</h2>
        <pre>{formattedMessage}</pre>
      </section>
    </main>
  );
}

export default App;
