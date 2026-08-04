# docs

sonjupang(매치3 퍼즐) PWA의 기획·설계 문서.

| 문서 | 내용 |
|---|---|
| [webapp-migration-plan.md](./webapp-migration-plan.md) | 초기 Godot → PWA 전환 검토 기록 |
| [DESIGN.md](./DESIGN.md) | 현재 PWA 디자인 시스템 |
| [webapp-design-renewal-plan.md](./webapp-design-renewal-plan.md) | 디자인 리뉴얼 작업 및 결정 기록 |
| [webapp-design-renewal-handoff.md](./webapp-design-renewal-handoff.md) | 디자인 리뉴얼 인수인계 기록 |
| [prototype-prompt.md](./prototype-prompt.md) | 사진 처리 파이프라인 프로토타입 제작용 프롬프트 |

## 배포 방식

현재 배포 방식은 **PWA + GitHub Pages**입니다. 번들러나 앱 패키징 과정 없이
`webapp/` 폴더를 그대로 배포합니다. APK·Capacitor·Gradle 기반 배포는 폐기했습니다.

## 폴더 구조

```
grandchild_pang/
├─ .github/workflows/pages.yml  # webapp/를 GitHub Pages로 배포
├─ docs/                        # 기획·설계 문서
├─ prototype/                   # 사진 블록 프로토타입 보관본
└─ webapp/                      # 앱 본체이자 배포본
```
