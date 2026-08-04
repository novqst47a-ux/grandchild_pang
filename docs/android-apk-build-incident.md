# Android APK 정적 화면 오류와 재발 방지

> **(이력 문서) 2026-08-04에 Android 배포를 접었다.** Capacitor와 vite를 걷어내고 PWA +
> GitHub Pages로 전환하면서 이 문서가 다루는 빌드 파이프라인 자체가 없어졌다. 여기 적힌
> 재발 방지 절차(`verify-build.mjs` 등)도 대상과 함께 삭제됐다.
>
> 이 장애는 **번들 산출물을 원본으로 덮어쓰는 후처리 단계**가 있었기 때문에 생겼고,
> 빌드 단계를 없애면서 그 유형이 구조적으로 사라졌다. 기록으로만 남긴다.
> 전환 근거는 [webapp-design-renewal-handoff.md](./webapp-design-renewal-handoff.md) §1 참고.

## 문서 목적

2026-08-03에 해결한 Android APK 실행 오류의 원인과 영구적인 재발 방지 절차를 기록한다.

- 상태: 해결됨
- 영향: APK를 설치하고 실행하면 HTML과 CSS만 표시되고 게임이 시작되지 않음
- 대표 증상: 개발 서버 없이 원본 `index.html`을 직접 연 것과 같은 정적 화면
- 확정 원인: Vite가 만든 `dist/index.html`을 후처리 스크립트가 원본 `index.html`로 덮어씀

## 정상 빌드 구조

웹 소스에는 브라우저가 직접 해석할 수 없는 npm 모듈 import가 포함되어 있다. 따라서 APK에는 원본 `src/`가 아니라 Vite가 만든 배포 번들이 들어가야 한다.

```text
index.html + src/*.js
        │
        ▼
    vite build
        │
        ▼
dist/index.html ──► dist/assets/index-<hash>.js
        │
        ▼
 cap sync android
        │
        ▼
android/app/src/main/assets/public/
        │
        ▼
  Gradle APK 빌드
```

정상적인 `dist/index.html`은 다음과 같이 Vite 번들을 참조한다. 해시 값은 빌드마다 바뀔 수 있다.

```html
<script type="module" crossorigin src="./assets/index-<hash>.js"></script>
```

## 발생 원인

당시 `npm run build`는 다음 순서로 실행되었다.

```text
vite build && node scripts/build.mjs
```

Vite는 정상적인 `dist/index.html`과 해시가 붙은 JS/CSS 번들을 만들었다. 그러나 후속 `scripts/build.mjs`가 원본 `index.html`을 다시 `dist/index.html`에 복사했다.

덮어쓴 HTML은 아래 개발용 경로를 참조했다.

```html
<script type="module" src="src/app.js"></script>
```

하지만 `dist/src/app.js`는 존재하지 않았다. `cap sync android`와 Gradle은 HTML 안의 참조 무결성을 검사하지 않고 이 상태를 그대로 APK에 포함했다. 그 결과 WebView에서 `src/app.js` 로드가 실패하고 게임 초기화 코드가 전혀 실행되지 않았다.

원본 `src/`를 `dist/`에 복사하는 방식도 올바른 해결책이 아니다. `src/storage.js`가 `@capacitor/core`, `@capacitor/filesystem`, `@capacitor/preferences` 같은 bare module specifier를 사용하므로 WebView는 Vite 번들링 없이 이를 직접 해석할 수 없다.

## 적용된 영구 수정

1. `scripts/build.mjs`는 Vite가 처리하는 `index.html`과 `styles.css`를 복사하지 않는다.
2. `scripts/verify-build.mjs`가 빌드 직후 다음 조건을 검사한다.
   - `dist/index.html`에 실행할 스크립트가 있는가
   - 개발용 `src/app.js`를 참조하지 않는가
   - 로컬 script/link 참조 대상이 `dist/` 안에 실제로 존재하는가
3. `npm run build` 마지막 단계에서 `verify-build.mjs`를 항상 실행한다.
4. 자동 테스트가 `build.mjs`의 복사 목록에 `index.html`이 다시 추가되는 회귀를 차단한다.

검증 실패 시 빌드가 중단되므로 깨진 웹 자산이 `cap sync android` 단계로 넘어가면 안 된다.

## 반드시 지킬 규칙

- 원본 `index.html`을 Vite 빌드 후 `dist/`에 다시 복사하지 않는다.
- 문제를 우회하려고 원본 `src/`를 `dist/` 또는 Android assets에 복사하지 않는다.
- `dist/`와 `android/app/src/main/assets/public/`의 생성 파일을 직접 수정하지 않는다.
- APK를 만들 때는 `npm.cmd run android:apk`를 사용한다. 이 명령은 웹 빌드, 검증, Capacitor 동기화, Gradle 빌드를 순서대로 실행한다.
- Android Studio나 Gradle에서 APK만 다시 만들기 전에 반드시 최신 웹 자산을 `cap sync` 했는지 확인한다.
- `BUILD SUCCESSFUL`만으로 앱이 정상이라고 판단하지 않는다. APK 내부 진입 스크립트도 확인한다.

