import { useEffect, useMemo, useState } from "react";
import type { MessagePayload } from "firebase/messaging";
import {
  getStoredRegistrationState,
  getTokenWhenPermissionGranted,
  listenForegroundMessages,
  registerTokenToFirestore,
  requestPermissionAndToken,
} from "./notifications";

type StatusState = "success" | "error" | undefined;

type SendPushResult = {
  success_count: number;
  failure_count: number;
  total: number;
  message: string;
};

type LastApiRequest = { url: string; method: string; body: unknown };

type LastApiResponse =
  | { status: number; ok: boolean; data: unknown }
  | { error: string };

type LastRobotRequest = { url: string; method: string; action: "start" | "stop" };

type LastRobotResponse =
  | { status: number; ok: boolean; data?: unknown }
  | { error: string };

const DEFAULT_STATUS_MESSAGE =
  "장치명을 입력한 뒤 아래 버튼을 눌러 알림을 설정해 주세요.";

function formatApiResponseText(response: LastApiResponse): string {
  if ("error" in response) return response.error;
  const statusText = response.ok ? "OK" : "";
  const dataJson = JSON.stringify(response.data, null, 2);
  return `${response.status} ${statusText}\n${dataJson}`.trim();
}

function formatRobotResponseText(response: LastRobotResponse): string {
  if ("error" in response) return response.error;
  const statusText = response.ok ? "OK" : "";
  const dataPart =
    response.data !== undefined
      ? `\n${JSON.stringify(response.data, null, 2)}`
      : "";
  return `${response.status} ${statusText}${dataPart}`.trim();
}

