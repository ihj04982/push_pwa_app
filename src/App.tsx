import { useEffect, useMemo, useState } from "react";
import type { MessagePayload } from "firebase/messaging";
import {
  getStoredRegistrationState,
  getTokenWhenPermissionGranted,
  listenForegroundMessages,
  registerTokenToFirestore,
  requestPermissionAndToken,
} from "./notifications";
import { useInstallPrompt } from "./useInstallPrompt";

type StatusState = "success" | "error" | undefined;

function App() {
  const [status, setStatus] = useState(
    "장치명을 입력한 뒤 아래 버튼을 눌러 알림을 설정해 주세요."
  );
  const [statusState, setStatusState] = useState<StatusState>(undefined);
  const [phase, setPhase] = useState<string>("대기 중");
  const [isLoading, setIsLoading] = useState(false);
  const [deviceName, setDeviceName] = useState(
    () => getStoredRegistrationState()?.deviceName ?? ""
  );
  const [lastMessage, setLastMessage] = useState<MessagePayload | null>(null);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const { canPrompt, triggerInstall, isIOS, isInAppBrowser, showAddToHome } =
    useInstallPrompt();

  useEffect(() => {
    const stored = getStoredRegistrationState();
    if (!stored || Notification.permission !== "granted") return;

    let cancelled = false;
    setPhase("확인 중");
    setStatus("등록 상태 확인 중…");
    setStatusState(undefined);

    getTokenWhenPermissionGranted().then((token) => {
      if (cancelled) return;
      if (!token) {
        setPhase("대기 중");
        setStatus("장치명을 입력한 뒤 아래 버튼을 눌러 알림을 설정해 주세요.");
        setStatusState(undefined);
        return;
      }
      setDeviceName(stored.deviceName);
      setPhase("완료");
      setStatus(
        "알림 권한이 허용되었고, FCM 토큰이 Firestore에 등록되었습니다."
      );
      setStatusState("success");
    }).catch(() => {
      if (cancelled) return;
      setPhase("대기 중");
      setStatus("장치명을 입력한 뒤 아래 버튼을 눌러 알림을 설정해 주세요.");
      setStatusState(undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribePromise = listenForegroundMessages((payload) => {
      setLastMessage(payload);
      setStatusState(undefined);
      const title = payload.notification?.title ?? "새 알림";
      const body = payload.notification?.body ?? "내용 없음";
      setStatus(`알림 수신: ${title} — ${body}`);
      setPhase("메시지 수신됨");
    });

    return () => {
      unsubscribePromise
        .then((unsubscribe) => unsubscribe?.())
        .catch(() => undefined);
    };
  }, []);

  const primaryMessage =
    statusState === "success"
      ? "알림이 설정되었습니다. 이 기기로 푸시 알림을 받을 수 있습니다."
      : statusState === "error"
        ? status
        : phase === "확인 중"
          ? status
          : "장치명을 입력한 뒤 버튼을 눌러 주세요.";

  const formattedMessage = useMemo(
    () =>
      lastMessage
        ? JSON.stringify(lastMessage, null, 2)
        : "아직 수신된 알림이 없습니다.",
    [lastMessage]
  );

  const handleEnableNotification = async () => {
    const trimmed = deviceName.trim();
    if (!trimmed) {
      setStatus("장치명을 입력해 주세요.");
      setStatusState("error");
      return;
    }
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
        setStatus(
          "토큰 발급에 실패했습니다. Firebase 설정 및 VAPID 키를 확인해 주세요."
        );
        setStatusState("error");
        return;
      }
      setPhase("Firestore 등록 중");
      setStatus("Firestore에 토큰 등록 중…");
      await registerTokenToFirestore(nextToken, deviceName.trim());
      setPhase("완료");
      setStatus("알림 권한이 허용되었고, FCM 토큰이 Firestore에 등록되었습니다.");
      setStatusState("success");
    } catch (error) {
      setPhase("오류");
      const message =
        error instanceof Error
          ? error.message
          : "알 수 없는 오류가 발생했습니다.";
      setStatus(`알림 설정 실패: ${message}`);
      setStatusState("error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main id="main-content" className="app">
      <h1 className="app__title">Push PWA App</h1>

      <section className="app__primary" aria-labelledby="main-cta-heading">
        <h2 id="main-cta-heading" className="visually-hidden">
          알림 설정
        </h2>
        <p
          className="app__status app__status--primary"
          aria-live="polite"
          data-state={statusState}
        >
          {primaryMessage}
        </p>
        <div className="app__primary-form">
          <p id="device-name-desc" className="app__primary-hint">
            Firestore에서 기기를 구분할 수 있는 이름을 입력한 뒤 버튼을 눌러 주세요.
          </p>
          <div className="app__device-name-wrap">
            <label htmlFor="device-name" className="app__device-name-label">
              장치명 <span className="app__required" aria-hidden="true">*</span>
            </label>
            <input
              id="device-name"
              type="text"
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="예: 홍길동의 iPhone"
              disabled={isLoading || phase === "확인 중"}
              required
              maxLength={100}
              className="app__device-name-input"
              aria-describedby="device-name-desc"
            />
          </div>
        </div>
        <button
          type="button"
          onClick={handleEnableNotification}
          disabled={isLoading || phase === "확인 중"}
          aria-label="알림 권한 요청 및 FCM 토큰 발급"
          aria-busy={isLoading || phase === "확인 중"}
          className="app__primary-btn"
        >
          {phase === "확인 중"
            ? "확인 중…"
            : isLoading
              ? "권한 요청 중…"
              : "알림 권한 요청 및 토큰 발급"}
        </button>
      </section>

      {showAddToHome && (
        <section
          className="app__secondary"
          aria-labelledby="add-to-home-heading"
        >
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
                    홈 화면에 추가는 Safari에서만 가능합니다. 링크를 길게 눌러{" "}
                    <strong>Safari에서 열기</strong>를 선택한 뒤, Safari에서{" "}
                    <strong>더 보기(⋯)</strong>를 누르고{" "}
                    <strong>공유(↑)</strong> 버튼에서{" "}
                    <strong>홈 화면에 추가</strong>를 선택해 주세요.
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
                  <strong>더 보기(⋯)</strong>를 누른 뒤{" "}
                  <strong>공유(↑)</strong> 버튼에서{" "}
                  <strong>홈 화면에 추가</strong>를 선택해 주세요.
                </p>
              )}
            </div>
          ) : (
            <p className="app__guide">
              브라우저 <strong>메뉴(⋮)</strong>에서{" "}
              <strong>홈 화면에 추가</strong> 또는 <strong>앱 설치</strong>를
              선택해 주세요.
            </p>
          )}
        </section>
      )}

      <section
        className={`app__debug ${debugExpanded ? "" : "app__debug--collapsed"}`}
        aria-live={debugExpanded ? "polite" : undefined}
      >
        <div className="app__debug-header">
          <h2 className="app__heading--utility">디버그</h2>
          <button
            type="button"
            onClick={() => setDebugExpanded((prev) => !prev)}
            aria-expanded={debugExpanded}
            aria-controls="debug-status-content"
            aria-label={debugExpanded ? "디버그 접기" : "디버그 펼치기"}
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
            <span className="app__debug-label">단계</span>
            <span className="app__debug-value" data-phase={phase}>
              {phase}
            </span>
          </p>
          <p className="app__debug-line app__debug-status" data-state={statusState}>
            {status}
          </p>
          <div className="app__debug-block">
            <span className="app__debug-label">Last Foreground Message</span>
            <pre className="app__pre">{formattedMessage}</pre>
          </div>
        </div>
      </section>
    </main>
  );
}

export default App;
