# Yacht Dice - Project Rules

## Project Overview

1:1 온라인 대전 주사위 게임. Firebase 기반 서버리스 아키텍처로, 프론트엔드는 순수 HTML/CSS/JS(ES5), 백엔드는 Firebase Cloud Functions(Node 22)로 구성된다. 빌드 도구나 프레임워크를 사용하지 않는다.

- **Live**: https://yacht-ff0c8.web.app
- **Firebase 프로젝트**: `yacht-ff0c8` (Asia regions)
- **게임 모드**: Yacht (12 카테고리) / Yahtzee (13 카테고리 + 보너스)

## Architecture

### Frontend (`js/`)

| 파일 | 역할 |
| --- | --- |
| `firebase-config.js` | Firebase 초기화. App Check (reCAPTCHA v3) 활성화 (emulator 모드에서는 비활성화). localhost 시 emulator 자동 연결. sendBeacon URL 설정 |
| `auth.js` | Google OAuth + Anonymous Auth. `getPlayerName()`은 12자 제한 |
| `lobby.js` | Cloud Functions 호출로 방 생성/참가/취소. 프레즌스 관리 |
| `game.js` | 게임 상태 머신, 턴 관리, Firebase 실시간 동기화. 주사위 stagger 애니메이션 완료 후 스코어카드 프리뷰 반영 |
| `scoring.js` | 클라이언트 점수 계산 (프리뷰용, 실제 점수는 서버에서 계산) |
| `dice.js` | 주사위 렌더링, 굴림 애니메이션, stagger stop (주사위가 랜덤 순서로 순차 정지) |
| `dice-skins.js` | 스킨 잠금해제/선택/저장. `SKIN_DEFS` 배열로 관리 |
| `bot-ai.js` | Bot AI 의사결정. DP 룩업 테이블 기반 최적 전략 (Gambler=최적, Basic=±1 노이즈). Endgame Worker 생성·통신·정리 (Transferable LUT 전달) |
| `bot-game.js` | Bot 대전 컨트롤러. 로컬 게임 상태, 턴 흐름, 애니메이션, 이모트, 탭 닫기 시 sendBeacon 패배 저장. Wave 봇 endgame 분기 |
| `endgame-worker.js` | Web Worker. 남은 5턴 이하에서 승률 근사(Win Probability) 모델로 상대 점수 대비 최적 전략 계산. Wave 봇 전용 |
| `history.js` | 전적 저장·조회 (로그인 유저 전용) |
| `i18n.js` | 영어/한국어 이중 언어. `I18n.t(key)` / `I18n.getLang()` |
| `audio.js` | BGM 매니저. `<audio loop>` 기반, 첫 사용자 인터랙션에 lazy 시작, `localStorage`('yacht-bgm-muted')로 음소거 상태 영구 저장 |
| `sfx.js` | SFX 매니저. Web Audio API 기반, 폴리포닉 효과음 (주사위 굴림/홀드 토글/카테고리 확정). 음소거 상태는 `audio.js`와 공유 (단일 ♪ 토글) |
| `nickname.js` | 닉네임 생성·관리. 언어별 닉네임 (ko/en) |
| `tutorial.js` | 단계별 튜토리얼. 게임 화면 기반 인터랙티브 가이드 |
| `ui.js` | 화면 전환, 스코어카드 렌더링(이벤트 위임), 토스트(동적 표시 시간), 오버레이 |
| `augments.js` | 증강 24종 정의·점수 파이프라인. `functions/augments.js`의 **동일 사본** (수정은 functions 쪽에서 하고 복사. `tools/augment_sim.js --conflict`가 일치 여부 검사) |
| `augment-ui.js` | 증강 모드 UI: 선택 모달(비공개 동시 선택)·공개, 증강 바, 능동 증강 시트(주사위 변경/봉인/교환/더블/동전/콜샷/올인), 점수 미리보기 보정, 굴림 상한 계산 |
| `app.js` | 엔트리포인트. 모듈 연결, 이벤트 바인딩, 이모트, 키보드 단축키, 오프라인 감지, 탭 충돌 감지, ID 토큰 캐싱, App Check 토큰 캐싱 (emulator 모드에서는 App Check 토큰 캐싱 비활성화) |