function App() {
  const [status, setStatus] = useState(DEFAULT_STATUS_MESSAGE);
  const [statusState, setStatusState] = useState<StatusState>(undefined);
  const [phase, setPhase] = useState<string>("대기 중");
  const [isLoading, setIsLoading] = useState(false);
  const [deviceName, setDeviceName] = useState(
    () => getStoredRegistrationState()?.deviceName ?? ""
  );
  const [lastMessage, setLastMessage] = useState<MessagePayload | null>(null);
  const [debugExpanded, setDebugExpanded] = useState(false);
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [pushDeviceName, setPushDeviceName] = useState("");
  const [sendPushLoading, setSendPushLoading] = useState(false);
  const [sendPushResult, setSendPushResult] = useState<SendPushResult | null>(null);
  const [sendPushError, setSendPushError] = useState<string | null>(null);
  const [lastApiRequest, setLastApiRequest] = useState<LastApiRequest | null>(null);
  const [lastApiResponse, setLastApiResponse] = useState<LastApiResponse | null>(null);
  const [robotLoading, setRobotLoading] = useState<"start" | "stop" | null>(null);
  const [robotMessage, setRobotMessage] = useState<string | null>(null);
  const [lastRobotRequest, setLastRobotRequest] =
    useState<LastRobotRequest | null>(null);
  const [lastRobotResponse, setLastRobotResponse] =
    useState<LastRobotResponse | null>(null);
  const [activeTab, setActiveTab] = useState<"register" | "send" | "robot">("robot");

  const pushApiUrl = import.meta.env.VITE_PUSH_API_URL?.trim() ?? "";

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
        setStatus(DEFAULT_STATUS_MESSAGE);
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
      setStatus(DEFAULT_STATUS_MESSAGE);
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

  const handleSendPush = async () => {
    const title = pushTitle.trim();
    const body = pushBody.trim();
    if (!title || !body) {
      setSendPushError("제목과 본문을 입력해 주세요.");
      setSendPushResult(null);
      return;
    }
    if (!pushApiUrl) {
      setSendPushError("VITE_PUSH_API_URL이 설정되지 않았습니다. (ngrok 또는 BE URL)");
      setSendPushResult(null);
      return;
    }
    setSendPushError(null);
    setSendPushResult(null);
    setSendPushLoading(true);
    const url = `${pushApiUrl.replace(/\/$/, "")}/api/send-push`;
    const requestBody = {
      title,
      body,
      ...(pushDeviceName.trim() ? { deviceName: pushDeviceName.trim() } : {}),
    };
    setLastApiRequest({ url, method: "POST", body: requestBody });
    setLastApiResponse(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const data = await res.json().catch(() => ({}));
      setLastApiResponse({
        status: res.status,
        ok: res.ok,
        data,
      });
      if (!res.ok) {
        setSendPushError(data.detail ?? data.message ?? `요청 실패 (${res.status})`);
        return;
      }
      setSendPushResult({
        success_count: data.success_count ?? 0,
        failure_count: data.failure_count ?? 0,
        total: data.total ?? 0,
        message: (data.message as string) ?? "발송 완료",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "네트워크 오류가 발생했습니다.";
      setSendPushError(message);
      setLastApiResponse({ error: message });
    } finally {
      setSendPushLoading(false);
    }
  };

  const handleRobotStart = async () => {
    if (!pushApiUrl) {
      setRobotMessage("VITE_PUSH_API_URL이 설정되지 않았습니다.");
      return;
    }
    setRobotMessage(null);
    setRobotLoading("start");
    const url = `${pushApiUrl.replace(/\/$/, "")}/robot/start`;
    setLastRobotRequest({ url, method: "POST", action: "start" });
    setLastRobotResponse(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      setLastRobotResponse({
        status: res.status,
        ok: res.ok,
        data: Object.keys(data).length > 0 ? data : undefined,
      });
      setRobotMessage(res.ok ? "로봇 시작 요청을 보냈습니다." : `요청 실패 (${res.status})`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "네트워크 오류";
      setRobotMessage(message);
      setLastRobotResponse({ error: message });
    } finally {
      setRobotLoading(null);
    }
  };

  const handleRobotStop = async () => {
    if (!pushApiUrl) {
      setRobotMessage("VITE_PUSH_API_URL이 설정되지 않았습니다.");
      return;
    }
    setRobotMessage(null);
    setRobotLoading("stop");
    const url = `${pushApiUrl.replace(/\/$/, "")}/robot/stop`;
    setLastRobotRequest({ url, method: "POST", action: "stop" });
    setLastRobotResponse(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      setLastRobotResponse({
        status: res.status,
        ok: res.ok,
        data: Object.keys(data).length > 0 ? data : undefined,
      });
      setRobotMessage(res.ok ? "로봇 정지 요청을 보냈습니다." : `요청 실패 (${res.status})`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "네트워크 오류";
      setRobotMessage(message);
      setLastRobotResponse({ error: message });
    } finally {
      setRobotLoading(null);
    }
  };

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

  const tabs = [
    { id: "robot" as const, label: "로봇 제어", panelId: "panel-robot" },
    { id: "register" as const, label: "알림 설정", panelId: "panel-register" },
    { id: "send" as const, label: "푸시 보내기", panelId: "panel-send" },
  ];

  return (
    <main id="main-content" className="app">
      <h1 className="app__title">피스피킹 솔루션 원격 제어</h1>

      <div role="tablist" aria-label="기능 선택" className="app__tablist">
        {tabs.map(({ id, label, panelId }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={panelId}
            id={`tab-${id}`}
            type="button"
            className={`app__tab ${activeTab === id ? "app__tab--active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="app__tabpanel">
        {activeTab === "register" && (
          <section
            role="tabpanel"
            id="panel-register"
            aria-labelledby="tab-register"
            className="app__primary"
          >
            <h2 id="main-cta-heading" className="visually-hidden">
              알림 설정
            </h2>
            <div className="app__primary-form">
              <p id="device-name-desc" className="app__primary-hint">
                푸시 알림을 받기 위해 이 기기를 구분할 장치명을 입력한 뒤 버튼을 눌러 주세요.
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
              style={{ width: "100%" }}
            >
              {phase === "확인 중"
                ? "확인 중…"
                : isLoading
                  ? "권한 요청 중…"
                  : "알림 권한 요청 및 토큰 발급"}
            </button>
            <div className="app__feedback" aria-live="polite">
              <p
                className="app__status app__status--primary"
                data-state={statusState}
              >
                {primaryMessage}
              </p>
            </div>
          </section>
        )}

        {activeTab === "send" && (
          <section
            role="tabpanel"
            id="panel-send"
            aria-labelledby="tab-send"
            className="app__primary"
          >
            <h2 id="send-push-heading" className="visually-hidden">
              알림 보내기
            </h2>
            <p id="send-push-desc" className="app__primary-hint">
              푸시 알림을 보내려면 제목과 본문을 입력한 뒤 푸시 보내기를 누르세요. 알림을 설정한 기기(들)로 발송되며, 장치명을 입력하면 해당 기기로만 보냅니다.
            </p>
            <div className="app__primary-form">
              <div className="app__device-name-wrap">
                <label htmlFor="push-title" className="app__device-name-label">
                  제목 <span className="app__required" aria-hidden="true">*</span>
                </label>
                <input
                  id="push-title"
                  type="text"
                  value={pushTitle}
                  onChange={(e) => setPushTitle(e.target.value)}
                  placeholder="알림 제목"
                  disabled={sendPushLoading}
                  maxLength={200}
                  className="app__device-name-input"
                  aria-describedby="send-push-desc"
                />
              </div>
              <div className="app__device-name-wrap">
                <label htmlFor="push-body" className="app__device-name-label">
                  본문 <span className="app__required" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="push-body"
                  value={pushBody}
                  onChange={(e) => setPushBody(e.target.value)}
                  placeholder="알림 본문"
                  disabled={sendPushLoading}
                  maxLength={1000}
                  rows={3}
                  className="app__device-name-input"
                />
              </div>
              <div className="app__device-name-wrap">
                <label htmlFor="push-device-name" className="app__device-name-label">
                  장치명 (선택)
                </label>
                <input
                  id="push-device-name"
                  type="text"
                  value={pushDeviceName}
                  onChange={(e) => setPushDeviceName(e.target.value)}
                  placeholder="비우면 전체 기기로 발송"
                  disabled={sendPushLoading}
                  maxLength={100}
                  className="app__device-name-input"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSendPush}
              disabled={sendPushLoading || !pushApiUrl}
              aria-label="푸시 알림 보내기"
              aria-busy={sendPushLoading}
              className="app__primary-btn"
              style={{ width: "100%" }}
            >
              {sendPushLoading ? "발송 중…" : "푸시 보내기"}
            </button>
            {(sendPushError || sendPushResult) && (
              <div className="app__feedback" aria-live="polite">
                <p
                  className="app__status app__status--primary"
                  data-state={sendPushError ? "error" : "success"}
                >
                  {sendPushError ?? sendPushResult?.message}
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === "robot" && (
          <section
            role="tabpanel"
            id="panel-robot"
            aria-labelledby="tab-robot"
            className="app__primary"
          >
            <h2 id="robot-heading" className="visually-hidden">
              로봇 제어
            </h2>
            <p className="app__primary-hint">
              로봇 시작/정지 API에 POST 요청을 보냅니다.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginTop: "1rem" }}>
              <button
                type="button"
                onClick={handleRobotStart}
                disabled={!pushApiUrl || robotLoading !== null}
                aria-label="로봇 시작"
                aria-busy={robotLoading === "start"}
                className="app__primary-btn"
                style={{ flex: 1 }}
              >
                {robotLoading === "start" ? "요청 중…" : "로봇 시작"}
              </button>
              <button
                type="button"
                onClick={handleRobotStop}
                disabled={!pushApiUrl || robotLoading !== null}
                aria-label="로봇 정지"
                aria-busy={robotLoading === "stop"}
                className="app__secondary-btn"
                style={{ flex: 1 }}
              >
                {robotLoading === "stop" ? "요청 중…" : "로봇 정지"}
              </button>
            </div>
            {robotMessage && (
              <div className="app__feedback" aria-live="polite">
                <p
                  className="app__status app__status--primary"
                  data-state={
                    lastRobotResponse
                      ? "error" in lastRobotResponse || !lastRobotResponse.ok
                        ? "error"
                        : "success"
                      : undefined
                  }
                >
                  {robotMessage}
                </p>
              </div>
            )}
          </section>
        )}
      </div>

      <section
        className={`app__debug ${debugExpanded ? "" : "app__debug--collapsed"}`}
        aria-live={debugExpanded ? "polite" : undefined}
      >
        <div className="app__debug-header">
          <h2 className="app__heading--utility">
            디버그
            {debugExpanded && (
              <span className="app__debug-tab-badge" aria-hidden="true">
                {" "}
                ({activeTab === "register" ? "알림 설정" : activeTab === "send" ? "푸시 보내기" : "로봇 제어"})
              </span>
            )}
          </h2>
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
          aria-label={`${activeTab === "register" ? "알림 설정" : activeTab === "send" ? "푸시 보내기" : "로봇 제어"} 탭 디버그 정보`}
        >
          {activeTab === "register" && (
            <>
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
            </>
          )}
          {activeTab === "send" && (
            <div className="app__debug-block">
              <span className="app__debug-label">푸시 API 요청 결과</span>
              {lastApiRequest && (
                <>
                  <p className="app__debug-line">
                    <span className="app__debug-label">Request</span>
                  </p>
                  <pre className="app__pre">
                    {lastApiRequest.method} {lastApiRequest.url}
                    {"\n"}
                    {JSON.stringify(lastApiRequest.body, null, 2)}
                  </pre>
                </>
              )}
              {lastApiResponse && (
                <>
                  <p className="app__debug-line">
                    <span className="app__debug-label">Response</span>
                  </p>
                  <pre className="app__pre">
                    {formatApiResponseText(lastApiResponse)}
                  </pre>
                </>
              )}
              {!lastApiRequest && !lastApiResponse && (
                <p className="app__debug-line">아직 푸시 API 요청이 없습니다.</p>
              )}
            </div>
          )}
          {activeTab === "robot" && (
            <div className="app__debug-block">
              <span className="app__debug-label">로봇 API 요청 결과</span>
              {lastRobotRequest && (
                <>
                  <p className="app__debug-line">
                    <span className="app__debug-label">Request</span>
                  </p>
                  <pre className="app__pre">
                    {lastRobotRequest.method} {lastRobotRequest.url}
                    {"\n"}
                    {JSON.stringify({ action: lastRobotRequest.action }, null, 2)}
                  </pre>
                </>
              )}
              {lastRobotResponse && (
                <>
                  <p className="app__debug-line">
                    <span className="app__debug-label">Response</span>
                  </p>
                  <pre className="app__pre">
                    {formatRobotResponseText(lastRobotResponse)}
                  </pre>
                </>
              )}
              {!lastRobotRequest && !lastRobotResponse && (
                <p className="app__debug-line">아직 로봇 API 요청이 없습니다.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default App;
