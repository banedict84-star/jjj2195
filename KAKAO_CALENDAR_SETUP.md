# 카카오톡 개인비서 → 구글 캘린더 자동 등록

카카오톡 채널에 일정을 말로 입력하면 AI가 날짜·시간·장소를 알아듣고
구글 캘린더에 자동으로 등록해 주는 봇입니다.

```
[카카오톡 채널]  →  [카카오 i 오픈빌더]  →  [Firebase Functions(kakaoSkill)]
 "내일 3시 회의"        (스킬 서버 호출)         ↓ Claude Haiku 로 일정 파싱
                                          ↓ Google Calendar API 등록
                                     [구글 캘린더에 일정 생성] ✅
                                          ↓
                                     "✅ 6/25(목) 15:00 회의 등록됨" 회신
```

구성 코드
- `functions/kakaoCalendar.js` — 웹훅 + 파싱 + 캘린더 등록
- `functions/index.js` — `kakaoSkill` 함수 export

---

## 0. 사전 준비

```bash
npm install -g firebase-tools
cd functions && npm install
```

---

## 1. 구글 캘린더 API 설정 (refresh token 발급)

본인 캘린더에 쓰기 위한 OAuth 인증을 1회만 받아 refresh token을 만듭니다.

1. **Google Cloud Console** (https://console.cloud.google.com) 접속
2. 프로젝트 선택(또는 새로 생성) → **API 및 서비스 → 라이브러리** → `Google Calendar API` **사용 설정**
3. **OAuth 동의 화면** 구성
   - User Type: **외부**, 앱 이름/이메일 입력
   - **테스트 사용자**에 본인 구글 계정 추가 (이게 없으면 인증이 막힙니다)
   - 범위(scope)에 `https://www.googleapis.com/auth/calendar` 추가
4. **사용자 인증 정보 → 사용자 인증 정보 만들기 → OAuth 클라이언트 ID**
   - 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI: `https://developers.google.com/oauthplayground`
   - 생성 후 **클라이언트 ID / 클라이언트 보안 비밀** 복사
5. **OAuth Playground**로 refresh token 발급 (https://developers.google.com/oauthplayground)
   - 우측 상단 ⚙️ → **Use your own OAuth credentials** 체크 → 위 ID/Secret 입력
   - 좌측에서 `Calendar API v3` → `https://www.googleapis.com/auth/calendar` 선택
   - **Authorize APIs** → 본인 계정 로그인 → **Exchange authorization code for tokens**
   - 나오는 **Refresh token** 복사

> 발급물 3개: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`

---

## 2. Claude API 키 발급

1. https://console.anthropic.com → **API Keys** → 키 생성
2. 키 복사 → `ANTHROPIC_API_KEY`

> 파싱에 `claude-haiku-4-5`(빠르고 저렴)를 사용합니다.

---

## 3. 시크릿 등록 & 배포

```bash
cd functions

# 시크릿 등록 (입력 프롬프트에 값 붙여넣기)
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set GOOGLE_REFRESH_TOKEN
firebase functions:secrets:set GOOGLE_CALENDAR_ID   # 보통 'primary' 입력

# 배포 (kakaoSkill만 배포하려면 --only)
firebase deploy --only functions:kakaoSkill
```

배포가 끝나면 웹훅 URL이 출력됩니다:
```
https://asia-northeast3-jjj2195-1bd15.cloudfunctions.net/kakaoSkill
```

### 로컬 테스트 (선택)
```bash
curl -X POST https://asia-northeast3-jjj2195-1bd15.cloudfunctions.net/kakaoSkill \
  -H "Content-Type: application/json" \
  -d '{"userRequest":{"utterance":"내일 오후 3시 강남에서 회의"}}'
```
정상이면 `{"version":"2.0","template":{"outputs":[{"simpleText":{"text":"✅ ..."}}]}}` 가 옵니다.

---

## 4. 카카오 i 오픈빌더 연결

1. **카카오톡 채널 만들기** (https://center-pf.kakao.com) — 무료
2. **카카오 i 오픈빌더** (https://i.kakao.com) → 봇 만들기 → 위 채널 연결
3. **스킬(Skill)** 등록
   - 스킬 URL: 위에서 받은 `kakaoSkill` 웹훅 URL
4. **시나리오 → 폴백 블록(또는 일반 블록)** 에서
   - 사용자 발화를 위 스킬로 연결
   - 응답: **스킬데이터 사용** 설정
5. **배포** 버튼으로 봇 배포 → 카카오톡에서 채널 추가 후 대화 테스트

---

## 사용 예시

| 입력 | 결과 |
|---|---|
| `내일 오후 3시 강남에서 회의` | 내일 15:00~16:00 "회의" @강남 |
| `다음 주 금요일 점심 약속` | 해당 금요일 12:00 "점심 약속" |
| `6월 25일 휴가` | 6/25 종일 "휴가" |
| `27일 저녁 7시 반 홍대 저녁모임` | 27일 19:30 "저녁모임" @홍대 |

- 시간 미지정 약속 → 시작 1시간짜리 일정으로 등록
- "휴가/연차" 같은 종일성 일정 → 종일 일정으로 등록
- 일정이 아닌 메시지 → "일정으로 등록할 내용을 알려주세요" 안내

---

## 동작 원리 메모

- **파싱**: `Claude Haiku 4.5` + structured outputs(JSON 스키마)로
  "내일/다음주/오후 3시" 같은 상대 표현을 한국 시각 기준 정확한 날짜·시각으로 변환
- **캘린더**: `googleapis`로 OAuth2(refresh token) 인증 후 `events.insert`
- **시간대**: 모든 일정은 `Asia/Seoul` 기준
- **카카오 응답**: 5초 타임아웃 대비, 빠른 Haiku 모델 사용 + simpleText 형식 회신