### Bot AI (`data/`, `tools/`)

| 파일 | 역할 |
| --- | --- |
| `data/dp_yacht.bin` | Yacht 모드 DP 룩업 테이블 (4,096 상태, Uint16, 8KB) |
| `data/dp_yahtzee.bin` | Yahtzee 모드 DP 룩업 테이블 (1,048,576 상태, Uint16, 2MB) |
| `tools/generate_dp.py` | Expectimax 알고리즘으로 DP 테이블 생성 (Python/NumPy/Numba) |
| `tools/augment_sim.js` | 증강 시뮬레이터. `--conflict N`: 무작위 행동 퍼징 + 불변식 검사, `--balance N`: 증강별 점수 차 측정. 증강 규칙·수치를 바꾸면 둘 다 다시 돌린다. `tools/augment_rules_test.js`: 증강 규칙 시나리오 테스트 |

### 방 봇 (`tools/room-bot/`)

맥에서 상시 실행하는 증강전 상대 봇. 고정 방 코드(기본 `7777`)에 증강 모드 Yacht 대기방을 항상 열어 두고, 누가 들어오면 player1("Claude")로 대전한다. 끝나면 20초 뒤 같은 코드로 새 대기방을 연다.

| 파일 | 역할 |
| --- | --- |
| `bot.js` | 데몬. firebase-admin으로 방을 관리하고, 모든 수는 `functions/game-rules.js` 리듀서를 RTDB 트랜잭션으로 적용(서버와 같은 검증). 상대 이탈(연결 끊김 60초·자기 턴 15분 무응답) 시 봇 승리 처리, 무승부 제안은 거절, 대기방은 30분마다 `lastActivityAt` 갱신(2시간 정리 회피) |
| `brain.js` | 규칙 기반 판단: 주사위 멀티셋 기대값 탐색으로 홀드·굴림 중단·칸 선택, Claude에게 넘길 합법 후보 목록 생성 |
| `advisor.js` | Claude 판단: `claude -p`(도구 없음)로 증강 선택·굴리기 전 봉인/교환/콜샷/올인·기록 시 주사위 변경/더블/동전/보험 사용을 고른다. 실패·타임아웃·불법 답이면 규칙 기반 기본값. 고민 중 🤔, 결정 후 한 줄 멘트를 이모트 말풍선으로 보낸다 |
| `install-launchd.sh` | LaunchAgent 설치/제거 (`uninstall`). 로그 `~/Library/Logs/yacht-room-bot.log` |

- 로컬 테스트: `BOT_EMULATOR=1 node tools/room-bot/bot.js` (에뮬레이터 RTDB). `BOT_NO_CLAUDE=1`이면 규칙 기반만. 단, 에뮬레이터에서는 App Check 토큰이 없어 브라우저의 callable이 모두 실패하므로 사람 쪽 참가·선택은 admin 스크립트로 대신해야 한다
- 운영: ADC(`gcloud auth application-default login`) 권한으로 운영 RTDB에 접속한다. 봇 uid는 `bot-claude`(전적이 `users/bot-claude`에 쌓임)
- 방 코드가 이미 다른 방에 쓰이고 있으면 비워질 때까지 1분마다 다시 확인한다

### 주사위 스킨 에셋 (`die_image/`)

| 디렉토리 | 내용 |
| --- | --- |
| `die_image/banana/` | Banana 스킨 이미지 |
| `die_image/wave/` | Wave 스킨 이미지 |
| `die_image/fire/` | Fire 스킨 이미지 |
| `die_image/dragon/` | Dragon 스킨 이미지 |
| `die_image/flower/` | Flower 스킨 이미지 |

**Ascend 스킨**(이미지 없음, CSS만): 증강전 5승 해금. 증강 게임에서 턴 플레이어가 가진 증강 수(1~3)에 따라 Lv1 잔불 → Lv2 용암 → Lv3 태양으로 진화한다. 증강 선택 시점엔 주사위가 classic이라, 진화 연출은 그 플레이어의 선택 후 첫 굴림이 멈출 때 재생된다(양쪽 화면 모두). `augment-ui.js`가 `DiceSkins.setAscendTargets()`로 플레이어별 목표 단계를, `game.js`가 `setAscendTurn()`/`ascendRollStopped()`로 표시 단계를 갱신해 `#dice-area[data-ascend-level]`에 반영한다. 증강전이 아니면 Lv1. 라이트·다크 모드 공통 외관.

