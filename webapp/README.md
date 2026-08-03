# 손주팡 웹앱 MVP

고령자와 저시력자를 위한 5×5 매치3 웹앱입니다. 블록의 원본 렌더 크기는 최대 120px이며,
좁은 안드로이드 화면에서는 5개가 잘리지 않도록 같은 비율로 축소됩니다.

## 포함 기능

- 5×5 보드, 5종 블록, 20회 이동, 연쇄 점수
- 터치 탭·스와이프, 손가락을 따라오는 드래그 블록, 키보드, 힌트, 소리 켜기/끄기
- 연쇄 단계별 축하 이미지: 좋아요·멋져요·대단해요
- 즉시 매치와 진행 불가능한 초기 보드를 방지하는 보드 생성
- 사진 불러오기, EXIF 방향 보정, 드래그·핀치 크롭, 6종 프레임
- 커스텀 블록 자동 저장과 전체 초기화
- JSON 파일 프리셋 저장·불러오기
- PWA 매니페스트와 오프라인 서비스 워커
- 파티클 옵션을 위한 비활성 UI 자리

커스텀 블록은 서버로 전송하지 않습니다. 웹에서는 IndexedDB, 안드로이드 앱에서는 앱 내부 파일에
자동 저장합니다. 게임 점수와 진행 보드는 저장하지 않습니다.

## 실행과 확인

PowerShell 실행 정책은 변경하지 않습니다. 프로젝트 루트에서 `.cmd` 실행 파일을 직접 호출하세요.

```powershell
cd .\webapp
npm.cmd run dev
```

화면에 표시되는 `http://127.0.0.1:4173` 주소를 브라우저에서 엽니다. `npm.ps1` 실행이 제한된
환경에서도 `npm.cmd`는 기존 보안 정책을 그대로 유지하며 실행됩니다.

테스트와 빌드도 같은 방식으로 실행합니다.

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build
```

`npm.cmd run build` 결과는 `dist/`에 생성됩니다. 정적 HTTPS 호스팅에 배포하면 안드로이드에서 홈 화면에
추가해 설치형으로 사용할 수 있습니다.

## 안드로이드 테스트 APK

Capacitor Android 프로젝트는 `android/`에 준비되어 있습니다. 패키지 ID는
`com.sonjupang.game`, 최소 지원 버전은 Android 7(API 24)입니다.

처음 한 번 Android Studio의 **SDK Manager**에서 다음 항목을 설치하고 라이선스에 동의해야 합니다.

- Android SDK Platform 36
- Android SDK Build-Tools 36.0.0
- JDK 21 이상(Android Studio 내장 JDK 사용 가능)

그다음 PowerShell 정책을 변경하지 않고 아래처럼 빌드합니다.

```powershell
cd .\webapp
npm.cmd run android:sync
npm.cmd run android:apk
```

`android:apk` 명령은 `JAVA_HOME`의 JDK를 먼저 확인하고, Java 21 미만이면 Android Studio의 내장
JDK 21을 자동으로 찾아 사용합니다. 둘 다 없으면 JDK 21 설치 안내와 함께 빌드를 중단합니다.

웹 빌드 직후 `scripts/verify-build.mjs`가 `index.html`의 진입 스크립트와 참조 파일을 자동으로
검증합니다. 검증에 실패하면 Android 동기화 전에 빌드가 중단됩니다. 과거 APK 정적 화면 오류의 원인과
수동 점검 절차는 [Android APK 정적 화면 오류와 재발 방지](../docs/android-apk-build-incident.md)를 참고하세요.

완성된 테스트 APK 위치:

```text
C:\Users\net1\Documents\Dev\grandchild_pang\android-build\app\outputs\apk\debug\app-debug.apk
```

### OneDrive 밖에서 Android 빌드하기

웹 소스와 Android 프로젝트 소스는 기존 OneDrive 저장소에 유지합니다. Gradle이 생성하는 모듈별
`build/` 디렉터리와 프로젝트 캐시만 다음 경로를 사용합니다.

```text
C:\Users\net1\Documents\Dev\grandchild_pang\
├─ android-build\          # app 및 플러그인의 Gradle 빌드 산출물
└─ gradle-project-cache\   # Gradle 프로젝트 캐시
```

`npm.cmd run android:apk`를 사용하면 위 경로가 자동 적용됩니다. Android Studio에서 빌드해도
`android/build.gradle` 설정에 의해 `android-build/` 산출물은 같은 외부 경로를 사용합니다. 단,
Android Studio 자체의 프로젝트 캐시는 별도로 생성될 수 있습니다.

다른 경로가 필요하면 빌드 전에 `SONJUPANG_ANDROID_BUILD_ROOT` 환경 변수를 지정합니다.

```powershell
$env:SONJUPANG_ANDROID_BUILD_ROOT = 'D:\Dev\grandchild_pang'
npm.cmd run android:apk
```

환경 변수는 Android 빌드 루트만 변경하며 `webapp`, `dist`, `android` 소스 위치는 변경하지 않습니다.

Android Studio에서 기기 또는 에뮬레이터로 실행하려면 다음 명령을 사용합니다.

```powershell
npm.cmd run android:open
```

안드로이드에서는 합성된 사진 블록을 앱 내부 저장소에 두고 블록 슬롯 정보만 Preferences에 저장합니다.
외부 저장소 권한은 사용하지 않습니다. 가족 사진이 Google Drive 백업이나 기기 간 전송에 포함되지 않도록
Android 11 이하와 Android 12 이상의 백업 제외 규칙을 모두 적용했습니다. 앱 삭제 또는 설정 화면의
`꾸민 블록 전체 초기화`를 실행하면 저장 데이터가 제거됩니다.
