# Yacht Dice

한국어 | **[English](README.md)**

1:1 온라인 대전 주사위 게임. **Yacht**(12 카테고리)와 **Yahtzee**(13 카테고리 + 보너스) 두 가지 모드를 지원한다.

> Live: https://yacht-ff0c8.web.app

## Features

- **두 가지 게임 모드** — Yacht / Yahtzee 선택
- **실시간 멀티플레이** — 6자리 방 코드로 친구와 대전, 랜덤 매치(Yahtzee/Yacht/상관없음 모드 선택)
- **Google 로그인 / 게스트** — Google OAuth 로그인 시 전적 저장, 게스트로도 플레이 가능
- **전적 & 통계** — 승률, 최근 게임 기록 (로그인 유저 전용)
- **주사위 스킨** — 10종 (Classic, Ornate, Bronze, Marble, Crimson, Hologram, Circuit, Banana, Carbon, Wave), 게임 수 / Bot 승리 기반 잠금해제
- **다크 모드** — 라이트/다크 테마 토글, 스킨 포함 실시간 전환 (WCAG AA 대비 준수)
- **이모트** — 16종 이모티콘 채팅, 키보드 단축키(Q/W/E/R/T/Y) 지원, 서버사이드 레이트 제한
- **재접속** — 탭 복귀 시 자동 재접속, 동시 탭 충돌 감지
- **오프라인 감지** — 네트워크 끊김 시 게임 액션 차단 + 토스트 알림
- **Bot 대전** — Basic(약간의 실수) / Gambler(최적 플레이) / Wave(승률 극대화 종반전 Web Worker) 세 난이도, Expectimax DP 기반
- **서버사이드 검증** — Cloud Functions 기반 점수 계산 안티치트, Transaction 기반 레이트 제한
- **어뷰징 방지** — 봇 게임 탭 닫기 시 패배 저장(sendBeacon), 최소 점수 미달 게임 무효 처리(승률 미반영)
- **App Check** — Firebase App Check (reCAPTCHA v3)로 포크 앱의 무단 백엔드 사용 차단
- **다국어** — 영어/한국어 이중 언어 지원, 실시간 전환
- **튜토리얼** — 인터랙티브 단계별 게임 안내
- **접근성** — aria-label, 키보드 내비게이션, 스크린리더 지원
- **빌드 없음** — 순수 HTML, CSS, JavaScript (번들러/프레임워크 없음)

## Tech Stack

| 영역 | 기술 |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES5) |
| Backend | Firebase Realtime Database |
| Auth | Firebase Auth (Google OAuth + Anonymous) |
| Anti-Cheat | Firebase Cloud Functions (Node 22) |
| App Check | Firebase App Check (reCAPTCHA v3) |
| Hosting | Firebase Hosting (글로벌 CDN, 자동 SSL) |
| CI/CD | GitHub Actions (Hosting + Functions 자동 배포, PR 프리뷰) |

## Project Structure

```
yacht_for_hw/
├── index.html                # SPA 엔트리 (모든 화면 포함)
├── css/
│   └── style.css             # 전체 스타일 (테마, 스킨, 반응형)
├── js/
│   ├── firebase-config.js    # Firebase 초기화 + App Check (reCAPTCHA v3) + emulator 자동 연결 + sendBeacon URL
│   ├── auth.js               # Google 로그인 / 게스트 모드
│   ├── lobby.js              # 방 생성·참가, 프레즌스, 재접속
│   ├── game.js               # 게임 상태 머신, 턴 관리, Firebase 동기화, 지연된 점수 프리뷰
│   ├── scoring.js            # Yacht / Yahtzee 점수 계산 (클라이언트)
│   ├── dice.js               # 주사위 렌더링, 굴림 애니메이션, stagger stop
│   ├── dice-skins.js         # 스킨 시스템 (잠금해제, 선택, 저장)
│   ├── bot-ai.js             # Bot AI (DP 룩업 테이블 기반 최적 전략, endgame worker 관리)
│   ├── bot-game.js           # Bot 대전 컨트롤러 (로컬 상태, 턴 관리, 이모트, 탭 닫기 패배 저장)
│   ├── endgame-worker.js     # Web Worker. 승률 근사 모델 (Wave 봇 종반전)
│   ├── history.js            # 전적 저장·조회
│   ├── i18n.js               # 영어/한국어 이중 언어
│   ├── nickname.js           # 닉네임 생성·관리 (언어별)
│   ├── tutorial.js           # 인터랙티브 튜토리얼
│   ├── ui.js                 # 화면 전환, 스코어카드(이벤트 위임), 토스트(동적 표시 시간)
│   └── app.js                # 엔트리포인트, 모듈 연결, 이모트, 오프라인 감지, 탭 충돌 감지, ID 토큰 캐싱, App Check 토큰 캐싱
├── die_image/                # 이미지 기반 주사위 스킨 에셋 (Banana, Wave)
├── data/
│   ├── dp_yacht.bin          # Yacht 모드 DP 룩업 테이블 (Uint16, 8KB)
│   └── dp_yahtzee.bin        # Yahtzee 모드 DP 룩업 테이블 (Uint16, 2MB)
├── tools/
│   └── generate_dp.py        # Expectimax DP 테이블 생성기 (Python/NumPy/Numba)
├── functions/
│   ├── index.js              # Cloud Functions (방 관리, 랜덤 매치, 주사위, 점수 검증, 무승부, Bot 결과, 무효 판정)
│   ├── scoring.js            # 서버사이드 점수 계산 로직
│   └── package.json
├── .github/workflows/
│   └── firebase-hosting-merge.yml    # main push 시 Hosting + Functions + DB Rules 자동 배포
├── firebase.json             # Hosting, Functions, Database, Emulator 설정
├── .firebaserc               # Firebase 프로젝트 연결 (yacht-ff0c8)
├── database.rules.json       # Realtime Database 보안 규칙
├── CLAUDE.md                 # AI 어시스턴트용 프로젝트 규칙
└── README.md
```

