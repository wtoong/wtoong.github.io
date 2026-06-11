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
| `constellation.html` | **학생** | 별자리 완성 게임 — 학년/학기 별자리를 골라 단원 문제를 풀고 별을 모음 |
| `constellation.js` | 별자리 게임 | 별자리 게임 엔진 (`window.ConstellationGame.init(...)`) — 별자리 렌더·출제·채점·별등급·기록 |
| `constellation.css` | 별자리 게임 | 밤하늘·별·연결선 전용 스타일 (puzzle.css/math.css 위에 얹음) |
| `data/constellations.json` | 공통 | 학년·학기별 별자리 도형(별 좌표·연결선) 데이터 |
| `puzzle.js` | 공통 | 퍼즐 엔진 (`window.JigsawPuzzle.init(...)`) |
| `puzzle.css` | 공통 | maker·study 페이지가 함께 쓰는 스타일 |
| `math-test.html` | **학생** | 수학 과제 풀기 페이지 — 선생님이 보낸 **과제 링크(범위·seed가 박힌 URL)**로 들어와 바로 풀고, 결과(요약+복원코드)를 메신저로 회신. 선택 화면 없음 |
| `math-assignment.js` | 수학 과제 | 학생 풀이 엔진 (`window.AssignmentQuiz.init(...)`) — URL 과제 파싱·출제·채점·결과/복기·결과코드·로컬캐시(하루 TTL, 같은 seed 재방문 시 복습만) |
| `math-assign.html` | 선생님 | 수학 **과제 만들기** 도구 — 범위(from~to)·단원 빼기·문제 수·seed를 정해 미리보고 학생 링크 복사. 학생 결과코드 붙여넣어 문항별 복원 |
| `math-assign.js` | 수학 과제 | 출제 도구 엔진 (`window.AssignmentMaker.init(...)`) |
| `assignment-core.js` | 공통 | 과제 공용 코어 (`window.Assignment`) — 시드 RNG로 **문제 선택+템플릿 인스턴스화를 결정적**으로(같은 seed→같은 시험지). 범위/단원 필터·라운드로빈 균등 출제·URL파라미터/결과코드 인코딩. 선생님 미리보기와 학생 풀이가 공유 |
| `question-bank.js` | 공통 | 문제 은행 로더 (`window.QuestionBank`) — 매니페스트를 읽어 필요한 (학년·학기) 샤드만 fetch |
| `question-renderer.js` | 공통 | 문제 렌더러 레지스트리 (`window.QuestionRenderer`) — 문제 카드의 문제 영역(텍스트/KaTeX/figure)과 **답안 입력 영역**(mc 보기 버튼·numeric 입력·bar-graph 위젯)을 type별 핸들러로 그리고 채점. 과제·별자리가 공유. 새 문제 유형은 `QuestionRenderer.register(type, {renderInput(q,ui), grade(q,given), wrongFeedback?, canRender?})` 핸들러 1개 등록으로 모든 페이지에 동시 추가됨 |
| `question-template.js` | 공통 | 생성형(템플릿) 문제 엔진 (`window.QuestionTemplate.instantiate(q)`) — `template`이 있는 문항을 출제 시점에 "숫자만 바뀐" 구체 문항으로 인스턴스화. 자체 안전 식 계산기(eval 미사용)·제약(거부 표집)·포맷(소수/분수). 템플릿 없으면 원본 그대로 반환 |
| `math.css` | 수학 과제 | 문제카드·결과막대·단원칩·복기리스트·결과상자·출제도구 전용 스타일 (puzzle.css 위에 얹음) |
| `data/math-curriculum.json` | 공통 | 학년/단원/세부기능 구조 (1~6학년 전 단원). 4학년은 1학기·2학기 각 6단원 모두 수록 |
| `data/questions/index.json` | 공통 | 문제 은행 샤드 매니페스트 (샤드 파일·포함 unitId·문항 수) |
| `data/questions/g{학년}-s{학기}.json` | 공통 | (학년·학기)별 문제 은행 샤드 (mc·numeric, grade/unitId/skillId 태깅) |
| `data/math-question-builder.html` | 선생님 | 문제를 추가해 샤드(`gX-sY.json`) 생성/편집 |
| `data/math-llm-prompt.html` | 선생님 | 채팅형 LLM(Claude·ChatGPT 등)에 붙여넣을 **출제 프롬프트 생성기**. 학년·학기·단원·원하는 문제를 적으면 문제 은행 JSON 포맷·템플릿 명세·교육과정(unitId/skillId) 컨텍스트가 담긴 프롬프트를 생성. 현재 렌더러(mc/numeric/latex)로 표현 안 되는 문제는 "불가" 대신 **새 type 설계 + 렌더링 구현 명세(클로드코드 요청문 포함)**를 내놓도록 강제 |
| `data/math-verification.html` | 선생님 | 단원·세부기능별 문제 수와 빠진 유형(0개)·orphan 문항을 점검하는 검증 페이지 |
| `data/dataset-builder.html` | 선생님 | 교과 이미지 URL을 모아 `curriculum-images.json` 생성 |
| `data/curriculum-images.json` | 공통 | 교과 과정 이미지 데이터셋 |