### 오디오 에셋 (`assets/audio/`)

| 파일 | 출처 | 라이선스 |
| --- | --- | --- |
| `assets/audio/bgm-bossa.mp3` | Joth - "8bit Bossa" (OpenGameArt) | CC0 (표기 의무 없음) |
| `assets/audio/sfx/dice-roll.ogg` | Kenney Casino Audio (dice-shake-1, loudnorm -14 LUFS) | CC0 |
| `assets/audio/sfx/dice-hold.ogg` | Kenney UI Audio (toggle_002, lowpass 4kHz + treble -6dB) | CC0 |
| `assets/audio/sfx/category-confirm.ogg` | Kenney UI Audio (confirmation_001) | CC0 |

### Backend (`functions/`)

| 파일 | 역할 |
| --- | --- |
| `game-rules.js` | 게임 상태 순수 리듀서(applyRoll/applySelect/applyAction/applyPicks). Cloud Functions 트랜잭션과 시뮬레이터가 같은 코드를 사용. 검증 후 변경, 실패 시 상태 무변경 |
| `augments.js` | 증강 정의·점수 파이프라인(기본→봉인→콜샷+25→더블→올인→동전→최후의 일격→막판 스퍼트→보험 순서, 연속 득점은 rules에서 마지막에 가산)·굴림 상한·강탈 계산. `js/augments.js`와 동일 |
| `index.js` | Cloud Functions: pickAugment, useAugment, createRoom, joinRoom, findOrCreateRandomRoom, rollDice, selectCategory, leaveGame, cancelRoom, updateGameMode, proposeDraw, respondToDraw, claimDisconnectWin, saveBotGameResult, saveBotGameResultBeacon, onGameFinished. 모든 onCall에 App Check 검증 포함. botDifficulty로 basic/gambler/wave 지원 |
| `scoring.js` | 서버사이드 점수 계산 (안티치트). 클라이언트 `scoring.js`와 로직 동일 |

### Key Constraints

- Cloud Functions region: `asia-southeast1` (callable·HTTP·DB trigger·scheduler 모두 RTDB와 같은 리전)
- Rate limit: createRoom/joinRoom에만 적용. rollDice/selectCategory는 성능을 위해 제외 (턴 순서는 room 트랜잭션에서 검증)
- Database: Firebase Realtime Database (`asia-southeast1`)
- playerName 최대 12자 (클라이언트 + 서버 양쪽에서 검증/truncate)
- 게스트는 Anonymous Auth로 uid 발급, classic 스킨만 사용 가능
- 온라인 매칭: 비공개 방(코드 공유) / 랜덤 매치(Yahtzee·Yacht·상관없음 모드 선택)
- 봇 게임 탭 닫기 시 `sendBeacon`으로 패배 결과 저장 (`saveBotGameResultBeacon`)
- 무효 판정: Yacht 양쪽 ≥50점, Yahtzee 양쪽 ≥100점 미달 또는 게임 시간 2분 미만 시 `"invalid"` (전적 표시되나 승률·연승에 미반영)
- Firebase App Check (reCAPTCHA v3): 프론트엔드에서 토큰 자동 발급, Cloud Functions에서 검증. 포크 앱의 무단 서버 사용 차단
- 증강 모드: 비공개 방 + Yacht 전용(`room.augmentMode`). 1·5·9턴 전에 초급·중급·고급 증강을 단계별 8개 중 랜덤 2개에서 선택. 선택은 `augmentPicks/{room}/{tier}`(클라이언트 접근 불가)에 저장 후 둘 다 고르면 공개. 증강 게임은 history에 `augment: true`, 통계 집계 제외. 단, 증강전 승리는 `stats.augmentWins`로 따로 센다(Ascend 스킨 해금용, 승률·연승엔 미반영). 단계 내 증강 가치 편차는 ±3점 이내로 유지(`tools/augment_sim.js --balance`)
- 증강 모드 1~6 보너스: 1~6 칸 합 63 이상이면 +35 (`augments.js`의 `UPPER_BONUS_HURDLE`/`UPPER_BONUS`). 현재 점수로 매번 계산하므로 강탈·교환으로 63 미만이 되면 사라진다. 달성률은 `tools/augment_sim.js --bonus`로 확인
- 신규 증강 9종: 잭팟(요트 90)·운명의 동전(2회, ×2/×½)·지름길(보너스 기준 55) / 연속 득점(12점+ 연속 시 +6~+24, `player.streak`)·콜샷(4회, 굴리기 전 족보 예고, 성공 +25)·올인(2회, 굴리기 전 선언, 18점+ ×2 아니면 0) / 최후의 일격(마지막 2기록 ×2)·행운의 주사위(종료 시 주사위 4+면 +40, `scores.lottery`·`room.lotteryLog`)·막판 스퍼트(0 아닌 기록 +5). 선언(`turnFlags.called`/`allIn`)은 첫 굴림 전 1턴 1회. 더블·동전·올인은 한 기록에 하나만(`MULTIPLIER_CONFLICT`). 동전·행운의 주사위 결과는 selectCategory가 트랜잭션 밖에서 미리 뽑아 재시도에도 같은 결과
- 증강 선택 제한 시간 90초(`PICK_TIME_MS`). 시간 초과 시 클라이언트가 자동 선택, 상대가 응답 없으면 `pickAugment({claimTimeout:true})`로 서버가 랜덤 선택

