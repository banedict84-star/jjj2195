# 모이다 봇 웹자보 연결

## 현재 상태

기존 `claude/kakao-google-calendar-auth-gamu2x` 브랜치의 `kakaoSkill`에 웹자보 흐름을 교체한 수정안이다. 로컬 자동 테스트와 첨부된 준공보고회 사진의 렌더링을 확인했다. **운영 Firebase 배포, 실제 GPT 호출, 실제 카카오 메시지 전송은 아직 하지 않았다.** 운영에 사용 중인 소스 버전과 아래 카카오 설정을 확인하고 배포해야 한다.

사용자는 모이다 채널에서 **웹자보 요청 → 사진 올리기 → 활동명·날짜 한 줄 입력 → 같은 채팅방에서 웹자보 수신** 순서로 이용한다. 사진은 여러 번 나누어 최대 10장까지 받고, GPT가 최대 3장을 선택해 제목과 부제를 정리한다. 실제 사진과 기존 남색·노란색 양식으로 1080×1350 PNG를 조합한다. 사람을 다시 그리는 이미지 생성 API는 호출하지 않는다.

## 카카오 관리자 설정

1. 모이다 봇의 **봇 ID**와 연결된 운영 채널을 확인한다. 채널 검색 ID와 봇 ID는 다르다.
2. 사진 수집 블록을 만들거나 기존 블록을 확인한다. 필수 파라미터에 **이미지 보안 전송 플러그인 `sys.plugin.secureimage`**를 연결하고, 스킬 응답을 사용한다. 이 블록 ID를 `KAKAO_PHOTO_BLOCK_ID`로 설정한다.
3. `poster_ready` 이벤트를 받는 완료 블록을 만든다. 추가 필수 파라미터 없이 같은 `kakaoSkill`을 실행하고 스킬 응답을 사용한다. 서버가 전달하는 `userRequest.params.posterJobId`로 해당 사용자의 결과를 찾는다.
4. 시작·사진·활동 설명·결과 확인 메시지가 `kakaoSkill`로 전달되도록 해당 블록과 폴백을 연결한다. 사진 수집 이후의 자유 입력도 스킬을 호출해야 한다.
5. 이 웹자보 흐름에서는 콜백을 사용하지 않는다. 완료 알림은 Event API로 발송한다.

스킬 URL은 다음과 같다. `REPLACE_WITH_SKILL_SECRET`은 서버의 `KAKAO_SKILL_SECRET`과 같은 충분히 긴 임의 값으로 바꾼다. 이 값은 관리자 화면에만 입력하고 저장소나 채팅에 공유하지 않는다.

```text
https://asia-northeast3-jjj2195-1bd15.cloudfunctions.net/kakaoSkill?key=REPLACE_WITH_SKILL_SECRET
```

코드는 `x-moida-skill-key` 헤더도 지원하지만, 관리자 화면에서 별도 헤더를 지원하는지 확인되지 않았다면 URL 방식을 사용한다. URL의 인증값과 요청의 봇 ID를 모두 검사한 뒤 웹자보 작업을 접수한다.

