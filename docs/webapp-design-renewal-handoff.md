# 디자인 리뉴얼 인수인계

> 다음 세션이 바로 이어서 작업할 수 있도록 정리한 문서.
> 전체 계획은 [webapp-design-renewal-plan.md](./webapp-design-renewal-plan.md), 기준 스펙은 [DESIGN.md](./DESIGN.md).

**마지막 갱신:** 2026-08-03 · **브랜치:** `design-renewal`

---

## 1. 지금 어디까지 왔나

| Phase | 내용 | 상태 |
|---|---|---|
| 0 | 자동 검사 안전망 (대비 검사·토큰 lint·기준값) | **완료** |
| 1 | 색상 토큰 + rem 타이포 기반 | **완료** |
| 2 | 게임 영역 입체화 (립·배지·팔레트·마이그레이션) | **완료** |
| 3 | 꾸미기 모달 스텝화 | **다음 차례** |
| 4 | 문구·상태·모션 | 대기 |
| 5 | 검증·배포 | 대기 |

커밋 4개 (오래된 순):

```
08faa96  webapp MVP 소스와 디자인 시스템 문서 추가   ← 리뉴얼 이전 베이스라인
859118d  Phase 0: 자동 검사 안전망 추가
bf16632  Phase 1: 색상 토큰과 rem 타이포 기반 교체
a214580  Phase 2: 게임 영역 입체화
```

`prototype/photo-block.html`은 이 작업과 무관한 사용자의 미커밋 변경(426줄)이라 **일부러 건드리지 않았다.** 계속 그대로 둘 것.

---

## 2. 먼저 알아야 할 함정

작업 중 실제로 걸렸던 것들이다.

1. **`npm test`는 지금 빨간 게 정상이다.** 21건 중 3건 실패 — 모달 립(Phase 3), 격식체·어려운 말(Phase 4)이 대상이다.
   이 검사들이 리뉴얼의 완료 정의라 일부러 먼저 넣었다. Phase가 끝나면서 하나씩 초록이 된다.

2. **개발 서버는 5173이다.** `webapp/README.md:30`이 4173으로 적어 둔 것은 **오류**다(`dev` 스크립트에 `--port` 지정 없음 → vite 기본값). Phase 5의 README 갱신 때 고칠 것.

3. **서비스 워커.** cache-first라 `styles.css`는 물론 `@vite/client`와 의존성 모듈까지 캐시해 개발 중 변경이 반영되지 않았다.
   Phase 1에서 `import.meta.env.PROD` 가드를 넣어 개발 서버에서는 등록하지 않는다. 캐시는 `v5`.
   그래도 화면이 안 바뀌면 예전에 등록된 SW가 남아 있는 것이니 아래로 지운다.

   ```js
   for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
   for (const k of await caches.keys()) await caches.delete(k);
   ```

4. **스타일·문구를 바꾼 배포마다 `sw.js`의 `CACHE`를 올릴 것.** 안 올리면 기존 사용자 화면이 그대로다.

5. **이 환경에서는 브라우저 스크린샷이 안 된다** (패널 미표시로 타임아웃).
   `javascript_tool`로 `getComputedStyle` 값을 재는 방식으로 검증해 왔다. 숫자라 diff도 된다.

6. **커밋 메시지에 PowerShell here-string(`@'...'@`)을 쓰지 말 것.** Bash 도구는 이를 해석하지 못해 제목 앞에 `@`가 붙는다. heredoc(`<<'EOF'`)을 쓴다.

7. **블록 키 형식은 `row:col`** (`game-core.js:6`). `[data-key="1:2"]` 형태로 선택한다.

---

## 3. 확정된 결정 (D1~D6)

사용자가 답한 내용이다. 다시 묻지 말 것. 근거는 계획 문서 §9에 있다.

| # | 결정 |
|---|---|
| D1 | 블록 이름·아트 유지, §1.3 팔레트를 **색상 계열로** 매핑 (순서대로가 아님) |
| D2 | 사진 블록을 슬롯 색 라운드 사각 바탕 안에 담는다 |
| D3 | Pretendard 동봉하지 않음 — 현재 폰트 스택 유지 |
| D4 | 좁은 화면 블록은 확보 가능한 최대치 (68px는 398px 폭부터) |
| D5 | **핀치 줌 차단 유지** — 대신 A8(rem 타이포)로 글꼴 설정을 받는다 |
| D6 | `사진 영역` 슬라이더를 스텝 3에 유지, 라벨 `사진이 보이는 크기` |

### DESIGN.md에 반영할 보정 6건 (Phase 5)

토큰 값을 실제로 계산해 확인한 것들이다. DESIGN.md §1.2 대비표 7개 항목은 문서값과 정확히 일치했고, 문서에 없는 조합에서만 문제가 나왔다.

