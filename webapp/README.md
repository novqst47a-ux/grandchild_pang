# 손주팡 웹앱

고령자와 저시력자를 위한 5×5 매치3 웹앱입니다. 블록의 원본 렌더 크기는 최대 120px이며,
좁은 안드로이드 화면에서는 5개가 잘리지 않도록 같은 비율로 축소됩니다.

**빌드 단계가 없습니다.** `index.html`이 `src/app.js`를 ES 모듈로 직접 불러오고 브라우저가
상대 경로 import를 따라갑니다. 이 폴더의 파일이 곧 배포본입니다. npm 의존성은 하나도 없고,
node는 테스트·대비 검사·개발 서버에만 쓰이는 개발 도구입니다.

## 포함 기능

- 5×5 보드, 5종 블록, 20회 이동, 연쇄 점수
- 터치 탭·스와이프, 손가락을 따라오는 드래그 블록, 키보드, 힌트, 소리 켜기/끄기
- 연쇄 단계별 축하 이미지: 좋아요·멋져요·대단해요
- 즉시 매치와 진행 불가능한 초기 보드를 방지하는 보드 생성
- 사진 불러오기, EXIF 방향 보정, 드래그·핀치 크롭, 6종 프레임
- 꾸민 블록 자동 저장과 전체 초기화
- JSON 파일로 꾸민 모습 저장·불러오기
- PWA 매니페스트와 오프라인 서비스 워커

꾸민 블록은 서버로 전송하지 않고 브라우저 IndexedDB에 저장합니다. 게임 점수와 진행 보드는
저장하지 않습니다.

### 사진을 오래 남기려면 홈 화면에 설치해야 합니다

브라우저 탭으로만 열어 두면 저장 공간이 부족할 때 IndexedDB가 축출될 수 있습니다. 홈 화면에
설치하면 `navigator.storage.persist()`가 자동 승인되어 축출 대상에서 빠집니다. 설정 화면의
저장 안내 문구가 현재 어느 상태인지 알려 줍니다.

| 문구 | 뜻 |
|---|---|
| 사진은 이 기기에만 저장돼요. 지우기 전까지 그대로 있어요 | 영구 저장 승인됨(설치형) |
| 사진은 이 브라우저에만 저장돼요. 인터넷으로 보내지 않아요 | 미승인. 축출될 수 있음 |

## 실행과 확인

PowerShell 실행 정책은 변경하지 않습니다. `.cmd` 실행 파일을 직접 호출하세요.

```powershell
cd .\webapp
npm.cmd run dev
```

`http://localhost:5173/`을 브라우저에서 엽니다. 개발 서버(`scripts/serve.mjs`)는 node 내장
모듈만 쓰므로 `npm install` 없이 그대로 돕니다. 포트를 바꾸려면 `PORT` 환경 변수를 씁니다.

테스트와 검사도 같은 방식으로 실행합니다.

```powershell
npm.cmd test
npm.cmd run check
```

- `npm test` — `tests/` 전체 (게임 로직 + 디자인 토큰·문구 규칙)
- `npm run check` — 문법 검사 + 대비 검사. 기본과 고대비(`prefers-contrast: more`) 두 벌을 각각 찍습니다

### 실기기에서 열기

개발 서버는 모든 인터페이스에 바인딩하므로, 같은 Wi-Fi의 휴대폰에서 서버가 출력한
`http://<PC의 IP>:5173/` 주소로 바로 열 수 있습니다. 사진 넣기는 `<input type="file" capture>`라
http로도 동작합니다.

다만 **서비스 워커와 홈 화면 설치는 보안 컨텍스트를 요구하므로 http LAN 주소에서는 확인할 수
없습니다.** 그 둘은 아래 배포 주소(HTTPS)에서 확인하세요.

## 배포 (GitHub Pages)

`main`에 push하면 [`.github/workflows/pages.yml`](../.github/workflows/pages.yml)이 테스트와
대비 검사를 돌린 뒤 `webapp/` 폴더를 그대로 Pages에 올립니다. 빌드 단계는 없습니다.

처음 한 번은 저장소 설정에서 **Settings → Pages → Source를 `GitHub Actions`로** 지정해야 합니다.

꾸민 사진은 기기 밖으로 나가지 않으므로 공개 주소로 서빙해도 사진이 노출되지 않습니다.
호스팅되는 것은 게임 코드와 기본 블록 이미지뿐입니다.

### 배포할 때마다 확인할 것

`sw.js`의 `CACHE` 이름을 올리는 것을 권장합니다. 서비스 워커가 stale-while-revalidate라
올리지 않아도 다음 접속에서 스스로 새 버전을 받지만, 이름을 올리면 한 번에 갈아끼워져
모듈 여러 개가 서로 다른 버전으로 섞이는 경우를 피할 수 있습니다.

## 폴더

```text
webapp/
├─ index.html          # 진입점. src/app.js를 모듈로 직접 로드
├─ styles.css          # 디자인 토큰과 전체 스타일
├─ sw.js               # 서비스 워커 (stale-while-revalidate)
├─ manifest.webmanifest
├─ src/
│  ├─ app.js           # UI·입력·게임 진행
│  ├─ game-core.js     # 순수 매치3 로직 (테스트 대상)
│  ├─ custom-blocks.js # 사진 합성·프레임·기본 블록 렌더
│  └─ storage.js       # IndexedDB 저장
├─ scripts/
│  ├─ serve.mjs        # 개발용 정적 서버 (의존성 없음)
│  ├─ check-contrast.mjs
│  └─ generate-icons.mjs
├─ tests/
└─ assets/celebrations/
```

디자인 스펙은 [DESIGN.md](../docs/DESIGN.md)를 따릅니다.
