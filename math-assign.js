/* 선생님 출제 도구 — 과제(시험지) 만들기
   👩‍🏫 범위(어느 학년·학기부터 어디까지)를 정하고, 필요하면 단원을 빼고, 문제 수와 seed를 골라
       "🎲 seed 뽑기 → 미리보기"로 실제 문제 구성을 확인한 뒤 학생용 링크를 복사해 배포한다.
       같은 seed면 학생도 똑같은 문제를 푼다(assignment-core.js의 buildQuiz가 보장).
       학생이 보내온 "결과 코드"를 붙여 넣으면 문항별로 무엇을 풀었고 맞았는지 복원해 본다.
   window.AssignmentMaker.init(...) 로 시작. */
(function () {
    'use strict';

    function el(tag, className, text) {
        const e = document.createElement(tag);
        if (className) e.className = className;
        if (text != null) e.textContent = text;
        return e;
    }
    function show(n) { n.classList.remove('hidden'); }

    function init(opts) {
        const {
            fromSelect, toSelect, levelBlocksEl, countButtons,
            seedInput, rollSeedBtn, previewBtn, previewMetaEl, previewEl,
            linkBox, copyLinkBtn, decodeInput, decodeBtn, decodeEl, messageEl,
        } = opts;

        const A = window.Assignment;
        const drop = new Set();
        let count = 10;
        let seed = A.randomSeed();

        function fillLevelSelect(sel, def) {
            for (let g = 1; g <= 6; g++) for (let s = 1; s <= 2; s++) {
                const o = el('option', null, A.levelLabel(g, s));
                o.value = `${g}-${s}`;
                sel.appendChild(o);
            }
            sel.value = def;
        }

        function cfg() {
            return { from: fromSelect.value, to: toSelect.value, drop: [...drop], n: count, seed };
        }

        // 학생용 링크를 항상 현재 설정으로 갱신
        function updateLink() {
            const u = new URL('math-test.html', location.href);
            u.search = A.toParams(cfg());
            linkBox.value = u.href;
        }

        // 범위 안 학기별 단원 토글 다시 그리기 (drop은 유지)
        function renderLevels() {
            levelBlocksEl.innerHTML = '';
            const from = A.parseLevel(fromSelect.value), to = A.parseLevel(toSelect.value);
            const lo = Math.min(from.rank, to.rank), hi = Math.max(from.rank, to.rank);
            A.levelsInRange(lo, hi).forEach(lv => {
                const units = A.unitsForLevel(lv.grade, lv.sem);
                if (!units.length) return;
                const block = el('details', 'level-block');
                const sum = el('summary', null, `${A.levelLabel(lv.grade, lv.sem)} · ${units.length}단원`);
                block.appendChild(sum);
                const chips = el('div', 'unit-chips');
                units.forEach(u => {
                    const chip = el('button', 'unit-chip', u.unitName);
                    chip.type = 'button';
                    if (drop.has(u.unitId)) chip.classList.add('dropped');
                    chip.addEventListener('click', () => {
                        if (drop.has(u.unitId)) drop.delete(u.unitId);
                        else drop.add(u.unitId);
                        chip.classList.toggle('dropped');
                        updateLink();
                    });
                    chips.appendChild(chip);
                });
                block.appendChild(chips);
                levelBlocksEl.appendChild(block);
            });
            updateLink();
        }

        function syncCount() {
            countButtons.forEach(b => b.classList.toggle('active', parseInt(b.dataset.count, 10) === count));
        }

        // ── 미리보기 (실제 학생이 풀 문제) ───────────────────────
        async function preview() {
            previewMetaEl.textContent = '문제를 만드는 중... 🧮';
            previewEl.innerHTML = '';
            const built = await A.buildQuiz(cfg());
            if (!built.quizList.length) {
                previewMetaEl.textContent = built.note || '이 범위에는 문제가 없어요 😢';
                return;
            }
            previewMetaEl.textContent =
                `🎲 seed ${seed} · 총 ${built.quizList.length}문제 (후보 ${built.eligible}개 중)` +
                (built.note ? ` · ${built.note}` : '');
            await window.QuestionRenderer.prepare(built.quizList);
            previewEl.appendChild(renderQuestionList(built.quizList));
        }

        // 문항 읽기 전용 리스트 (프롬프트 + 그림/막대그래프 + 정답). answers가 있으면 학생 답도.
        function renderQuestionList(quizList, answers) {
            const wrap = el('div', 'review-list');
            quizList.forEach((q, i) => {
                const a = answers && answers[i];
                const cls = a ? (a.correct ? ' ok' : ' no') : '';
                const row = el('div', 'review-row' + cls);
                const head = el('div', 'review-head');
                head.appendChild(el('span', 'review-num', `${i + 1}번`));
                if (a) head.appendChild(el('span', 'review-mark', a.correct ? '⭕' : '❌'));
                head.appendChild(el('span', 'review-unit',
                    `${A.unitGrade(q.unitId)}학년 · ${A.unitName(q.unitId)}`));
                row.appendChild(head);
                // 프롬프트·그림·정답(막대그래프 포함)을 공용 렌더러로 그린다
                window.QuestionRenderer.renderPreview(row, q);
                if (a) {
                    const my = (a.given === '' || a.given == null) ? '(안 풂)' : a.given;
                    row.appendChild(el('div', 'review-answer', `학생 답: ${my} ${a.correct ? '✅' : '❌'}`));
                }
                wrap.appendChild(row);
            });
            return wrap;
        }

        // ── 학생 결과 코드 복원 ──────────────────────────────────
        async function decodeResult() {
            decodeEl.innerHTML = '';
            const raw = (decodeInput.value || '').trim();
            if (!raw) { decodeEl.textContent = '학생이 보낸 결과를 붙여 넣어 주세요!'; return; }
            // 붙여넣은 글에서 마지막 줄(코드)부터 시도
            const tokens = raw.split(/\s+/).filter(Boolean);
            let payload = null;
            for (let i = tokens.length - 1; i >= 0 && !payload; i--) {
                const p = A.decodeResult(tokens[i]);
                if (p && Array.isArray(p.answers)) payload = p;
            }
            if (!payload) { decodeEl.textContent = '앗! 결과 코드를 읽지 못했어요 😢 (코드를 통째로 붙여 넣었는지 확인해 주세요)'; return; }

            const built = await A.buildQuiz(payload.cfg);
            const f = A.parseLevel(payload.cfg.from), t = A.parseLevel(payload.cfg.to);
            const sc = payload.score || {};
            const pct = sc.total ? Math.round(sc.correct / sc.total * 100) : 0;
            decodeEl.appendChild(el('div', 'preview-meta',
                `📋 ${payload.label || '이름없음'} · ${A.levelLabel(f.grade, f.sem)}~${A.levelLabel(t.grade, t.sem)} · ` +
                `점수 ${sc.correct || 0}/${sc.total || 0} (${pct}%) · seed ${payload.cfg.seed}`));
            if (built.quizList.length === payload.answers.length) {
                await window.QuestionRenderer.prepare(built.quizList);
                decodeEl.appendChild(renderQuestionList(built.quizList, payload.answers));
            } else {
                decodeEl.appendChild(el('p', 'level-hint',
                    '문항 수가 맞지 않아 문제별 복원은 못 했어요(문제 은행이 바뀌었을 수 있어요). 점수 요약은 위에 있어요.'));
            }
        }

        function copyText(text, btn, okLabel, normalLabel) {
            const done = () => { btn.textContent = okLabel; setTimeout(() => btn.textContent = normalLabel, 1800); };
            if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => {
                linkBox.select(); try { document.execCommand('copy'); done(); } catch (e) {}
            });
            else { linkBox.select(); try { document.execCommand('copy'); done(); } catch (e) {} }
        }

        // ── 이벤트 ───────────────────────────────────────────────
        fromSelect.addEventListener('change', renderLevels);
        toSelect.addEventListener('change', renderLevels);
        countButtons.forEach(b => b.addEventListener('click', () => {
            count = parseInt(b.dataset.count, 10) || 10; syncCount(); updateLink();
        }));
        seedInput.addEventListener('input', () => {
            const v = parseInt(seedInput.value, 10);
            if (v > 0) { seed = v; updateLink(); }
        });
        rollSeedBtn.addEventListener('click', () => {
            seed = A.randomSeed(); seedInput.value = seed; updateLink();
        });
        previewBtn.addEventListener('click', preview);
        copyLinkBtn.addEventListener('click', () => copyText(linkBox.value, copyLinkBtn, '복사했어요! ✅', '🔗 링크 복사'));
        decodeBtn.addEventListener('click', decodeResult);

        // ── 시작 ─────────────────────────────────────────────────
        (async () => {
            messageEl.textContent = '준비하는 중... 🧮';
            const ok = await A.prepare();
            if (!ok) { messageEl.textContent = '교육과정·문제 은행을 불러오지 못했어요 😢'; return; }
            messageEl.textContent = '';
            fillLevelSelect(fromSelect, '1-1');
            fillLevelSelect(toSelect, '4-1');
            seedInput.value = seed;
            count = 10; syncCount();
            renderLevels();
        })();
    }

    window.AssignmentMaker = { init };
})();