## Hosting & Deploy

- **자동 배포**: `main` 브랜치 push 시 GitHub Actions가 Hosting + Functions + Database Rules 동시 배포
- **수동 배포**: `firebase deploy --only hosting` / `firebase deploy --only functions` / `firebase deploy --only database`
- **CI/CD 워크플로우**: `.github/workflows/firebase-hosting-merge.yml`

## Local Test

`js/firebase-config.js`에서 `localhost`이면 자동으로 emulator에 연결한다.

| 명령어 | 용도 |
| --- | --- |
| `/localtest` | Emulator 전체 실행 (Functions/Auth/DB) |
| `/localtest stop` | Emulator 종료 (graceful shutdown → 데이터 자동 저장) |

### Emulator 포트

| 서비스 | 포트 |
| --- | --- |
| Hosting | 5002 |
| Emulator UI | 4000 |
| Functions | 5001 |
| Auth | 9099 |
| Database | 9000 |

### 데이터 영속성

에뮬레이터는 `--import=emulator-data --export-on-exit=emulator-data`로 실행되어, 시작 시 데이터를 복원하고 종료 시 자동 저장한다. `/localtest stop`은 SIGTERM으로 graceful shutdown하여 export를 보장한다.

- `emulator-data/auth_export/` — Auth 계정 (고정 UID)
- `emulator-data/database_export/yacht-ff0c8-default-rtdb.json` — DB 데이터 (stats, 닉네임 등)

### 테스트 계정

에뮬레이터 로그인 시 `auth.js`의 계정 선택 모달에서 아래 계정으로 로그인한다. import된 Auth 계정(`testuser@test.com`)이 아닌, 앱이 실제로 사용하는 `emu-` 이메일 계정이다.

| 이메일 | displayName | UID (고정) | 용도 |
| --- | --- | --- | --- |
| `emu-testuser@test.com` | testuser | `UXiRhqXHLsS2qpvWzioUbWO5VQsb` | 일반 기능 테스트 |
| `emu-longname@test.com` | testforlongusername | `XgSznBM1DwkspDfWB8A8fK2CpWPu` | 긴 닉네임 UI 테스트 |

두 계정 모두 모든 스킨 잠금해제 조건을 충족하는 stats가 사전 세팅되어 있다.

### 에뮬레이터 DB namespace 주의

에뮬레이터 RTDB에는 두 개의 namespace가 존재한다:

- `yacht-ff0c8-default-rtdb` — 앱이 실제로 사용하는 namespace (`databaseURL` 기반)
- **default (namespace 없음)** — curl이 기본으로 접근하는 namespace

