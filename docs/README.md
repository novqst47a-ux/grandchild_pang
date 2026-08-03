# docs

sonjupang(매치3 퍼즐) 웹앱 전환 관련 문서.

| 문서 | 내용 |
|---|---|
| [webapp-migration-plan.md](./webapp-migration-plan.md) | Godot → 웹앱 전환 검토, 사진 블록 기능 설계, 배포 방안 |
| [DESIGN.md](./DESIGN.md) | 디자인 시스템 v2 — 색상 토큰, 타이포, 깊이, 게임 영역·모달 스펙, 보이스&톤 |
| [webapp-design-renewal-plan.md](./webapp-design-renewal-plan.md) | DESIGN.md를 현재 webapp에 적용하기 위한 단계별 작업 계획, 대비 검증 결과, 결정 사항 |
| [webapp-design-renewal-handoff.md](./webapp-design-renewal-handoff.md) | 리뉴얼 진행 상황과 다음 단계 인수인계 — 진행 중이면 여기부터 읽을 것 |
| [prototype-prompt.md](./prototype-prompt.md) | 사진 처리 파이프라인 프로토타입 제작용 프롬프트 |
| [android-apk-build-incident.md](./android-apk-build-incident.md) | APK 정적 화면 오류의 원인, 수정 내용, 빌드 검증 및 재발 방지 절차 |

## 폴더 구조

```
grandchild_pang/
├─ docs/                        # 기획/설계 문서
├─ practice/
│  └─ sonjupang/                # Godot 4.7 매치3 연습 프로젝트
└─ Godot_v4.7.1-stable_win64/   # Godot 엔진 실행파일
```
