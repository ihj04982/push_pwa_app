import { useEffect, useMemo, useState } from "react";
import type { MessagePayload } from "firebase/messaging";
import {
  listenForegroundMessages,
  registerTokenToFirestore,
  requestPermissionAndToken
} from "./notifications";
import { useInstallPrompt } from "./useInstallPrompt";

type StatusState = "success" | "error" | undefined;

function App() {
  const [status, setStatus] = useState("아래 버튼을 눌러 알림 권한을 요청하고 토큰을 발급받으세요.");
  const [statusState, setStatusState] = useState<StatusState>(undefined);
  const [phase, setPhase] = useState<string>("대기 중");
  const [isLoading, setIsLoading] = useState(false);
  const [lastMessage, setLastMessage] = useState<MessagePayload | null>(null);
  const [debugExpanded, setDebugExpanded] = useState(true);
  const {
    canPrompt,
    triggerInstall,
    isIOS,
    isInAppBrowser,
    showAddToHome,
  } = useInstallPrompt();

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
      <h1 className="app__title">Push PWA App</h1>

      {/* 1. Primary: 알림 설정 — 메인 액션 */}
      <section className="app__primary" aria-labelledby="main-cta-heading">
        <h2 id="main-cta-heading" className="visually-hidden">
          알림 설정
        </h2>
        <p className="app__status" aria-live="polite" data-state={statusState}>
          {status}
        </p>
        <button
          type="button"
          onClick={handleEnableNotification}
          disabled={isLoading}
          aria-label="알림 권한 요청 및 FCM 토큰 발급"
          aria-busy={isLoading}
          className="app__primary-btn"
        >
          {isLoading ? "권한 요청 중…" : "알림 권한 요청 및 토큰 발급"}
        </button>
      </section>

      {/* 2. Secondary: 홈 화면에 추가 — 보조 안내 */}
      {showAddToHome && (
        <section className="app__secondary" aria-labelledby="add-to-home-heading">
          <h2 id="add-to-home-heading" className="app__heading--sub">
            홈 화면에 추가
          </h2>
          {canPrompt ? (
            <button
              type="button"
              onClick={triggerInstall}
              className="app__secondary-btn"
              aria-label="홈 화면에 앱 추가"
            >
              홈 화면에 추가
            </button>
          ) : isIOS ? (
            <div className="app__guide">
              {isInAppBrowser ? (
                <>
                  <p>
                    이 기능은 Safari에서만 가능해요. 링크를 길게 눌러{" "}
                    <strong>Safari에서 열기</strong>를 선택한 뒤, Safari에서{" "}
                    <strong>더 보기(⋯)</strong>가 보이면 먼저 누르고{" "}
                    <strong>공유(↑)</strong> 버튼을 누른 다음{" "}
                    <strong>홈 화면에 추가</strong>를 선택하세요.
                  </p>
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="app__link"
                  >
                    이 페이지를 Safari에서 열기
                  </a>
                </>
              ) : (
                <p>
                  <strong>더 보기(⋯)</strong>가 보이면 먼저 누른 뒤{" "}
                  <strong>공유(↑)</strong> 버튼을 누르고,{" "}
                  <strong>홈 화면에 추가</strong>를 선택하세요.
                </p>
              )}
            </div>
          ) : (
            <p className="app__guide">
              브라우저 <strong>메뉴(⋮)</strong>에서{" "}
              <strong>홈 화면에 추가</strong> 또는 <strong>앱 설치</strong>를
              선택하세요.
            </p>
          )}
        </section>
      )}

      {/* 3. Data: 마지막 수신 메시지 — 참고용 데이터 */}
      <section className="app__data" aria-labelledby="last-message-heading">
        <h2 id="last-message-heading" className="app__heading--sub">
          Last Foreground Message
        </h2>
        <pre className="app__pre">{formattedMessage}</pre>
      </section>

      {/* 4. Utility: 디버그 — 개발자용, 최소 시각적 비중 */}
      <section
        className={`app__debug ${debugExpanded ? "" : "app__debug--collapsed"}`}
        aria-live={debugExpanded ? "polite" : undefined}
      >
        <div className="app__debug-header">
          <h2 className="app__heading--utility">디버그 상태</h2>
          <button
            type="button"
            onClick={() => setDebugExpanded((prev) => !prev)}
            aria-expanded={debugExpanded}
            aria-controls="debug-status-content"
            aria-label={debugExpanded ? "디버그 상태 접기" : "디버그 상태 펼치기"}
            className="app__debug-toggle"
          >
            {debugExpanded ? "접기" : "펼치기"}
            <span className="app__debug-chevron" aria-hidden="true">
              {debugExpanded ? " ▲" : " ▼"}
            </span>
          </button>
        </div>
        <div
          id="debug-status-content"
          className="app__debug-content"
          hidden={!debugExpanded}
        >
          <p className="app__debug-line">
            <span className="app__debug-label">현재 단계</span>
            <span className="app__debug-value" data-phase={phase}>
              {phase}
            </span>
          </p>
          <p className="app__status app__status--small" data-state={statusState}>
            {status}
          </p>
        </div>
      </section>
    </main>
  );
}

export default App;
