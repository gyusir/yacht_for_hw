# Yacht Dice

1:1 온라인 대전 주사위 게임. **Yacht**(12 카테고리)와 **Yahtzee**(13 카테고리 + 보너스) 두 가지 모드를 지원한다.

> Live: https://yacht-ff0c8.web.app

## Features

- **두 가지 게임 모드** — Yacht / Yahtzee 선택
- **실시간 멀티플레이** — 6자리 방 코드로 친구와 대전, 빠른 매치(랜덤 참가)
- **Google 로그인 / 게스트** — Google OAuth 로그인 시 전적 저장, 게스트로도 플레이 가능
- **전적 & 통계** — 승률, 최근 게임 기록 (로그인 유저 전용)
- **주사위 스킨** — 6종 (Classic, Ornate, Bronze, Marble, Crimson, Hologram), 게임 수 기반 잠금해제
- **다크 모드** — 라이트/다크 테마 토글, 스킨 포함 실시간 전환
- **이모트** — 16종 이모티콘 채팅, 키보드 단축키(Q/W/E/R/T/Y) 지원
- **재접속** — 탭 복귀 시 자동 재접속
- **서버사이드 검증** — Cloud Functions 기반 점수 계산 안티치트
- **빌드 없음** — 순수 HTML, CSS, JavaScript (번들러/프레임워크 없음)

## Tech Stack

| 영역 | 기술 |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES5) |
| Backend | Firebase Realtime Database |
| Auth | Firebase Auth (Google OAuth + Anonymous) |
| Anti-Cheat | Firebase Cloud Functions (Node 22) |
| Hosting | Firebase Hosting (글로벌 CDN, 자동 SSL) |
| CI/CD | GitHub Actions (Hosting + Functions 자동 배포, PR 프리뷰) |

## Project Structure

```
yacht_for_hw/
├── index.html                # SPA 엔트리 (모든 화면 포함)
├── css/
│   └── style.css             # 전체 스타일 (테마, 스킨, 반응형)
├── js/
│   ├── firebase-config.js    # Firebase 초기화 + localhost emulator 자동 연결
│   ├── auth.js               # Google 로그인 / 게스트 모드
│   ├── lobby.js              # 방 생성·참가, 프레즌스, 재접속
│   ├── game.js               # 게임 상태 머신, 턴 관리, Firebase 동기화
│   ├── scoring.js            # Yacht / Yahtzee 점수 계산 (클라이언트)
│   ├── dice.js               # 주사위 렌더링, 굴림 애니메이션
│   ├── dice-skins.js         # 스킨 시스템 (잠금해제, 선택, 저장)
│   ├── history.js            # 전적 저장·조회
│   ├── ui.js                 # 화면 전환, 스코어카드, 토스트
│   └── app.js                # 엔트리포인트, 모듈 연결, 이모트, 키보드 단축키
├── functions/
│   ├── index.js              # Cloud Functions (방 관리, 주사위, 점수 검증)
│   ├── scoring.js            # 서버사이드 점수 계산 로직
│   └── package.json
├── .github/workflows/
│   ├── firebase-hosting-merge.yml    # main push 시 Hosting + Functions 자동 배포
│   └── firebase-hosting-preview.yml  # PR 프리뷰 채널 생성
├── firebase.json             # Hosting, Functions, Database, Emulator 설정
├── .firebaserc               # Firebase 프로젝트 연결 (yacht-ff0c8)
├── database.rules.json       # Realtime Database 보안 규칙
├── CLAUDE.md                 # AI 어시스턴트용 프로젝트 규칙
└── README.md
```

## How to Play

1. 로그인 화면에서 **Google 로그인** 또는 **게스트 이름 입력**
2. 로비에서 **Create Room** → 게임 모드 선택 → 6자리 코드를 상대에게 공유
3. 상대는 **Join** → 코드 입력으로 참가 (또는 **Quick Match**로 랜덤 매칭)
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

- 게임: http://localhost:5000
- Emulator UI: http://localhost:4000

Claude Code 사용 시 `/localtest` 명령어로 emulator를 실행할 수 있다.

### Deploy

`main` 브랜치에 push되면 GitHub Actions가 Hosting과 Functions를 자동 배포한다.

- **프로덕션 배포**: `dev` → `main` PR merge 시 자동 실행
- **PR 프리뷰**: PR 생성 시 임시 프리뷰 URL이 PR 코멘트에 자동 게시 (7일 후 만료)
- **수동 배포**: `firebase deploy --only hosting` / `firebase deploy --only functions`

### Firebase Setup (새 프로젝트로 교체 시)

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. **Build > Realtime Database** 활성화
3. **Build > Authentication > Sign-in method**에서 Google 활성화
4. 프로젝트 설정 > 웹 앱 추가 > config 복사
5. `js/firebase-config.js`의 `firebaseConfig` 객체 교체

### Dice Skin 추가

`CLAUDE.md`의 "Dice Skin Addition Checklist"를 참고한다.
