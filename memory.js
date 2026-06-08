/* 카드 뒤집기 메모리 게임 엔진
   🎴 카드 앞면(face)을 추상 객체로 다뤄 이모지↔교과 그림을 쉽게 교체한다.
      face: { type: 'emoji', value: '🍎' }  또는  { type: 'image', url, title }
   window.MemoryGame.init(...) 로 시작한다 (puzzle.js의 JigsawPuzzle 컨벤션). */
(function () {
    'use strict';

    // 난이도별 짝(pair) 수와 카드판 열 수. 모바일 고려해 열은 4 이하로.
    const LEVELS = {
        easy:   { pairs: 6,  cols: 3, label: '쉬움' },   // 3 × 4 = 12장
        normal: { pairs: 8,  cols: 4, label: '보통' },   // 4 × 4 = 16장
        hard:   { pairs: 10, cols: 4, label: '어려움' }, // 4 × 5 = 20장
    };

    // 아기자기한 이모지 풀 (가장 어려운 난이도 10쌍보다 넉넉하게)
    const EMOJI_POOL = [
        '🍎', '🍌', '🍓', '🍉', '🍑', '🍇', '🥕', '🌽',
        '🐶', '🐱', '🐰', '🐻', '🦊', '🐸', '🐥', '🦄',
        '🌈', '⭐', '🌸', '🎈', '🍭', '🎁', '🚀', '⚽',
    ];

    const DATASET_URL = 'data/curriculum-images.json';
    const FLIP_BACK_DELAY = 800; // 틀렸을 때 다시 닫히기까지 (ms)

    // ── 작은 유틸 ────────────────────────────────────────────────
    function shuffle(arr) { // Fisher–Yates
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function pickRandom(arr, n) {
        return shuffle(arr).slice(0, n);
    }

    function init(opts) {
        const {
            boardEl, messageEl, timerEl, movesEl, matchesEl, totalEl,
            levelButtons, modeButtons, restartBtn,
        } = opts;

        // ── 게임 상태 ────────────────────────────────────────────
        const q = new URLSearchParams(location.search);
        let level = LEVELS[q.get('level')] ? q.get('level') : 'normal';
        let mode  = q.get('mode') === 'image' ? 'image' : 'emoji';
        const subjectFilter = q.get('subject') || '';
        const gradeFilter   = q.get('grade') || '';

        let cards = [];          // 현재 판의 카드 목록
        let firstPick = null;    // 먼저 뒤집은 카드
        let lock = false;        // 비교 중 클릭 잠금
        let moves = 0;
        let matched = 0;
        let datasetCache = null; // 교과 그림 JSON 캐시

        // 타이머
        let timerId = null;
        let seconds = 0;
        let timerStarted = false;

        function stopTimer() {
            if (timerId) { clearInterval(timerId); timerId = null; }
        }
        function resetTimer() {
            stopTimer();
            seconds = 0;
            timerStarted = false;
            timerEl.textContent = '0초';
        }
        function startTimerIfNeeded() {
            if (timerStarted) return;
            timerStarted = true;
            timerId = setInterval(() => {
                seconds++;
                timerEl.textContent = seconds + '초';
            }, 1000);
        }

        // ── face 렌더링 (이모지 / 이미지 공통) ───────────────────
        function renderFront(face) {
            const front = document.createElement('div');
            front.className = 'card-face card-front';
            if (face.type === 'image') {
                const img = document.createElement('img');
                img.src = face.url;
                img.alt = face.title || '';
                img.loading = 'lazy';
                front.appendChild(img);
            } else {
                front.textContent = face.value;
            }
            return front;
        }

        function makeCardEl(card) {
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'card';
            el.setAttribute('aria-label', '카드');

            const inner = document.createElement('div');
            inner.className = 'card-inner';

            const back = document.createElement('div');
            back.className = 'card-face card-back';
            back.textContent = '❓';

            inner.appendChild(back);
            inner.appendChild(renderFront(card.face));
            el.appendChild(inner);

            el.addEventListener('click', () => onCardClick(card));
            return el;
        }

        // ── 카드 클릭 처리 ───────────────────────────────────────
        function onCardClick(card) {
            if (lock || card.flipped || card.matched) return;
            startTimerIfNeeded();

            card.flipped = true;
            card.el.classList.add('flipped');

            if (!firstPick) {
                firstPick = card;
                return;
            }

            // 두 번째 카드 → 비교
            moves++;
            movesEl.textContent = moves;

            if (firstPick.pairId === card.pairId) {
                // 짝 성공
                firstPick.matched = card.matched = true;
                firstPick.el.classList.add('matched');
                card.el.classList.add('matched');
                firstPick = null;
                matched++;
                matchesEl.textContent = matched;
                if (matched === cards.length / 2) win();
            } else {
                // 실패 → 잠깐 후 둘 다 닫기
                lock = true;
                boardEl.classList.add('locked');
                const a = firstPick, b = card;
                firstPick = null;
                setTimeout(() => {
                    a.flipped = b.flipped = false;
                    a.el.classList.remove('flipped');
                    b.el.classList.remove('flipped');
                    lock = false;
                    boardEl.classList.remove('locked');
                }, FLIP_BACK_DELAY);
            }
        }

        function win() {
            stopTimer();
            messageEl.textContent =
                `우와! ${seconds}초 만에 ${moves}번으로 모두 찾았어요! 🎉✨`;
        }

        // ── face 목록 만들기 (모드별) ────────────────────────────
        // { faces, note } 반환. note 가 있으면 폴백 안내 메시지.
        async function buildFaces(pairCount) {
            if (mode === 'image') {
                const faces = await buildImageFaces(pairCount);
                if (faces) return { faces, note: '' };
                // 그림이 부족하면 이모지로 폴백
                mode = 'emoji';
                syncModeButtons();
                return {
                    faces: emojiFaces(pairCount),
                    note: '앗! 교과 그림이 아직 부족해서 이모지로 놀자 😊',
                };
            }
            return { faces: emojiFaces(pairCount), note: '' };
        }

        function emojiFaces(pairCount) {
            return pickRandom(EMOJI_POOL, pairCount)
                .map(v => ({ type: 'emoji', value: v }));
        }

        async function buildImageFaces(pairCount) {
            try {
                if (!datasetCache) {
                    const res = await fetch(DATASET_URL);
                    if (!res.ok) return null;
                    datasetCache = await res.json();
                }
                let imgs = (datasetCache.images || []).filter(it => it && it.url);
                if (subjectFilter) imgs = imgs.filter(it => it.subject === subjectFilter);
                if (gradeFilter)   imgs = imgs.filter(it => String(it.grade) === String(gradeFilter));
                if (imgs.length < pairCount) return null;
                return pickRandom(imgs, pairCount)
                    .map(it => ({ type: 'image', url: it.url, title: it.title }));
            } catch (e) {
                return null;
            }
        }

        // ── 새 게임 시작 ─────────────────────────────────────────
        async function newGame() {
            const cfg = LEVELS[level];
            messageEl.textContent = '';
            resetTimer();
            moves = 0; matched = 0; firstPick = null; lock = false;
            movesEl.textContent = '0';
            matchesEl.textContent = '0';
            totalEl.textContent = cfg.pairs;
            boardEl.classList.remove('locked');
            boardEl.innerHTML = '';

            if (mode === 'image') messageEl.textContent = '교과 그림을 가져오는 중이에요... 🖼️';
            const { faces, note } = await buildFaces(cfg.pairs);
            messageEl.textContent = note;

            // 각 face를 2장씩 → 셔플 → 카드 생성
            const deck = shuffle(
                faces.flatMap((face, i) => [
                    { pairId: i, face, flipped: false, matched: false },
                    { pairId: i, face, flipped: false, matched: false },
                ])
            );
            cards = deck;
            boardEl.style.gridTemplateColumns = `repeat(${cfg.cols}, 1fr)`;
            deck.forEach(card => {
                card.el = makeCardEl(card);
                boardEl.appendChild(card.el);
            });
        }

        // ── 컨트롤 버튼 동기화 ───────────────────────────────────
        function syncLevelButtons() {
            levelButtons.forEach(b =>
                b.classList.toggle('active', b.dataset.level === level));
        }
        function syncModeButtons() {
            modeButtons.forEach(b =>
                b.classList.toggle('active', b.dataset.mode === mode));
        }

        levelButtons.forEach(b => b.addEventListener('click', () => {
            if (level === b.dataset.level) { newGame(); return; }
            level = b.dataset.level;
            syncLevelButtons();
            newGame();
        }));
        modeButtons.forEach(b => b.addEventListener('click', () => {
            if (mode === b.dataset.mode) { newGame(); return; }
            mode = b.dataset.mode;
            syncModeButtons();
            newGame();
        }));
        restartBtn.addEventListener('click', newGame);

        // ── 시작 ────────────────────────────────────────────────
        syncLevelButtons();
        syncModeButtons();
        newGame();
    }

    window.MemoryGame = { init };
})();