### 동작 방식
- 선생님이 `jigsaw-puzzle.html`에서 이미지(업로드 또는 공개 URL)와 가로/세로
  조각 수를 정함 → "학습용 링크 만들기"로 `study.html?img=...&cols=..&rows=..` 링크 생성.
- 학생은 그 링크를 열어 `study.html`에서 퍼즐을 풂 (locked 모드).
- 빌드/번들러 없음. 파일을 직접 열거나 정적 서버로 서빙.

### 수학 과제(시험지) 동작 방식
- **DB 없음**: 결과 영속화는 학생→선생님 **메신저 회신**(요약+복원코드)과 학생 로컬캐시(하루)뿐.
- **선생님이 과제를 고정**: `math-assign.html`에서 **범위(from~to)**(예: 1학년1학기~4학년1학기)를
  고르고, 학기를 펼쳐 **빼고 싶은 단원만 제거**(기본=범위 전체 포함). 문제 수(5~30)와
  **seed**(🎲 랜덤 또는 직접 입력)를 정함. "미리보기"로 그 seed의 실제 문제 구성을 확인 →
  맘에 들면 **링크 복사**(`math-test.html?from=1-1&to=4-1&drop=2-3,3-1&n=10&seed=837261`)해 배포.
- **seed = 시험지 한 장**: `assignment-core.js`(`window.Assignment`)가 시드 RNG(mulberry32)로
  **문제 선택과 템플릿 인스턴스화를 모두 결정적**으로 만들어, 같은 (범위·제외·문제수·seed)면
  선생님 미리보기와 모든 학생이 **똑같은 문제**를 본다. 선택은 단원별로 묶어 **라운드로빈**으로
  골고루 뽑음(한 단원이 독점하지 않음).
- 누적 순위는 `(학년-1)×2 + 학기`로 매김(1학년1학기=1 … 6학년2학기=12).
  단원의 학기는 `math-curriculum.json`의 `semester` 필드(없으면 1~2번=1학기, 3번 이상=2학기 추정).
- **학생 흐름**: 받은 링크 열기 → (선택 화면 없이) 바로 풀기 → 결과 화면(정답률·약점 단원·문제 복기).
  `math-test.html`은 과제 파라미터가 없으면 "선생님 링크로 들어와줘" 안내만 띄움.
- **결과 회신**: 결과 화면의 "결과 보내기 📋"가 **요약 + 복원코드(base64)**를 클립보드로 복사.
  학생이 메신저로 붙여 보내면, 선생님은 `math-assign.html` 하단에 붙여넣어 **문항별로
  무엇을 풀었고 맞았는지 복원**(같은 seed로 시험지 재생성 후 학생 답 zip).
- **로컬 캐시**: `localStorage`(키 `math-assignment-cache-v1`)에 seed별 결과 저장. 읽을 때
  **24시간 지난 항목 자동 삭제**. 같은 seed 링크를 다시 열면 새로 풀지 않고 **이전 결과+복습만** 보여줌.
- **문제 은행 샤딩**: 문제는 `data/questions/g{학년}-s{학기}.json` 샤드로 나뉘고
  `data/questions/index.json`(매니페스트)에 목록이 있음. `question-bank.js`(`QuestionBank`)가
  매니페스트를 먼저 읽고 **필요한 샤드만** fetch(과제 범위 안 단원 샤드).
  과제·별자리 게임·빌더·검증 페이지가 모두 이 로더를 공유.
  (`data/` 안의 페이지는 `QuestionBank.basePath='questions/'`로 설정.)
- 단원/세부기능 구조는 `data/math-curriculum.json`. 선생님이 `data/math-question-builder.html`(GUI)로
  문제를 추가해 샤드로 저장하고, `data/math-verification.html`로 빠진 유형(0개 세부기능)·orphan을 점검.
  직접 편집 또는 Claude에게 요청해 등록·확장도 가능.
