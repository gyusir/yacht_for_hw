Firebase Emulator 또는 로컬 Hosting 서버를 실행하여 로컬 테스트 환경을 구성합니다.

인자에 따라 동작이 달라집니다:
- (없음) → emulator 전체 실행 (Functions/Auth/DB 포함)
- `hosting` → hosting만 실행 (프로덕션 서버 연결)
- `stop` → 실행 중인 프로세스 종료

## stop인 경우

1. `lsof -ti:5002,5001,9000,9099,4000 | xargs kill -9 2>/dev/null` 로 emulator 관련 포트를 모두 종료
2. "로컬 테스트 환경이 종료되었습니다." 메시지 출력

## hosting인 경우

1. 먼저 포트 5002가 사용 중인지 확인: `lsof -i:5002` 로 체크
   - 이미 사용 중이면 "이미 실행 중입니다" 메시지와 함께 링크만 제공하고 종료

2. `firebase serve --only hosting --port 5002`를 백그라운드로 실행
   - 반드시 프로젝트 루트 디렉토리에서 실행 (cwd가 다르면 절대 경로 사용)
   - 반드시 `run_in_background: true` 옵션으로 실행

3. 포트 5002가 열릴 때까지 대기 (최대 15초)

4. 아래 정보를 사용자에게 제공:

```
로컬 Hosting 테스트 환경이 준비되었습니다. (프로덕션 서버 연결)

- 게임: http://localhost:5002

⚠️ 이전에 emulator 모드를 사용했다면 Ctrl+Shift+R (하드 리프레시)로 캐시를 초기화해주세요.

종료하려면: /localtest stop
```

## 기본 실행 (인자 없음)

1. 먼저 emulator가 이미 실행 중인지 확인: `lsof -i:5001` 로 체크
   - 이미 실행 중이면 "이미 실행 중입니다" 메시지와 함께 링크만 제공하고 종료

2. functions 의존성 설치 확인: `functions/node_modules`가 없으면 `cd functions && npm install` 실행

3. Firebase Emulator를 백그라운드로 실행:
   ```
   firebase emulators:start --import=emulator-data
   ```
   - 반드시 프로젝트 루트 디렉토리에서 실행 (cwd가 다르면 절대 경로 사용)
   - 반드시 `run_in_background: true` 옵션으로 실행

4. emulator가 준비될 때까지 대기: `lsof -i:5002`으로 hosting 포트가 열릴 때까지 확인 (최대 30초)

5. 아래 정보를 사용자에게 제공:

```
로컬 테스트 환경이 준비되었습니다. (Emulator 연결)

- 게임: http://localhost:5002?emulator=true
- Emulator UI: http://localhost:4000
- Functions: localhost:5001
- Auth: localhost:9099
- Database: localhost:9000

종료하려면: /localtest stop
```

## 주의사항
- `?emulator=true` 쿼리 파라미터가 있을 때만 emulator로 연결됩니다
- 쿼리 파라미터 없이 localhost에 접속하면 프로덕션 서버를 사용합니다
- `emulator-data/`에 사전 설정된 테스트 계정이 자동 로드됩니다:
  - `testuser@test.com` (displayName: testuser)
  - `testforlongusername@test.com` (displayName: testforlongusername)
