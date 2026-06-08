/*
 * 직소 퍼즐 공유 엔진 (maker 페이지 + study 페이지 공통)
 * window.JigsawPuzzle.init({ canvas, messageEl, imageSource, cols, rows, locked, onComplete })
 *  - imageSource: HTMLImageElement | URL 문자열 | dataURL
 *  - locked: 학습용(study) 모드 여부 (UI 제어는 페이지가 담당, 엔진 동작엔 영향 없음)
 *  - onComplete: 퍼즐 완성 시 호출되는 콜백 (선택)
 */
(function () {
    // ----- 클로저 내부 상태 -----
    let canvas, ctx, messageEl, onComplete;
    let img = null;
    let scaledImgCanvas = null, scaledCtx = null;

    let pieces = [];
    let cols = 4, rows = 4;
    let pieceW = 0, pieceH = 0;
    let boardStartX = 0, boardStartY = 0;
    let trayRegion = { x: 0, y: 0, w: 0, h: 0 };

    let isDragging = false;
    let selectedPiece = null;
    let dragOffsetX = 0, dragOffsetY = 0;
    let dpr = 1;

    let eventsAttached = false;
    let resizeRaf = null;

    // ----- 이미지 로딩 -----
    function resolveImage(src) {
        return new Promise((resolve, reject) => {
            if (src instanceof HTMLImageElement) {
                if (src.complete && src.naturalWidth) { resolve(src); return; }
                src.addEventListener('load', () => resolve(src), { once: true });
                src.addEventListener('error', reject, { once: true });
                return;
            }
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = src; // 공개 URL: crossOrigin 미설정 (렌더링만 하므로 tainted 캔버스여도 OK)
        });
    }

    // ----- 레이아웃: 뷰포트에 맞춰 보드+트레이 영역 산출 + DPR 적용 -----
    function computeLayout() {
        dpr = window.devicePixelRatio || 1;

        // 모바일 주소창/툴바 뒤 영역까지 포함하는 innerHeight 대신
        // 실제로 보이는 visualViewport 크기를 사용 (트레이가 화면 밖으로 밀리는 문제 방지)
        const vv = window.visualViewport;
        const vw = vv ? vv.width : window.innerWidth;
        const vh = vv ? vv.height : window.innerHeight;

        const cssW = Math.max(280, Math.min(vw - 16, 1100));
        const rectTop = Math.max(0, canvas.getBoundingClientRect().top);
        const cssH = Math.max(300, vh - rectTop - 12);

        // CSS 크기와 백킹스토어 크기 분리 (선명도)
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 이후 모든 좌표는 CSS px 단위

        const pad = 8;
        const gap = 10;
        const imgAR = img.naturalWidth / img.naturalHeight;
        const portrait = cssW < cssH;

        let sWidth, sHeight;
        if (portrait) {
            // 세로: 보드는 위쪽(이미지 비율대로, 높이는 최대 60%까지), 나머지는 전부 트레이
            const innerW = cssW - pad * 2;
            const maxBoardH = cssH * 0.60;
            sWidth = innerW;
            sHeight = sWidth / imgAR;
            if (sHeight > maxBoardH) { sHeight = maxBoardH; sWidth = sHeight * imgAR; }
            boardStartX = (cssW - sWidth) / 2;
            boardStartY = pad;
            trayRegion = { x: pad, y: sHeight + pad + gap, w: cssW - pad * 2, h: cssH - sHeight - pad * 2 - gap };
        } else {
            // 가로: 보드는 왼쪽, 트레이는 오른쪽
            const trayW = Math.max(140, cssW * 0.34);
            const boardSlotW = cssW - trayW - pad * 2 - gap;
            const boardSlotH = cssH - pad * 2;
            const fit = Math.min(boardSlotW / img.naturalWidth, boardSlotH / img.naturalHeight);
            sWidth = img.naturalWidth * fit;
            sHeight = img.naturalHeight * fit;
            boardStartX = pad + (boardSlotW - sWidth) / 2;
            boardStartY = pad + (boardSlotH - sHeight) / 2;
            trayRegion = { x: cssW - trayW - pad, y: pad, w: trayW, h: cssH - pad * 2 };
        }

        sWidth = Math.max(1, Math.floor(sWidth));
        sHeight = Math.max(1, Math.floor(sHeight));

        // 스케일된 이미지를 오프스크린 캔버스에 렌더 (조각 그릴 때 소스로 사용)
        scaledImgCanvas.width = sWidth;
        scaledImgCanvas.height = sHeight;
        scaledCtx.clearRect(0, 0, sWidth, sHeight);
        scaledCtx.drawImage(img, 0, 0, sWidth, sHeight);

        pieceW = sWidth / cols;
        pieceH = sHeight / rows;
    }

    // ----- 조각 생성 (모양 + 정답 위치 + 트레이 내 정규화 위치) -----
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function generatePieces() {
        pieces = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const shape = {
                    t: r === 0 ? 0 : -pieces[(r - 1) * cols + c].shape.b,
                    r: c === cols - 1 ? 0 : (Math.random() > 0.5 ? 1 : -1),
                    b: r === rows - 1 ? 0 : (Math.random() > 0.5 ? 1 : -1),
                    l: c === 0 ? 0 : -pieces[r * cols + (c - 1)].shape.r
                };
                pieces.push({
                    col: c, row: r, shape: shape,
                    correctX: 0, correctY: 0,
                    x: 0, y: 0,
                    trayFx: 0, trayFy: 0, // 트레이 내 중심 위치 (0~1) — 리사이즈 시 재배치용
                    isLocked: false
                });
            }
        }

        // 트레이 안에 느슨한 그리드 + 지터로 분산 (보드를 가리지 않음)
        const n = pieces.length;
        let tc = Math.max(1, Math.round(Math.sqrt(n * (trayRegion.w / Math.max(1, trayRegion.h)))));
        tc = Math.min(tc, n);
        const tr = Math.ceil(n / tc);
        const slots = shuffle([...Array(n).keys()]);
        slots.forEach((pieceIdx, slot) => {
            const gx = slot % tc;
            const gy = Math.floor(slot / tc);
            const jitter = 0.5 / tc;
            pieces[pieceIdx].trayFx = Math.min(1, Math.max(0, (gx + 0.5) / tc + (Math.random() - 0.5) * jitter));
            pieces[pieceIdx].trayFy = Math.min(1, Math.max(0, (gy + 0.5) / tr + (Math.random() - 0.5) * (0.5 / tr)));
        });
    }

    // ----- 정답/트레이 좌표를 현재 레이아웃에 맞춰 적용 -----
    function applyPositions() {
        pieces.forEach(p => {
            p.correctX = boardStartX + p.col * pieceW;
            p.correctY = boardStartY + p.row * pieceH;
            if (p.isLocked) {
                p.x = p.correctX;
                p.y = p.correctY;
            } else {
                const freeW = Math.max(0, trayRegion.w - pieceW);
                const freeH = Math.max(0, trayRegion.h - pieceH);
                let x = trayRegion.x + p.trayFx * trayRegion.w - pieceW / 2;
                let y = trayRegion.y + p.trayFy * trayRegion.h - pieceH / 2;
                p.x = Math.min(trayRegion.x + freeW, Math.max(trayRegion.x, x));
                p.y = Math.min(trayRegion.y + freeH, Math.max(trayRegion.y, y));
            }
        });
    }

    // ----- 조각 path (bezier 탭/홈) -----
    function createPiecePath(context, x, y, w, h, shape) {
        const neck = Math.min(w, h) * 0.15;
        const tab = Math.min(w, h) * 0.25;

        context.beginPath();
        context.moveTo(x, y);

        if (shape.t === 0) context.lineTo(x + w, y);
        else {
            context.lineTo(x + w / 2 - neck, y);
            context.bezierCurveTo(x + w / 2 - neck, y - shape.t * tab, x + w / 2 + neck, y - shape.t * tab, x + w / 2 + neck, y);
            context.lineTo(x + w, y);
        }
        if (shape.r === 0) context.lineTo(x + w, y + h);
        else {
            context.lineTo(x + w, y + h / 2 - neck);
            context.bezierCurveTo(x + w + shape.r * tab, y + h / 2 - neck, x + w + shape.r * tab, y + h / 2 + neck, x + w, y + h / 2 + neck);
            context.lineTo(x + w, y + h);
        }
        if (shape.b === 0) context.lineTo(x, y + h);
        else {
            context.lineTo(x + w / 2 + neck, y + h);
            context.bezierCurveTo(x + w / 2 + neck, y + h + shape.b * tab, x + w / 2 - neck, y + h + shape.b * tab, x + w / 2 - neck, y + h);
            context.lineTo(x, y + h);
        }
        if (shape.l === 0) context.lineTo(x, y);
        else {
            context.lineTo(x, y + h / 2 + neck);
            context.bezierCurveTo(x - shape.l * tab, y + h / 2 + neck, x - shape.l * tab, y + h / 2 - neck, x, y + h / 2 - neck);
            context.lineTo(x, y);
        }
        context.closePath();
    }

    function drawPiece(p) {
        ctx.save();
        createPiecePath(ctx, p.x, p.y, pieceW, pieceH, p.shape);
        ctx.clip();

        // 조각 좌표 - 정답 좌표 + 보드 시작 위치 = 이미지가 딱 맞는 오프셋
        ctx.drawImage(scaledImgCanvas, p.x - p.correctX + boardStartX, p.y - p.correctY + boardStartY);

        ctx.lineWidth = 2;
        ctx.strokeStyle = p.isLocked ? "rgba(0,0,0,0.1)" : "rgba(0,0,0,0.6)";
        ctx.stroke();

        if (!p.isLocked) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 5;
            ctx.shadowOffsetX = 2;
            ctx.shadowOffsetY = 2;
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawAll() {
        // setTransform(dpr...) 상태이므로 CSS px 크기로 clear
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 보드(정답판) 가이드 영역
        ctx.fillStyle = "rgba(0,0,0,0.05)";
        ctx.fillRect(boardStartX, boardStartY, scaledImgCanvas.width, scaledImgCanvas.height);

        // 트레이(조각 보관 영역) 가이드
        ctx.fillStyle = "rgba(33,150,243,0.05)";
        ctx.fillRect(trayRegion.x, trayRegion.y, trayRegion.w, trayRegion.h);

        // 그리기 순서: 잠긴 조각(맨 아래) → 느슨한 조각 → 잡은 조각(맨 위)
        pieces.forEach(p => { if (p.isLocked) drawPiece(p); });
        pieces.forEach(p => { if (!p.isLocked && p !== selectedPiece) drawPiece(p); });
        if (selectedPiece && !selectedPiece.isLocked) drawPiece(selectedPiece);
    }

    // ----- 포인터 좌표 → CSS px (그리기 공간과 일치) -----
    function toLocal(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const sx = canvas.clientWidth / rect.width;
        const sy = canvas.clientHeight / rect.height;
        return { x: (clientX - rect.left) * sx, y: (clientY - rect.top) * sy };
    }

    function handleStart(clientX, clientY) {
        const { x: mouseX, y: mouseY } = toLocal(clientX, clientY);
        for (let i = pieces.length - 1; i >= 0; i--) {
            const p = pieces[i];
            if (p.isLocked) continue;
            createPiecePath(ctx, p.x, p.y, pieceW, pieceH, p.shape);
            // isPointInPath는 CTM의 영향을 받지 않는 device 픽셀 좌표로 판정하므로
            // path가 dpr 배율로 그려진 만큼 터치/마우스 좌표도 dpr을 곱해 맞춘다.
            if (ctx.isPointInPath(mouseX * dpr, mouseY * dpr)) {
                selectedPiece = p;
                isDragging = true;
                dragOffsetX = mouseX - p.x;
                dragOffsetY = mouseY - p.y;
                pieces.splice(i, 1);
                pieces.push(p); // 느슨한 조각은 잡으면 맨 위로
                drawAll();
                break;
            }
        }
    }

    function handleMove(clientX, clientY) {
        if (!isDragging || !selectedPiece) return;
        const { x, y } = toLocal(clientX, clientY);
        selectedPiece.x = x - dragOffsetX;
        selectedPiece.y = y - dragOffsetY;
        drawAll();
    }

    function handleEnd() {
        if (!selectedPiece) return;
        const snapDistance = 25;
        const dx = selectedPiece.x - selectedPiece.correctX;
        const dy = selectedPiece.y - selectedPiece.correctY;

        if (Math.abs(dx) < snapDistance && Math.abs(dy) < snapDistance) {
            selectedPiece.x = selectedPiece.correctX;
            selectedPiece.y = selectedPiece.correctY;
            selectedPiece.isLocked = true;

            // 잠긴 조각은 배열 맨 앞으로 (= 맨 아래에 그려짐)
            const idx = pieces.indexOf(selectedPiece);
            if (idx > 0) { pieces.splice(idx, 1); pieces.unshift(selectedPiece); }

            if (pieces.every(p => p.isLocked)) {
                messageEl.innerText = "🎉 우와! 퍼즐 완성! 정말 잘했어요! 🌈✨";
                if (typeof onComplete === 'function') onComplete();
            }
        }
        selectedPiece = null;
        isDragging = false;
        drawAll();
    }

    function onResize() {
        if (!img) return;
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
            computeLayout();
            applyPositions();
            drawAll();
        });
    }

    function attachEvents() {
        if (eventsAttached) return;
        eventsAttached = true;

        canvas.addEventListener('mousedown', (e) => handleStart(e.clientX, e.clientY));
        canvas.addEventListener('mousemove', (e) => handleMove(e.clientX, e.clientY));
        canvas.addEventListener('mouseup', handleEnd);
        canvas.addEventListener('mouseleave', handleEnd);

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            handleStart(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });
        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            handleMove(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: false });
        canvas.addEventListener('touchend', handleEnd);
        canvas.addEventListener('touchcancel', handleEnd);

        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
        // 모바일 주소창/툴바가 접히거나 펼쳐질 때도 다시 맞춤
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', onResize);
        }
    }

    // ----- 공개 진입점 -----
    async function init(opts) {
        canvas = opts.canvas;
        ctx = canvas.getContext('2d');
        messageEl = opts.messageEl || { innerText: '' };
        onComplete = opts.onComplete;
        cols = Math.min(15, Math.max(2, parseInt(opts.cols) || 4));
        rows = Math.min(15, Math.max(2, parseInt(opts.rows) || 4));

        if (!scaledImgCanvas) {
            scaledImgCanvas = document.createElement('canvas');
            scaledCtx = scaledImgCanvas.getContext('2d');
        }

        // 재생성 시 상태 초기화
        selectedPiece = null;
        isDragging = false;

        img = await resolveImage(opts.imageSource);

        computeLayout();
        generatePieces();
        applyPositions();
        attachEvents();
        drawAll();
    }

    window.JigsawPuzzle = { init };
})();
