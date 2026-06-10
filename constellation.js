/* 별자리 완성하기 게임 엔진
   🌟 학년·학기를 고르면 그 학기 별자리가 밤하늘에 뜨고, 각 단원이 별 하나가 된다.
      별을 눌러 그 단원 문제를 풀면 정답률에 따라 별 1~3개(색이 점점 화려)를 얻어 별을 켠다.
      기록은 localStorage(캐시)에 저장하고, JSON 파일로 내보내기/불러오기 한다.
      window.ConstellationGame.init(...) 로 시작 (memory.js / math-diagnostic.js 컨벤션). */
(function () {
    'use strict';

    const CURRICULUM_URL    = 'data/math-curriculum.json';
    const CONSTELLATIONS_URL = 'data/constellations.json';
    // 문항은 question-bank.js(QuestionBank)가 단원별 샤드에서 필요할 때만 불러온다.

    const STORE_KEY = 'constellation-progress-v1';
    const QUESTIONS_PER_PLAY = 5;   // 한 단원당 출제 수 (문제가 적으면 있는 만큼)

    // 정답률 → 별 등급 (후하게): 40% ⭐ / 70% ⭐⭐ / 90% ⭐⭐⭐
    function starsForAccuracy(acc) {
        if (acc >= 0.9) return 3;
        if (acc >= 0.7) return 2;
        if (acc >= 0.4) return 1;
        return 0;
    }

    const SVG_NS = 'http://www.w3.org/2000/svg';

    // ── KaTeX 지연 로드 (math-diagnostic.js와 동일) ──────────────
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

    // ── 작은 유틸 (memory.js / math-diagnostic.js와 동일) ──────────
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
    function svgEl(tag, attrs) {
        const e = document.createElementNS(SVG_NS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    }
    // 단원번호로 학기 추정 (math-diagnostic.js와 동일)
    function deriveSemester(unitId) {
        const n = parseInt(String(unitId).split('-')[1], 10);
        return n >= 3 ? 2 : 1;
    }
    function starGlyphs(n) { return n > 0 ? '⭐'.repeat(n) : '☆'; }

    function init(opts) {
        const {
            skyEl, skyGridEl, nameInput, importInput, exportBtn, messageEl,
            constelEl, constelTitleEl, constelMapEl, constelStatusEl, backBtn,
            quizEl, progressEl, questionEl,
            resultEl, resultBodyEl, replayBtn, resultBackBtn,
        } = opts;

        // ── 데이터 캐시 ──────────────────────────────────────────
        let manifestLoaded = false;    // 문제 은행 매니페스트 로드 여부
        let curriculumCache = null;    // 교육과정 구조
        let constellationsCache = null; // 별자리 도형
        let unitNameMap = {};          // unitId -> 단원 이름
        let unitGradeMap = {};         // unitId -> 학년

        // ── 진행/기록 (localStorage) ─────────────────────────────
        let progress = loadProgress(); // { _meta, best:{unitId:stars}, bestAcc:{unitId:acc} }

        // ── 현재 상태 ────────────────────────────────────────────
        let currentC = null;     // 현재 보고 있는 별자리
        let currentUnitId = null;
        let currentUnitName = '';
        let quizList = [];
        let answers = [];
        let cursor = 0;

        // ── 화면 전환 ────────────────────────────────────────────
        function show(node) { node.classList.remove('hidden'); }
        function hide(node) { node.classList.add('hidden'); }
        function goScreen(node) {
            [skyEl, constelEl, quizEl, resultEl].forEach(hide);
            show(node);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        // ── 데이터 로드 ──────────────────────────────────────────
        async function loadData() {
            if (curriculumCache && constellationsCache && manifestLoaded) return true;
            try {
                QuestionBank.basePath = 'data/questions/';
                const [cRes, sRes] = await Promise.all([
                    fetch(CURRICULUM_URL), fetch(CONSTELLATIONS_URL),
                ]);
                if (!cRes.ok || !sRes.ok) return false;
                curriculumCache = await cRes.json();
                constellationsCache = await sRes.json();
                await QuestionBank.loadManifest();
                manifestLoaded = true;
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
        }

        // 해당 학년·학기에 속한 단원 목록(순서 유지)
        function unitsForSemester(grade, sem) {
            const g = (curriculumCache.grades || []).find(x => x.grade === grade);
            if (!g) return [];
            return (g.units || [])
                .filter(u => (u.semester || deriveSemester(u.unitId)) === sem)
                .map(u => ({ unitId: u.unitId, unitName: u.unitName }));
        }

        // 별자리에 그 학기 단원을 순서대로 매핑 → 그릴 노드 배열을 만든다.
        //  · 별 수 < 단원 수 : 부족분만큼 별 좌표를 만들어 모든 단원을 표시(누락 방지)
        //  · 별 수 > 단원 수 : 남는 별은 장식(deco)
        function buildNodes(c, units) {
            const base = c.stars || [];
            const nodes = [];
            const count = Math.max(base.length, units.length);
            for (let i = 0; i < count; i++) {
                const pos = base[i] || extraStarPos(i - base.length);
                if (i < units.length) {
                    const u = units[i];
                    const stars = progress.best[u.unitId] || 0;
                    nodes.push({ x: pos.x, y: pos.y, type: 'unit',
                        unitId: u.unitId, unitName: u.unitName, stars });
                } else {
                    nodes.push({ x: pos.x, y: pos.y, type: 'deco' });
                }
            }
            return nodes;
        }
        // 별보다 단원이 많을 때 추가 별 좌표(자리만 만들면 됨 — 데이터 편집 중 임시 상황)
        function extraStarPos(k) {
            const cols = 6;
            const x = 0.14 + (k % cols) * 0.145;
            const y = 0.9 - Math.floor(k / cols) * 0.16;
            return { x, y };
        }
        // 추가 별은 직전 별과 이어 붙여 "이어진" 느낌 유지
        function linesFor(c, nodeCount) {
            const lines = (c.lines || []).slice();
            for (let i = (c.stars || []).length; i < nodeCount; i++) {
                if (i - 1 >= 0) lines.push([i - 1, i]);
            }
            return lines;
        }

        // ── 별자리 그리기 (밤하늘 미니뷰 + 상세 공용) ──────────────
        //   opts: { mini:bool, onUnitClick:fn }
        function renderMap(container, c, units, o) {
            o = o || {};
            const nodes = buildNodes(c, units);
            const lines = linesFor(c, nodes.length);
            container.innerHTML = '';

            const wrap = el('div', 'constel-wrap' + (o.mini ? ' mini' : ''));

            // 연결선 (SVG)
            const svg = svgEl('svg', {
                class: 'constel-svg', viewBox: '0 0 100 100', preserveAspectRatio: 'none',
            });
            lines.forEach(([i, j]) => {
                const a = nodes[i], b = nodes[j];
                if (!a || !b) return;
                const lit = a.type === 'unit' && b.type === 'unit'
                    && a.stars > 0 && b.stars > 0;
                svg.appendChild(svgEl('line', {
                    x1: a.x * 100, y1: a.y * 100, x2: b.x * 100, y2: b.y * 100,
                    class: 'constel-line' + (lit ? ' lit' : ''),
                }));
            });
            wrap.appendChild(svg);

            // 별
            nodes.forEach(n => {
                const isUnit = n.type === 'unit';
                const cls = isUnit ? `star unit lv${n.stars}` : 'star deco';
                const node = isUnit && !o.mini
                    ? el('button', cls) : el('span', cls);
                node.style.left = (n.x * 100) + '%';
                node.style.top  = (n.y * 100) + '%';
                if (isUnit && !o.mini) {
                    node.type = 'button';
                    node.title = `${n.unitName} (최고 ${starGlyphs(n.stars)})`;
                    node.appendChild(el('span', 'star-core'));
                    const label = el('span', 'star-label');
                    label.appendChild(el('span', 'star-label-name', n.unitName));
                    label.appendChild(el('span', 'star-label-stars', starGlyphs(n.stars)));
                    node.appendChild(label);
                    if (o.onUnitClick) node.addEventListener('click', () => o.onUnitClick(n));
                } else if (isUnit) {
                    node.appendChild(el('span', 'star-core'));
                }
                wrap.appendChild(node);
            });

            container.appendChild(wrap);
            return nodes;
        }

        // ── 전체 밤하늘 ──────────────────────────────────────────
        function renderSky() {
            skyGridEl.innerHTML = '';
            const list = (constellationsCache.constellations || [])
                .slice()
                .sort((a, b) => (a.grade - b.grade) || (a.semester - b.semester));

            list.forEach(c => {
                const units = unitsForSemester(c.grade, c.semester);
                const earned = units.reduce((s, u) => s + (progress.best[u.unitId] || 0), 0);
                const max = units.length * 3;
                const litUnits = units.filter(u => (progress.best[u.unitId] || 0) > 0).length;
                const done = units.length > 0 && litUnits === units.length;

                const tile = el('button', 'sky-tile' + (done ? ' done' : ''));
                tile.type = 'button';
                tile.appendChild(el('div', 'sky-tile-grade', `${c.grade}학년 ${c.semester}학기`));

                const mapBox = el('div', 'sky-tile-map');
                renderMap(mapBox, c, units, { mini: true });
                tile.appendChild(mapBox);

                tile.appendChild(el('div', 'sky-tile-name', (done ? '✨ ' : '') + c.name));
                tile.appendChild(el('div', 'sky-tile-stars',
                    `⭐ ${earned} / ${max}`));
                tile.addEventListener('click', () => openConstellation(c));
                skyGridEl.appendChild(tile);
            });
        }

        // ── 별자리 상세 ──────────────────────────────────────────
        function openConstellation(c) {
            currentC = c;
            const units = unitsForSemester(c.grade, c.semester);
            constelTitleEl.textContent = `${c.grade}학년 ${c.semester}학기 · ${c.name}`;
            renderMap(constelMapEl, c, units, { mini: false, onUnitClick: n => startUnit(n) });
            renderStatus(units);
            goScreen(constelEl);
        }

        function renderStatus(units) {
            const earned = units.reduce((s, u) => s + (progress.best[u.unitId] || 0), 0);
            const max = units.length * 3;
            const litUnits = units.filter(u => (progress.best[u.unitId] || 0) > 0).length;
            constelStatusEl.innerHTML = '';
            const line = el('div', 'status-line',
                `켜진 별 ${litUnits} / ${units.length} 단원 · 받은 별 ⭐ ${earned} / ${max}`);
            constelStatusEl.appendChild(line);
            let msg;
            if (units.length === 0) msg = '이 학기는 아직 단원이 없어요. 곧 채워질 거예요! 🌱';
            else if (litUnits === units.length && earned === max) msg = '완벽해요! 별자리가 반짝반짝 완성됐어요 🎉';
            else if (litUnits === units.length) msg = '별자리를 다 켰어요! 더 높은 점수로 ⭐⭐⭐에 도전해봐요 ✨';
            else msg = '별을 콕 눌러 문제를 풀고 별자리를 완성해보자! 🌟';
            constelStatusEl.appendChild(el('div', 'status-msg', msg));
        }

        // ── 단원 문제 시작 ───────────────────────────────────────
        async function startUnit(node) {
            let pool = [];
            try { pool = await QuestionBank.loadByUnits([node.unitId]); }
            catch (e) { pool = []; }
            if (!pool.length) {
                messageEl.textContent = '';
                renderStatus(unitsForSemester(currentC.grade, currentC.semester));
                constelStatusEl.querySelector('.status-msg').textContent =
                    `앗! "${node.unitName}" 단원은 아직 문제가 없어요 😢 다른 별을 눌러봐요!`;
                return;
            }
            currentUnitId = node.unitId;
            currentUnitName = node.unitName;
            // 템플릿 문항은 여기서 구체값으로 인스턴스화(숫자만 매번 바뀜). 템플릿이 없으면 원본 그대로.
            quizList = shuffle(pool).slice(0, QUESTIONS_PER_PLAY)
                .map(q => window.QuestionTemplate ? window.QuestionTemplate.instantiate(q) : q);
            answers = [];
            cursor = 0;
            goScreen(quizEl);
            if (quizList.some(q => q.latex)) {
                loadKatex().then(renderQuestion);
            } else {
                renderQuestion();
            }
        }

        // ── 채점 (math-diagnostic.js와 동일) ─────────────────────
        function gradeAnswer(q, given) {
            if (given == null || given === '') return false;
            if (q.type === 'bar-graph') return given === true;
            if (q.type === 'numeric') {
                const val = parseFloat(String(given).replace(/\s/g, '').replace(',', '.'));
                if (isNaN(val)) return false;
                const tol = q.tolerance || 0;
                return Math.abs(val - q.answer) <= tol;
            }
            return String(given).trim() === String(q.answer).trim();
        }

        // ── 문제 렌더링 (math-diagnostic.js 패턴) ────────────────
        function renderQuestion() {
            const q = quizList[cursor];
            progressEl.textContent = `${cursor + 1} / ${quizList.length}`;
            questionEl.innerHTML = '';

            const card = el('div', 'q-card');
            card.appendChild(el('div', 'q-grade-badge',
                `${currentC.name} · ${currentUnitName}`));
            const promptDiv = el('div', 'q-prompt');
            if (q.latex) promptDiv.innerHTML = renderLatex(q.prompt);
            else promptDiv.textContent = q.prompt;
            card.appendChild(promptDiv);

            if (q.figure && q._vars && window.QuestionFigures) {
                const fig = QuestionFigures.render(q.figure, q._vars);
                if (fig) card.appendChild(fig);
            }

            const answersWrap = el('div', 'q-answers');
            const feedback = el('div', 'q-feedback');
            const nextBtn = el('button', '', cursor === quizList.length - 1 ? '결과 보기 🎉' : '다음 문제 ➡️');
            nextBtn.classList.add('hidden');

            function finishQuestion(given) {
                const correct = gradeAnswer(q, given);
                answers.push({ qId: q.id, correct });
                answersWrap.querySelectorAll('button, input').forEach(n => n.disabled = true);
                if (q.type === 'bar-graph') {
                    feedback.textContent = correct
                        ? '정답이에요! 🎉'
                        : '아쉬워요! 초록 점선이 정답 막대를 알려줘요 🌟';
                } else if (q.latex) {
                    feedback.innerHTML = correct
                        ? '정답이에요! 🎉'
                        : '아쉬워요! 정답은 ' + renderLatex(q.answer) + ' 예요.';
                } else {
                    feedback.textContent = correct
                        ? '정답이에요! 🎉'
                        : `아쉬워요! 정답은 "${q.answer}" 예요.`;
                }
                feedback.classList.add(correct ? 'ok' : 'no');
                show(nextBtn);
                nextBtn.focus();
            }

            if (q.type === 'mc') {
                shuffle(q.choices).forEach(choice => {
                    const b = el('button', 'choice-btn');
                    if (q.latex) b.innerHTML = renderLatex(choice);
                    else b.textContent = choice;
                    b.type = 'button';
                    b.addEventListener('click', () => finishQuestion(choice));
                    answersWrap.appendChild(b);
                });
            } else if (q.type === 'bar-graph' && q.barGraph && q._vars && window.BarGraphWidget) {
                const bg = q.barGraph;
                const correctVals = bg.valueVars.map(v => q._vars[v]);
                const bgw = BarGraphWidget.create({
                    labels: bg.labels,
                    correctValues: correctVals,
                    unit: bg.unit || '',
                    scale: bg.scale || 1,
                    yMin: bg.yMin || 0,
                });
                answersWrap.appendChild(bgw.element);
                const checkBtn = el('button', 'secondary', '정답 확인 ✏️');
                checkBtn.type = 'button';
                checkBtn.addEventListener('click', () => {
                    const userVals = bgw.getValues();
                    const isCorrect = correctVals.every((v, i) => userVals[i] === v);
                    bgw.markAnswers(userVals, correctVals);
                    checkBtn.disabled = true;
                    finishQuestion(isCorrect);
                });
                answersWrap.appendChild(checkBtn);
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
                else finishUnit();
            });

            card.appendChild(answersWrap);
            card.appendChild(feedback);
            card.appendChild(nextBtn);
            questionEl.appendChild(card);
        }

        // ── 결과 + 최고기록 갱신 ─────────────────────────────────
        function finishUnit() {
            const total = answers.length;
            const correct = answers.filter(a => a.correct).length;
            const acc = total ? correct / total : 0;
            const stars = starsForAccuracy(acc);

            const prevStars = progress.best[currentUnitId] || 0;
            const prevAcc = progress.bestAcc[currentUnitId] || 0;
            const improved = stars > prevStars;
            if (stars > prevStars) progress.best[currentUnitId] = stars;
            if (acc > prevAcc) progress.bestAcc[currentUnitId] = acc;
            if (improved || acc > prevAcc) saveProgress();

            renderResult({ correct, total, acc, stars, prevStars, improved });
            goScreen(resultEl);
        }

        function renderResult(r) {
            const bestStars = progress.best[currentUnitId] || 0;
            resultBodyEl.innerHTML = '';
            resultBodyEl.appendChild(el('div', 'report-title', `${currentUnitName} 결과`));

            const hero = el('div', 'report-hero');
            const big = el('div', `result-stars lv${r.stars}`, starGlyphs(r.stars));
            hero.appendChild(big);
            hero.appendChild(el('div', 'report-score',
                `${r.total}문제 중 ${r.correct}개 정답 (정답률 ${Math.round(r.acc * 100)}%)`));
            let note;
            if (r.improved) note = '🎉 최고기록 갱신! 별이 더 밝아졌어요!';
            else if (r.stars === 0) note = '조금만 더! 40% 넘으면 별을 켤 수 있어요 💪';
            else note = `이번엔 ${starGlyphs(r.stars)} 받았어요. 최고기록은 ${starGlyphs(bestStars)} 예요!`;
            hero.appendChild(el('div', 'report-note', note));
            resultBodyEl.appendChild(hero);

            let tip;
            if (bestStars >= 3) tip = '이 단원은 완전 마스터! 다른 별도 채워봐요 🌟';
            else if (bestStars === 2) tip = '90% 넘으면 ⭐⭐⭐ 무지개 별이 돼요! 다시 도전해봐요 🌈';
            else if (bestStars === 1) tip = '70% 넘으면 ⭐⭐ 황금별이 돼요! 한 번 더 풀어볼까요? ✨';
            else tip = '괜찮아요! 다시 풀면 분명 별을 켤 수 있어요 🍀';
            resultBodyEl.appendChild(el('div', 'report-hint', tip));
        }

        // ── 저장 / 불러오기 (localStorage) ───────────────────────
        function loadProgress() {
            try {
                const raw = localStorage.getItem(STORE_KEY);
                if (raw) {
                    const data = JSON.parse(raw);
                    if (data && data._meta && data._meta.kind === 'constellation-progress') {
                        return { _meta: data._meta, best: data.best || {}, bestAcc: data.bestAcc || {} };
                    }
                }
            } catch (e) { /* 캐시 손상/차단 시 무시 */ }
            return {
                _meta: { kind: 'constellation-progress', version: 1, studentLabel: '', exported: '' },
                best: {}, bestAcc: {},
            };
        }
        function saveProgress() {
            progress._meta.studentLabel = (nameInput.value || '').trim();
            progress._meta.exported = new Date().toISOString();
            try { localStorage.setItem(STORE_KEY, JSON.stringify(progress)); }
            catch (e) { /* 저장 공간 부족/차단 시 무시 */ }
        }

        // ── 내보내기 / 불러오기 (math-diagnostic.js 패턴) ────────
        function exportProgress() {
            saveProgress();
            const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            const label = (progress._meta.studentLabel || '학생').replace(/\s+/g, '');
            a.download = `constellation-${label}-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            messageEl.textContent = '내 별자리 기록을 저장했어요! 💾 잘 보관해 두세요 ✨';
        }
        function importProgressFile(file) {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const data = JSON.parse(reader.result);
                    if (!data || data._meta?.kind !== 'constellation-progress') {
                        throw new Error('별자리 기록 파일이 아니에요');
                    }
                    // 더 높은 등급 우선으로 병합
                    const inBest = data.best || {}, inAcc = data.bestAcc || {};
                    Object.keys(inBest).forEach(u => {
                        if ((inBest[u] || 0) > (progress.best[u] || 0)) progress.best[u] = inBest[u];
                    });
                    Object.keys(inAcc).forEach(u => {
                        if ((inAcc[u] || 0) > (progress.bestAcc[u] || 0)) progress.bestAcc[u] = inAcc[u];
                    });
                    const label = data._meta.studentLabel;
                    if (label && !nameInput.value) nameInput.value = label;
                    saveProgress();
                    renderSky();
                    messageEl.textContent = '📂 별자리 기록을 불러왔어요! 모았던 별이 다시 반짝여요 ✨';
                } catch (e) {
                    messageEl.textContent = '앗! 올바른 별자리 기록 파일이 아니에요 😢';
                }
            };
            reader.readAsText(file);
        }

        // ── 컨트롤 연결 ──────────────────────────────────────────
        exportBtn.addEventListener('click', exportProgress);
        importInput.addEventListener('change', e => {
            if (e.target.files && e.target.files[0]) importProgressFile(e.target.files[0]);
        });
        backBtn.addEventListener('click', () => { renderSky(); goScreen(skyEl); });
        resultBackBtn.addEventListener('click', () => openConstellation(currentC));
        replayBtn.addEventListener('click', () =>
            startUnit({ unitId: currentUnitId, unitName: currentUnitName }));

        // ── 시작 ────────────────────────────────────────────────
        async function boot() {
            messageEl.textContent = '밤하늘을 준비하는 중이에요... 🔭';
            const ready = await loadData();
            if (!ready) {
                messageEl.textContent = '별자리를 불러오지 못했어요 😢 선생님께 알려주세요!';
                return;
            }
            if (progress._meta.studentLabel && !nameInput.value) {
                nameInput.value = progress._meta.studentLabel;
            }
            messageEl.textContent = '';
            renderSky();
            goScreen(skyEl);
        }
        boot();
    }

    window.ConstellationGame = { init };
})();
