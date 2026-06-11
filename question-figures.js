/* 문제 도형 렌더러 (공용)
   문항에 figure + _vars 가 있을 때 SVG 시각 자료를 만든다.
   window.QuestionFigures.render(type, vars) → SVGElement | null
*/
(function () {
    'use strict';
    const NS = 'http://www.w3.org/2000/svg';

    function svgEl(tag, attrs, text) {
        const e = document.createElementNS(NS, tag);
        for (const k in attrs) e.setAttribute(k, String(attrs[k]));
        if (text != null) e.textContent = text;
        return e;
    }

    function norm(dx, dy) {
        const l = Math.hypot(dx, dy) || 1;
        return [dx / l, dy / l];
    }

    // ── 삼각형 세 각 렌더 (두 각이 알려지고 나머지 한 각이 "?") ──────
    // vars: { a, b }  →  c = 180 - a - b (미지)
    function triangleAnglesSVG(vars) {
        const a = vars.a, b = vars.b, c = 180 - a - b;
        const angles = [a, b, c];
        const aR = a * Math.PI / 180, bR = b * Math.PI / 180;

        const VW = 240, VH = 210;

        // 단위 삼각형: P0=(0,0) ∠a, P1=(1,0) ∠b, P2=(tX,tY) ∠c
        const sinAB = Math.sin(aR + bR);
        const tX = Math.cos(aR) * Math.sin(bR) / sinAB;
        const tY = Math.sin(aR) * Math.sin(bR) / sinAB;

        // 레이블 여백을 포함한 가용 영역
        const pad = 46;
        const avW = VW - 2 * pad, avH = VH - 2 * pad;

        // 비율 유지 스케일 — 0.88로 여유 있게 채움
        const scale = Math.min(avW / 1, avH / tY) * 0.88;

        // 삼각형을 뷰박스 중앙에 배치 (y-축 반전)
        const triW = scale, triH = tY * scale;
        const baseX = (VW - triW) / 2;
        const baseY = (VH + triH) / 2;

        function toSVG(mx, my) {
            return [baseX + mx * scale, baseY - my * scale];
        }

        const P = [toSVG(0, 0), toSVG(1, 0), toSVG(tX, tY)];
        const cxT = (P[0][0] + P[1][0] + P[2][0]) / 3;
        const cyT = (P[0][1] + P[1][1] + P[2][1]) / 3;

        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', String(VH));
        svg.style.cssText =
            'max-width:240px;display:block;margin:4px auto 0;' +
            'background:rgba(142,197,255,0.07);border-radius:14px';

        // 삼각형 채우기 + 테두리
        svg.appendChild(svgEl('polygon', {
            points: P.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
            fill: 'rgba(142,197,255,0.20)',
            stroke: '#4a90d9',
            'stroke-width': '2.2',
            'stroke-linejoin': 'round'
        }));

        const ARC_R = 18;
        const SQ = 13;  // 직각 기호 크기
        const labels    = [`${a}°`, `${b}°`, '?'];
        const arcStroke = ['#4a90d9', '#4a90d9', '#e07010'];
        const txtFill   = ['#1d4e8a', '#1d4e8a', '#b85000'];
        const txtSize   = ['13',      '13',      '16'];
        const txtWeight = ['700',     '700',     '900'];

        P.forEach(([vx, vy], i) => {
            const [ax, ay] = P[(i + 1) % 3];
            const [bxp, byp] = P[(i + 2) % 3];
            const u1 = norm(ax - vx, ay - vy);
            const u2 = norm(bxp - vx, byp - vy);
            const isRight = angles[i] === 90 && i !== 2; // 미지각은 힌트 방지를 위해 호로 표시

            if (isRight) {
                // 직각 기호: ㄱ 모양 사각형 꺾쇠
                const q1x = vx + u1[0] * SQ, q1y = vy + u1[1] * SQ;
                const qmx = vx + (u1[0] + u2[0]) * SQ, qmy = vy + (u1[1] + u2[1]) * SQ;
                const q2x = vx + u2[0] * SQ, q2y = vy + u2[1] * SQ;
                const stroke = i === 2 ? arcStroke[2] : arcStroke[0];
                // 작은 정사각형 채우기 (안쪽 배경)
                if (i === 2) {
                    svg.appendChild(svgEl('path', {
                        d: `M ${vx.toFixed(1)} ${vy.toFixed(1)} ` +
                           `L ${q1x.toFixed(1)} ${q1y.toFixed(1)} ` +
                           `L ${qmx.toFixed(1)} ${qmy.toFixed(1)} ` +
                           `L ${q2x.toFixed(1)} ${q2y.toFixed(1)} Z`,
                        fill: 'rgba(224,112,16,0.18)',
                        stroke: 'none'
                    }));
                }
                svg.appendChild(svgEl('path', {
                    d: `M ${q1x.toFixed(1)} ${q1y.toFixed(1)} ` +
                       `L ${qmx.toFixed(1)} ${qmy.toFixed(1)} ` +
                       `L ${q2x.toFixed(1)} ${q2y.toFixed(1)}`,
                    fill: 'none',
                    stroke,
                    'stroke-width': '1.8',
                    'stroke-linejoin': 'miter'
                }));
            } else {
                // 일반 각도 호
                const p1x = vx + u1[0] * ARC_R, p1y = vy + u1[1] * ARC_R;
                const p2x = vx + u2[0] * ARC_R, p2y = vy + u2[1] * ARC_R;
                const cross = u1[0] * u2[1] - u1[1] * u2[0];
                const sweep = cross < 0 ? 0 : 1;

                if (i === 2) {
                    svg.appendChild(svgEl('path', {
                        d: `M ${vx.toFixed(1)} ${vy.toFixed(1)} ` +
                           `L ${p1x.toFixed(1)} ${p1y.toFixed(1)} ` +
                           `A ${ARC_R} ${ARC_R} 0 0 ${sweep} ${p2x.toFixed(1)} ${p2y.toFixed(1)} Z`,
                        fill: 'rgba(224,112,16,0.18)',
                        stroke: 'none'
                    }));
                }
                svg.appendChild(svgEl('path', {
                    d: `M ${p1x.toFixed(1)} ${p1y.toFixed(1)} ` +
                       `A ${ARC_R} ${ARC_R} 0 0 ${sweep} ${p2x.toFixed(1)} ${p2y.toFixed(1)}`,
                    fill: 'none',
                    stroke: arcStroke[i],
                    'stroke-width': i === 2 ? '2.2' : '1.8'
                }));
            }

            // 레이블: 꼭짓점 → 무게중심 방향으로 이동
            const distC = Math.hypot(cxT - vx, cyT - vy) || 1;
            const markerR = isRight ? SQ : ARC_R;
            const labelD = Math.min(markerR + 17, distC * 0.68);
            const [dcx, dcy] = norm(cxT - vx, cyT - vy);
            const lx = vx + dcx * labelD, ly = vy + dcy * labelD;

            svg.appendChild(svgEl('text', {
                x: lx.toFixed(1), y: ly.toFixed(1),
                'text-anchor': 'middle',
                'dominant-baseline': 'middle',
                'font-size': txtSize[i],
                'font-weight': txtWeight[i],
                fill: txtFill[i]
            }, labels[i]));
        });

        return svg;
    }

    // ── 이등변삼각형 각도 렌더 ──────────────────────────────────
    // isosceles-apex: vars={a} → 꼭지각 a°(알려짐), 밑각 ?(구해야 함)
    // isosceles-base: vars={b} → 밑각 b°(알려짐), 꼭지각 ?(구해야 함)
    function isoscelesSVG(vars, apexGiven) {
        const VW = 240, VH = 210;

        const apexAngle = apexGiven ? vars.a : 180 - 2 * vars.b;
        const safeApex = Math.max(15, Math.min(150, apexAngle));
        const apexR = safeApex * Math.PI / 180;

        const halfBase = 1.0;
        const triH = halfBase / Math.tan(apexR / 2);
        const pad = 46;
        const scale = Math.min((VW - 2 * pad) / (2 * halfBase), (VH - 2 * pad) / triH) * 0.85;

        const cx = VW / 2;
        const scaledHB = halfBase * scale;
        const scaledHH = triH * scale;
        const topY = (VH - scaledHH) / 2;
        const botY = topY + scaledHH;

        // P[0]=꼭지(apex), P[1]=밑-왼쪽, P[2]=밑-오른쪽
        const P = [[cx, topY], [cx - scaledHB, botY], [cx + scaledHB, botY]];
        const cxT = (P[0][0] + P[1][0] + P[2][0]) / 3;
        const cyT = (P[0][1] + P[1][1] + P[2][1]) / 3;

        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', String(VH));
        svg.style.cssText =
            'max-width:240px;display:block;margin:4px auto 0;' +
            'background:rgba(142,197,255,0.07);border-radius:14px';

        svg.appendChild(svgEl('polygon', {
            points: P.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
            fill: 'rgba(142,197,255,0.20)',
            stroke: '#4a90d9',
            'stroke-width': '2.2',
            'stroke-linejoin': 'round'
        }));

        // 같은 변(두 다리) 위에 눈금 표시
        function addTick(Pa, Pb) {
            const mx = (Pa[0] + Pb[0]) / 2, my = (Pa[1] + Pb[1]) / 2;
            const dx = Pb[0] - Pa[0], dy = Pb[1] - Pa[1];
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len * 6, ny = dx / len * 6;
            svg.appendChild(svgEl('line', {
                x1: (mx + nx).toFixed(1), y1: (my + ny).toFixed(1),
                x2: (mx - nx).toFixed(1), y2: (my - ny).toFixed(1),
                stroke: '#4a90d9', 'stroke-width': '2.2', 'stroke-linecap': 'round'
            }));
        }
        addTick(P[0], P[1]);
        addTick(P[0], P[2]);

        // 각 꼭짓점별 레이블 설정
        // apexGiven: [0]=a°, [1]=?, [2]=?
        // baseGiven: [0]=?,  [1]=b°, [2]=b°
        const cfg = apexGiven
            ? [{ label: `${vars.a}°`, unk: false }, { label: '?', unk: true }, { label: '?', unk: true }]
            : [{ label: '?', unk: true }, { label: `${vars.b}°`, unk: false }, { label: `${vars.b}°`, unk: false }];

        const ARC_R = 18;
        P.forEach(([vx, vy], i) => {
            const [ax, ay] = P[(i + 1) % 3];
            const [bxp, byp] = P[(i + 2) % 3];
            const u1 = norm(ax - vx, ay - vy);
            const u2 = norm(bxp - vx, byp - vy);
            const cross = u1[0] * u2[1] - u1[1] * u2[0];
            const sweep = cross < 0 ? 0 : 1;
            const p1x = vx + u1[0] * ARC_R, p1y = vy + u1[1] * ARC_R;
            const p2x = vx + u2[0] * ARC_R, p2y = vy + u2[1] * ARC_R;
            const unk = cfg[i].unk;
            const stroke = unk ? '#e07010' : '#4a90d9';

            if (unk) {
                svg.appendChild(svgEl('path', {
                    d: `M ${vx.toFixed(1)} ${vy.toFixed(1)} ` +
                       `L ${p1x.toFixed(1)} ${p1y.toFixed(1)} ` +
                       `A ${ARC_R} ${ARC_R} 0 0 ${sweep} ${p2x.toFixed(1)} ${p2y.toFixed(1)} Z`,
                    fill: 'rgba(224,112,16,0.18)', stroke: 'none'
                }));
            }
            svg.appendChild(svgEl('path', {
                d: `M ${p1x.toFixed(1)} ${p1y.toFixed(1)} ` +
                   `A ${ARC_R} ${ARC_R} 0 0 ${sweep} ${p2x.toFixed(1)} ${p2y.toFixed(1)}`,
                fill: 'none', stroke, 'stroke-width': unk ? '2.2' : '1.8'
            }));

            // 레이블: 꼭짓점 → 무게중심 방향
            const distC = Math.hypot(cxT - vx, cyT - vy) || 1;
            const labelD = Math.min(ARC_R + 16, distC * 0.68);
            const lx = vx + (cxT - vx) / distC * labelD;
            const ly = vy + (cyT - vy) / distC * labelD;
            svg.appendChild(svgEl('text', {
                x: lx.toFixed(1), y: ly.toFixed(1),
                'text-anchor': 'middle', 'dominant-baseline': 'middle',
                'font-size': unk ? '16' : '13',
                'font-weight': unk ? '900' : '700',
                fill: unk ? '#b85000' : '#1d4e8a'
            }, cfg[i].label));
        });

        return svg;
    }

    // ── 진입점 ────────────────────────────────────────────────────
    function render(type, vars) {
        if (type === 'triangle-angles') return triangleAnglesSVG(vars);
        if (type === 'isosceles-apex') return isoscelesSVG(vars, true);
        if (type === 'isosceles-base') return isoscelesSVG(vars, false);
        return null;
    }

    // ── 자가 검증 (콘솔 오류로 즉시 포착) ───────────────────────
    (function selfTest() {
        const cases = [
            { a: 90, b: 60, i: 0, expect: true,  desc: '기지각 90° (i=0) → 직각기호' },
            { a: 60, b: 90, i: 1, expect: true,  desc: '기지각 90° (i=1) → 직각기호' },
            { a: 60, b: 30, i: 2, expect: false, desc: '미지각 90° (i=2) → 호 (힌트방지)' },
            { a: 60, b: 70, i: 2, expect: false, desc: '미지각 50° (i=2) → 호' },
        ];
        cases.forEach(({ a, b, i, expect, desc }) => {
            const angles = [a, b, 180 - a - b];
            const isRight = angles[i] === 90 && i !== 2;
            if (isRight !== expect)
                console.error('[QuestionFigures] ❌ 자가검증 실패:', desc, { isRight, expect });
        });
    })();

    window.QuestionFigures = { render };
})();