## 표준 빌드와 검증 절차

필수 환경:

- Android SDK Platform 36
- Android SDK Build-Tools 36.0.0
- JDK 21 이상
- Android SDK 라이선스 동의 완료

PowerShell에서 다음 명령을 실행한다.

```powershell
cd .\webapp
npm.cmd test
npm.cmd run check
npm.cmd run android:apk
```

웹 빌드 로그에 다음과 같은 메시지가 있어야 한다. 실제 해시는 달라질 수 있다.

```text
빌드 진입점 검증 완료: ./assets/index-<hash>.js
```

완성된 APK:

```text
C:\Users\net1\Documents\Dev\grandchild_pang\android-build\app\outputs\apk\debug\app-debug.apk
```

Gradle 빌드 산출물과 프로젝트 캐시는 OneDrive 충돌을 피하기 위해 다음처럼 외부 경로에 둔다.

```text
C:\Users\net1\Documents\Dev\grandchild_pang\android-build\
C:\Users\net1\Documents\Dev\grandchild_pang\gradle-project-cache\
```

웹 소스, `dist/`, Capacitor `android/` 프로젝트 소스는 기존 저장소에 유지한다. 경로를 바꿔야 할 때는
`SONJUPANG_ANDROID_BUILD_ROOT` 환경 변수를 사용하며 생성된 폴더를 저장소로 복사하지 않는다.

## 산출물 점검 기준

다음 조건을 모두 만족해야 한다.

- `dist/index.html`에 `src/app.js` 문자열이 없다.
- `dist/index.html`이 `./assets/index-<hash>.js`를 참조한다.
- 참조된 JS 파일이 `dist/assets/`에 존재한다.
- Android assets의 `index.html`도 같은 번들을 참조한다.
- APK 내부에 참조된 `assets/public/assets/index-<hash>.js`가 존재한다.

APK는 ZIP 형식이므로 PowerShell에서 읽기 전용으로 확인할 수 있다.

```powershell
$apk = 'C:\Users\net1\Documents\Dev\grandchild_pang\android-build\app\outputs\apk\debug\app-debug.apk'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $apk))
try {
  $index = $zip.GetEntry('assets/public/index.html')
  $reader = [System.IO.StreamReader]::new($index.Open())
  try { $html = $reader.ReadToEnd() } finally { $reader.Dispose() }
  $html | Select-String -Pattern '<script[^>]+src='
  $zip.Entries | Where-Object FullName -Like 'assets/public/assets/index-*.js'
} finally {
  $zip.Dispose()
}
```

## 기기 재설치 시 주의

서비스 워커가 이전 `index.html`을 캐시했을 가능성이 있다. 수정 APK를 검증할 때는 다음 중 하나를 수행한다.

1. 기존 앱을 완전히 삭제한 뒤 새 APK를 설치한다.
2. Android 설정에서 앱 데이터를 삭제한 뒤 새 APK를 설치한다.

설치 후 게임판이 생성되고 힌트·새 게임·설정 버튼이 동작하는지 확인한다. 정적 레이아웃만 보이면 APK 내부 script 경로부터 다시 확인한다.

## 증상별 우선 점검

| 증상 | 우선 점검 |
|---|---|
| HTML/CSS는 보이지만 게임판과 버튼이 동작하지 않음 | `index.html`의 script 경로와 APK 내부 JS 존재 여부 |
| 수정 전 화면이 계속 표시됨 | 앱 데이터와 서비스 워커 캐시 삭제 여부 |
| 웹 빌드는 정상이나 APK에 변경이 없음 | `cap sync android` 실행 여부와 Android assets 수정 시각 |
| APK 빌드가 SDK/라이선스 오류로 중단됨 | Platform 36, Build-Tools 36.0.0, SDK 라이선스 |
| 시작 화면에서 종료되거나 네이티브 오류가 발생함 | `adb logcat`, Manifest, MainActivity, Capacitor 플러그인 |

## 관련 파일

- `webapp/package.json`: 전체 빌드 명령
- `webapp/vite.config.js`: Vite 배포 경로와 WebView 빌드 대상
- `webapp/scripts/build.mjs`: Vite 이후 추가 정적 파일 복사
- `webapp/scripts/verify-build.mjs`: 웹 산출물 진입점 검증
- `webapp/tests/android-compat.test.mjs`: Android 및 빌드 회귀 테스트
- `webapp/capacitor.config.json`: Capacitor의 `webDir` 설정
- `webapp/android/app/src/main/assets/public/`: 동기화된 Android 웹 자산
