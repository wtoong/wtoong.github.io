/* 문제 렌더러 레지스트리 🎨
   window.QuestionRenderer — 문제 카드의 "문제 영역"(프롬프트·KaTeX 수식·figure 그림)과
   "답안 입력 영역"(보기 버튼·숫자 입력·조작 위젯)을 type별 핸들러로 그리고 채점한다.
   진단(math-diagnostic.js)·별자리(constellation.js)가 이 모듈 하나를 공유하므로,
   새 문제 유형은 QuestionRenderer.register(type, handler) 한 번이면 모든 페이지에 동시에 생긴다.

   ── 사용법 (호스트 페이지) ──────────────────────────────────────
     QuestionRenderer.prepare(quizList)        // latex 문항이 있으면 KaTeX 로드
       .then(() => QuestionRenderer.renderInto(card, q, {
           onAnswered({ given, correct }) { ... } // 채점 결과를 받아 기록·다음 버튼 표시
       }));
   renderInto는 card 안에 .q-prompt / figure / .q-answers / .q-feedback 을 채운다.
   배지(.q-grade-badge)와 다음 버튼은 페이지마다 다르므로 호스트가 직접 붙인다.

   ── 핸들러 인터페이스 ───────────────────────────────────────────
     QuestionRenderer.register('my-type', {
       canRender(q)?,        // false면 numeric 입력으로 폴백 (기본: true)
       renderInput(q, ui),   // 답안 입력 UI를 ui.wrap에 그린다.
                             //   학생이 답하면 ui.submit(given) 호출 → 채점·잠금·피드백은 코어가 처리
       grade(q, given),      // → boolean. given이 null/'' 아님은 코어가 보장
       wrongFeedback(q)?,    // 오답 피드백 메시지(string|Node). 기본: 정답 보여주기
     });
   ui 헬퍼: { wrap, submit(given), el(tag,cls,text), rich(node,text) — q.latex면 수식 렌더, shuffle(arr) }
*/
(function () {
    'use strict';

    // ── KaTeX 지연 로드 ───────────────────────────────────────────
    let _katexPromise = null;
    function loadKatex() {
        if (_katexPromise) return _katexPromise;
        _katexPromise = new Promise(resolve => {
            if (window.katex) { resolve(); return; }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
            document.head.appendChild(link);
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
            s.onload = resolve;
            document.head.appendChild(s);
        });
        return _katexPromise;
    }

    function renderLatex(text) {
        if (!window.katex) return String(text);
        return String(text).replace(/\$([^$]+)\$/g, (_, math) =>
            katex.renderToString(math, { throwOnError: false, displayMode: false })
        );
    }

    // 평문/수식 텍스트를 노드에 채움 (latex=true면 $...$ 인라인 수식)
    function richText(node, text, latex) {
        if (latex) node.innerHTML = renderLatex(text);
        else node.textContent = text;
    }

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

    // ── 핸들러 레지스트리 ────────────────────────────────────────
    const handlers = {};

    function register(type, handler) { handlers[type] = handler; }

    // 핸들러를 못 찾거나 canRender가 거부하면 numeric 입력으로 폴백
    function resolve(q) {
        const h = handlers[q.type];
        if (h && (!h.canRender || h.canRender(q))) return h;
        return handlers.numeric;
    }

    // ── 채점 (호스트도 단독 호출 가능) ───────────────────────────
    function grade(q, given) {
        if (given == null || given === '') return false;
        return resolve(q).grade(q, given);
    }

    // ── 문제 카드 렌더링 ─────────────────────────────────────────
    // card 안에 프롬프트·그림·답안입력·피드백을 채우고, 답이 제출되면
    // 채점 → 입력 잠금 → 피드백 표시 → opts.onAnswered({given, correct}) 호출.
    function renderInto(card, q, opts) {
        const handler = resolve(q);

        const promptDiv = el('div', 'q-prompt');
        richText(promptDiv, q.prompt, q.latex);
        card.appendChild(promptDiv);

        if (q.figure && q._vars && window.QuestionFigures) {
            const fig = QuestionFigures.render(q.figure, q._vars);
            if (fig) card.appendChild(fig);
        }

        const wrap = el('div', 'q-answers');
        const feedback = el('div', 'q-feedback');
        let done = false;

        function submit(given) {
            if (done) return;
            done = true;
            const correct = grade(q, given);
            wrap.querySelectorAll('button, input, select, textarea')
                .forEach(n => n.disabled = true);
            if (correct) {
                feedback.textContent = '정답이에요! 🎉';
            } else {
                const msg = handler.wrongFeedback && handler.wrongFeedback(q);
                if (msg instanceof Node) feedback.appendChild(msg);
                else if (msg != null) feedback.textContent = msg;
                else if (q.latex) feedback.innerHTML =
                    '아쉬워요! 정답은 ' + renderLatex(q.answer) + ' 예요.';
                else feedback.textContent = `아쉬워요! 정답은 "${q.answer}" 예요.`;
            }
            feedback.classList.add(correct ? 'ok' : 'no');
            if (opts && opts.onAnswered) opts.onAnswered({ given, correct });
        }

        const ui = {
            wrap, submit, el, shuffle,
            rich: (node, text) => richText(node, text, q.latex),
        };
        handler.renderInput(q, ui);

        card.appendChild(wrap);
        card.appendChild(feedback);
    }

    // ── 읽기 전용 미리보기/복기 렌더 (정답까지 보여줌) ──────────────
    // 선생님 미리보기·학생 복기에서 쓴다. 프롬프트·그림은 renderInto와 동일하게 그리고,
    // 답안 영역은 핸들러의 renderPreview(있으면)로 정답을 표시(없으면 "정답: ..." 텍스트).
    function renderPreview(card, q) {
        const handler = resolve(q);

        const promptDiv = el('div', 'q-prompt');
        richText(promptDiv, q.prompt, q.latex);
        card.appendChild(promptDiv);

        if (q.figure && q._vars && window.QuestionFigures) {
            const fig = QuestionFigures.render(q.figure, q._vars);
            if (fig) card.appendChild(fig);
        }

        const wrap = el('div', 'q-answers');
        const ui = {
            wrap, el, shuffle,
            rich: (node, text) => richText(node, text, q.latex),
        };
        if (handler.renderPreview) {
            handler.renderPreview(q, ui);
        } else {
            const ans = el('div', 'q-answer-reveal');
            if (q.latex) ans.innerHTML = '정답: ' + renderLatex(q.answer);
            else ans.textContent = '정답: ' + q.answer;
            wrap.appendChild(ans);
        }
        card.appendChild(wrap);
    }

    // latex 문항이 섞여 있으면 KaTeX를 미리 로드
    function prepare(list) {
        return (list || []).some(q => q.latex) ? loadKatex() : Promise.resolve();
    }

    // ── 기본 핸들러: 객관식 ──────────────────────────────────────
    register('mc', {
        renderInput(q, ui) {
            ui.shuffle(q.choices).forEach(choice => {
                const b = ui.el('button', 'choice-btn');
                ui.rich(b, choice);
                b.type = 'button';
                b.addEventListener('click', () => ui.submit(choice));
                ui.wrap.appendChild(b);
            });
        },
        grade(q, given) {
            return String(given).trim() === String(q.answer).trim();
        },
        renderPreview(q, ui) {
            q.choices.forEach(choice => {
                const b = ui.el('button', 'choice-btn');
                ui.rich(b, choice);
                b.type = 'button';
                b.disabled = true;
                if (String(choice).trim() === String(q.answer).trim())
                    b.classList.add('choice-correct');
                ui.wrap.appendChild(b);
            });
        },
    });

    // ── 기본 핸들러: 숫자 입력 ───────────────────────────────────
    register('numeric', {
        renderInput(q, ui) {
            const inputRow = ui.el('div', 'q-input-row');
            const input = document.createElement('input');
            input.type = 'text';
            input.inputMode = 'decimal';
            input.className = 'q-num-input';
            input.placeholder = '답을 적어요';
            const ok = ui.el('button', 'secondary', '확인 ✏️');
            ok.type = 'button';
            const submit = () => { if (input.value.trim() !== '') ui.submit(input.value); };
            ok.addEventListener('click', submit);
            input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
            inputRow.appendChild(input);
            inputRow.appendChild(ok);
            ui.wrap.appendChild(inputRow);
            setTimeout(() => input.focus(), 0);
        },
        grade(q, given) {
            const val = parseFloat(String(given).replace(/\s/g, '').replace(',', '.'));
            if (isNaN(val)) return false;
            return Math.abs(val - q.answer) <= (q.tolerance || 0);
        },
    });

    // ── 기본 핸들러: 막대그래프 위젯 (위젯이 자체 정오를 판단해 boolean 제출) ──
    register('bar-graph', {
        canRender(q) {
            return !!(q.barGraph && q._vars && window.BarGraphWidget);
        },
        renderInput(q, ui) {
            const bg = q.barGraph;
            const correctVals = bg.valueVars.map(v => q._vars[v]);
            const bgw = BarGraphWidget.create({
                labels: bg.labels,
                correctValues: correctVals,
                unit: bg.unit || '',
                scale: bg.scale || 1,
                yMin: bg.yMin || 0,
                belowRows: bg.belowRowsVar ? Number(q._vars[bg.belowRowsVar]) : (bg.belowRows || 1),
            });
            ui.wrap.appendChild(bgw.element);
            const checkBtn = ui.el('button', 'secondary', '정답 확인 ✏️');
            checkBtn.type = 'button';
            checkBtn.addEventListener('click', () => {
                const userVals = bgw.getValues();
                bgw.markAnswers(userVals, correctVals);
                ui.submit(correctVals.every((v, i) => userVals[i] === v));
            });
            ui.wrap.appendChild(checkBtn);
        },
        grade(q, given) { return given === true; },
        wrongFeedback() { return '아쉬워요! 초록 점선이 정답 막대를 알려줘요 🌟'; },
        renderPreview(q, ui) {
            const bg = q.barGraph;
            const correctVals = bg.valueVars.map(v => q._vars[v]);
            const bgw = BarGraphWidget.create({
                labels: bg.labels,
                correctValues: correctVals,
                unit: bg.unit || '',
                scale: bg.scale || 1,
                yMin: bg.yMin || 0,
                belowRows: bg.belowRowsVar ? Number(q._vars[bg.belowRowsVar]) : (bg.belowRows || 1),
            });
            ui.wrap.appendChild(bgw.element);
            // 정답 높이로 칠하고 잠금(bg-checked) — 학생이 만들 정답 그래프를 그대로 보여줌
            bgw.markAnswers(correctVals, correctVals);
        },
    });

    window.QuestionRenderer = { register, grade, renderInto, renderPreview, prepare, loadKatex, renderLatex };
})();
