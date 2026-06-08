# CLAUDE.md

이 저장소에서 작업할 때 Claude(및 다른 기여자)가 따라야 할 안내 문서입니다.

## 프로젝트 개요

초등학생을 위한 **직소 퍼즐 학습 웹앱**입니다. 정적 사이트(GitHub Pages)로,
빌드 과정 없이 순수 HTML/CSS/JS로 동작합니다.

### 주요 파일

| 파일 | 대상 | 설명 |
|------|------|------|
| `index.html` | 모두 | 메인 랜딩 페이지 (놀이터 입구) |
| `study.html` | **학생** | 선생님이 보내준 링크로 퍼즐을 푸는 페이지 |
| `jigsaw-puzzle.html` | 선생님 | 사진·크기를 정해 퍼즐을 만들고 학습용 링크를 생성 |
| `memory.html` | **학생** | 카드 뒤집기 메모리 게임 (이모지·교과 그림 짝 맞추기) |
| `memory.js` | 메모리 게임 | 메모리 게임 엔진 (`window.MemoryGame.init(...)`) |
| `memory.css` | 메모리 게임 | 카드판·3D 뒤집기 전용 스타일 (puzzle.css 위에 얹음) |
| `puzzle.js` | 공통 | 퍼즐 엔진 (`window.JigsawPuzzle.init(...)`) |
| `puzzle.css` | 공통 | maker·study 페이지가 함께 쓰는 스타일 |
| `math-test.html` | **학생** | 수학 레벨 진단 페이지 (문제 풀기 → 레포트 → 결과 JSON 저장/불러오기) |
| `math-diagnostic.js` | 수학 진단 | 진단 엔진 (`window.MathDiagnostic.init(...)`) — 출제·채점·학년추정·약점분석·레포트 |
| `math.css` | 수학 진단 | 시작화면·문제카드·결과막대 전용 스타일 (puzzle.css 위에 얹음) |
| `data/math-curriculum.json` | 공통 | 학년/단원/세부기능 구조 (1~6학년 전 단원) |
| `data/math-questions.json` | 공통 | 수학 진단 문제 은행 (mc·numeric, grade/unitId/skillId 태깅) |
| `data/math-question-builder.html` | 선생님 | 진단 문제를 추가해 `math-questions.json` 생성 |
| `data/dataset-builder.html` | 선생님 | 교과 이미지 URL을 모아 `curriculum-images.json` 생성 |
| `data/curriculum-images.json` | 공통 | 교과 과정 이미지 데이터셋 |

### 동작 방식
- 선생님이 `jigsaw-puzzle.html`에서 이미지(업로드 또는 공개 URL)와 가로/세로
  조각 수를 정함 → "학습용 링크 만들기"로 `study.html?img=...&cols=..&rows=..` 링크 생성.
- 학생은 그 링크를 열어 `study.html`에서 퍼즐을 풂 (locked 모드).
- 빌드/번들러 없음. 파일을 직접 열거나 정적 서버로 서빙.

### 수학 레벨 진단 동작 방식
- **DB 없음**: 결과 영속화는 레포트 JSON 파일(다운로드/업로드)이 전부. 학생이 파일을 들고 다님.
- 학생이 `math-test.html`을 열어 **전 학년(1~6)·전 단원을 골고루 섞은** 문제를 풂.
  선생님이 학년·단원 범위를 고르지 않는다 — 시스템이 답을 보고 **학년 수준을 역추정**
  (하위부터 연속 정답률 ≥70%인 최고 학년)하고 **약점 단원**(오답률 ≥50%, 2문항 이상)을 뽑음.
- 평가 끝 → "결과 저장하기"로 누적 이력이 담긴 레포트 JSON 다운로드.
- 재평가 때 그 파일을 업로드하면 누적 오답률로 약한 단원에 가중치(`1 + 3×오답률`)를 줘
  그 단원 문제가 더 자주 나옴(적응형). 레포트 업로드 유무로 자동 전환.
- 문제 은행/단원 구조는 정적 JSON. 선생님이 `data/math-question-builder.html`(GUI),
  직접 편집, 또는 Claude에게 요청해 등록·확장.

## 디자인 원칙 — 아기자기하게 (초등학생 대상)

이 사이트는 **초등학생이 사용하는 페이지**입니다. UI를 만들거나 수정할 때는
항상 밝고 귀엽고(아기자기한) 친근한 느낌을 유지하세요.

- **폰트**: 둥글둥글한 한글 폰트 사용 (`Jua`, `Gaegu`). 딱딱한 고딕체 지양.
- **색감**: 사탕 같은 파스텔 팔레트
  (분홍 `#ff8fb1`, 노랑 `#ffd86b`, 민트 `#7fd8be`, 하늘 `#8ec5ff`, 보라 `#c79bff`).
  `puzzle.css`의 `:root` CSS 변수(`--candy-*`)를 재사용하세요.
- **모양**: 큼직한 둥근 모서리(border-radius 20px+), 알약 모양 버튼,
  점선 테두리, 폭신한 그림자.
- **버튼**: 아래쪽 입체 그림자로 "눌리는" 느낌 + hover 시 통통 튀는 효과.
- **이모지**: 제목·버튼·메시지에 친근한 이모지 적극 활용 (🧩🌈✨🎨📚).
- **문구**: 어린이가 이해하기 쉬운 친근한 반말/존댓말 톤으로.
  딱딱한 안내문 대신 "조각을 콕 집어서 제자리에 쏙! 넣어보자 ✨" 같은 표현.
- **애니메이션**: 둥실둥실 떠다니거나(`float`), 통통 튀는(`pop-bounce`)
  부드럽고 즐거운 모션. 과하지 않게.
- 칭찬·격려 메시지를 아끼지 말기 (예: 퍼즐 완성 시 "우와! 정말 잘했어요!").

선생님용 도구 페이지(`jigsaw-puzzle.html`)도 학생이 흘끗 볼 수 있으니 같은
귀여운 톤을 유지합니다. `data/dataset-builder.html`은 순수 관리자 도구라
실용적인 대시보드 스타일을 유지해도 됩니다.

## 작업 시 주의사항

- `puzzle.css`의 클래스/요소 선택자(`.controls`, `.row`, `.message`,
  `.link-output.show`, `canvas`, `button`, `button.secondary`,
  `input[type=...]`)는 `puzzle.js`와 각 HTML이 의존합니다. 이름을 함부로 바꾸지 마세요.
- 캔버스 크기는 `puzzle.js`의 `layout()`에서 직접 지정하므로 CSS에서
  고정 크기를 주지 마세요.
- 빌드 도구가 없으므로 외부 라이브러리는 CDN으로 lazy load 합니다
  (예: HEIC 변환용 `libheif`).
- 변경 후 실제 브라우저에서 동작을 확인하세요.
