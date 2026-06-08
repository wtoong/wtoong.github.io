/* 수학 진단평가(레벨 테스트) 엔진
   🧮 선생님/학생이 고른 "학년·학기까지 누적" 범위에서 문제를 골고루(단원은 랜덤) 내고,
      그 범위 안에서 정답률과 약한 단원을 진단한다.
      예) 4학년 1학기를 고르면 → 1학년 1학기 ~ 4학년 1학기까지의 단원에서만 출제.
      DB가 없으므로 결과는 레포트 JSON 파일로 내보내고(다운로드),
      재평가 때 그 파일을 불러오면 자주 틀린 단원에 가중치를 줘 더 많이 출제한다.
   window.MathDiagnostic.init(...) 로 시작한다 (memory.js의 컨벤션). */
(function () {
    'use strict';

    const QUESTIONS_URL  = 'data/math-questions.json';
    const CURRICULUM_URL = 'data/math-curriculum.json';

    const WEIGHT_K = 3;        // 약점 단원 가중치 세기: w = 1 + K * 오답률
    const RECENCY_DECAY = 0.6; // 최근 학기일수록 ↑ : 한 학기 멀어질 때마다 가중치 ×0.6
    const MIN_PER_LEVEL = 1;   // 각 학기(학년·학기)에 최소 보장하는 문항 수

    // ── 작은 유틸 (memory.js와 동일) ─────────────────────────────
    function shuffle(arr) { // Fisher–Yates
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function el(tag, className, text) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text != null) e.textContent = text;
        return e;
    }

    // 단원번호로 학기 추정 (curriculum에 semester가 없을 때 대비): 1~2번=1학기, 3번 이상=2학기
    function deriveSemester(unitId) {
        const n = parseInt(String(unitId).split('-')[1], 10);
        return n >= 3 ? 2 : 1;
    }
    // (학년, 학기) → 누적 순위. 1학년1학기=1, 1학년2학기=2, 2학년1학기=3 ... 6학년2학기=12
    function levelRank(grade, semester) {
        return (grade - 1) * 2 + (semester === 2 ? 2 : 1);
    }

    function init(opts) {
        const {
            startEl, nameInput, countButtons, gradeButtons, semButtons,
            levelSummaryEl, importInput, startBtn,
            quizEl, progressEl, questionEl,
            reportEl, downloadBtn, restartBtn, messageEl,
        } = opts;

        // ── 데이터 캐시 ──────────────────────────────────────────
        let bankCache = null;          // 문제 은행
        let curriculumCache = null;    // 교육과정 구조
        let unitNameMap = {};          // unitId -> 단원 이름
        let unitGradeMap = {};         // unitId -> 학년
        let unitSemesterMap = {};      // unitId -> 학기(1|2)

        // ── 진행 상태 ────────────────────────────────────────────
        const params = new URLSearchParams(location.search);
        // ?count=30 같은 편의 파라미터로 기본 문제 수 미리 선택 (20/30/40만 허용)
        const urlCount = parseInt(params.get('count'), 10);
        let questionCount = [20, 30, 40].includes(urlCount) ? urlCount : 20;
        // ?grade=4&sem=1 로 출제 범위(누적 레벨) 미리 고정. 없으면 전체(6학년 2학기).
        const urlGrade = parseInt(params.get('grade'), 10);
        const urlSem   = parseInt(params.get('sem'), 10);
        let targetGrade = [1, 2, 3, 4, 5, 6].includes(urlGrade) ? urlGrade : 6;
        let targetSem   = [1, 2].includes(urlSem) ? urlSem : 2;

        let prevReport = null;       // 불러온 이전 레포트(재평가용)
        let quizList = [];           // 이번 회차 출제 문제
        let answers = [];            // [{qId, unitId, grade, given, correct}]
        let cursor = 0;
        let currentReport = null;    // 내보낼 누적 레포트

        // ── 데이터 로드 ──────────────────────────────────────────
        async function loadData() {
            if (bankCache && curriculumCache) return true;
            try {
                const [qRes, cRes] = await Promise.all([
                    fetch(QUESTIONS_URL), fetch(CURRICULUM_URL),
                ]);
                if (!qRes.ok || !cRes.ok) return false;
                bankCache = await qRes.json();
                curriculumCache = await cRes.json();
                buildMaps();
                return true;
            } catch (e) {
                return false;
            }
        }

        function buildMaps() {
            (curriculumCache.grades || []).forEach(g => {
                (g.units || []).forEach(u => {
                    unitNameMap[u.unitId] = u.unitName;
                    unitGradeMap[u.unitId] = g.grade;
                    unitSemesterMap[u.unitId] = u.semester || deriveSemester(u.unitId);
                });
            });
            // 문제에만 있는 단원도 보강 (커리큘럼 누락 대비)
            (bankCache.questions || []).forEach(q => {
                if (unitGradeMap[q.unitId] == null) unitGradeMap[q.unitId] = q.grade;
                if (unitNameMap[q.unitId] == null)  unitNameMap[q.unitId] = q.unitId;
                if (unitSemesterMap[q.unitId] == null) unitSemesterMap[q.unitId] = deriveSemester(q.unitId);
            });
        }

        // 문제의 누적 순위 (학년·학기)
        function questionRank(q) {
            return levelRank(unitGradeMap[q.unitId] || q.grade, unitSemesterMap[q.unitId] || 1);
        }

        // ── 문제 선택: 누적 범위 + 최근 학기 가중 + 학기별 최소 보장 ──
        //   · 최근 학기일수록 더 자주(가중치 ×RECENCY_DECAY^거리), 저학년은 참고용으로 적게.
        //   · 단, 범위 안 각 학기는 최소 MIN_PER_LEVEL개 보장(1학년 1학기가 0개로 묻히지 않게).
        //   · 약점 단원 가중치(1 + K×오답률)는 그 위에 곱해서 함께 반영.
        function selectQuestions(count, weights, maxRank) {
            // 선택 범위 안의 문제만 (1학년 1학기 ~ 목표 학년·학기)
            const all = (bankCache.questions || []).filter(q => questionRank(q) <= maxRank);
            const pool = {};            // unitId -> 남은 문제(셔플됨)
            all.forEach(q => { (pool[q.unitId] = pool[q.unitId] || []).push(q); });
            Object.keys(pool).forEach(u => { pool[u] = shuffle(pool[u]); });

            // 단원 -> 학기 순위(rank). 범위 안에 실제 문제가 있는 학기 목록도 모은다.
            const unitRank = {};
            Object.keys(pool).forEach(u => {
                unitRank[u] = levelRank(unitGradeMap[u] || 0, unitSemesterMap[u] || 1);
            });
            const levelRanks = [...new Set(Object.keys(pool).map(u => unitRank[u]))];

            // 학기별 남은 문제 수
            const availOf = r => Object.keys(pool)
                .filter(u => unitRank[u] === r)
                .reduce((s, u) => s + pool[u].length, 0);

            // 학기별 최소 보장(quota) — 그 학기 문제 수로 상한
            const quota = {};
            levelRanks.forEach(r => { quota[r] = Math.min(MIN_PER_LEVEL, availOf(r)); });

            // 가중치 = 최근 학기 가중(×decay^거리) × 약점 단원 가중
            const recency = r => Math.pow(RECENCY_DECAY, Math.max(0, maxRank - r));
            const unitWeight = u => recency(unitRank[u]) * (1 + WEIGHT_K * ((weights && weights[u]) || 0));

            function stockUnits(rankSet) {
                return Object.keys(pool).filter(u =>
                    pool[u].length && (!rankSet || rankSet.has(unitRank[u])));
            }
            function roulette(units) {
                const total = units.reduce((s, u) => s + unitWeight(u), 0);
                let r = Math.random() * total;
                for (const u of units) { r -= unitWeight(u); if (r <= 0) return u; }
                return units[units.length - 1];
            }
            function take(u) {
                chosen.push(pool[u].pop());
                const r = unitRank[u];
                if (quota[r] > 0) quota[r]--; // 뽑힌 학기의 보장분에서 깐다
            }

            const chosen = [];
            while (chosen.length < count) {
                const units = stockUnits();
                if (!units.length) break;
                const remainingDraws = count - chosen.length;

                // 아직 못 채운 최소보장 합(남은 문제 수로 상한)과, 그 학기들의 집합
                let unmetSum = 0; const unmetRanks = new Set();
                levelRanks.forEach(r => {
                    if (quota[r] <= 0) return;
                    const need = Math.min(quota[r], availOf(r));
                    if (need > 0) { unmetSum += need; unmetRanks.add(r); }
                });

                // 남은 자리수가 보장분과 같아지면(=더는 여유 없음) 그때부터 보장분만 채운다
                if (remainingDraws <= unmetSum) {
                    const forced = stockUnits(unmetRanks);
                    take(roulette(forced.length ? forced : units));
                } else {
                    take(roulette(units)); // 평소엔 최근 가중 랜덤
                }
            }

            let note = '';
            if (!all.length) {
                note = '이 범위에는 아직 문제가 없어요 😢 선생님께 알려주세요!';
            } else if (chosen.length < count) {
                note = `이 범위에 문제가 ${count}개보다 적어서 ${chosen.length}개만 풀어요! 😊`;
            }
            return { questions: shuffle(chosen), note };
        }

        // ── 채점 ─────────────────────────────────────────────────
        function gradeAnswer(q, given) {
            if (given == null || given === '') return false;
            if (q.type === 'numeric') {
                const val = parseFloat(String(given).replace(/\s/g, '').replace(',', '.'));
                if (isNaN(val)) return false;
                const tol = q.tolerance || 0;
                return Math.abs(val - q.answer) <= tol;
            }
            return String(given).trim() === String(q.answer).trim();
        }

        // ── 집계 ─────────────────────────────────────────────────
        function aggregate(list) {
            const perUnit = {}, perGrade = {};
            list.forEach(a => {
                const u = perUnit[a.unitId] = perUnit[a.unitId] ||
                    { asked: 0, correct: 0, unitName: unitNameMap[a.unitId] || a.unitId };
                u.asked++; if (a.correct) u.correct++;
                const g = perGrade[a.grade] = perGrade[a.grade] || { asked: 0, correct: 0 };
                g.asked++; if (a.correct) g.correct++;
            });
            Object.values(perUnit).forEach(u => {
                u.errorRate = u.asked ? (u.asked - u.correct) / u.asked : 0;
            });
            Object.values(perGrade).forEach(g => {
                g.accuracy = g.asked ? g.correct / g.asked : 0;
            });
            const weakUnits = Object.keys(perUnit)
                .filter(u => perUnit[u].errorRate >= 0.5 && perUnit[u].asked >= 2)
                .sort((a, b) => perUnit[b].errorRate - perUnit[a].errorRate);
            return { perUnit, perGrade, weakUnits };
        }

        // ── 선택 범위 정답률에 따른 한줄평 ───────────────────────
        function rangeNote(accuracy) {
            if (accuracy >= 0.9) return '와! 이 범위는 완전히 자신 있어요 🚀 다음 학기에도 도전해봐요!';
            if (accuracy >= 0.7) return '이 범위를 잘 이해하고 있어요! 👍 조금만 더 다지면 완벽해요.';
            if (accuracy >= 0.5) return '거의 다 왔어요! 약한 단원만 더 연습하면 탄탄해질 거예요 🌱';
            return '약한 단원부터 차근차근 연습해봐요. 할 수 있어요 💪';
        }

        // ── 레포트(누적) 만들기 ──────────────────────────────────
        function buildReport(prev, session, studentLabel) {
            const sessions = (prev && Array.isArray(prev.sessions)) ? prev.sessions.slice() : [];
            sessions.push(session);
            const perUnit = {};
            sessions.forEach(s => {
                Object.keys(s.perUnit || {}).forEach(u => {
                    const c = perUnit[u] = perUnit[u] ||
                        { asked: 0, correct: 0, unitName: s.perUnit[u].unitName || unitNameMap[u] || u };
                    c.asked += s.perUnit[u].asked;
                    c.correct += s.perUnit[u].correct;
                });
            });
            Object.values(perUnit).forEach(c => {
                c.errorRate = c.asked ? (c.asked - c.correct) / c.asked : 0;
            });
            const label = studentLabel || (prev && prev._meta && prev._meta.studentLabel) || '';
            return {
                _meta: {
                    kind: 'math-diagnostic-report', version: 2,
                    studentLabel: label, exported: new Date().toISOString(),
                },
                sessions,
                cumulative: { perUnit },
            };
        }

        // ── 화면 전환 헬퍼 ───────────────────────────────────────
        function show(node) { node.classList.remove('hidden'); }
        function hide(node) { node.classList.add('hidden'); }

        // ── 문제 렌더링 ──────────────────────────────────────────
        function renderQuestion() {
            const q = quizList[cursor];
            progressEl.textContent = `${cursor + 1} / ${quizList.length}`;
            questionEl.innerHTML = '';

            const card = el('div', 'q-card');
            card.appendChild(el('div', 'q-grade-badge',
                `${unitGradeMap[q.unitId]}학년 · ${unitNameMap[q.unitId] || q.unitId}`));
            card.appendChild(el('div', 'q-prompt', q.prompt));

            const answersWrap = el('div', 'q-answers');
            const feedback = el('div', 'q-feedback');
            const nextBtn = el('button', '', cursor === quizList.length - 1 ? '결과 보기 🎉' : '다음 문제 ➡️');
            nextBtn.classList.add('hidden');

            function finishQuestion(given) {
                const correct = gradeAnswer(q, given);
                answers.push({ qId: q.id, unitId: q.unitId, grade: q.grade, given, correct });
                answersWrap.querySelectorAll('button, input').forEach(n => n.disabled = true);
                feedback.textContent = correct
                    ? '정답이에요! 🎉'
                    : `아쉬워요! 정답은 "${q.answer}" 예요.`;
                feedback.classList.add(correct ? 'ok' : 'no');
                show(nextBtn);
                nextBtn.focus();
            }

            if (q.type === 'mc') {
                shuffle(q.choices).forEach(choice => {
                    const b = el('button', 'choice-btn', choice);
                    b.type = 'button';
                    b.addEventListener('click', () => finishQuestion(choice));
                    answersWrap.appendChild(b);
                });
            } else { // numeric
                const inputRow = el('div', 'q-input-row');
                const input = document.createElement('input');
                input.type = 'text';
                input.inputMode = 'decimal';
                input.className = 'q-num-input';
                input.placeholder = '답을 적어요';
                const ok = el('button', 'secondary', '확인 ✏️');
                ok.type = 'button';
                const submit = () => { if (input.value.trim() !== '') finishQuestion(input.value); };
                ok.addEventListener('click', submit);
                input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
                inputRow.appendChild(input);
                inputRow.appendChild(ok);
                answersWrap.appendChild(inputRow);
                setTimeout(() => input.focus(), 0);
            }

            nextBtn.addEventListener('click', () => {
                cursor++;
                if (cursor < quizList.length) renderQuestion();
                else finishQuiz();
            });

            card.appendChild(answersWrap);
            card.appendChild(feedback);
            card.appendChild(nextBtn);
            questionEl.appendChild(card);
        }

        // ── 평가 종료 → 레포트 ───────────────────────────────────
        function finishQuiz() {
            const { perUnit, perGrade, weakUnits } = aggregate(answers);
            const studentLabel = (nameInput.value || '').trim();
            const totalCorrect = answers.filter(a => a.correct).length;

            const session = {
                sessionId: 's-' + Date.now(),
                date: new Date().toISOString().slice(0, 10),
                config: { questionCount: quizList.length, targetGrade, targetSem },
                totalCorrect, totalAnswered: answers.length,
                perUnit, perGrade, weakUnits,
                answers,
            };
            currentReport = buildReport(prevReport, session, studentLabel);

            hide(quizEl);
            show(reportEl);
            renderReport(session, studentLabel);
            downloadBtn.disabled = false;
        }

        function renderReport(session, studentLabel) {
            reportEl.querySelector('.report-body').innerHTML = '';
            const body = reportEl.querySelector('.report-body');

            const who = studentLabel ? `${studentLabel} 친구의 ` : '';
            body.appendChild(el('h2', 'report-title', `${who}진단 결과 📋`));

            const accuracy = session.totalAnswered ? session.totalCorrect / session.totalAnswered : 0;
            const pct = Math.round(accuracy * 100);
            const rangeLabel = `1학년 1학기 ~ ${session.config.targetGrade}학년 ${session.config.targetSem}학기`;

            // 출제 범위 + 정답률 + 한줄평
            const hero = el('div', 'report-hero');
            hero.appendChild(el('div', 'report-range', `📚 ${rangeLabel} 범위`));
            hero.appendChild(el('div', 'report-grade', `정답률 ${pct}%`));
            hero.appendChild(el('div', 'report-note', rangeNote(accuracy)));
            hero.appendChild(el('div', 'report-score',
                `맞힌 문제: ${session.totalCorrect} / ${session.totalAnswered}`));
            body.appendChild(hero);

            // 학년별 정확도 막대 (선택 범위 안의 학년만)
            body.appendChild(el('h3', 'report-h3', '학년별 정답률 📊'));
            const gradeWrap = el('div', 'bar-wrap');
            for (let g = 1; g <= session.config.targetGrade; g++) {
                const gd = session.perGrade[g];
                if (!gd) continue;
                const gpct = Math.round(gd.accuracy * 100);
                const row = el('div', 'bar-row');
                row.appendChild(el('span', 'bar-label', `${g}학년`));
                const track = el('div', 'bar-track');
                const fill = el('div', 'bar-fill');
                fill.style.width = gpct + '%';
                if (gpct < 50) fill.classList.add('low');
                else if (gpct < 70) fill.classList.add('mid');
                track.appendChild(fill);
                row.appendChild(track);
                row.appendChild(el('span', 'bar-pct', `${gpct}% (${gd.correct}/${gd.asked})`));
                gradeWrap.appendChild(row);
            }
            body.appendChild(gradeWrap);

            // 약점 단원
            body.appendChild(el('h3', 'report-h3', '더 연습하면 좋은 단원 🎯'));
            if (session.weakUnits.length) {
                const ul = el('ul', 'weak-list');
                session.weakUnits.forEach(u => {
                    const pu = session.perUnit[u];
                    const ppct = Math.round(pu.errorRate * 100);
                    ul.appendChild(el('li', null,
                        `${unitGradeMap[u]}학년 · ${pu.unitName} — 틀린 비율 ${ppct}% (${pu.correct}/${pu.asked} 맞힘)`));
                });
                body.appendChild(ul);
            } else {
                body.appendChild(el('p', 'weak-none', '약한 단원이 거의 없어요! 정말 잘했어요 🌈'));
            }

            // 누적 안내
            const totalSessions = currentReport.sessions.length;
            body.appendChild(el('p', 'report-hint',
                `이 결과를 "결과 저장하기"로 내려받아 두면, 다음에 불러올 때 자주 틀린 단원이 더 많이 나와요. ` +
                `(지금까지 평가 횟수: ${totalSessions}번)`));
        }

        // ── 내보내기 / 불러오기 ─────────────────────────────────
        function exportReport() {
            if (!currentReport) return;
            const blob = new Blob([JSON.stringify(currentReport, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const label = (currentReport._meta.studentLabel || '학생').replace(/\s+/g, '');
            a.download = `math-report-${label}-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
        }

        function importReportFile(file) {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    if (!data || data._meta?.kind !== 'math-diagnostic-report') {
                        throw new Error('진단 레포트 파일이 아니에요');
                    }
                    prevReport = data;
                    const n = (data.sessions || []).length;
                    const label = data._meta.studentLabel;
                    if (label && !nameInput.value) nameInput.value = label;
                    messageEl.textContent =
                        `📂 이전 결과를 불러왔어요! (평가 ${n}번 기록) 약했던 단원이 더 많이 나와요 ✨`;
                } catch (e) {
                    prevReport = null;
                    messageEl.textContent = '앗! 올바른 진단 결과 파일이 아니에요 😢';
                }
            };
            reader.readAsText(file);
        }

        // ── 컨트롤 연결 ──────────────────────────────────────────
        function syncCountButtons() {
            countButtons.forEach(b =>
                b.classList.toggle('active', parseInt(b.dataset.count, 10) === questionCount));
        }
        function syncLevelButtons() {
            gradeButtons.forEach(b =>
                b.classList.toggle('active', parseInt(b.dataset.grade, 10) === targetGrade));
            semButtons.forEach(b =>
                b.classList.toggle('active', parseInt(b.dataset.sem, 10) === targetSem));
            if (levelSummaryEl) {
                levelSummaryEl.innerHTML =
                    `지금 고른 범위: <b>${targetGrade}학년 ${targetSem}학기</b>까지 누적 📚`;
            }
        }

        countButtons.forEach(b => b.addEventListener('click', () => {
            questionCount = parseInt(b.dataset.count, 10) || 20;
            syncCountButtons();
        }));
        gradeButtons.forEach(b => b.addEventListener('click', () => {
            targetGrade = parseInt(b.dataset.grade, 10) || 6;
            syncLevelButtons();
        }));
        semButtons.forEach(b => b.addEventListener('click', () => {
            targetSem = parseInt(b.dataset.sem, 10) || 1;
            syncLevelButtons();
        }));

        importInput.addEventListener('change', e => {
            if (e.target.files && e.target.files[0]) importReportFile(e.target.files[0]);
        });

        async function startQuiz() {
            messageEl.textContent = '문제를 준비하는 중이에요... 🧮';
            const ready = await loadData();
            if (!ready) {
                messageEl.textContent = '문제를 불러오지 못했어요 😢 선생님께 알려주세요!';
                return;
            }
            const weights = {};
            if (prevReport && prevReport.cumulative && prevReport.cumulative.perUnit) {
                Object.keys(prevReport.cumulative.perUnit).forEach(u => {
                    weights[u] = prevReport.cumulative.perUnit[u].errorRate || 0;
                });
            }
            const maxRank = levelRank(targetGrade, targetSem);
            const sel = selectQuestions(questionCount, weights, maxRank);
            if (!sel.questions.length) {
                messageEl.textContent = sel.note || '이 범위에는 아직 문제가 없어요 😢';
                return;
            }
            quizList = sel.questions;
            answers = [];
            cursor = 0;
            currentReport = null;
            messageEl.textContent = sel.note || '';

            // 고른 범위를 주소창에 반영(공유·새로고침해도 같은 범위로 시작)
            try {
                const p = new URLSearchParams(location.search);
                p.set('grade', targetGrade);
                p.set('sem', targetSem);
                p.set('count', questionCount);
                history.replaceState(null, '', location.pathname + '?' + p.toString());
            } catch (e) { /* 파일(file://)로 열면 무시 */ }

            hide(startEl);
            hide(reportEl);
            show(quizEl);
            renderQuestion();
        }

        startBtn.addEventListener('click', startQuiz);
        downloadBtn.addEventListener('click', exportReport);
        restartBtn.addEventListener('click', () => {
            // 시작 화면으로. 직전 레포트는 이어서 재평가에 쓰도록 유지.
            prevReport = currentReport || prevReport;
            hide(reportEl);
            hide(quizEl);
            show(startEl);
            messageEl.textContent = prevReport
                ? '한 번 더 풀면 결과가 더 정확해져요! 약했던 단원이 더 나와요 ✨' : '';
        });

        // ── 시작 상태 ────────────────────────────────────────────
        syncCountButtons();
        syncLevelButtons();
        downloadBtn.disabled = true;
        loadData(); // 미리 받아두기 (실패해도 startQuiz에서 재시도)
    }

    window.MathDiagnostic = { init };
})();
