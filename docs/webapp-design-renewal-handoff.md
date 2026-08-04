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
| 4 | 문구·상태·모션 | **완료** |
| 5 | 검증·배포 | **진행 중** — PWA 전환 완료, 실기기 점검이 남음 |

**Phase 5 도중에 배포 방식을 Android APK에서 PWA로 바꿨다.** 사용자 10명 미만짜리 앱에
Capacitor·vite·Gradle 툴체인(로컬 1.3GB)을 유지하는 비용이 과하다는 판단이었고, 무엇보다
Phase 5의 가장 비싼 항목인 D2-a 마이그레이션 검증이 **곧 삭제할 네이티브 저장 경로를**
검증하는 일이 되기 때문이었다. 배포 대상을 먼저 확정하고 실기기 점검을 한 번만 하기로 했다.

APK는 실제 배포 전이었으므로 이관해야 할 사용자 데이터는 없었다.

커밋 7개 (오래된 순):

```
08faa96  webapp MVP 소스와 디자인 시스템 문서 추가   ← 리뉴얼 이전 베이스라인
859118d  Phase 0: 자동 검사 안전망 추가
bf16632  Phase 1: 색상 토큰과 rem 타이포 기반 교체
a214580  Phase 2: 게임 영역 입체화
7874a17  Phase 3: 꾸미기 모달 스텝화
3ba7cda  Phase 4: 문구·상태·모션
(A4·A5)  점수 카운트업과 고대비 변형   ← 사용자 요청으로 추가
```

계획 §6.1의 권장 항목 A1~A8이 **전부 반영됐다**(A1은 D5로 미채택).

**Phase 0에서 넣어 둔 완료 정의가 전부 초록이다.** 남은 것은 사람이 봐야 하는 것뿐이다.
`npm test`는 **15건**이다. 이전의 21건에서 Android 전용 `android-compat.test.mjs` 6건이
대상과 함께 없어졌다. 디자인 토큰 9건과 게임 로직 6건은 그대로이므로 리뉴얼 안전망은 온전하다.

`prototype/photo-block.html`은 이 작업과 무관한 사용자의 미커밋 변경(426줄)이라 **일부러 건드리지 않았다.** 계속 그대로 둘 것.

---

## 2. 먼저 알아야 할 함정

작업 중 실제로 걸렸던 것들이다.

1. **`npm test`는 이제 15/15 초록이다.** 빨간 것이 보이면 회귀다. Phase 0~4가 하나씩 초록으로 바꿔 온 것이니
   실패를 "원래 그런 것"으로 넘기지 말 것.

2. **개발 서버는 5173이다.** 예전 README가 4173으로 적어 둔 것은 오류였고 지금은 고쳐져 있다.
   `npm run dev`는 이제 vite가 아니라 `scripts/serve.mjs`(node 내장 모듈만 쓰는 정적 서버)를 띄운다.
   **`npm install`이 필요 없다** — 의존성이 0개다.

3. **서비스 워커.** 개발 서버에서는 등록하지 않는다. 번들러를 걷어내면서 빌드 시점 플래그
   (`import.meta.env.PROD`)가 없어졌으므로 지금은 **호스트 이름으로 판별**한다(`app.js`의 `isLocalHost`).
   localhost·127.0.0.1에서는 등록하지 않는다. 그래도 화면이 안 바뀌면 예전에 등록된 SW가
   남아 있는 것이니 아래로 지운다.

   ```js
   for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
   for (const k of await caches.keys()) await caches.delete(k);
   ```

4. **`sw.js`는 이제 stale-while-revalidate다.** 번들러가 사라지면서 해시 파일명(`index-<hash>.js`)도
   같이 사라졌고, `src/app.js`는 주소가 영원히 같아졌다. 예전 cache-first 그대로 두면 캐시 이름을
   올리는 것을 **한 번 잊는 순간 어르신 화면이 영영 안 바뀐다.** 그래서 캐시를 즉시 내주되 뒤에서
   다시 받아 덮어쓰도록 바꿨다 — 사람이 무엇을 잊어도 다음 접속에서 스스로 낫는다.
   그래도 배포마다 `CACHE`를 올리는 편이 낫다(한 번에 갈아끼워져 모듈 버전이 섞이지 않는다).
   현재 **`v9`**.

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

## 4. 모달 스텝 구조 (Phase 3에서 만든 것)

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

## 5. Phase 4에서 정한 규칙 (지켜 줄 것)

- **문구 끝에 마침표를 붙이지 않는다.** 문장 사이에는 쓰고 끝에는 안 쓴다
  (`여기는 안 움직여요. 다른 곳을 눌러 보세요`). DESIGN §7 표의 형태 그대로다.
- **토스트는 `toast(text, tone)`.** tone은 `''` / `'success'` / `'danger'`.
  잘 됐으면 success, 안 됐으면 danger. 표시 2500ms(`TOAST_MS`).
