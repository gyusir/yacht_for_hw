# Staging 환경 구축 계획

## 목표

PR 프리뷰에서 Functions(서버)까지 포함한 풀스택 테스트가 가능하도록 스테이징 Firebase 프로젝트를 추가한다.

## 현재 구조

| 워크플로우 | 트리거 | 배포 대상 | 비고 |
|---|---|---|---|
| `firebase-hosting-merge.yml` | main push | Hosting + Functions → `yacht-ff0c8` | 프로덕션 |
| `firebase-hosting-preview.yml` | PR to main | Hosting만 → `yacht-ff0c8` preview channel | Functions 미포함 |

**문제점**: PR 프리뷰에서 프론트엔드만 확인 가능. Functions 변경 시 프로덕션에 직접 배포해야만 테스트 가능.

## 변경 후 구조

| 워크플로우 | 트리거 | 배포 대상 | 비고 |
|---|---|---|---|
| `firebase-hosting-merge.yml` | main push | Hosting + Functions → `yacht-ff0c8` | 변경 없음 |
| `firebase-hosting-preview.yml` | PR to main | Hosting + Functions → `yacht-ff0c8-dev` | 풀스택 스테이징 |

## 작업 항목

### 1. Firebase 프로젝트 생성

- Firebase Console에서 `yacht-ff0c8-dev` 프로젝트 생성
- Realtime Database 인스턴스 생성 (region: `asia-southeast1`)
- Authentication 설정 (Anonymous + Google OAuth)
- Blaze 또는 Spark 플랜 설정

### 2. GitHub Secret 추가

- Firebase Console → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성
- GitHub repo Settings → Secrets → `FIREBASE_SERVICE_ACCOUNT_YACHT_FF0C8_DEV` 추가

### 3. `firebase-hosting-preview.yml` 수정

기존:
```yaml
- uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    repoToken: ${{ secrets.GITHUB_TOKEN }}
    firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_YACHT_FF0C8 }}
    projectId: yacht-ff0c8
```

변경 후:
```yaml
- uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    repoToken: ${{ secrets.GITHUB_TOKEN }}
    firebaseServiceAccount: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_YACHT_FF0C8_DEV }}
    channelId: live
    projectId: yacht-ff0c8-dev

- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    credentials_json: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_YACHT_FF0C8_DEV }}

- name: Install Functions dependencies
  run: cd functions && npm ci

- name: Install Firebase CLI
  run: npm install -g firebase-tools

- name: Deploy Functions
  run: firebase deploy --only functions --project yacht-ff0c8-dev
```

### 4. `js/firebase-config.js` 수정

호스트명 기반으로 프로덕션/스테이징 config를 분기한다.

```javascript
var STAGING_CONFIG = {
  apiKey: "...",
  authDomain: "yacht-ff0c8-dev.firebaseapp.com",
  databaseURL: "https://yacht-ff0c8-dev-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "yacht-ff0c8-dev",
  // ...
};

var isStaging = location.hostname.indexOf('yacht-ff0c8-dev') !== -1;
var config = isStaging ? STAGING_CONFIG : PROD_CONFIG;
```

### 5. Security Rules 동기화

프로덕션과 동일한 rules를 스테이징에도 배포한다.

```bash
firebase deploy --only database --project yacht-ff0c8-dev
```

PR 워크플로우에 이 스텝도 추가하거나, 수동으로 초기 1회만 실행.

## 개발 흐름 (변경 후)

```
dev에서 작업 → PR 생성
  │
  ├─ GitHub Actions가 yacht-ff0c8-dev에 Hosting + Functions 배포
  │
  ├─ yacht-ff0c8-dev.web.app 에서 풀스택 테스트
  │
  └─ 확인 완료 → main에 merge → 프로덕션(yacht-ff0c8) 자동 배포
```

## 로컬 CLI에서 복수 프로젝트 관리

하나의 Firebase CLI 세션에서 프로덕션/스테이징 모두 접근 가능하다.

### `.firebaserc` 설정

```json
{
  "projects": {
    "default": "yacht-ff0c8",
    "staging": "yacht-ff0c8-dev"
  }
}
```

### 사용법

```bash
# 프로덕션 (기본)
firebase deploy

# 스테이징으로 전환
firebase use staging
firebase deploy

# 또는 플래그로 직접 지정 (전환 없이)
firebase deploy --project yacht-ff0c8-dev
```

`firebase use`로 활성 프로젝트를 전환하거나, `--project` 플래그로 매번 지정할 수 있다. 별도 로그인이나 세션 분리 불필요.

## 유지되는 것

- `firebase-hosting-merge.yml` — 변경 없음
- 프로덕션 프로젝트 (`yacht-ff0c8`) — 변경 없음
- 로컬 emulator 테스트 (`/localtest`) — 변경 없음

## 비용

- Firebase Spark(무료) 플랜으로 스테이징 프로젝트 생성 가능
- Functions 사용 시 Blaze 플랜 필요하나, 테스트 트래픽 수준이면 비용 거의 $0
