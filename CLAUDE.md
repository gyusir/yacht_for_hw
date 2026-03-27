# Yacht Dice - Project Rules

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

### 3. 컬러 설계 원칙
- 라이트모드 배경(`#f0f2f5`)과 다크모드 배경(`#0f0f1a`) 각각에서 주사위가 뚜렷이 구분되어야 한다
- 핍/텍스트 vs 주사위 배경: WCAG AA 기준 4.5:1 이상 대비
- 다크모드에서는 메탈릭 색상 ~15-20% 밝게, 네온/글로우 계열은 강도 높이기
- 선택 보더 색상은 스킨의 대표 색상 사용

### 4. 검증
- 라이트모드에서 모든 스킨 외관 확인
- 다크모드에서 모든 스킨 외관 확인
- 라이트↔다크 실시간 전환 시 즉시 반영되는지 확인
- 스킨 셀렉터 프리뷰 썸네일이 양쪽 모드에서 정상 표시되는지 확인
- 게스트 모드에서 classic만 적용되는지 확인