curl로 에뮬레이터 DB에 직접 데이터를 쓸 때 반드시 `?ns=yacht-ff0c8-default-rtdb`를 붙여야 한다:

```bash
# 올바른 방법
curl -X PUT "http://localhost:9000/users/{uid}/stats.json?ns=yacht-ff0c8-default-rtdb" 
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" 
  -d '{"totalGames":100}'

# 잘못된 방법 (default namespace에 쓰여서 앱에서 안 보임)
curl -X PUT "http://localhost:9000/users/{uid}/stats.json" -d '{"totalGames":100}'
```

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

   - **PR 생성 전 반드시 사용자에게 버전을 몇으로 올릴지 물어본다**
   - 사용자가 지정한 버전으로 `index.html`의 모든 버전 참조를 업데이트하고 커밋한 뒤 push
   - `gh` CLI로 `dev` → `main` PR 생성
   - **merge는 반드시 사용자 허락을 받은 후에만 진행한다**

### Restrictions

- **별도의 feature 브랜치를 만들지 않는다. 모든 작업은 반드시** `dev` **브랜치에서 수행한다.**
- **사용자 허락 없이 원격 dev에 push하지 않는다**
- **사용자 허락 없이 PR을 merge하지 않는다**

### Version Tagging

- 버전은 `index.html`의 `<span class="app-version">` 태그에 표기한다
- 커밋 메시지에 버전을 명시할 때는 반드시 `index.html`의 버전도 함께 업데이트한다
- 버전 변경 시 반드시 함께 갱신할 것:
  - `<head>` 인라인 스크립트의 `var V='X.X'` (캐시 버스팅 트리거)
  - `<link rel="stylesheet" href="css/style.css?v=X.X">`
  - 모든 `<script src="js/*.js?v=X.X">` 태그의 쿼리 스트링

## Content Security Policy (CSP) 관리

`firebase.json`의 `headers` 섹션에서 CSP를 관리한다. Firebase 앱은 다양한 Google 도메인에 의존하므로 CSP 변경 시 반드시 아래 사항을 준수한다.

### 필수 도메인 목록

| directive | 필수 도메인 | 이유 |
| --- | --- | --- |
| `script-src` | `https://www.gstatic.com` | Firebase SDK |
| `script-src` | `https://apis.google.com` | Google Auth |
| `script-src` | `https://accounts.google.com` | Google Sign-in |
| `script-src` | `https://*.firebasedatabase.app` | RTDB JSONP long-polling (WebSocket 실패 시 fallback) |
| `script-src` | `https://www.google.com`, `https://www.recaptcha.net` | reCAPTCHA v3 (App Check) |
| `connect-src` | `https://*.firebaseio.com`, `wss://*.firebaseio.com` | RTDB 실시간 연결 |
| `connect-src` | `https://*.firebasedatabase.app`, `wss://*.firebasedatabase.app` | RTDB 연결 |
| `connect-src` | `https://*.googleapis.com` | Firebase Auth, Cloud Functions |
| `connect-src` | `https://*.cloudfunctions.net` | Cloud Functions callable 호출 |
| `connect-src` | `https://*.gstatic.com` | Firebase SDK source maps |
| `connect-src` | `https://www.recaptcha.net`, `https://recaptcha.google.com` | reCAPTCHA v3 (App Check) |
| `frame-src` | `https://accounts.google.com`, `https://*.firebaseapp.com` | Google OAuth popup/redirect |
| `frame-src` | `https://www.recaptcha.net`, `https://recaptcha.google.com` | reCAPTCHA v3 (App Check) |

### 주의사항

- **SPA rewrite**: `"source": "**"` rewrite를 사용하므로 `**/*.html` 패턴은 매칭되지 않는다. CSP는 반드시 `"source": "**"` 블록에 배치한다.
- **배포 전 테스트**: CSP 변경 시 반드시 `/localtest`로 로컬에서 먼저 확인한다. 프로덕션 배포 후 CSP 오류가 발생하면 사이트 전체가 작동 불능이 된다.
- **새 Firebase 서비스 추가 시**: 해당 서비스가 사용하는 도메인을 CSP에 추가해야 한다.

## Bot AI Architecture