- **`DROP_MS`(400ms)는 `.tile.spawned`의 `--m-slow`와 짝이다.** 한쪽만 바꾸면 낙하 도중에 DOM이 갈린다.
- **`--e-bounce`는 게임 영역 선택자에서만.** 모달에서 쓰면 자동 검사가 잡는다.
- **`prefers-reduced-motion` 블록의 `:active` 규칙 3줄을 지우지 말 것.** 전역 규칙은 전환 시간만
  줄일 뿐 `:active`의 `translateY`는 남는다. 그 3줄이 "이동은 없애되 피드백은 남긴다"(§8)를 담당한다.
- **`@media (prefers-contrast: more)` 안의 `:root`는 대비 검사기가 따로 떼어 본다**(A5).
  `check-contrast.mjs`의 `splitContrastVariant()`가 그 일을 한다. 이걸 지우면 검사기가
  고대비 값으로 기본값을 덮어써 **기본 화면을 전혀 검사하지 않게 된다.** 조용히 망가지는 종류다.
  고대비 블록에 토큰을 더 넣는 건 안전하다 — 두 벌 다 자동으로 검사된다.
- **고대비 블록에서 레이아웃 수치를 바꾸지 말 것.** 색과 경계 두께만 다룬다.
  블록 크기·버튼 높이가 달라지면 같은 앱인데 조작 감각이 달라진다.
- **점수 표시는 `animateScore()`만 건드린다.** `scoreValue.textContent`를 직접 쓰면
  카운트업이 덮어써서 값이 되돌아간다. 내려가는 값(새 게임)은 즉시 반영된다.

## 6. 다음 작업 — Phase 5 (검증·배포, 약 0.5일)

자동 검사는 다 끝났다. **남은 것은 전부 사람이 실기기에서 봐야 하는 것들이다.**
계획 문서 Phase 5 체크리스트를 따르되, 순서는 아래를 권한다.

1. **D2-a 마이그레이션 확인 (가장 먼저, 되돌리기 어려움)**
   리뉴얼 **전** 버전(`08faa96`)을 띄워 블록을 2~3개 꾸민 뒤, 현재 버전을 **같은 origin에서**
   열어 사진이 슬롯 색 바탕 위에 제대로 얹히는지 본다. IndexedDB는 origin 단위라 배포만
   갈아끼우면 그대로 이어진다 — APK 두 개를 만들어 재설치하던 절차가 필요 없어졌고,
   이제 이것이 **실제 출시 경로 그 자체**다.

   ```bash
   git stash && git checkout 08faa96 -- webapp && npm.cmd run dev
   ```

   꾸며 둔 뒤 되돌리고(`git checkout HEAD -- webapp`) 같은 포트로 다시 띄워 확인한다.
   개발 환경에서는 v1 데이터를 심어 확인 완료(모서리 알파 0→255, 저장 v2, 재실행 시 재변환 없음).

2. **실기기 점검 (같은 Wi-Fi의 휴대폰에서 `http://<PC IP>:5173/`)**
   360 / 390 / 768px, TalkBack, `prefers-reduced-motion`, 한 손 조작,
   **OS 글꼴 크기 "매우 크게"** 에서 A8(rem 타이포)이 동작하는지, 고대비(A5) 켠 상태
   (~~브라우저 확대 200%~~ — D5로 줌 차단 유지)

   Android는 설정 → 접근성의 고대비 계열 설정이 `prefers-contrast`로 전달되는지 기기마다
   다르므로, 전달되지 않으면 그 사실 자체를 기록해 두면 된다.

3. **스텝 3의 두 라벨**(`사진 크기` / `사진이 보이는 크기`)이 헷갈리지 않는지 (D6)

4. **배포 후에만 확인할 수 있는 것 (HTTPS 필요)**
   서비스 워커 등록, 홈 화면 설치, 설치 후 저장 안내 문구가 "지우기 전까지 그대로 있어요"로
   바뀌는지(= `navigator.storage.persist()` 승인), 비행기 모드에서 오프라인 실행.
   **http LAN 주소로는 확인할 수 없다.** Pages에 올린 뒤 볼 것.

5. 리뉴얼 후 스크린샷 → `docs/design-review/after/`

6. `docs/DESIGN.md`에 "구현 보정" 절 추가 — 아래 §3의 8건

`webapp/README.md` 갱신(용어·포트·Android 절 제거)은 PWA 전환에서 **완료했다.**

---

## 7. 실행과 검증

```bash
cd webapp && npm.cmd test
```

```bash
cd webapp && npm.cmd run check
```

- `npm run check` = 문법 검사 + `scripts/check-contrast.mjs` (대비). 지금 **통과**.
  대비는 **기본과 고대비(`prefers-contrast: more`) 두 벌**을 각각 찍어 준다.
