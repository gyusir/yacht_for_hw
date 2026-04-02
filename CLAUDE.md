# Yacht Dice - Project Rules

## Project Overview

1:1 온라인 대전 주사위 게임. Firebase 기반 서버리스 아키텍처로, 프론트엔드는 순수 HTML/CSS/JS(ES5), 백엔드는 Firebase Cloud Functions(Node 22)로 구성된다. 빌드 도구나 프레임워크를 사용하지 않는다.

- **Live**: https://yacht-ff0c8.web.app
- **Firebase 프로젝트**: `yacht-ff0c8` (Asia regions)
- **게임 모드**: Yacht (12 카테고리) / Yahtzee (13 카테고리 + 보너스)

## Architecture

### Frontend (`js/`)
| 파일 | 역할 |
|---|---|
| `firebase-config.js` | Firebase 초기화. localhost 시 emulator 자동 연결. sendBeacon URL 설정 |
| `auth.js` | Google OAuth + Anonymous Auth. `getPlayerName()`은 12자 제한 |
| `lobby.js` | Cloud Functions 호출로 방 생성/참가/취소. 프레즌스 관리 |
| `game.js` | 게임 상태 머신, 턴 관리, Firebase 실시간 동기화 |
| `scoring.js` | 클라이언트 점수 계산 (프리뷰용, 실제 점수는 서버에서 계산) |
| `dice.js` | 주사위 렌더링, 굴림 애니메이션 |
| `dice-skins.js` | 스킨 잠금해제/선택/저장. `SKIN_DEFS` 배열로 관리 |
| `bot-ai.js` | Bot AI 의사결정. DP 룩업 테이블 기반 최적 전략 (Gambler=최적, Basic=±1 노이즈) |
| `bot-game.js` | Bot 대전 컨트롤러. 로컬 게임 상태, 턴 흐름, 애니메이션, 이모트, 탭 닫기 시 sendBeacon 패배 저장 |
| `history.js` | 전적 저장·조회 (로그인 유저 전용) |
| `i18n.js` | 영어/한국어 이중 언어. `I18n.t(key)` / `I18n.getLang()` |
| `nickname.js` | 닉네임 생성·관리. 언어별 닉네임 (ko/en) |
| `tutorial.js` | 단계별 튜토리얼. 게임 화면 기반 인터랙티브 가이드 |
| `ui.js` | 화면 전환, 스코어카드 렌더링(이벤트 위임), 토스트(동적 표시 시간), 오버레이 |
| `app.js` | 엔트리포인트. 모듈 연결, 이벤트 바인딩, 이모트, 키보드 단축키, 오프라인 감지, 탭 충돌 감지, ID 토큰 캐싱 |

### Bot AI (`data/`, `tools/`)
| 파일 | 역할 |
|---|---|
| `data/dp_yacht.bin` | Yacht 모드 DP 룩업 테이블 (4,096 상태, Uint16, 8KB) |
| `data/dp_yahtzee.bin` | Yahtzee 모드 DP 룩업 테이블 (1,048,576 상태, Uint16, 2MB) |
| `tools/generate_dp.py` | Expectimax 알고리즘으로 DP 테이블 생성 (Python/NumPy/Numba) |

### Backend (`functions/`)
| 파일 | 역할 |
|---|---|
| `index.js` | Cloud Functions: createRoom, joinRoom, findOrCreateRandomRoom, rollDice, selectCategory, leaveGame, cancelRoom, updateGameMode, proposeDraw, respondToDraw, claimDisconnectWin, saveBotGameResult, saveBotGameResultBeacon, onGameFinished |
| `scoring.js` | 서버사이드 점수 계산 (안티치트). 클라이언트 `scoring.js`와 로직 동일 |

### Key Constraints
- Cloud Functions region: `asia-northeast3` (callable), `asia-southeast1` (DB trigger)
- Database: Firebase Realtime Database (`asia-southeast1`)
- playerName 최대 12자 (클라이언트 + 서버 양쪽에서 검증/truncate)
- 게스트는 Anonymous Auth로 uid 발급, classic 스킨만 사용 가능
- 온라인 매칭: 비공개 방(코드 공유) / 랜덤 매치(Yahtzee·Yacht·상관없음 모드 선택)
- 봇 게임 탭 닫기 시 `sendBeacon`으로 패배 결과 저장 (`saveBotGameResultBeacon`)
- 최소 점수 무효 판정: Yacht 양쪽 ≥50점, Yahtzee 양쪽 ≥100점 미달 시 `"invalid"` (전적 표시되나 승률 미반영)

## Hosting & Deploy