## How to Play

1. 로그인 화면에서 **Google 로그인** 또는 **게스트 이름 입력**
2. 로비에서 **Create Room** → 게임 모드 선택 → 6자리 코드를 상대에게 공유
3. 상대는 **Join** → 코드 입력으로 참가 (또는 **Random Match** → 게임 모드 선택 → 상대 찾기)
4. 턴마다 주사위를 최대 3회 굴리고, 클릭(또는 1~5키)으로 홀드/해제, 스코어카드에서 카테고리 선택
5. 모든 카테고리가 채워지면 종료 — 합산 점수가 높은 쪽이 승리

## Game Rules

### Yacht (12 categories)

| Category | Score |
|---|---|
| Ones -- Sixes | 해당 숫자의 합 |
| Four of a Kind | 같은 숫자 4개의 합 |
| Full House | 3+2 조합 시 전체 합 |
| Small Straight (1-2-3-4-5) | 30점 |
| Large Straight (2-3-4-5-6) | 30점 |
| Choice | 주사위 전체 합 |
| Yacht (5개 동일) | 50점 |

### Yahtzee (13 categories)

| Category | Score |
|---|---|
| Ones -- Sixes | 해당 숫자의 합 |
| Three of a Kind | 3개 이상 동일 시 전체 합 |
| Four of a Kind | 4개 이상 동일 시 전체 합 |
| Full House | 25점 (고정) |
| Small Straight (4연속) | 30점 |
| Large Straight (5연속) | 40점 |
| Yahtzee (5개 동일) | 50점 |
| Chance | 주사위 전체 합 |
| **Upper Bonus** | 상단 합계 >= 63 시 +35점 |
| **Yahtzee Bonus** | 추가 Yahtzee마다 +100점 |

## Development

### Local Test (Emulator)

Firebase Emulator를 사용하면 실제 Firebase를 건드리지 않고 로컬에서 전체 기능을 테스트할 수 있다. `js/firebase-config.js`에서 `localhost` 접속 시 자동으로 emulator로 연결되므로 config 수정이 필요 없다.

```bash
# functions 의존성 설치 (최초 1회)
cd functions && npm install && cd ..

# emulator 실행 (Hosting + Functions + Auth + Database)
firebase emulators:start
```

- 게임: http://localhost:5002?emulator=true
- Emulator UI: http://localhost:4000

Claude Code 사용 시 `/localtest` 명령어로 emulator를, `/localtest hosting`으로 hosting만 실행할 수 있다.

### Deploy

`main` 브랜치에 push되면 GitHub Actions가 Hosting과 Functions를 자동 배포한다.

- **프로덕션 배포**: `dev` → `main` PR merge 시 자동 실행
- **수동 배포**: `firebase deploy --only hosting` / `firebase deploy --only functions` / `firebase deploy --only database`

### Firebase Setup (새 프로젝트로 교체 시)

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. **Build > Realtime Database** 활성화
3. **Build > Authentication > Sign-in method**에서 Google 활성화
4. 프로젝트 설정 > 웹 앱 추가 > config 복사
5. `js/firebase-config.js`의 `firebaseConfig` 객체 교체

### Bot AI (DP 테이블 재생성)

`tools/generate_dp.py`로 Expectimax DP 룩업 테이블을 생성한다. 점수 규칙이 변경되면 재생성이 필요하다.

```bash
# 의존성 설치
pip install numpy numba

# Yacht 모드 (~2초)
python3 tools/generate_dp.py yacht

# Yahtzee 모드 (~65초, 10코어 병렬)
python3 tools/generate_dp.py yahtzee
```

결과물은 `data/dp_yacht.bin`, `data/dp_yahtzee.bin`에 Uint16 바이너리로 저장된다.

| 모드 | 상태 수 | 최적 EV | 파일 크기 |
|---|---|---|---|
| Yacht | 4,096 | 166.96 | 8KB |
| Yahtzee | 1,048,576 | 253.97 | 2MB |

### Dice Skin 추가

`CLAUDE.md`의 "Dice Skin Addition Checklist"를 참고한다.
