# Yacht Dice

1:1 온라인 대전 주사위 게임. **Yacht**(12 카테고리)와 **Yahtzee**(13 카테고리 + 보너스) 두 가지 모드를 지원한다.

> Live: GitHub Pages로 배포 중 — `https://<username>.github.io/yacht_for_hw/`

## Features

- **두 가지 게임 모드** — Yacht / Yahtzee 선택
- **실시간 멀티플레이** — 6자리 방 코드로 친구와 대전
- **Google 로그인 / 게스트** — Google OAuth 로그인 시 전적 저장, 게스트로도 플레이 가능
- **전적 & 통계** — 승률, 최근 게임 기록 (로그인 유저 전용)
- **주사위 스킨** — 6종 (Classic, Ornate, Bronze, Marble, Crimson, Hologram), 게임 수 기반 잠금해제
- **다크 모드** — 라이트/다크 테마 토글, 스킨 포함 실시간 전환
- **이모트** — 16종 이모티콘 채팅
- **재접속** — 탭 복귀 시 자동 재접속
- **빌드 없음** — 순수 HTML, CSS, JavaScript

## Tech Stack

| 영역 | 기술 |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JS (ES5) |
| Backend | Firebase Realtime Database (서버리스) |
| Auth | Firebase Auth (Google OAuth) |
| Hosting | GitHub Pages (정적) |

## Project Structure

```
├── index.html           # SPA 엔트리 (모든 화면 포함)
├── css/
│   └── style.css        # 전체 스타일 (테마, 스킨, 반응형)
├── js/
│   ├── firebase-config.js  # Firebase 초기화
│   ├── auth.js             # Google 로그인 / 게스트 모드
│   ├── lobby.js            # 방 생성·참가, 프레즌스, 재접속
│   ├── game.js             # 게임 상태 머신, 턴 관리, Firebase 동기화
│   ├── scoring.js          # Yacht / Yahtzee 점수 계산
│   ├── dice.js             # 주사위 렌더링, 굴림 애니메이션
│   ├── dice-skins.js       # 스킨 시스템 (잠금해제, 선택, 저장)
│   ├── history.js          # 전적 저장·조회
│   ├── ui.js               # 화면 전환, 스코어카드, 토스트
│   └── app.js              # 엔트리포인트, 모듈 연결, 이모트
├── CLAUDE.md            # AI 어시스턴트용 프로젝트 규칙
└── README.md
```

## How to Play

1. 로그인 화면에서 **Google 로그인** 또는 **게스트 이름 입력**
2. 로비에서 **Create Room** → 게임 모드 선택 → 6자리 코드를 상대에게 공유
3. 상대는 **Join** → 코드 입력으로 참가
4. 턴마다 주사위를 최대 3회 굴리고, 클릭으로 홀드/해제, 스코어카드에서 카테고리 선택
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

### Local

별도 빌드 없이 `index.html`을 브라우저에서 열면 동작한다. Firebase 연결이 필요하므로 인터넷 필요.

### Firebase Setup (이미 구성됨)

현재 `js/firebase-config.js`에 Firebase 프로젝트가 연결되어 있다. 새 프로젝트로 교체하려면:

1. [Firebase Console](https://console.firebase.google.com/)에서 프로젝트 생성
2. **Build > Realtime Database** 활성화
3. **Build > Authentication > Sign-in method**에서 Google 활성화
4. 프로젝트 설정 > 웹 앱 추가 > config 복사
5. `js/firebase-config.js`의 `firebaseConfig` 객체 교체

### Deploy

GitHub Pages에서 `main` 브랜치 루트(`/`)를 소스로 설정하면 자동 배포된다.

### Dice Skin 추가

`CLAUDE.md`의 "Dice Skin Addition Checklist"를 참고한다. 요약:
1. `js/dice-skins.js`의 `SKIN_DEFS`에 등록
2. `css/style.css`에 라이트/다크 모드 CSS 블록 추가 (10개)
3. 선택 보더 색상 추가 (2개)
