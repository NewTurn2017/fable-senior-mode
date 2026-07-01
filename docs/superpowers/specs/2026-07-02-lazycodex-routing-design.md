# LazyCodex Routing 재설계 — senior-mode

날짜: 2026-07-02
상태: 승인됨 (사용자 확인)

## 배경

senior-mode SKILL.md의 "LazyCodex Compatibility" 섹션은 트리거(`ulw`, `$ulw-plan`, `$ulw-loop`, `$start-work`)를 프롬프트 파일에 넣으라는 수준에서 끝난다. 어떤 트리거를 언제 쓸지, 브리프에 뭘 담아야 할지 정의가 없어 fable-5의 시니어 판단이 트리거 선택에 반영되지 않는다.

근거가 된 Codex 쪽 실제 구조 (OmO 4.15.1, `~/.codex/plugins/cache/sisyphuslabs/omo/4.15.1/` 설치 확인. 최초 설계는 4.13.0 캐시 기준이었으나 4.15.1 재검증 완료 — 아래 트리거 세트 모두 유효):

- `ulw`/`ultrawork` — 한 방 오케스트레이션 지시문 (목표 + Manual-QA 채널 + 검증 게이트)
- `$ulw-plan` — Prometheus 플래닝 컨설턴트. `.omo/plans/<slug>.md`에 decision-complete 플랜만 작성, 구현 금지
- `$start-work` — 승인된 플랜 실행
- `$ulw-loop` — 목표·성공기준·증거 게이트 기반 장기 멀티골 루프
- `$ulw-research` — (4.15.1 추가) 명시 요청 시에만 발동하는 최대 포화 리서치. 코드베이스+웹+공식문서+OSS 병렬 스웜, 인용 포함 종합 보고

## 결정 사항 (사용자 확인 완료)

1. **역할 분담**: fable-5는 트리거 라우팅 + 설계 브리프까지만. 상세 구현 플랜(태스크 분해, 파일별 수정 명세)은 저장소를 직접 탐색하는 Prometheus($ulw-plan) 몫.
2. **발동 조건**: LazyCodex는 지금처럼 옵셔널 유지. 쓰기로 결정된 뒤에만 라우팅 규격 적용.
3. **플랜 게이트**: $ulw-plan 산출물을 fable-5가 시니어 관점으로 검토 → 검토 요약을 사용자에게 제시 → 사용자 승인 후에만 $start-work 실행 위임.
4. **구조**: SKILL.md 인라인 확장 (레퍼런스 파일 분리 없음, 트리거별 프롬프트 템플릿 없음 — YAGNI).

## 설계

### 1. 트리거 라우팅 테이블

LazyCodex 사용 결정 후, 위임 시작 전에 fable-5가 트리거 하나를 명시적으로 선택하고 선택 이유를 한 줄 기록.

| 상황 | 트리거 | 위임 형태 |
|---|---|---|
| 범위 확정된 중간 크기 구현 (판단 여지 적음) | `ulw` | `task --write` 한 방, 브리프에 성공 기준 + QA 시나리오 |
| 크거나 모호한 작업 — 상세 플랜부터 | `$ulw-plan` | 1단계: `task --read-only`, 플랜 생성만, 구현 금지 명시 |
| 검토·승인된 플랜 실행 | `$start-work` | 2단계: `task --write`, `.omo/plans/<slug>.md` 경로 지정 |
| 장기·멀티골, 증거 게이트 필요 | `$ulw-loop` | `task --write --background` + `watch`/`status` 추적 |

애매하면 `$ulw-plan`부터 (플랜은 되돌릴 수 있고 잘못된 구현은 비쌈).

### 2. 설계 브리프 계약

기존 Delegation Prompt Contract에 LazyCodex 전용 항목 추가:

- **트리거 선언**: 프롬프트 파일 첫 줄에 트리거 단독 배치 (워드바운드 매칭 보장)
- **목표 + 성공 기준**: OmO Manual-QA 채널이 검증 가능한 형태
- **Must-NOT**: 건드리면 안 되는 파일·범위
- **완료 마커**: 보고서 마지막 줄 규격 (`wait`/`watch` 완료 판정용)
- **상세 플랜 금지선**: fable-5는 태스크 분해·파일별 수정 명세를 쓰지 않음

### 3. 2단계 흐름 ($ulw-plan → $start-work)

1. fable-5가 설계 브리프 작성 → `$ulw-plan` read-only task
2. 완료 후 fable-5가 `.omo/plans/<slug>.md` 검토: 리스크, 누락, 과설계, Must-NOT 위반
3. 검토 요약(승인 권고/수정 요구)을 사용자에게 제시 → 사용자 승인 대기
4. 승인 시 `$start-work` write task 위임, 기존 Workflow 8단계 검증으로 마무리
5. 수정 요구 시 좁힌 후속 브리프로 `$ulw-plan` 재실행 (fable-5가 플랜 파일을 직접 고치지 않음)

### 4. 유지되는 것

발동 조건(옵셔널), 설치 승인 절차(`npx lazycodex-ai install` 사용자 승인 필수), companion 스크립트 경유 원칙, `wait`/`watch`/`status`/`result` 추적 규칙.

## 변경 파일

- `SKILL.md` — "LazyCodex Compatibility" 섹션을 "LazyCodex Delegation"으로 재작성
- `README.md` / `README.en.md` — LazyCodex 섹션에 라우팅 요약 동기화
