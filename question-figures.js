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
        const aR = a * Math.PI / 180, bR = b * Math.PI / 180;

        const VW = 220, VH = 200;

        // 단위 삼각형: P0=(0,0) ∠a, P1=(1,0) ∠b, P2=(tX,tY) ∠c
        const sinAB = Math.sin(aR + bR);
        const tX = Math.cos(aR) * Math.sin(bR) / sinAB;
        const tY = Math.sin(aR) * Math.sin(bR) / sinAB;

        // 레이블 여백을 포함한 가용 영역
        const pad = 46;
        const avW = VW - 2 * pad, avH = VH - 2 * pad;

        // 비율 유지 스케일
        const scale = Math.min(avW / 1, avH / tY) * 0.80;

        // 삼각형을 뷰박스 중앙에 배치 (y-축 반전)
        const triW = scale, triH = tY * scale;
        const baseX = (VW - triW) / 2;
        const baseY = (VH + triH) / 2;   // base 꼭짓점의 SVG y 좌표

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
            'max-width:220px;display:block;margin:4px auto 0;' +
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
        const labels    = [`${a}°`, `${b}°`, '?'];
        const arcStroke = ['#4a90d9', '#4a90d9', '#e07010'];
        const txtFill   = ['#1d4e8a', '#1d4e8a', '#b85000'];
        const txtSize   = ['13',      '13',      '16'];
        const txtWeight = ['700',     '700',     '900'];

        P.forEach(([vx, vy], i) => {
            const [ax, ay] = P[(i + 1) % 3];
            const [bx, by] = P[(i + 2) % 3];
            const u1 = norm(ax - vx, ay - vy);
            const u2 = norm(bx - vx, by - vy);

            // 호 끝점
            const p1x = vx + u1[0] * ARC_R, p1y = vy + u1[1] * ARC_R;
            const p2x = vx + u2[0] * ARC_R, p2y = vy + u2[1] * ARC_R;

            // cross < 0 이면 SVG CCW sweep=0 이 삼각형 내부 호
            const cross = u1[0] * u2[1] - u1[1] * u2[0];
            const sweep = cross < 0 ? 0 : 1;

            // 미지각: 부채꼴 배경 강조
            if (i === 2) {
                svg.appendChild(svgEl('path', {
                    d: `M ${vx.toFixed(1)} ${vy.toFixed(1)} ` +
                       `L ${p1x.toFixed(1)} ${p1y.toFixed(1)} ` +
                       `A ${ARC_R} ${ARC_R} 0 0 ${sweep} ${p2x.toFixed(1)} ${p2y.toFixed(1)} Z`,
                    fill: 'rgba(224,112,16,0.18)',
                    stroke: 'none'
                }));
            }

            // 각도 호
            svg.appendChild(svgEl('path', {
                d: `M ${p1x.toFixed(1)} ${p1y.toFixed(1)} ` +
                   `A ${ARC_R} ${ARC_R} 0 0 ${sweep} ${p2x.toFixed(1)} ${p2y.toFixed(1)}`,
                fill: 'none',
                stroke: arcStroke[i],
                'stroke-width': i === 2 ? '2.2' : '1.8'
            }));

            // 레이블: 꼭짓점 → 무게중심 방향으로 이동 (삼각형 내부에 위치)
            const distC = Math.hypot(cxT - vx, cyT - vy) || 1;
            const labelD = Math.min(ARC_R + 17, distC * 0.68);
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

    // ── 진입점 ────────────────────────────────────────────────────
    function render(type, vars) {
        if (type === 'triangle-angles') return triangleAnglesSVG(vars);
        return null;
    }

    window.QuestionFigures = { render };
})();
