# 디자인 리뉴얼 인수인계

> 다음 세션이 바로 이어서 작업할 수 있도록 정리한 문서.
> 전체 계획은 [webapp-design-renewal-plan.md](./webapp-design-renewal-plan.md), 기준 스펙은 [DESIGN.md](./DESIGN.md).

**마지막 갱신:** 2026-08-04 · **브랜치:** `design-renewal`

---

## 1. 지금 어디까지 왔나

| Phase | 내용 | 상태 |
|---|---|---|
| 0 | 자동 검사 안전망 (대비 검사·토큰 lint·기준값) | **완료** |
| 1 | 색상 토큰 + rem 타이포 기반 | **완료** |
| 2 | 게임 영역 입체화 (립·배지·팔레트·마이그레이션) | **완료** |
| 3 | 꾸미기 모달 스텝화 | **완료** |
| 4 | 문구·상태·모션 | **다음 차례** |
| 5 | 검증·배포 | 대기 |

커밋 5개 (오래된 순):

```
08faa96  webapp MVP 소스와 디자인 시스템 문서 추가   ← 리뉴얼 이전 베이스라인
859118d  Phase 0: 자동 검사 안전망 추가
bf16632  Phase 1: 색상 토큰과 rem 타이포 기반 교체
a214580  Phase 2: 게임 영역 입체화
(Phase 3) 꾸미기 모달 스텝화
```

`prototype/photo-block.html`은 이 작업과 무관한 사용자의 미커밋 변경(426줄)이라 **일부러 건드리지 않았다.** 계속 그대로 둘 것.

---

## 2. 먼저 알아야 할 함정

작업 중 실제로 걸렸던 것들이다.

1. **`npm test`는 지금도 빨간 게 정상이다.** 21건 중 2건 실패 — 둘 다 **Phase 4가 지울 문구**다.
   격식체 3건 / 어려운 말 6건, 전부 `src/app.js`의 문자열이다. `index.html` 쪽은 Phase 3에서 이미 정리했다.
   Phase 0 시점 대비 격식체 7→3, 어려운 말 17→6으로 줄었다.

2. **개발 서버는 5173이다.** `webapp/README.md:30`이 4173으로 적어 둔 것은 **오류**다(`dev` 스크립트에 `--port` 지정 없음 → vite 기본값). Phase 5의 README 갱신 때 고칠 것.

3. **서비스 워커.** cache-first라 `styles.css`는 물론 `@vite/client`와 의존성 모듈까지 캐시해 개발 중 변경이 반영되지 않았다.
   Phase 1에서 `import.meta.env.PROD` 가드를 넣어 개발 서버에서는 등록하지 않는다. 캐시는 **`v6`**(Phase 3에서 올림).
   그래도 화면이 안 바뀌면 예전에 등록된 SW가 남아 있는 것이니 아래로 지운다.

   ```js
   for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
   for (const k of await caches.keys()) await caches.delete(k);
   ```

4. **스타일·문구를 바꾼 배포마다 `sw.js`의 `CACHE`를 올릴 것.** 안 올리면 기존 사용자 화면이 그대로다.
   Phase 4에서 문구를 바꾸면 **v7로 올린다.**

5. **이 환경에서는 브라우저 스크린샷이 안 된다** (패널 미표시로 타임아웃).
   `javascript_tool`로 `getComputedStyle` 값을 재는 방식으로 검증해 왔다. 숫자라 diff도 된다.
   다만 아래 6·7번 두 가지 함정이 있다.

6. **미표시 탭에서는 CSS 전환(transition)이 진행되지 않는다.** `document.visibilityState`가 `hidden`이라
   `getComputedStyle`이 **전환 시작 전 값**을 계속 돌려준다. 진행바 폭, 비활성 버튼 배경처럼
   `transition` 대상인 속성은 아무리 기다려도 안 바뀐 것처럼 보인다. 버그가 아니다.
   최종값을 재려면 잠깐 전환을 꺼라.

   ```js
   const kill = document.createElement('style');
   kill.textContent = '*{transition:none !important;animation:none !important}';
   document.head.append(kill);
   // ... 여기서 측정 ...
   kill.remove();
   ```

7. **이 환경에서는 `<dialog>`의 `close` 이벤트가 발화하지 않는다.** 새로 만든 빈 `<dialog>`에
   `showModal()` → `close()`를 해도 마찬가지다(Chrome 148 기준). 그래서 확인 다이얼로그의
   답은 `close` 이벤트가 아니라 **버튼 클릭 핸들러에서 바로** 정한다(`app.js`의 `settleConfirmWith`).
   `cancel`/`close` 리스너는 Esc·백드롭용 안전망으로만 남아 있다. **이 구조를 되돌리지 말 것** —
   되돌리면 `새 게임`과 `모두 처음으로 되돌리기`가 예외도 로그도 없이 조용히 멈춘다.