1. §1.3 블록 팔레트 → D1 매핑표. 해님 립 `#c98a00`(2.41:1) → `#9a6800`
2. §5.3 게임판 외곽선 `--line-strong`(1.32:1) → `--board-edge: #96754b`(3.48:1)
3. §10 "68px 보장" → "≥400px에서 68px, 그 이하는 확보 가능한 최대"
4. §6.3 비활성 라벨 → `#756a5e` (`#7a6f63`은 4.50:1로 기준선에 걸침)
5. §2.1 폰트 스택에서 Pretendard 제거, §12에서 "확대 200%" 제외
6. §5.1/§5.5 게임 버튼 테두리·립 → `--btn-edge: #96856f` (원안은 1.26~1.55:1)

---

## 4. 다음 작업 — Phase 3 (모달 스텝화, 약 2일)

**가장 큰 단계다.** 계획 문서 Phase 3 체크리스트를 그대로 따르되, 아래를 먼저 처리해야 한다.

### 먼저 걷어낼 것

`index.html`의 모달은 헤더와 푸터가 각각 `<form method="dialog">`로 감싸여 있다.
**그 안의 버튼은 전부 모달을 닫는다.** 스텝 이동 버튼을 넣으려면 이 구조부터 없애고
`type="button"` + 명시적 `dialog.close()`로 바꿔야 한다.

### 목표 구조

```
헤더  : [← 뒤로(56px, step>1)]  제목  [×(56px)]
진행바: 4px, 트랙 --line / 채움 --carrot
본문  : .step-panel[data-step="1|2|3|done"] 중 하나만 표시
푸터  : sticky, 주요 버튼 1개 (폭 100%, 높이 64px, 립 없음)
```

푸터 버튼: 1·2단계 `다음`(2단계는 사진 없으면 비활성), 3단계 `이 사진으로 할게요`, 완료 `게임으로 돌아가기` + 본문에 `계속 꾸미기`.

### 놓치기 쉬운 것

- **모달 립 제거 대상은 공유 클래스다.** lint가 잡는 4건은 `.primary-button` / `.secondary-button, .action-button` / `.danger-button` / `.action-button.subtle`.
  `.primary-button`은 게임 종료 오버레이(립 유지)와 모달 푸터(립 제거) 양쪽에 쓰이므로 **클래스를 갈라야 한다.**
- 슬롯·프레임 목록은 `overflow-x: auto` → 2~3열 그리드 (DESIGN §11 Don't).
- 프리셋 3종 + 칭찬 효과 자리는 스텝 1 하단 "더 보기"(`<details>`)로 이동.
- `window.confirm()`(`app.js`의 전체 초기화)을 커스텀 다이얼로그로 교체, **기본 포커스는 취소**.
- 스텝 전환은 페이드 + 8px 상승. 좌우 슬라이드·bounce 금지.
- 완료 조건에 **`npm run build` + `verify-build.mjs` 통과**를 반드시 포함할 것. 과거 APK 정적 화면 사고가 `index.html` 구조 변경에서 나왔다.

---

## 5. 실행과 검증

```bash
cd webapp && npm.cmd test
```

```bash
cd webapp && npm.cmd run check
```

```bash
cd webapp && npm.cmd run build
```

- `npm run check` = 문법 검사 + `scripts/check-contrast.mjs` (대비). 지금 **통과**.
- `npm test` = `tests/` 전체. 지금 **18/21**.
- 개발 서버는 `.claude/launch.json`의 `sonjupang-webapp` 설정으로 뜬다 (127.0.0.1:5173).

### 화면 값 재기

패널 스크린샷이 안 되므로 콘솔에서 잰다. 리뉴얼 전 기준값은 [design-review/before/baseline.md](./design-review/before/baseline.md).

```js
const g = (s, p) => getComputedStyle(document.querySelector(s))[p];
const r = (s) => document.querySelector(s).getBoundingClientRect();
({ 뷰포트: innerWidth, 루트글자: g('html','fontSize'), 블록: Math.round(r('.tile').width),
   블록립: g('.tile','boxShadow'), 간격: g('.board','gap'),
   버튼높이: Math.round(r('.wide-button').height) })
```

### Phase 2까지의 실측값

| 항목 | 360px | 390px | 768px |
|---|---:|---:|---:|
| 블록 | 60px | 66px | 120px |
| 루트 글자 | 18px | 18px | 19px |
| 주요 버튼 높이 | 64px | 64px | 64px |

---

## 6. 남은 과제 메모

- **B1 (블록 크기 보통/크게)** — D5로 사용자가 스스로 확대할 수단이 없어져 우선순위가 올라갔다. 범위 밖이지만 리뉴얼 후 가장 먼저 다룰 것을 권했다. 약 0.5일.
- Phase 5에서 `webapp/README.md` 용어 갱신(프리셋 → 꾸민 모습) + 포트 오류 수정 + DESIGN.md 보정 6건 반영.
- Phase 5에서 **리뉴얼 전 버전으로 블록을 꾸며 둔 뒤 업데이트**해 D2-a 마이그레이션을 실기기에서 확인할 것. (개발 환경에서는 v1 데이터를 심어 확인 완료: 모서리 알파 0→255, 저장 v2, 재실행 시 재변환 없음)
