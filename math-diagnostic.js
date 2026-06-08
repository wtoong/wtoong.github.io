/* 수학 진단평가(레벨 테스트) 엔진
   🧮 전 학년(1~6)·전 단원을 골고루 섞어 출제하고, 학생의 답을 분석해
      "대략 몇 학년 수준이고 어느 단원이 약한지"를 자동으로 진단한다.
      DB가 없으므로 결과는 레포트 JSON 파일로 내보내고(다운로드),
      재평가 때 그 파일을 불러오면 자주 틀린 단원에 가중치를 줘 더 많이 출제한다.
   window.MathDiagnostic.init(...) 로 시작한다 (memory.js의 컨벤션). */
(function () {
    'use strict';

    const QUESTIONS_URL  = 'data/math-questions.json';
    const CURRICULUM_URL = 'data/math-curriculum.json';

    const WEIGHT_K = 3;     // 약점 단원 가중치 세기: w = 1 + K * 오답률
    const MASTERY = 0.7;    // 숙달 임계 정확도
    const MIN_GRADE_SAMPLE = 3; // 학년 추정에 필요한 학년별 최소 문항 수

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

    function init(opts) {
        const {
            startEl, nameInput, countButtons, importInput, startBtn,
            quizEl, progressEl, questionEl,
            reportEl, downloadBtn, restartBtn, messageEl,
        } = opts;

        // ── 데이터 캐시 ──────────────────────────────────────────
        let bankCache = null;        // 문제 은행
        let curriculumCache = null;  // 교육과정 구조
        let unitNameMap = {};        // unitId -> 단원 이름
        let unitGradeMap = {};       // unitId -> 학년

        // ── 진행 상태 ────────────────────────────────────────────
        // ?count=30 같은 편의 파라미터로 기본 문제 수 미리 선택 (20/30/40만 허용)
        const urlCount = parseInt(new URLSearchParams(location.search).get('count'));
        let questionCount = [20, 30, 40].includes(urlCount) ? urlCount : 20;
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
                });
            });
            // 문제에만 있는 단원도 보강 (커리큘럼 누락 대비)
            (bankCache.questions || []).forEach(q => {
                if (unitGradeMap[q.unitId] == null) unitGradeMap[q.unitId] = q.grade;
                if (unitNameMap[q.unitId] == null)  unitNameMap[q.unitId] = q.unitId;
            });
        }

        // ── 문제 선택: 전 학년·전 단원 표집 (+가중치) ────────────
        function selectQuestions(count, weights) {
            const all = (bankCache.questions || []);
            const pool = {};            // unitId -> 남은 문제(셔플됨)
            all.forEach(q => { (pool[q.unitId] = pool[q.unitId] || []).push(q); });
            Object.keys(pool).forEach(u => { pool[u] = shuffle(pool[u]); });

            const chosen = [];
            const unitWeight = u => 1 + WEIGHT_K * ((weights && weights[u]) || 0);

            function stockUnits(filterFn) {
                return Object.keys(pool).filter(u =>
                    pool[u].length && (!filterFn || filterFn(u)));
            }
            function roulette(units) {
                const total = units.reduce((s, u) => s + unitWeight(u), 0);
                let r = Math.random() * total;
                for (const u of units) { r -= unitWeight(u); if (r <= 0) return u; }
                return units[units.length - 1];
            }
            function take(u) { chosen.push(pool[u].pop()); }

            // 1단계: 학년별 최소 표집 (학년 추정 신뢰 확보)
            const grades = [...new Set(all.map(q => q.grade))].sort((a, b) => a - b);
            let base = count >= 12 ? 2 : 1;
            while (base * grades.length > count) base--;
            for (const g of grades) {
                for (let i = 0; i < base; i++) {
                    const gUnits = stockUnits(u => unitGradeMap[u] === g);
                    if (!gUnits.length) break;
                    take(roulette(gUnits));
                }
            }
            // 2단계: 남은 자리 → 전역 가중 표집 (약점 단원이 더 자주)
            while (chosen.length < count) {
                const units = stockUnits();
                if (!units.length) break;
                take(roulette(units));
            }

            const note = chosen.length < count
                ? `문제 은행에 문제가 ${count}개보다 적어서 ${chosen.length}개만 풀어요! 😊`
                : '';
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

        // ── 학년 수준 추정 (답 → 역추정) ─────────────────────────
        function estimateGrade(perGrade) {
            const grades = [1, 2, 3, 4, 5, 6];
            let mastered = 0;
            for (const g of grades) {
                const gd = perGrade[g];
                if (!gd || gd.asked < MIN_GRADE_SAMPLE) break; // 표본 부족이면 그 위는 신뢰 X
                if (gd.accuracy >= MASTERY) mastered = g; else break;
            }
            let est = mastered || 1, note = '';
            if (mastered === 0) {
                note = '기초를 조금만 더 다지면 쑥쑥 자랄 거예요! 낮은 학년 단원부터 차근차근 연습해봐요 🌱';
            } else if (mastered === 6) {
                note = '와! 6학년 수준까지 척척이에요. 더 어려운 문제에도 도전해봐요 🚀';
            } else {
                const next = perGrade[mastered + 1];
                note = (next && next.accuracy >= 0.4)
                    ? `${mastered}학년은 탄탄하고, ${mastered + 1}학년에 신나게 도전하는 중이에요! 💪`
                    : `${mastered}학년 수준이에요. 이제 ${mastered + 1}학년 단원을 연습해봐요! ✨`;
            }
            return { estimatedGrade: est, note };
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
                    kind: 'math-diagnostic-report', version: 1,
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
            const { estimatedGrade, note } = estimateGrade(perGrade);
            const studentLabel = (nameInput.value || '').trim();
            const totalCorrect = answers.filter(a => a.correct).length;

            const session = {
                sessionId: 's-' + Date.now(),
                date: new Date().toISOString().slice(0, 10),
                config: { questionCount: quizList.length },
                estimatedGrade, estimateNote: note,
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

            // 추정 학년 + 한줄평
            const hero = el('div', 'report-hero');
            hero.appendChild(el('div', 'report-grade', `약 ${session.estimatedGrade}학년 수준`));
            hero.appendChild(el('div', 'report-note', session.estimateNote));
            hero.appendChild(el('div', 'report-score',
                `맞힌 문제: ${session.totalCorrect} / ${session.totalAnswered}`));
            body.appendChild(hero);

            // 학년별 정확도 막대
            body.appendChild(el('h3', 'report-h3', '학년별 정답률 📊'));
            const gradeWrap = el('div', 'bar-wrap');
            [1, 2, 3, 4, 5, 6].forEach(g => {
                const gd = session.perGrade[g];
                if (!gd) return;
                const pct = Math.round(gd.accuracy * 100);
                const row = el('div', 'bar-row');
                row.appendChild(el('span', 'bar-label', `${g}학년`));
                const track = el('div', 'bar-track');
                const fill = el('div', 'bar-fill');
                fill.style.width = pct + '%';
                if (pct < 50) fill.classList.add('low');
                else if (pct < 70) fill.classList.add('mid');
                track.appendChild(fill);
                row.appendChild(track);
                row.appendChild(el('span', 'bar-pct', `${pct}% (${gd.correct}/${gd.asked})`));
                gradeWrap.appendChild(row);
            });
            body.appendChild(gradeWrap);

            // 약점 단원
            body.appendChild(el('h3', 'report-h3', '더 연습하면 좋은 단원 🎯'));
            if (session.weakUnits.length) {
                const ul = el('ul', 'weak-list');
                session.weakUnits.forEach(u => {
                    const pu = session.perUnit[u];
                    const pct = Math.round(pu.errorRate * 100);
                    ul.appendChild(el('li', null,
                        `${unitGradeMap[u]}학년 · ${pu.unitName} — 틀린 비율 ${pct}% (${pu.correct}/${pu.asked} 맞힘)`));
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
                b.classList.toggle('active', parseInt(b.dataset.count) === questionCount));
        }
        countButtons.forEach(b => b.addEventListener('click', () => {
            questionCount = parseInt(b.dataset.count) || 20;
            syncCountButtons();
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
            const sel = selectQuestions(questionCount, weights);
            quizList = sel.questions;
            answers = [];
            cursor = 0;
            currentReport = null;
            messageEl.textContent = '';

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
        downloadBtn.disabled = true;
        loadData(); // 미리 받아두기 (실패해도 startQuiz에서 재시도)
    }

    window.MathDiagnostic = { init };
})();