/* ── 막대그래프 인터랙티브 위젯 ──────────────────────────────────────────
   window.BarGraphWidget.create(opts) → { element, getValues, markAnswers }
   opts: {
     labels        string[]   — 항목 이름 (x축 레이블)
     correctValues number[]   — 각 항목의 정답 값
     unit          string     — 단위 (예: "명")
     scale         number     — 눈금 한 칸의 값 (기본 1)
     yMin          number     — y축 시작값 (기본 0; >0이면 물결 끊김 표시)
   }
*/
(function () {
    'use strict';

    function create(opts) {
        const labels        = opts.labels        || [];
        const correctValues = opts.correctValues || [];
        const unit          = opts.unit          || '';
        const scale         = opts.scale         || 1;
        const n             = labels.length;

        // y축 범위 계산
        const maxVal  = correctValues.length ? Math.max.apply(null, correctValues) : scale;
        const yMin    = Math.floor((opts.yMin || 0) / scale) * scale;
        const hasWave = yMin > 0;
        const yMax    = Math.ceil((maxVal + scale) / scale) * scale;
        const numRows = (yMax - yMin) / scale;

        // 물결 아래(0~yMin)에 보여줄 행 수 — 난이도 조절용.
        // 항상 잘림(break) 구간이 남도록 [1, yMin/scale - 1]로 클램프.
        const belowRows = hasWave
            ? Math.max(1, Math.min(Number(opts.belowRows) || 1, Math.max(1, Math.round(yMin / scale) - 1)))
            : 0;
        const CELL_W = 44, CELL_H = 34, BREAK_H = 26;

        // 각 막대의 현재 높이 (0 = 비어있음)
        const barHeights = new Array(n).fill(0);

        function div(cls) {
            const d = document.createElement('div');
            d.className = cls;
            return d;
        }

        const widget = div('bg-widget');

        // ── 데이터 표 ──────────────────────────────────────────────
        const tbl = document.createElement('table');
        tbl.className = 'bg-table';

        const trLbl = document.createElement('tr');
        const thItem = document.createElement('th');
        thItem.textContent = '항목';
        trLbl.appendChild(thItem);
        labels.forEach(function (l) {
            const td = document.createElement('td');
            td.textContent = l;
            trLbl.appendChild(td);
        });

        const trVal = document.createElement('tr');
        const thVal = document.createElement('th');
        thVal.textContent = unit ? '수 (' + unit + ')' : '수';
        trVal.appendChild(thVal);
        correctValues.forEach(function (v) {
            const td = document.createElement('td');
            td.textContent = v;
            trVal.appendChild(td);
        });

        tbl.appendChild(trLbl);
        tbl.appendChild(trVal);
        widget.appendChild(tbl);

        const instr = div('bg-instruction');
        instr.textContent = '✏️ 막대를 눌러 높이를 맞춰보세요!';
        widget.appendChild(instr);

        // ── 그래프 영역 ────────────────────────────────────────────
        const graphArea = div('bg-graph');

        // ── Y축 레이블 ─────────────────────────────────────────────
        const yaxis = div('bg-yaxis');
        // 인터랙티브 행 레이블: yMax(상단) → yMin+scale(하단)
        for (var r = 0; r <= numRows; r++) {
            var val = yMax - r * scale;
            var lbl = div(r < numRows ? 'bg-ylabel' : 'bg-ylabel bg-ylabel-min');
            lbl.textContent = val;
            yaxis.appendChild(lbl);
        }
        // 물결(끊김) 구간 + 물결 아래 행 레이블 (yMin > 0일 때)
        if (hasWave) {
            yaxis.appendChild(div('bg-ylabel-break'));      // 물결 높이만큼 빈 칸
            for (var bl = belowRows; bl >= 1; bl--) {        // 물결 아래 행: belowRows*scale … scale
                var blLbl = div('bg-ylabel');
                blLbl.textContent = bl * scale;
                yaxis.appendChild(blLbl);
            }
            var zeroLbl = div('bg-ylabel bg-ylabel-min');
            zeroLbl.textContent = '0';
            yaxis.appendChild(zeroLbl);
        }
        graphArea.appendChild(yaxis);

        // ── 격자 래퍼 (왼쪽 테두리 = Y축) ─────────────────────────
        const gridWrap = div('bg-grid-wrap');

        // 인터랙티브 셀 행렬 cells[row][col]
        var cells = [];
        for (var ri = 0; ri < numRows; ri++) {
            var row = div('bg-row');
            var rowCells = [];
            for (var ci = 0; ci < n; ci++) {
                var cell = div('bg-cell');
                (function (col, rIdx) {
                    cell.addEventListener('click', function () { handleClick(col, rIdx); });
                })(ci, ri);
                row.appendChild(cell);
                rowCells.push(cell);
            }
            cells.push(rowCells);
            gridWrap.appendChild(row);
        }

        var belowCells = [];   // belowCells[행][col] — 물결 아래 행 셀
        var breakBars  = [];   // breakBars[col] — 물결 구간 막대 연장(SVG rect)
        if (!hasWave) {
            // X축 바닥선 (0)
            gridWrap.appendChild(div('bg-axis-line'));
        } else {
            // ── 물결(끊김) 띠 ──
            // 막대를 배경처럼 연장해 그린 뒤, 위아래가 물결이고 안쪽이 배경색인
            // 도형을 올려 가운데를 잘라낸다(두 줄기 사이 = 빈 상태).
            var breakBand = div('bg-break');
            var breakW = n * CELL_W;
            var bsvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            bsvg.setAttribute('width', breakW);
            bsvg.setAttribute('height', BREAK_H);
            bsvg.setAttribute('viewBox', '0 0 ' + breakW + ' ' + BREAK_H);
            bsvg.style.display = 'block';

            // 빈 격자 배경 (빈 셀과 같은 색)
            var bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            bgRect.setAttribute('x', 0); bgRect.setAttribute('y', 0);
            bgRect.setAttribute('width', breakW); bgRect.setAttribute('height', BREAK_H);
            bgRect.setAttribute('fill', '#f5faff');
            bsvg.appendChild(bgRect);

            // 칸마다 막대 연장 (채움색은 redrawCol/markAnswers에서 지정)
            for (var bc = 0; bc < n; bc++) {
                var brect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                brect.setAttribute('x', bc * CELL_W); brect.setAttribute('y', 0);
                brect.setAttribute('width', CELL_W); brect.setAttribute('height', BREAK_H);
                brect.setAttribute('fill', 'none');
                bsvg.appendChild(brect);
                breakBars.push(brect);
            }

            // 물결 잘림 도형
            var amp = 3.5, segW = 13;
            var tyB = BREAK_H * 0.34, byB = BREAK_H * 0.66; // 두 줄기 위치
            var waveD = function (baseY) {
                var d = 'M0,' + baseY, x;
                for (x = 0; x < breakW; x += segW) {
                    d += ' Q' + (x + segW * 0.25) + ',' + (baseY - amp) + ' ' + (x + segW * 0.5) + ',' + baseY +
                         ' Q' + (x + segW * 0.75) + ',' + (baseY + amp) + ' ' + (x + segW) + ',' + baseY;
                }
                return d;
            };
            var waveDRev = function (baseY) {
                var d = '', x;
                for (x = breakW; x > 0; x -= segW) {
                    d += ' Q' + (x - segW * 0.25) + ',' + (baseY + amp) + ' ' + (x - segW * 0.5) + ',' + baseY +
                         ' Q' + (x - segW * 0.75) + ',' + (baseY - amp) + ' ' + (x - segW) + ',' + baseY;
                }
                return d;
            };
            // 두 물결 사이를 배경색으로 채워 막대를 잘라냄
            var cut = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            cut.setAttribute('d', waveD(tyB) + ' L' + breakW + ',' + byB + waveDRev(byB) + ' Z');
            cut.setAttribute('fill', '#f5faff');
            bsvg.appendChild(cut);
            // 두 줄기(물결선)
            [tyB, byB].forEach(function (baseY) {
                var ln = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                ln.setAttribute('d', waveD(baseY));
                ln.setAttribute('fill', 'none');
                ln.setAttribute('stroke', '#555');
                ln.setAttribute('stroke-width', '2');
                ln.setAttribute('stroke-linecap', 'round');
                bsvg.appendChild(ln);
            });
            breakBand.appendChild(bsvg);
            gridWrap.appendChild(breakBand);

            // ── 물결 아래 행 (값 1…belowRows) — 클릭 불가, 막대가 이어져 보임 ──
            for (var brow = 0; brow < belowRows; brow++) {
                var bRow = div('bg-below-row');
                var bRowCells = [];
                for (var bci = 0; bci < n; bci++) {
                    var bcell = div('bg-below-cell');
                    bRow.appendChild(bcell);
                    bRowCells.push(bcell);
                }
                gridWrap.appendChild(bRow);
                belowCells.push(bRowCells);
            }

            // X축 바닥선 (0)
            gridWrap.appendChild(div('bg-axis-line'));
        }

        // X축 레이블
        const xlabels = div('bg-xlabels');
        labels.forEach(function (l) {
            const xl = div('bg-xlabel');
            xl.textContent = l;
            xlabels.appendChild(xl);
        });
        gridWrap.appendChild(xlabels);

        if (unit) {
            const unitLbl = div('bg-graph-unit');
            unitLbl.textContent = '(단위: ' + unit + ')';
            gridWrap.appendChild(unitLbl);
        }

        graphArea.appendChild(gridWrap);
        widget.appendChild(graphArea);

        // ── 인터랙션 ──────────────────────────────────────────────
        function topRow(h) {
            if (h <= yMin) return numRows; // 빈 막대
            return Math.round((yMax - h) / scale);
        }

        // 물결 구간 막대 연장 색칠
        function paintBreakBar(col, state) {
            if (!hasWave || !breakBars[col]) return;
            var fill = state === 'correct' ? '#7fd8be'
                     : state === 'hint'    ? 'rgba(127,216,190,0.30)'
                     : state === 'sky'     ? '#8ec5ff'
                     : 'none';
            breakBars[col].setAttribute('fill', fill);
        }

        // 물결 아래 행 셀 색칠
        function updateBelow(col, cls) {
            // cls: 'below-filled' | 'below-correct' | 'below-hint' | null
            if (!hasWave) return;
            belowCells.forEach(function (bRow) {
                var bc = bRow[col];
                bc.classList.remove('below-filled', 'below-correct', 'below-hint');
                if (cls) bc.classList.add(cls);
            });
        }

        function redrawCol(col) {
            var tr = topRow(barHeights[col]);
            for (var r = 0; r < numRows; r++) {
                cells[r][col].classList.toggle('filled', r >= tr);
            }
            var on = barHeights[col] > yMin;
            updateBelow(col, on ? 'below-filled' : null);
            paintBreakBar(col, on ? 'sky' : null);
        }

        function handleClick(col, rIdx) {
            if (widget.classList.contains('bg-checked')) return;
            var val = yMax - rIdx * scale;
            barHeights[col] = (barHeights[col] === val) ? 0 : val;
            redrawCol(col);
        }

        // ── 공개 메서드 ───────────────────────────────────────────
        function getValues() { return barHeights.slice(); }

        function markAnswers(userVals, correctVals) {
            widget.classList.add('bg-checked');
            for (var c = 0; c < n; c++) {
                var uH = userVals[c];
                var cH = correctVals[c];
                var ok = (uH === cH);
                var cTop = topRow(cH);
                for (var r = 0; r < numRows; r++) {
                    var cell = cells[r][c];
                    cell.classList.remove('filled');
                    if (r >= cTop) cell.classList.add(ok ? 'bg-correct' : 'bg-hint');
                }
                updateBelow(c, ok ? 'below-correct' : 'below-hint');
                paintBreakBar(c, ok ? 'correct' : 'hint');
            }
        }

        // 미리 채우기 (검증 페이지용)
        function prefill(vals) {
            vals.forEach(function (v, i) {
                barHeights[i] = v;
                redrawCol(i);
            });
        }

        return { element: widget, getValues: getValues, markAnswers: markAnswers, prefill: prefill };
    }

    window.BarGraphWidget = { create: create };
})();