### DP 룩업 테이블 (`data/`)

Expectimax 알고리즘으로 모든 게임 상태의 최적 기대값(EV)을 사전 계산한 테이블. `tools/generate_dp.py`로 생성한다.

- **Yacht**: `dp[mask]` — 4,096 상태 (Uint16 → Float64, 8KB)
- **Yahtzee**: `dp[mask * 128 + upper * 2 + yzFlag]` — 1,048,576 상태 (Uint16 → Float64, 2MB)
  - `mask`: 비어있는 카테고리 비트마스크 (bit i=1이면 카테고리 i 미사용)
  - `upper`: 상단 섹션 합계 (0\~63으로 클램핑)
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
- **Wave (해일)**: 남은 6턴+에서는 Gambler와 동일한 EV 최적 플레이. 남은 5턴 이하에서 Web Worker(`endgame-worker.js`)로 승률 근사 모델(Win Probability Approximation)을 구동하여 상대 점수 대비 최적 전략 수행. Delta를 Sigmoid 함수로 변환하여 이기고 있을 때 안전한 플레이, 지고 있을 때 하이리스크 역전 플레이.

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

#### 이미지 스킨 CSS 주의사항

이미지 기반 스킨(Banana, Wave, Fire, Dragon 등)은 기존 이미지 스킨의 CSS 패턴을 반드시 참조하여 작성한다.

- **테두리**: `.die`에 `border-color`를 사용한다 (Star 스킨 패턴). `box-shadow`로 테두리를 주면 `overflow` 설정에 따라 잘릴 수 있다
- **overflow**: `.die`에 `overflow: visible`을 사용해야 `.held-check` 배지가 잘리지 않는다. `overflow: hidden`은 금지
- **display**: `.skin-preview-die`와 `.cube-face`에 반드시 `display: block`을 명시한다. 기본값이 `display: grid`(`.skin-preview-die` 상속)이므로 생략하면 이미지가 축소된다
- **3D Cube 테두리**: `.cube-face.skin-preview-die`의 기본 `border-width`는 `1px`이다. 이미지 스킨은 `border: none`으로 제거하고 이미지에 `box-shadow: 0 0 0 1.5px`로 테두리를 표현한다 (Fire 스킨 패턴 참조). `border: 2px solid`를 사용하면 다른 스킨 대비 테두리가 두꺼워진다
- **Preview/3D Cube 테두리 누락 방지**: `.die`에 테두리를 적용했으면 `.skin-preview-die`와 `.cube-face`에도 동일한 색상의 테두리를 적용해야 한다

### 3. Color Design Principles

- 라이트모드 배경(`#f0f2f5`)과 다크모드 배경(`#0f0f1a`) 각각에서 주사위가 뚜렷이 구분되어야 한다
- 핍/텍스트 vs 주사위 배경: WCAG AA 기준 4.5:1 이상 대비
- 다크모드에서는 메탈릭 색상 \~15-20% 밝게, 네온/글로우 계열은 강도 높이기
- 선택 보더 색상은 스킨의 대표 색상 사용

### 4. 테스트 페이지 등록 (`test-dice-skins.*`)

`test-dice-skins.html`/`js/test-dice-skins.js`/`css/test-dice-skins.css`는 모든 스킨을 한 페이지에서 미리보기하는 독립 테스트 도구이다. 새 스킨 추가 시 반드시 이 파일들에도 등록한다:

- `js/test-dice-skins.js`: `SKIN_DEFS`에 추가, `renderMiniFaceHTML`·`renderDie`·`renderPreview` 함수에 분기 추가
- `css/test-dice-skins.css`: 이미지 스킨이면 `.die`, `.skin-preview-die`, `.cube-face` CSS 추가

### 5. Verification

- 라이트모드에서 모든 스킨 외관 확인
- 다크모드에서 모든 스킨 외관 확인
- 라이트↔다크 실시간 전환 시 즉시 반영되는지 확인
- 스킨 셀렉터 프리뷰 썸네일이 양쪽 모드에서 정상 표시되는지 확인
- **3D Cube, Preview에서도 테두리·이미지가 정상 표시되는지 확인**
- 게스트 모드에서 classic만 적용되는지 확인