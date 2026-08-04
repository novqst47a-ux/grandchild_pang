# docs

sonjupang(매치3 퍼즐) 웹앱 전환 관련 문서.

| 문서 | 내용 |
|---|---|
| [webapp-migration-plan.md](./webapp-migration-plan.md) | Godot → 웹앱 전환 검토, 사진 블록 기능 설계, 배포 방안 |
| [DESIGN.md](./DESIGN.md) | 디자인 시스템 v2 — 색상 토큰, 타이포, 깊이, 게임 영역·모달 스펙, 보이스&톤 |
| [webapp-design-renewal-plan.md](./webapp-design-renewal-plan.md) | DESIGN.md를 현재 webapp에 적용하기 위한 단계별 작업 계획, 대비 검증 결과, 결정 사항 |
| [webapp-design-renewal-handoff.md](./webapp-design-renewal-handoff.md) | 리뉴얼 진행 상황과 다음 단계 인수인계 — 진행 중이면 여기부터 읽을 것 |
| [prototype-prompt.md](./prototype-prompt.md) | 사진 처리 파이프라인 프로토타입 제작용 프롬프트 |
| [android-apk-build-incident.md](./android-apk-build-incident.md) | **(이력)** APK 정적 화면 오류 기록. Android 배포는 접었다 |

## 배포 방식

**PWA + GitHub Pages.** 번들러도 빌드 단계도 없고, `webapp/` 폴더가 곧 배포본이다.
npm 의존성은 0개이며 node는 테스트·대비 검사·개발 서버에만 쓴다.

Android APK(Capacitor)는 2026-08-04에 접었다. 사용자 10명 미만인 앱에 Capacitor·vite·Gradle
툴체인(로컬 1.3GB)을 유지하는 비용이 과했고, 수정할 때마다 새 APK를 만들어 기기마다 다시
설치시켜야 하는 부담이 컸다. 실제 배포 전이라 이관할 사용자 데이터는 없었다.
자세한 근거는 [webapp-design-renewal-handoff.md](./webapp-design-renewal-handoff.md) §1 참고.

## 폴더 구조

```
grandchild_pang/
├─ .github/workflows/pages.yml  # webapp/를 GitHub Pages로 배포
├─ docs/                        # 기획/설계 문서
├─ webapp/                      # 앱 본체 (= 배포본)
├─ practice/
│  └─ sonjupang/                # Godot 4.7 매치3 연습 프로젝트
└─ Godot_v4.7.1-stable_win64/   # Godot 엔진 실행파일
```
