import { useEffect, useMemo, useState } from "react";
import type { MessagePayload } from "firebase/messaging";
import {
  getTokenWhenPermissionGranted,
  listenForegroundMessages,
  registerTokenToFirestore,
  requestPermissionAndToken
} from "./notifications";

type StatusState = "success" | "error" | undefined;

function App() {
  const [status, setStatus] = useState("초기화 중…");
  const [statusState, setStatusState] = useState<StatusState>(undefined);
  const [phase, setPhase] = useState<string>("초기화 중");
  const [isLoading, setIsLoading] = useState(false);
  const [lastMessage, setLastMessage] = useState<MessagePayload | null>(null);

  useEffect(() => {
    const unsubscribePromise = listenForegroundMessages((payload) => {
      setLastMessage(payload);
      setStatusState(undefined);
      const title = payload.notification?.title ?? "새 알림";
      const body = payload.notification?.body ?? "메시지를 수신했습니다.";
      setStatus(`포그라운드 알림 수신: ${title} - ${body}`);
      setPhase("메시지 수신됨");
    });

    return () => {
      unsubscribePromise
        .then((unsubscribe) => unsubscribe?.())
        .catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (Notification.permission !== "granted") {
      setPhase("대기 중");
      setStatus("알림 권한을 요청해 주세요.");
      return;
    }
    let cancelled = false;
    setPhase("토큰 발급 중");
    setStatus("FCM 토큰 발급 중…");
    getTokenWhenPermissionGranted()
      .then((currentToken) => {
        if (cancelled || !currentToken) return;
        setPhase("Firestore 등록 중");
        setStatus("Firestore에 토큰 등록 중…");
        return registerTokenToFirestore(currentToken).then(() => currentToken);
      })
      .then((currentToken) => {
        if (cancelled || !currentToken) return;
        setPhase("완료");
        setStatus("알림 허용됨. FCM 토큰이 Firestore에 자동 등록되었습니다.");
        setStatusState("success");
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("대기 중");
          setStatus("알림 권한을 요청해 주세요.");
          setStatusState(undefined);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const formattedMessage = useMemo(
    () =>
      lastMessage
        ? JSON.stringify(lastMessage, null, 2)
        : "아직 수신된 포그라운드 메시지가 없습니다.",
    [lastMessage]
  );

  const handleEnableNotification = async () => {
    setPhase("권한 요청 중");
    setStatus("알림 권한 요청 중…");
    setStatusState(undefined);
    setIsLoading(true);
    try {
      setPhase("토큰 발급 중");
      setStatus("FCM 토큰 발급 중…");
      const nextToken = await requestPermissionAndToken();
      if (!nextToken) {
        setPhase("오류");
        setStatus("토큰 발급 실패: Firebase 설정값과 VAPID 키를 확인해 주세요.");
        setStatusState("error");
        return;
      }
      setPhase("Firestore 등록 중");
      setStatus("Firestore에 토큰 등록 중…");
      await registerTokenToFirestore(nextToken);
      setPhase("완료");
      setStatus("알림 권한 허용 및 FCM 토큰 Firestore 자동 등록 완료");
      setStatusState("success");
    } catch (error) {
      setPhase("오류");
      const message =
        error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
      setStatus(`알림 설정 실패: ${message}`);
      setStatusState("error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main id="main-content" className="app">
      <h1>Push PWA App</h1>

      <section className="debug-status" aria-live="polite">
        <h2>디버그 상태</h2>
        <div className="debug-phase">
          <span className="phase-label">현재 단계:</span>
          <span className="phase-value" data-phase={phase}>
            {phase}
          </span>
        </div>
        <p className="status" data-state={statusState}>
          {status}
        </p>
      </section>

      <button
        type="button"
        onClick={handleEnableNotification}
        disabled={isLoading}
        aria-label="알림 권한 요청 및 FCM 토큰 발급"
        aria-busy={isLoading}
      >
        {isLoading ? "권한 요청 중…" : "알림 권한 요청 및 토큰 발급"}
      </button>

      <section className="panel">
        <h2>Last Foreground Message</h2>
        <pre>{formattedMessage}</pre>
      </section>
    </main>
  );
}

export default App;