- **생성형(템플릿) 문항**: 학생이 답을 외우지 못하게, 포맷은 같고 숫자만 매번 바뀌는 문항을
  지원. 문항에 `template`을 넣으면(고정 문항과 한 샤드에 자유롭게 섞임) 출제 시점에
  `question-template.js`가 변수를 범위에서 뽑아 **구체값으로 인스턴스화**한다. `template`이
  없으면 기존 고정 문항과 100% 동일하게 동작(하위호환). 과제·별자리 모두 문제를 뽑아
  `quizList`에 넣는 순간 `QuestionTemplate.instantiate(q)`를 거친다.
  - `template` 필드: `vars`(정수 변수 `{min,max,step?}`), `constraints`(불리언 식 배열 —
    모두 참이어야 채택, 음수 방지 `a >= b`·정확한 나눗셈 등을 표현), `derived`(파생값),
    `prompt`(`{이름}` 자리표시자), `format`/`promptParts`(소수 `dec:N`·분수 `frac`·대분수 `mixed`·한글읽기 `korean`),
    `answer`(numeric=산술식, mc는 `choices[0]`이 정답), `choices`(mc, 0번=정답·나머지 오답 유인지),
    `tolerance`(소수 오차).
  - 식 계산기는 **eval 미사용** 자체 파서. 함수는 화이트리스트(`floor,ceil,round,abs,gcd,lcm,
    min,max,pow`)만. 제약 불만족이면 재추첨(최대 200회), 못 찾으면 `__templateFailed`로 폴백.
  - 작성은 당분간 샤드 JSON 직접 편집(예시: 4학년 `q-t-*` 문항). `data/math-verification.html`의
    **"🎲 템플릿 문항 점검"** 버튼으로 생성 오류(정답이 보기에 없음·음수·자리표시자 미치환 등)를
    출제 전에 일괄 점검할 수 있음.

### 별자리 완성 게임 동작 방식
- **목표**: 단원 문제를 풀어 별을 켜고 학년·학기 별자리를 완성. 첫 진입 시 12개
  (6학년×2학기) 별자리가 모두 보이는 **전체 밤하늘**이 떠, 밤하늘 전체 채우기가 메타 목표.
- **별 = 단원(unitId)**. 학년·학기를 고르면 그 학기의 단원들이 별자리의 별로 매핑됨
  (별 배열 인덱스 순서대로, 단원=별). 매핑은 `constellation.js`가 렌더 시점에 동적으로 함.
  - 단원 수 < 별 수 → 남는 별은 **장식 별**(흐릿·반짝, 클릭 불가).
  - 단원 수 > 별 수 → 부족분만큼 별 좌표를 자동 생성(`extraStarPos`)해 **모든 단원을 반드시 표시**.
  단원이 추가/수정돼도 깨지지 않게 설계됨. 별자리 도형은 `data/constellations.json`(별 좌표·연결선)에만 정의.
- **별 등급(후하게)**: 한 단원을 풀면 정답률 → 별 1~3개. `<40%`=0(미점등),
  `≥40%`=⭐, `≥70%`=⭐⭐, `≥90%`=⭐⭐⭐. 등급이 오를수록 별 색이 화려해짐
  (0 점선 빈별 → 1 하늘색 → 2 황금 → 3 분홍↔보라 무지개). **최고기록 갱신만** 저장.
- **출제**: `QuestionBank.loadByUnits([unitId])`로 그 단원 샤드를 불러와 문제를 섞어 최대 `QUESTIONS_PER_PLAY`(=5)개.
  채점·문제카드는 공용 렌더러(`question-renderer.js`)를 과제와 함께 사용(스타일 `.q-card` 등 동일).
- **기록 저장**: `localStorage`(키 `constellation-progress-v1`)에 단원별 최고 별등급 저장.
  "내 별 내보내기"로 JSON 다운로드, "별 불러오기"로 업로드(더 높은 등급 우선 병합).
  과제 결과코드와 형식이 다름(`_meta.kind: 'constellation-progress'`).

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

## 작업 효율(토큰 절약) — Claude 참고

이 저장소는 **빌드 없는 작은 정적 사이트**라 대부분의 변경은 가볍습니다.
불필요하게 무거운 워크플로로 토큰을 낭비하지 마세요.

- **규모에 맞는 워크플로**: "모듈 1개 추가/소규모 편집" 수준이면 Explore+Plan
  다단계 에이전트 없이 직접 `Grep`/`Read`로 진행하세요. 플랜 워크플로는 구조가
  불확실하거나 여러 영역에 걸칠 때만.
- **서브에이전트는 결론만 간결히**: Explore/Plan 리포트는 **전문이 그대로**
  컨텍스트로 돌아옵니다. 꼭 쓸 땐 "결론·핵심 경로만 불릿으로" 요청하고, 전체 JSON
  예시·필드 표·긴 코드 인용을 통째로 받지 마세요.
- **큰 파일은 부분만**: JSON 샤드 전체·긴 HTML을 통째로 `Read` 하지 말고 `Grep`으로
  해당 줄만, 또는 `offset/limit`로 필요한 구간만. 이미 읽은 파일은 다시 읽지 마세요.
- **계획서 길이**: 플랜 파일은 승인 시 전문이 한 번 더 되돌아오므로 간결하게.
- **문제 은행 탐색 지름길**: 파일 구조가 고정이므로 전체 grep 없이 직접 접근하세요.
  - 학년·학기 알면 → `data/questions/g{학년}-s{학기}.json` 바로 열기
  - 문제 ID 알면 → 해당 샤드 파일 하나만 grep (전체 파일 grep 금지)
  - 단원(unitId) 알면 → 해당 샤드 파일에서 `"unitId": "X-Y"` grep 한 방
  - 커리큘럼 구조(단원명·skillId)는 대화 맥락에 이미 나왔으면 `math-curriculum.json` 재확인 불필요