- `npm test` = `tests/` 전체. 지금 **15/15**.
- **`npm run build`는 없어졌다.** 빌드 단계가 없다. `webapp/` 폴더가 곧 배포본이다.
- 개발 서버는 `.claude/launch.json`의 `sonjupang-webapp` 설정으로 뜬다.
  `autoPort: true`라 5173이 이미 쓰이고 있으면 다른 포트가 할당된다 — 도구가 알려 주는
  포트를 쓸 것. 직접 띄울 때는 `npm.cmd run dev`.

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

### Phase 4까지의 실측값

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

Phase 4에서 추가로 확인한 것:

| 항목 | 실측 |
|---|---|
| 첫 진입 | 스켈레톤 25칸 → 블록 25칸, **블록 렌더는 한 번**이고 그 한 번에 이미 사진 블록이 들어 있다 |
| 연쇄 처리 중 | `.board.busy` → `pointer-events: none` + `brightness(0.96)`, 끝나면 해제 |
| 토스트 | 중립 `rgba(43,38,33,.93)` / 성공 `#1f7a55` / 실패 `#c42f2f`, 2500ms 뒤 사라짐 |
| 스켈레톤 칸 | 66px(블록과 동일), `--line`, 반경 12px |
| reduced-motion | `:active` 규칙 3개(`.wide-button`·`.icon-button` / `.primary-button` / `.tile`)가 실제로 등록됨 |
| 점수 카운트업 | 0→30을 ~300ms에 걸쳐 12단계, 감속하며 정확히 착지. 연쇄 시 보이는 값에서 이어감 |
| 점수 즉시 반영 | 새 게임(→0)과 reduced-motion에서 중간 단계 0개 |
| 고대비 | 토큰 13개 교체·경계 굵어짐 확인, **블록 66px / 버튼 64px는 그대로** |

고대비는 `document.styleSheets`에서 `CSSMediaRule`을 찾아 `media.mediaText`를 `'all'`로
바꿔 켜고 재는 방식으로 확인했다. 측정 뒤 원래 조건으로 되돌리면 기본값과 정확히 일치한다.

깜빡임 확인은 iframe에 앱을 띄우고 `#board`에 `MutationObserver`를 걸어 **첫 렌더의 img src**를
저장된 dataURL과 대조하는 방식으로 했다. 같은 방법을 Phase 5 회귀 확인에도 쓸 수 있다.

---

## 8. 남은 과제 메모

- **고대비에서 블록 립은 그대로다.** 5종 립은 `custom-blocks.js`의 `DEFAULT_BLOCKS`에 있고
  `renderBoard()`가 인라인 `--tile-lip`으로 넣어 미디어쿼리로 덮을 수 없다. 대신 블록 흰 링을
  3→4px로 굵혀 경계를 살렸다. 립까지 바꾸려면 JS가 고대비 여부를 읽어야 한다 — 별도 과제.
- **B1 (블록 크기 보통/크게)** — D5로 사용자가 스스로 확대할 수단이 없어져 우선순위가 올라갔다. 범위 밖이지만 리뉴얼 후 가장 먼저 다룰 것을 권했다. 약 0.5일.
  자리는 이미 있다 — 스텝 1의 `<details class="more-panel">` 안.
- `webapp/README.md` 갱신은 **완료**(용어·포트·Android 절 제거·PWA 배포 절 추가). DESIGN.md 보정 8건은 남았다.
- Phase 5에서 **리뉴얼 전 버전으로 블록을 꾸며 둔 뒤 현재 버전으로** D2-a 마이그레이션을 확인할 것 (§6-1). (개발 환경에서는 v1 데이터를 심어 확인 완료: 모서리 알파 0→255, 저장 v2, 재실행 시 재변환 없음)
- Phase 5 실기기 확인 때 **스텝 3의 두 라벨(`사진 크기` / `사진이 보이는 크기`)이 헷갈리지 않는지** 함께 볼 것 (D6).
- **구형 브라우저 하한이 올라갔다.** vite의 `target: 'chrome60'` 트랜스파일이 없어져 원본이
  그대로 나간다. `src/`가 optional chaining을 널리 쓰므로 **Chrome 80+**(2020년 3월)가 필요하다.
  안드로이드 Chrome은 OS와 별개로 자동 갱신되니 실무상 위험은 낮지만, 어르신 폰이 아주 오래됐고
  Chrome 자동 업데이트가 꺼져 있다면 백지로 뜬다. 실기기 점검 때 Chrome 버전을 한 번 확인해 둘 것.
- **Pages 최초 1회 설정이 남았다.** 저장소 Settings → Pages → Source를 `GitHub Actions`로
  지정해야 워크플로가 배포한다. 워크플로는 `main` push에서 도므로 `design-renewal` 병합 후 동작한다.