8. **커밋 메시지에 PowerShell here-string(`@'...'@`)을 쓰지 말 것.** Bash 도구는 이를 해석하지 못해 제목 앞에 `@`가 붙는다. heredoc(`<<'EOF'`)을 쓴다.

9. **블록 키 형식은 `row:col`** (`game-core.js:6`). `[data-key="1:2"]` 형태로 선택한다.

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

### DESIGN.md에 반영할 보정 8건 (Phase 5)

토큰 값을 실제로 계산해 확인한 것들이다. DESIGN.md §1.2 대비표 7개 항목은 문서값과 정확히 일치했고, 문서에 없는 조합에서만 문제가 나왔다.

1. §1.3 블록 팔레트 → D1 매핑표. 해님 립 `#c98a00`(2.41:1) → `#9a6800`
2. §5.3 게임판 외곽선 `--line-strong`(1.32:1) → `--board-edge: #96754b`(3.48:1)
3. §10 "68px 보장" → "≥400px에서 68px, 그 이하는 확보 가능한 최대"
4. §6.3 비활성 라벨 → `#6f6458` (`#756a5e`는 비활성 버튼 면 `#f0e9e1` 위에서 4.38:1)
5. §2.1 폰트 스택에서 Pretendard 제거, §12에서 "확대 200%" 제외
6. §5.1/§5.5 게임 버튼 테두리·립 → `--btn-edge: #96856f` (원안은 1.26~1.55:1)
7. §6.4 선택 카드 기본 면. 문서는 `--surface`인데 §6.2가 모달 바닥도 `--surface`로 지정해
   두 색이 같아진다 → 구현은 `--surface-warm` 면 + `3px --line-strong`. 두께는 3px 고정
   (선택 시 2→3px로 바뀌면 그리드가 1px씩 밀린다)
8. §6.3 비활성 주요 버튼 면 `#f0e9e1`을 토큰 `--surface-mute`로 정의

---

## 4. Phase 3에서 만든 구조 (Phase 4가 손댈 자리)

```
헤더  : [← 뒤로(56px)]  [1 / 3] + 제목  [×(56px)]
진행바: 4px, 트랙 --line / 채움 --carrot, 250ms
본문  : .step-panel[data-step="1|2|3|done"] 중 .active 하나만 표시
푸터  : 보조문구(#stepNote) + 주요 버튼 1개 (#stepNextButton, 폭 100%, 64px, 립 없음)
```

- 상태는 `app.js`의 **`editorStep`** 하나. `STEPS` 표가 스텝별 제목·푸터 라벨을 갖고 있고,
  `renderStep()`이 패널·제목·진행바·뒤로 버튼·푸터 라벨·비활성·보조문구를 한 번에 칠한다.
  스텝을 옮길 땐 `goStep()`(본문 스크롤을 맨 위로 되돌린다), 같은 스텝 안에서 다시 칠할 땐 `renderStep()`.
- 뒤로 버튼은 스텝 1·done에서 `hidden`이지만 CSS가 `visibility: hidden`으로 **자리는 남긴다.**
  자리를 없애면 제목이 스텝마다 좌우로 흔들린다.
- 모달 버튼 클래스는 **`.step-button`(주요) / `.flat-button`(보조, `.accent` `.danger` `.wide` 변형)** 이다.
  `.primary-button`은 이제 **게임 종료 오버레이 전용**이다. 립 검사가 `<dialog>` 안에 등장하는
  클래스 이름으로 판정하므로, 모달에서 `.primary-button`을 다시 쓰면 검사가 빨개진다.
- 되돌리기(`#restoreSlotButton`)는 스텝 1에서, 그 자리에 사진이 있을 때만 보인다.
- 꾸민 모습 보관·칭찬 효과는 스텝 1 하단 `<details class="more-panel">` 안에 있다.

---

## 5. 다음 작업 — Phase 4 (문구·상태·모션, 약 1일)

계획 문서 Phase 4 체크리스트를 그대로 따르되, 아래를 먼저 알아 둘 것.

### 남은 문구 9건은 전부 `src/app.js`에 있다

`npm.cmd test`가 그대로 목록을 뽑아 준다. 계획 문서 §4 대응표가 짝을 갖고 있다.
`index.html`은 Phase 3에서 새 구조로 다시 쓰면서 이미 §7 보이스로 맞췄다.

