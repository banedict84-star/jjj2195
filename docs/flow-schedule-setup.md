# 모이다 → 플로우 프로젝트 일정 등록

개인용 API `/user/posts/projects/747538/schedules`를 사용합니다.
API 키는 GitHub에 넣지 않습니다. 서버 Secret Manager에서만 관리합니다.

## 배포 전 설정

Firebase 프로젝트: `jjj2195-1bd15`

1. Firestore `userTokens`에서 의원실 사용자의 카카오 사용자 ID(문서 ID)를 확인합니다. 본인이 확인한 사용자만 지정합니다.
2. `firebase functions:secrets:set FLOW_SCHEDULE_CONFIG --project jjj2195-1bd15` 실행 후 다음 구조의 JSON을 입력합니다.

```json
{"apiKey":"실제 개인용 API 키","projectId":"747538","kakaoUserIds":["확인한 의원실 카카오 사용자 ID"]}
```

3. `firebase deploy --only functions:kakaoSkill --project jjj2195-1bd15`
4. 지정 사용자로 일정 1건을 등록하여 플로우 프로젝트 캘린더에 표시되는지 확인합니다.
5. 플로우의 기존 구글 연동이 이 일정을 전달하는지 별도 확인합니다. 이 코드는 구글에 이중 등록하지 않습니다.

지정되지 않은 사용자는 기존 구글 캘린더 경로를 사용합니다.
플로우 사용자의 조회·삭제는 현재 플로우 앱에서 처리하도록 안내합니다.
기존 일정 이관, 양방향 동기화, 아침 브리핑의 플로우 전환은 포함하지 않습니다.
API 응답 시간 초과는 실제 등록되었을 가능성이 있어 자동 재시도하지 않습니다.
동일 카카오 메시지의 재전송 중복 제거는 아직 구현하지 않았습니다.

검증: `node --test functions/test/flowCalendar.test.js`
