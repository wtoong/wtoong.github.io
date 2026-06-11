/* 학생 과제 풀이 엔진
   🎒 선생님이 준 링크(범위·seed가 박힌 URL)를 열면 → 바로 그 시험지를 풀고 → 결과를 본다.
      선택 화면 없음. 같은 seed면 늘 같은 문제(assignment-core.js의 buildQuiz가 보장).
      푼 기록은 로컬 캐시(localStorage, 하루 뒤 자동 삭제)에 남겨, 다시 열면 복습만 보여준다.
   window.AssignmentQuiz.init(...) 로 시작한다. */
(function () {
    'use strict';

    const CACHE_KEY = 'math-assignment-cache-v1';
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 하루

    function el(tag, className, text) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text != null) e.textContent = text;
        return e;
    }
    function show(n) { n.classList.remove('hidden'); }
    function hide(n) { n.classList.add('hidden'); }

    // ── 로컬 캐시 (오래된 항목은 읽을 때 청소) ───────────────────
    function loadCache() {
        let store = {};
        try { store = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { store = {}; }
        const now = Date.now();
        let changed = false;
        Object.keys(store).forEach(k => {
            if (!store[k] || now - (store[k].ts || 0) > CACHE_TTL) { delete store[k]; changed = true; }
        });
        if (changed) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch (e) {} }
        return store;
    }
    function saveCacheEntry(key, entry) {
        const store = loadCache();
        store[key] = entry;
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(store)); } catch (e) {}
    }

    function init(opts) {
        const {
            noAssignEl, nameInput, quizEl, progressEl, questionEl,
            reportEl, reportBodyEl, reviewBannerEl, nameRowEl,
            copyBtn, resultBoxEl, messageEl,
        } = opts;
        function currentLabel() { return (nameInput && nameInput.value || '').trim(); }

        const params = new URLSearchParams(location.search);
        const cfg = window.Assignment.fromParams(params);
        const cacheKey = cfg ? window.Assignment.toParams(cfg) : null;

        let quizList = [];
        let answers = [];   // [{qId, unitId, grade, skillId, given, correct}]
        let cursor = 0;

        if (!cfg) { show(noAssignEl); return; }

        // ── 집계 ─────────────────────────────────────────────────
        function aggregate(list) {
            const perUnit = {};
            list.forEach(a => {
                const u = perUnit[a.unitId] = perUnit[a.unitId] ||
                    { asked: 0, correct: 0, unitName: window.Assignment.unitName(a.unitId) };
                u.asked++; if (a.correct) u.correct++;
            });
            Object.values(perUnit).forEach(u => {
                u.errorRate = u.asked ? (u.asked - u.correct) / u.asked : 0;
            });
            const weakUnits = Object.keys(perUnit)
                .filter(u => perUnit[u].errorRate >= 0.5 && perUnit[u].asked >= 2)
                .sort((a, b) => perUnit[b].errorRate - perUnit[a].errorRate);
            return { perUnit, weakUnits };
        }
        function rangeNote(acc) {
            if (acc >= 0.9) return '와! 완벽에 가까워요 🚀 정말 잘했어요!';
            if (acc >= 0.7) return '잘 풀었어요! 👍 조금만 더 다지면 완벽해요.';
            if (acc >= 0.5) return '거의 다 왔어요! 약한 단원만 더 연습하면 탄탄해질 거예요 🌱';
            return '약한 단원부터 차근차근 연습해봐요. 할 수 있어요 💪';
        }

        // ── 결과 화면 ────────────────────────────────────────────
        function rangeText() {
            const f = window.Assignment.parseLevel(cfg.from), t = window.Assignment.parseLevel(cfg.to);
            return `${window.Assignment.levelLabel(f.grade, f.sem)} ~ ${window.Assignment.levelLabel(t.grade, t.sem)}`;
        }

        function renderReport(label, ans) {
            const { perUnit, weakUnits } = aggregate(ans);
            reportBodyEl.innerHTML = '';
            const correct = ans.filter(a => a.correct).length;
            const total = ans.length;
            const acc = total ? correct / total : 0;
            const pct = Math.round(acc * 100);

            const who = label ? `${label} 친구의 ` : '';
            reportBodyEl.appendChild(el('h2', 'report-title', `${who}과제 결과 📋`));

            const hero = el('div', 'report-hero');
            hero.appendChild(el('div', 'report-range', `📚 ${rangeText()} 범위`));
            hero.appendChild(el('div', 'report-grade', `정답률 ${pct}%`));
            hero.appendChild(el('div', 'report-note', rangeNote(acc)));
            hero.appendChild(el('div', 'report-score', `맞힌 문제: ${correct} / ${total}`));
            reportBodyEl.appendChild(hero);

            reportBodyEl.appendChild(el('h3', 'report-h3', '더 연습하면 좋은 단원 🎯'));
            if (weakUnits.length) {
                const ul = el('ul', 'weak-list');
                weakUnits.forEach(u => {
                    const pu = perUnit[u];
                    const ppct = Math.round(pu.errorRate * 100);
                    ul.appendChild(el('li', null,
                        `${window.Assignment.unitGrade(u)}학년 · ${pu.unitName} — 틀린 비율 ${ppct}% (${pu.correct}/${pu.asked} 맞힘)`));
                });
                reportBodyEl.appendChild(ul);
            } else {
                reportBodyEl.appendChild(el('p', 'weak-none', '약한 단원이 거의 없어요! 정말 잘했어요 🌈'));
            }

            // 문제 복기 (정답/내 답)
            reportBodyEl.appendChild(el('h3', 'report-h3', '문제 다시 보기 🔍'));
            reportBodyEl.appendChild(renderReviewList(ans));
        }

        // 문제별 복기 리스트 (읽기 전용): 프롬프트 + 내 답 + 정답
        function renderReviewList(ans) {
            const wrap = el('div', 'review-list');
            quizList.forEach((q, i) => {
                const a = ans[i] || {};
                const row = el('div', 'review-row ' + (a.correct ? 'ok' : 'no'));
                const head = el('div', 'review-head');
                head.appendChild(el('span', 'review-num', `${i + 1}번`));
                head.appendChild(el('span', 'review-mark', a.correct ? '⭕' : '❌'));
                head.appendChild(el('span', 'review-unit',
                    `${window.Assignment.unitGrade(q.unitId)}학년 · ${window.Assignment.unitName(q.unitId)}`));
                row.appendChild(head);
                const prompt = el('div', 'review-prompt');
                if (q.latex && window.QuestionRenderer) prompt.innerHTML = window.QuestionRenderer.renderLatex(q.prompt);
                else prompt.textContent = q.prompt;
                row.appendChild(prompt);
                const myAns = (a.given === '' || a.given == null) ? '(안 풂)' : a.given;
                row.appendChild(el('div', 'review-answer',
                    a.correct ? `내 답: ${myAns} ✅` : `내 답: ${myAns}  ·  정답: ${q.answer}`));
                wrap.appendChild(row);
            });
            return wrap;
        }

        // ── 결과 회신 (요약 + 복원 코드) ─────────────────────────
        function buildResultText(label, ans) {
            const correct = ans.filter(a => a.correct).length, total = ans.length;
            const pct = total ? Math.round(correct / total * 100) : 0;
            const { weakUnits, perUnit } = aggregate(ans);
            const weak = weakUnits.length
                ? weakUnits.map(u => perUnit[u].unitName).join(', ')
                : '없음 (잘했어요!)';
            const code = window.Assignment.encodeResult({
                v: 1, label: label || '',
                cfg,
                score: { correct, total },
                answers: ans.map(a => ({ given: a.given, correct: a.correct })),
            });
            return [
                '📋 수학 과제 결과',
                `이름: ${label || '-'}`,
                `범위: ${rangeText()} · ${total}문제 · seed ${cfg.seed}`,
                `점수: ${correct}/${total} (${pct}%)`,
                `약한 단원: ${weak}`,
                '',
                '─ 선생님께 아래 코드도 함께 보내요 ─',
                code,
            ].join('\n');
        }

        function showResultBox(ans) {
            if (nameRowEl) show(nameRowEl);
            const refresh = () => { resultBoxEl.value = buildResultText(currentLabel(), ans); };
            refresh();
            if (nameInput) nameInput.addEventListener('input', refresh);
            show(resultBoxEl);
            copyBtn.onclick = () => {
                refresh();
                resultBoxEl.select();
                const text = resultBoxEl.value;
                const done = () => { copyBtn.textContent = '복사했어요! ✅';
                    setTimeout(() => copyBtn.textContent = '결과 보내기 📋', 1800); };
                if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {
                    try { document.execCommand('copy'); done(); } catch (e) {}
                });
                else { try { document.execCommand('copy'); done(); } catch (e) {} }
            };
        }

        // ── 문제 풀이 ────────────────────────────────────────────
        function renderQuestion() {
            const q = quizList[cursor];
            progressEl.textContent = `${cursor + 1} / ${quizList.length}`;
            questionEl.innerHTML = '';
            const card = el('div', 'q-card');
            card.appendChild(el('div', 'q-grade-badge',
                `${window.Assignment.unitGrade(q.unitId)}학년 · ${window.Assignment.unitName(q.unitId)}`));
            const nextBtn = el('button', '', cursor === quizList.length - 1 ? '결과 보기 🎉' : '다음 문제 ➡️');
            nextBtn.classList.add('hidden');
            window.QuestionRenderer.renderInto(card, q, {
                onAnswered({ given, correct }) {
                    answers.push({ qId: q.id, unitId: q.unitId, skillId: q.skillId, grade: q.grade, given, correct });
                    show(nextBtn); nextBtn.focus();
                },
            });
            nextBtn.addEventListener('click', () => {
                cursor++;
                if (cursor < quizList.length) renderQuestion();
                else finishQuiz();
            });
            card.appendChild(nextBtn);
            questionEl.appendChild(card);
        }

        function finishQuiz() {
            const label = currentLabel();
            const correct = answers.filter(a => a.correct).length;
            saveCacheEntry(cacheKey, {
                ts: Date.now(), label,
                answers: answers.map(a => ({ given: a.given, correct: a.correct })),
                score: { correct, total: answers.length },
            });
            hide(quizEl);
            show(reportEl);
            renderReport(label, answers);
            showResultBox(answers);
        }

        // ── 시작: 캐시 확인 → 복습 or 풀이 ───────────────────────
        async function begin() {
            messageEl.textContent = '문제를 준비하는 중이에요... 🧮';
            const ok = await window.Assignment.prepare();
            if (!ok) { messageEl.textContent = '문제를 불러오지 못했어요 😢 선생님께 알려주세요!'; return; }
            const built = await window.Assignment.buildQuiz(cfg);
            quizList = built.quizList;
            if (!quizList.length) { messageEl.textContent = built.note || '이 과제에는 문제가 없어요 😢'; return; }
            await window.QuestionRenderer.prepare(quizList);

            const cached = loadCache()[cacheKey];
            if (cached && cached.answers && cached.answers.length === quizList.length) {
                // 이미 푼 과제 → 이전 결과 + 복습만
                const ans = cached.answers.map((a, i) => ({
                    qId: quizList[i].id, unitId: quizList[i].unitId,
                    skillId: quizList[i].skillId, grade: quizList[i].grade,
                    given: a.given, correct: a.correct,
                }));
                if (nameInput && cached.label && !nameInput.value) nameInput.value = cached.label;
                messageEl.textContent = '';
                show(reviewBannerEl);
                show(reportEl);
                renderReport(cached.label || '', ans);
                showResultBox(ans);
                return;
            }

            // 처음 푸는 과제
            messageEl.textContent = built.note || '';
            answers = []; cursor = 0;
            hide(reportEl);
            if (nameRowEl) show(nameRowEl);
            show(quizEl);
            renderQuestion();
        }

        begin();
    }

    window.AssignmentQuiz = { init };
})();