남은 것은 대체로 **프리셋 → 꾸민 모습** 치환과 `#storageStatus` 세 문장이다.
`#storageStatus`는 `initializeApp()`이 저장소 종류(웹/안드로이드)에 따라 넣는다.

### 놓치기 쉬운 것

- 문구를 바꾸면 `sw.js`의 `CACHE`를 **v7**로 올린다.
- `aria-label`도 화면 문구와 같이 바꾼다. 검사기가 `aria-label`·`alt`·`title`도 읽는다.
- 토스트 표시 시간 1800ms → 2500ms는 `app.js`의 `toast()` 안에 있다.
  `--success` / `--danger` 변형을 추가할 때 **`.toast`는 `<dialog>` 밖**이라 립 검사에 걸리지 않는다.
- 첫 진입 스켈레톤은 `startGame()`이 저장소 로드보다 먼저 렌더해서 생기는 깜빡임을 함께 없애는 작업이다
  (`initializeApp()` 참조).
- `prefers-reduced-motion`에서 **누름 시 색 변화는 유지**해야 한다. 현재 전역 규칙이
  `transition-duration: .01ms`로 일괄 축소만 하고 있다. 모달 버튼의 `:active` 색 변화는
  전환이 아니라 규칙 자체라 살아 있지만, 규칙을 지울 때 함께 날리지 말 것.

---

## 6. 실행과 검증

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
- `npm test` = `tests/` 전체. 지금 **19/21** (남은 2건은 Phase 4 문구).
- `npm run build`는 `verify-build.mjs`까지 돌린다. 지금 **통과**.
- 개발 서버는 `.claude/launch.json`의 `sonjupang-webapp` 설정으로 뜬다 (127.0.0.1:5173).
  브라우저 도구로는 `http://localhost:5173/`으로 접속해야 한다 (`127.0.0.1`은 거부됨).

### 화면 값 재기

패널 스크린샷이 안 되므로 콘솔에서 잰다. 리뉴얼 전 기준값은 [design-review/before/baseline.md](./design-review/before/baseline.md).
**전환 대상 속성을 잰다면 §2의 6번을 먼저 읽을 것.**

```js
const g = (s, p) => getComputedStyle(document.querySelector(s))[p];
const r = (s) => document.querySelector(s).getBoundingClientRect();
({ 뷰포트: innerWidth, 루트글자: g('html','fontSize'), 블록: Math.round(r('.tile').width),
   블록립: g('.tile','boxShadow'), 간격: g('.board','gap'),
   버튼높이: Math.round(r('.wide-button').height) })
```

### Phase 3까지의 실측값

| 항목 | 360px | 390px | 768px |
|---|---:|---:|---:|
| 블록 | 60px | 66px | 120px |
| 루트 글자 | 18px | 18px | 19px |
| 주요 버튼 높이 | 64px | 64px | 64px |
| 모달 폭 | 360 (전체 시트) | 390 (전체 시트) | 640 (중앙) |
| 모달 제목 | 24.6px | 24.6px | 30px |
| 모달 반경 | 28px 상단만 | 28px 상단만 | 28px 전체 |
| 선택 카드 | 104×137 | 114×137 | 187×… |
| 크롭 캔버스 | 332px | 360px | 360px |
| 스테퍼 −/+ | 56px | 56px | 56px |
| 슬라이더 터치 영역 | 48px | 48px | 48px |

360px에서 **가로 스크롤 없음**, 모달 안 계산된 `box-shadow` 립 **0건**을 함께 확인했다.

---

## 7. 남은 과제 메모

- **B1 (블록 크기 보통/크게)** — D5로 사용자가 스스로 확대할 수단이 없어져 우선순위가 올라갔다. 범위 밖이지만 리뉴얼 후 가장 먼저 다룰 것을 권했다. 약 0.5일.
  자리는 이미 있다 — 스텝 1의 `<details class="more-panel">` 안.
- Phase 5에서 `webapp/README.md` 용어 갱신(프리셋 → 꾸민 모습) + 포트 오류 수정 + DESIGN.md 보정 8건 반영.
- Phase 5에서 **리뉴얼 전 버전으로 블록을 꾸며 둔 뒤 업데이트**해 D2-a 마이그레이션을 실기기에서 확인할 것. (개발 환경에서는 v1 데이터를 심어 확인 완료: 모서리 알파 0→255, 저장 v2, 재실행 시 재변환 없음)
- Phase 5 실기기 확인 때 **스텝 3의 두 라벨(`사진 크기` / `사진이 보이는 크기`)이 헷갈리지 않는지** 함께 볼 것 (D6).
