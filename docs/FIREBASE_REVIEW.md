# Firebase 관련 로직 점검 결과

Firebase MCP 가이드 및 프로젝트 코드·설정을 기준으로 점검한 결과입니다.

---

## 1. 점검 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| Firestore 규칙 문법 | ✅ 통과 | `firebase deploy --only firestore --dry-run` 컴파일 성공 |
| Firestore 규칙 시맨틱 | ⚠️ 수정됨 | `deviceName` 검증 추가, 클라이언트 읽기 제한 유지 |
| Firebase 초기화 (`firebase.ts`) | ✅ 양호 | |
| FCM + Firestore 연동 (`notifications.ts`) | ✅ 양호 | 등록 확인 로직은 규칙에 맞게 수정됨 |
| Service Worker (`firebase-messaging-sw.js`) | ✅ 양호 | |
| 앱 플로우 (`App.tsx`) | ✅ 양호 | |

---

## 2. Firestore 규칙 (firestore.rules)

- **문법**: `firebase deploy --only firestore --dry-run` 으로 컴파일 성공 확인됨.
- **의도**: `fcmTokens` 컬렉션은 **쓰기만 허용, 읽기/삭제 불가** → 토큰 수집용으로 적절함.
- **수정 사항**:
  - 규칙에 `deviceName` 필드 검증을 추가해, 클라이언트가 필수 필드를 빼고 쓰지 못하도록 했습니다.
  - 앱에서는 **Firestore 읽기 없이** 등록 여부를 판단하도록 변경해, 현재 규칙(읽기 불가)과 일치시켰습니다.

---

## 3. Firebase 초기화 (src/firebase.ts)

- `initializeApp`, `getFirestore`, `getMessaging` + `isSupported()` 사용 적절.
- `getMessagingIfSupported()`로 단일 Promise 재사용 → 중복 초기화 방지.
- DEV에서 필수 env 키 누락 시 `console.warn` → 개발 시 확인 용이.
- **권장**: `authDomain`, `storageBucket`, `measurementId` 등은 선택이지만, `.env.example`에 있으면 채워두는 것이 좋음.

---

## 4. FCM + Firestore (src/notifications.ts)

- **토큰 문서 ID**: 토큰 SHA-256 해시로 중복 문서 방지 → 적절.
- **deviceId**: `getOrCreateDeviceId()`로 localStorage 기반 일관된 값 사용 → 적절.
- **등록 상태**: `getStoredRegistrationState()` / `saveRegistrationState()` / `clearRegistrationState()`로 로컬 상태 관리 → 적절.
- **Service Worker**: 별도 스코프 `/firebase-cloud-messaging-push-scope`, `INIT_FIREBASE_CONFIG`로 설정 전달 → 적절.
- **수정 사항**: `isDeviceRegisteredInFirestore()`는 Firestore **read**가 필요하나, 현재 규칙은 `allow read: if false`이므로 권한 오류가 납니다. 따라서 **Firestore 읽기 없이** 토큰 + localStorage만으로 “등록됨” 여부를 판단하도록 앱 로직을 변경했습니다.

---

## 5. Service Worker (public/firebase-messaging-sw.js)

- `firebase-app-compat`, `firebase-messaging-compat` 로 백그라운드 메시지 처리.
- `onBackgroundMessage` → `showNotification` 처리.
- `notificationclick` → `data.url` 또는 `/` 로 열기.
- `INIT_FIREBASE_CONFIG` 수신 후 한 번만 초기화 → 정상.

---

## 6. 앱 플로우 (App.tsx)

- 권한 요청 → 토큰 발급 → Firestore 등록 순서 명확.
- foreground 메시지 수신 시 `onMessage` 콜백으로 상태/UI 반영.
- 등록 확인 로직은 위 4번에 맞춰 “Firestore 읽기 제거” 후에도 동작하도록 수정됨.

---

## 7. 권장 사항

1. **환경 변수**: `.env.example`에 있는 모든 Firebase 관련 변수를 로컬/배포 환경에 맞게 설정할 것.
2. **인증 도입 시**: 푸시 토큰을 사용자별로 제한하려면 Firebase Auth 도입 후, 예: `/fcmTokens/{userId}/{tokenId}` 형태로 저장하고 규칙에서 `request.auth.uid == userId`로 읽기/쓰기 제한을 두는 방안 검토.
3. **규칙 배포**: 수정한 규칙 반영 후 `firebase deploy --only firestore` 로 배포할 것.

---

## 8. 참고 (Firebase MCP)

- Firestore 초기 설정: `firebase://guides/init/firestore`
- Firestore 규칙 가이드: `firebase://guides/init/firestore_rules`
- 규칙 검증: `npx firebase deploy --only firestore --dry-run` 사용.