- **자동 배포**: `main` 브랜치 push 시 GitHub Actions가 Hosting + Functions 동시 배포
- **PR 프리뷰**: PR 생성 시 임시 프리뷰 URL 자동 게시 (7일 후 만료)
- **수동 배포**: `firebase deploy --only hosting` / `firebase deploy --only functions`
- **CI/CD 워크플로우**: `.github/workflows/firebase-hosting-merge.yml`

## Local Test

두 가지 모드를 지원한다. `js/firebase-config.js`에서 `?emulator=true` 쿼리 파라미터가 있을 때만 emulator로 연결한다.

| 모드 | 명령어 | 용도 | 서버 연결 |
|---|---|---|---|
| Emulator 전체 | `/localtest` | Functions/Auth/DB 변경 테스트 | emulator |
| Hosting만 | `/localtest hosting` | 프론트엔드만 변경 테스트 | 프로덕션 |

### Emulator 포트

| 서비스 | 포트 |
|---|---|
| Hosting | 5002 |
| Emulator UI | 4000 |
| Functions | 5001 |
| Auth | 9099 |
| Database | 9000 |

종료: `/localtest stop`

## Git Branch Rules

브랜치는 `main`과 `dev` 두 개만 사용한다.

### Workflow

1. **동기화** (세션 시작 시 또는 유저 요청 시)
   - `main`에서 `git pull` → `dev`에서 `main` merge 또는 rebase

2. **로컬 작업 & 커밋**
   - 모든 작업은 `dev` 브랜치에서 수행
   - 작업 완료 후 커밋 (사용자에게 별도 허락을 구하지 않는다)

3. **원격 동기화 & Push**
   - `git fetch` + `git pull`로 원격 `dev` 확인 후 push

4. **PR 생성 & Merge**
   - `gh` CLI로 `dev` → `main` PR 생성
   - **merge는 반드시 사용자 허락을 받은 후에만 진행한다**

### Restrictions
- **별도의 feature 브랜치를 만들지 않는다. 모든 작업은 반드시 `dev` 브랜치에서 수행한다.**
- **사용자 허락 없이 main에 push하지 않는다**
- **사용자 허락 없이 PR을 merge하지 않는다**

## Content Security Policy (CSP) 관리

`firebase.json`의 `headers` 섹션에서 CSP를 관리한다. Firebase 앱은 다양한 Google 도메인에 의존하므로 CSP 변경 시 반드시 아래 사항을 준수한다.

### 필수 도메인 목록

| directive | 필수 도메인 | 이유 |
|---|---|---|
| `script-src` | `https://www.gstatic.com` | Firebase SDK |
| `script-src` | `https://apis.google.com` | Google Auth |
| `script-src` | `https://accounts.google.com` | Google Sign-in |
| `script-src` | `https://*.firebasedatabase.app` | RTDB JSONP long-polling (WebSocket 실패 시 fallback) |
| `connect-src` | `https://*.firebaseio.com`, `wss://*.firebaseio.com` | RTDB 실시간 연결 |
| `connect-src` | `https://*.firebasedatabase.app`, `wss://*.firebasedatabase.app` | RTDB 연결 |
| `connect-src` | `https://*.googleapis.com` | Firebase Auth, Cloud Functions |
| `connect-src` | `https://*.cloudfunctions.net` | Cloud Functions callable 호출 |
| `connect-src` | `https://*.gstatic.com` | Firebase SDK source maps |
| `frame-src` | `https://accounts.google.com`, `https://*.firebaseapp.com` | Google OAuth popup/redirect |

### 주의사항
- **SPA rewrite**: `"source": "**"` rewrite를 사용하므로 `**/*.html` 패턴은 매칭되지 않는다. CSP는 반드시 `"source": "**"` 블록에 배치한다.
- **배포 전 테스트**: CSP 변경 시 반드시 `/localtest hosting`으로 로컬에서 먼저 확인한다. 프로덕션 배포 후 CSP 오류가 발생하면 사이트 전체가 작동 불능이 된다.
- **새 Firebase 서비스 추가 시**: 해당 서비스가 사용하는 도메인을 CSP에 추가해야 한다.

## Bot AI Architecture

### DP 룩업 테이블 (`data/`)

Expectimax 알고리즘으로 모든 게임 상태의 최적 기대값(EV)을 사전 계산한 테이블. `tools/generate_dp.py`로 생성한다.