**일반 카카오 사진 첨부가 자동으로 스킬에 전달된다고 가정하면 안 된다.** 계정에서 이미지 보안 전송 플러그인을 사용할 수 있는지 먼저 확인한다. 공식 가이드의 `secureUrls: "List(https://..., https://...)"` 형태를 처리하며, 한 번에 최대 10장이고 링크 유효시간은 10분이다. 이 코드는 최초 사진 수신 후 8분이 지나면 재업로드를 안내한다. 플러그인을 쓸 수 없다면 별도 업로드 화면이 필요하며, 이 수정안에는 포함하지 않았다. [카카오 플러그인 연동 가이드](https://kakaobusiness.gitbook.io/main/tool/chatbot/skill_guide/apply_skill_to_plugin)

Event API 이용에는 연결된 비즈 앱·비즈니스 채널, 카카오 로그인 설정, 월렛 등 카카오의 이용 조건 충족이 필요하며 수신자는 채널을 추가한 사용자여야 한다. 해당 앱의 REST API 키를 사용한다. 서버 IP 제한을 설정했다면 Cloud Functions의 발신 환경도 확인한다. API의 `SUCCESS`는 접수 성공이며 실제 전달 성공과 다르다. 저장한 `delivery.taskId`를 공식 작업 결과 조회 API로 확인할 수 있다. [카카오 Event API 가이드](https://kakaobusiness.gitbook.io/main/tool/chatbot/main_notions/event-api)

## Firebase 설정과 배포

대상 프로젝트: `jjj2195-1bd15`, 함수 리전: `asia-northeast3`.

`functions/.env.example`을 `functions/.env.jjj2195-1bd15`로 복사한 뒤 봇 ID와 사진 블록 ID를 입력한다. `POSTER_STORAGE_BUCKET` 기본값은 기존 코드에 있던 버킷 이름이며, 실제 버킷의 존재와 함수 실행 서비스 계정의 읽기·쓰기 권한을 확인한다. 설정 파일은 Git에서 제외된다.

| 값 | 저장 위치 | 용도 |
| --- | --- | --- |
| `KAKAO_BOT_ID` | 함수 환경변수 | 요청 봇 확인, Event API 대상 |
| `KAKAO_PHOTO_BLOCK_ID` | 함수 환경변수 | 사진 올리기 버튼 |
| `KAKAO_POSTER_EVENT_NAME` | 함수 환경변수 | 완료 이벤트, 기본 `poster_ready` |
| `POSTER_STORAGE_BUCKET` | 함수 환경변수 | 결과 이미지 저장 |
| `KAKAO_SKILL_SECRET` | Secret Manager | 카카오 스킬 URL 인증 |
| `OPENAI_API_KEY` | Secret Manager | 사진 분석·문구 정리 |
| `KAKAO_REST_API_KEY` | Secret Manager | Event API 발송 |

Firebase CLI가 로그인되어 있는 환경에서 프로젝트를 명시해 비밀값을 등록한다. 기존 OpenAI·카카오 키가 올바르게 등록되어 있으면 재등록하거나 교체하지 않아도 된다. 기존 캘린더 함수의 Google·Anthropic 시크릿도 유지한다.

```sh
firebase functions:secrets:set KAKAO_SKILL_SECRET --project jjj2195-1bd15
# 아래 두 개는 필요한 경우에만 등록
firebase functions:secrets:set OPENAI_API_KEY --project jjj2195-1bd15
firebase functions:secrets:set KAKAO_REST_API_KEY --project jjj2195-1bd15
```

배포 전에 Firestore의 `posterBotSessions`와 `posterBotJobs`를 **서버 전용**으로 보호한다. 원본 링크·사용자 ID·결과 접근 토큰을 저장하므로 클라이언트 읽기와 쓰기를 허용하면 안 된다. 현재 운영 규칙은 저장소에 없어 이 수정안에서 확인하지 못했다. 아래 규칙을 기존 규칙과 합칠 수 있지만, 다른 경로의 포괄적 `allow`가 해당 컬렉션을 허용하면 이 `deny`만으로 차단되지 않는다. 기존 규칙 전체에서 해당 컬렉션에 대한 클라이언트 접근이 불가능한지 검증한다. Admin SDK를 사용하는 함수는 서버 권한으로 접근한다.

```text
match /posterBotSessions/{document=**} {
  allow read, write: if false;
}
match /posterBotJobs/{document=**} {
  allow read, write: if false;
}
```

결과 버킷도 비공개로 유지한다. 외부에는 UUID와 무작위 토큰을 검증하는 `posterBotImage`만 노출한다. `kakaoSkill`과 `posterBotImage`는 카카오 서버에서 HTTP로 접근 가능해야 한다. Firestore 트리거·Cloud Scheduler에 필요한 프로젝트 API, 결제 설정과 실행 권한을 확인한다.

Node.js 20에서 다음을 실행한다.

```sh
cd functions
npm ci
npm test
npm run check
cd ..
firebase deploy --only functions:kakaoSkill,functions:processPosterJob,functions:posterBotImage,functions:expirePosterJobs --project jjj2195-1bd15
```

저장소의 이전 `posterWorker`·`testPoster` 등 다른 함수는 위 배포 대상에 포함하지 않는다. 새 `kakaoSkill`은 이전 웹자보 워커를 호출하지 않는다. 기존 기능을 제거하는 별도 배포도 수행하지 않는다.

## 실제 연결 확인

1. 모이다 채널에서 `웹자보 요청`을 보내 사진 버튼이 나타나는지 확인한다.
2. 실제 활동 사진 2~3장을 올리고 수신 장수를 확인한다. 곧이어 `9월 11일 / 모바일 의정지원서비스 준공보고회`처럼 한 줄로 입력한다.
3. Firestore 작업이 `queued → processing → completed`로 바뀌는지, 같은 채널에 완성 이미지가 오는지 확인한다. 이 확인에서는 실제 GPT 사용료와 Event API 발송 비용이 발생할 수 있다.
4. 사진 속 인물·행사명·날짜·글자 배치를 확인하고 이미지가 저장되는지 확인한다.
5. 자동 답장이 안 와도 `웹자보 결과 보기`로 완성본을 받을 수 있다. `delivery: failed`는 발송 요청 실패, `delivery.status: submitted`는 접수 완료이므로 `taskId`로 전달 상태를 확인한다. 이미지 제작을 다시 요청해 발송 문제를 해결하려고 하지 않는다.

## 검증 범위와 운영 동작

- Node.js 20과 24에서 자동 테스트 21개 통과. 실제 사진으로 만든 샘플의 한글·제목 줄바꿈·기존 하단 로고를 시각 확인했다.
- 테스트는 Firestore 트랜잭션·GPT·카카오 요청을 대역으로 검증하고, 실제 Sharp/Resvg 렌더러로 이미지 크기와 사진 배치를 확인한다. 실제 외부 API나 운영 Firestore 검증을 대신하지 않는다.
- 같은 작업의 중복 요청이나 중복 트리거는 제작을 한 번만 실행한다. 발송 실패 시에도 완성 결과는 남겨 두고 재제작하지 않는다.
- 사진 링크 만료, 제작 실패를 사용자에게 알린다. 프로세스가 중단된 작업은 5분 주기의 점검에서 마지막 갱신 후 10분이 지났으면 실패로 표시한다. 이 시간 초과 처리는 별도 자동 알림 없이 결과 조회에 반영된다.
- 결과는 읽은 뒤 삭제하지 않는다. 원본 사진 파일은 작업 중 메모리에서만 처리하며 저장소에 복사하지 않는다. 작업 문서의 임시 원본 URL과 완성 PNG에는 자동 삭제 기한이 아직 없으므로 운영 보관 기간에 맞춰 별도 정리가 필요하다.

## 파일 구성과 디자인 출처

- `functions/posterBotCore.js`: 사진 파싱, 사용자별 대화 상태, 작업 중복 방지, 응답.
- `functions/posterBot.js`: 인증, Firestore 트리거, 비공개 이미지 저장, Event API, 결과 이미지 제공.
- `functions/activityPoster.js`: GPT 사진 선택·문구 작성, 원본 사진과 양식 조합.
- `functions/assets/jyj-footer.png`: 사용자가 제공한 `30.png`의 기존 정당·의회·이름 하단. 이전 직함 문구는 제외했다.
- `functions/assets/NanumGothic-Bold.ttf`: [Google Fonts 나눔고딕](https://github.com/google/fonts/tree/main/ofl/nanumgothic), 동봉한 `NanumGothic-OFL.txt` 라이선스 적용.
