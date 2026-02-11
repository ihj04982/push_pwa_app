# Push PWA App (React + Vite + Firebase)

React + Vite + Firebase Cloud Messaging 기반의 설치형 PWA 예제입니다.
iOS(홈 화면 앱)와 Galaxy(Android Chrome) 환경을 모두 고려해 구성했습니다.

## 1) 실행 방법

1. `.env.example`을 복사해 `.env` 파일을 생성합니다.
2. Firebase Web App 설정값과 `VITE_FIREBASE_VAPID_KEY`를 채웁니다.
3. 앱 실행:

```bash
npm install
npm run dev
```

## 2) 아이콘 파일 준비 (나중에 교체)

현재 아이콘은 사용자가 제공할 PNG를 넣는 전제로 경로만 구성되어 있습니다.
아래 파일명을 `public/icons` 폴더에 추가해 주세요.

- `favicon-32x32.png`
- `apple-touch-icon.png`
- `pwa-192x192.png`
- `pwa-512x512.png`
- `pwa-512x512-maskable.png`

## 3) Firebase FCM 설정

- Firebase Console > Cloud Messaging에서 Web Push 인증서(VAPID) 키를 생성
- `.env`의 `VITE_FIREBASE_VAPID_KEY`에 입력
- 알림 권한을 허용하면 **FCM 토큰이 Firestore `fcmTokens` 컬렉션에 자동 등록**됩니다. (버튼 클릭으로도 권한 요청 및 등록 가능)

### FCM 토큰 자동 등록 (Firestore)

- 앱 로드 시 이미 알림 권한이 허용된 경우, 토큰을 발급해 Firestore에 자동 저장합니다.
- 문서 ID는 디바이스별 고유 ID(`localStorage` 기반)이며, 필드는 `token`, `timestamp`입니다.
- 규칙 배포: `firebase deploy --only firestore:rules`로 `firestore.rules`를 배포해야 클라이언트 쓰기가 허용됩니다.

### 백그라운드 알림

`public/firebase-messaging-sw.js`에서 백그라운드 알림을 처리합니다.
앱은 시작 시 Firebase 설정값을 service worker로 전달합니다.

## 4) 테스트 체크리스트

### Galaxy (Android Chrome)

- 홈 화면 추가로 설치 가능한지 확인
- 알림 권한 허용 후 FCM 토큰 발급 확인
- 포그라운드 수신 시 앱 UI에 메시지 표시 확인
- 백그라운드/앱 종료 상태에서 시스템 알림 표시 확인

### iOS (Safari, iOS 16.4+)

- Safari에서 사이트 열기 후 "홈 화면에 추가"로 설치
- 설치된 앱에서 알림 권한 허용
- 포그라운드/백그라운드 알림 수신 확인

## 5) 주의사항

- iOS는 홈 화면에 설치된 PWA에서만 웹 푸시를 지원합니다.
- Firebase Messaging service worker는 `public/firebase-messaging-sw.js`를 사용합니다.
- PWA 캐싱 service worker(`vite-plugin-pwa`)와 충돌을 피하기 위해
  FCM service worker는 별도 scope(`/firebase-cloud-messaging-push-scope`)로 등록합니다.
- Firestore를 사용하려면 Firebase Console에서 Firestore 데이터베이스를 생성한 뒤,
  프로젝트 연결(`firebase use <projectId>`, projectId는 `.env`의 `VITE_FIREBASE_PROJECT_ID`와 동일하게) 후
  `firebase deploy --only firestore:rules`로 보안 규칙을 배포해야 합니다.
