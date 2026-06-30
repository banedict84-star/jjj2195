# SMM 리셀 패널

SMMKings 를 **공급처**로 두고 마진을 붙여 재판매하는 고객용 패널입니다.
(모이다와는 분리된 독립 모듈 — `/smm` 폴더)

## 구성

```
smm/
  index.html   로그인 / 회원가입
  panel.html   고객 대시보드 (잔액 · 서비스 · 주문 · 내역)
  admin.html   관리자 (마진 설정 · 고객 충전 · 공급처 잔액 · 전체 주문)
  app.js       Firebase 초기화 + 공통 헬퍼
  styles.css   스타일
```

백엔드 함수는 `../functions/index.js` 에 있습니다 (`smm*` 으로 시작).

## 보안 설계 (중요)

- **API 키는 프론트에 없습니다.** Firebase Secret(`SMMKINGS_API_KEY`)으로만 보관하고,
  Cloud Function 안에서만 SMMKings 로 붙습니다.
- 가격 계산 · 잔액 차감 · 공급처 주문은 **전부 서버(onCall 함수)** 에서 처리합니다.
  고객이 가격이나 잔액을 조작할 수 없습니다.
- 주문 실패 시 잔액은 **자동 환불**됩니다.

## 설치 / 배포

```bash
# 1) SMMKings API 키 등록 (smmkings.com → Account/API 메뉴에서 복사)
firebase functions:secrets:set SMMKINGS_API_KEY

# 2) 함수 배포
firebase deploy --only functions

# 3) (호스팅을 쓴다면) 정적 파일 배포 — firebase.json hosting 설정 후
#    /smm 폴더를 호스팅에 포함하거나 public 으로 지정
```

## 첫 관리자 지정

함수 배포 후 회원가입을 한 번 하면 `users/{uid}` 문서가 생깁니다.
Firebase 콘솔 → Firestore → 해당 사용자 문서에서 `role` 값을
`"user"` → `"admin"` 으로 바꾸면 그 계정이 관리자가 됩니다.

## Firestore 컬렉션

| 컬렉션 | 내용 |
|---|---|
| `users/{uid}` | `email`, `balance`(USD), `role`, `createdAt` |
| `orders/{id}` | `uid`, `providerOrder`, `service`, `serviceName`, `link`, `quantity`, `charge`, `status`, `createdAt` |
| `config/settings` | `markupPercent` (마진 %, 기본 20) |

> 패널은 Firestore 를 **직접 읽지 않고** 항상 onCall 함수를 통해 접근하므로,
> 기존 모이다의 Firestore 규칙을 건드리지 않습니다.

## 결제(충전) 안내

현재 MVP는 **수동 충전**입니다: 고객이 입금 → 관리자 화면에서 잔액 충전.
자동 결제(카드/PG/암호화폐)가 필요하면 결제 웹훅 → `smmAdjustBalance` 연동을
추가하면 됩니다.