- **Yacht**: `dp[mask]` — 4,096 상태 (Uint16 → Float64, 8KB)
- **Yahtzee**: `dp[mask * 128 + upper * 2 + yzFlag]` — 1,048,576 상태 (Uint16 → Float64, 2MB)
  - `mask`: 비어있는 카테고리 비트마스크 (bit i=1이면 카테고리 i 미사용)
  - `upper`: 상단 섹션 합계 (0~63으로 클램핑)
  - `yzFlag`: Yahtzee를 50점으로 채웠는지 여부 (0 또는 1)

### 브라우저 의사결정 (`js/bot-ai.js`)

봇 턴마다 Phase 배열을 계산하여 최적 행동을 결정한다:

1. **Phase 0** (`val0[252]`): 각 주사위 조합에서 카테고리 선택 시 최대 EV
2. **Phase 1** (`val1[252]`): 1회 리롤 기회가 있을 때 최적 홀드 선택의 EV

결정 로직:
- `shouldReroll`: `val1[현재주사위] > val0[현재주사위]`이면 리롤
- `chooseHolds`: 32개 홀드 마스크 중 EV 최대인 것 선택 (rollsLeft=2이면 val1 참조, rollsLeft=1이면 val0 참조)
- `chooseCategory`: 사용 가능 카테고리 중 `score + dp[nextState]` 최대인 것 선택

### 난이도 차이
- **Gambler**: 완벽한 최적 플레이 (EV 기반 최선 선택)
- **Basic**: 근접 선택지 중 확률적 실수 (`CLOSE_THRESHOLD=8`, `MISTAKE_RATE=25%`, `bot-ai.js` 상단에서 조절 가능). EV 차이 8점 이내 선택지에서 25% 확률로 차선을 선택. 차이가 큰 경우 항상 최적 선택.

### DP 테이블 재생성

점수 규칙(`scoring.js`)이 변경되면 DP 테이블을 재생성해야 한다:
```bash
python3 tools/generate_dp.py yacht    # ~2초
python3 tools/generate_dp.py yahtzee  # ~65초 (10코어)
```
의존성: `pip install numpy numba`

## Dice Skin Addition Checklist

새 주사위 스킨을 추가할 때 반드시 아래 순서를 따른다.

### 1. JS 등록 (`js/dice-skins.js`)
- `SKIN_DEFS` 배열에 `{ id, name, unlockAt }` 추가
- `id`는 소문자 kebab-case (CSS 셀렉터에서 `[data-dice-skin="id"]`로 사용됨)
- `unlockAt`은 이전 스킨보다 3 이상 간격 유지
- 스킨별 특수 렌더링(예: Crimson의 한자 문자)이 필요하면 `dice.js`의 `renderDie()`에 분기 추가
- **unlock count 하드코딩 갱신**: `renderSkinSelector()` 내 `'/' + N + ' unlocked'` 숫자 업데이트

### 2. CSS 스타일 (`css/style.css`)
모든 스킨 스타일은 CSS에서만 정의한다. JS에 컬러값을 넣지 않는다.

추가해야 할 CSS 블록 (총 6개):
- `[data-dice-skin="id"] .die` — 라이트모드 주사위 본체
- `[data-dice-skin="id"] .pip` — 라이트모드 핍
- `[data-theme="dark"] [data-dice-skin="id"] .die` — 다크모드 본체
- `[data-theme="dark"] [data-dice-skin="id"] .pip` — 다크모드 핍
- `.skin-preview-die[data-dice-skin="id"]` — 라이트모드 프리뷰
- `[data-theme="dark"] .skin-preview-die[data-dice-skin="id"]` — 다크모드 프리뷰

홀드 표시는 `.held-check` 배지(CSS)로 통일 — 스킨별 held 규칙 불필요

선택 테두리 (총 2개):
- `.skin-option.active[data-skin-id="id"]` — 라이트모드 선택 보더
- `[data-theme="dark"] .skin-option.active[data-skin-id="id"]` — 다크모드 선택 보더

### 3. Color Design Principles
- 라이트모드 배경(`#f0f2f5`)과 다크모드 배경(`#0f0f1a`) 각각에서 주사위가 뚜렷이 구분되어야 한다
- 핍/텍스트 vs 주사위 배경: WCAG AA 기준 4.5:1 이상 대비
- 다크모드에서는 메탈릭 색상 ~15-20% 밝게, 네온/글로우 계열은 강도 높이기
- 선택 보더 색상은 스킨의 대표 색상 사용

### 4. Verification
- 라이트모드에서 모든 스킨 외관 확인
- 다크모드에서 모든 스킨 외관 확인
- 라이트↔다크 실시간 전환 시 즉시 반영되는지 확인
- 스킨 셀렉터 프리뷰 썸네일이 양쪽 모드에서 정상 표시되는지 확인
- 게스트 모드에서 classic만 적용되는지 확인
