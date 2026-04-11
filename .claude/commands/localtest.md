Firebase Emulator를 실행하여 로컬 테스트 환경을 구성합니다.

인자에 따라 동작이 달라집니다:
- (없음) → emulator 전체 실행 (Functions/Auth/DB 포함)
- `stop` → 실행 중인 프로세스 종료

## stop인 경우

1. `lsof -ti:5001 | xargs kill -TERM 2>/dev/null` 로 Functions 포트에 SIGTERM 전송 (graceful shutdown → DB/Auth 데이터 자동 export)
2. 2초 대기 후 나머지 포트가 아직 열려있으면 `lsof -ti:5002,5001,9000,9099,4000 | xargs kill -9 2>/dev/null` 로 강제 종료
3. "로컬 테스트 환경이 종료되었습니다. (데이터 저장됨)" 메시지 출력

## 기본 실행 (인자 없음)

1. 먼저 emulator가 이미 실행 중인지 확인: `lsof -i:5001` 로 체크
   - 이미 실행 중이면 "이미 실행 중입니다" 메시지와 함께 링크만 제공하고 종료

2. functions 의존성 설치 확인: `functions/node_modules`가 없으면 `cd functions && npm install` 실행

3. Firebase Emulator를 백그라운드로 실행:
   ```
   firebase emulators:start --import=emulator-data --export-on-exit=emulator-data
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
- `emulator-data/`에 사전 설정된 테스트 계정과 DB 데이터가 자동 로드됩니다
- 에뮬레이터 로그인 시 사용되는 계정:
  - `emu-testuser@test.com` (displayName: testuser, UID: UXiRhqXHLsS2qpvWzioUbWO5VQsb)
  - `emu-longname@test.com` (displayName: testforlongusername, UID: XgSznBM1DwkspDfWB8A8fK2CpWPu)
- 두 계정 모두 모든 스킨 잠금해제 stats가 사전 세팅되어 있습니다
