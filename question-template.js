/* 문제 템플릿 엔진 (공용)
   🎲 "포맷은 그대로, 숫자만 매번 바뀌는" 생성형 문제를 만든다.
      문제 객체에 template이 있으면, 변수를 범위에서 뽑고 제약(음수 방지·정확히
      나누어떨어짐 등)을 만족할 때까지 다시 뽑은 뒤, prompt/choices/answer/tolerance가
      구체값으로 채워진 새 객체를 돌려준다. template이 없으면 원본 그대로 반환한다.
      → 그래서 렌더·채점·리포트 코드는 손대지 않아도 된다(이미 구체값만 다루므로).
      빌드 도구가 없으므로 <script>로 불러 window.QuestionTemplate 전역으로 쓴다.

   사용 예)
     const concrete = QuestionTemplate.instantiate(q);           // 매번 새 숫자
     const concrete = QuestionTemplate.instantiate(q, {seed:7}); // 재현 가능(테스트)

   template 스키마)
     {
       "vars":        { "a": {"min":100,"max":999,"step":1}, ... },  // 정수 변수
       "constraints": ["a >= b", "a % b == 0"],   // 모두 참이어야 채택(아니면 재추첨)
       "derived":     { "g": "gcd(num,d)", ... }, // 선언 순서대로 계산되는 파생값
       "prompt":      "{a} ÷ {b} = ?",            // {이름} → 포맷된 값으로 치환
       "format":      { "x": "dec:1", "pfrac": "frac", "ans": "mixed", "n": "korean" },
       //               dec:N=소수 N자리, frac=분수, mixed=대분수, korean=한글 읽기(큰 수)
       "promptParts": { "pfrac": ["p","d"], "ans": ["whole","rem","rd"] },
       "answer":      "a / b",        // numeric: 산술식 → 숫자
       "tolerance":   0.001,          // numeric(선택): 소수 오차 허용
       "choices":     ["a*b", "a*b+a", ...]  // mc: 0번이 정답, 나머지 오답 유인지
     }
*/
(function () {
    'use strict';

    // ── 안전한 식 계산기 (eval/Function 미사용) ─────────────────
    // 지원: + - * / %  (산술), == != < <= > >= && ||  (제약/불리언),
    //       괄호, 단항 -, 화이트리스트 함수.
    const FUNCS = {
        floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs,
        min: Math.min, max: Math.max, pow: Math.pow,
        gcd: function (a, b) {
            a = Math.abs(Math.round(a)); b = Math.abs(Math.round(b));
            while (b) { const t = a % b; a = b; b = t; }
            return a;
        },
        lcm: function (a, b) {
            const g = FUNCS.gcd(a, b);
            return g ? Math.abs(Math.round(a) / g * Math.round(b)) : 0;
        },
    };

    function tokenize(s) {
        const toks = [];
        const two = ['==', '!=', '<=', '>=', '&&', '||'];
        let i = 0;
        while (i < s.length) {
            const c = s[i];
            if (c === ' ' || c === '\t') { i++; continue; }
            if (/[0-9.]/.test(c)) {
                let j = i + 1;
                while (j < s.length && /[0-9.]/.test(s[j])) j++;
                toks.push({ t: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue;
            }
            if (/[a-zA-Z_]/.test(c)) {
                let j = i + 1;
                while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j++;
                toks.push({ t: 'id', v: s.slice(i, j) }); i = j; continue;
            }
            const pair = s.slice(i, i + 2);
            if (two.indexOf(pair) >= 0) { toks.push({ t: 'op', v: pair }); i += 2; continue; }
            if ('+-*/%()<>,'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c }); i++; continue; }
            throw new Error('알 수 없는 문자: ' + c);
        }
        toks.push({ t: 'eof' });
        return toks;
    }

    function parse(toks) {
        let p = 0;
        const peek = () => toks[p];
        const next = () => toks[p++];
        function expect(v) { const t = next(); if (t.v !== v) throw new Error('기대한 토큰: ' + v); }

        function parseOr() { let n = parseAnd(); while (peek().v === '||') { next(); n = { op: '||', a: n, b: parseAnd() }; } return n; }
        function parseAnd() { let n = parseEq(); while (peek().v === '&&') { next(); n = { op: '&&', a: n, b: parseEq() }; } return n; }
        function parseEq() { let n = parseCmp(); while (peek().v === '==' || peek().v === '!=') { const o = next().v; n = { op: o, a: n, b: parseCmp() }; } return n; }
        function parseCmp() { let n = parseAdd(); while (['<', '<=', '>', '>='].indexOf(peek().v) >= 0) { const o = next().v; n = { op: o, a: n, b: parseAdd() }; } return n; }
        function parseAdd() { let n = parseMul(); while (peek().v === '+' || peek().v === '-') { const o = next().v; n = { op: o, a: n, b: parseMul() }; } return n; }
        function parseMul() { let n = parseUnary(); while (['*', '/', '%'].indexOf(peek().v) >= 0) { const o = next().v; n = { op: o, a: n, b: parseUnary() }; } return n; }
        function parseUnary() {
            if (peek().v === '-') { next(); return { op: 'neg', a: parseUnary() }; }
            if (peek().v === '+') { next(); return parseUnary(); }
            return parsePrimary();
        }
        function parsePrimary() {
            const t = peek();
            if (t.t === 'num') { next(); return { num: t.v }; }
            if (t.t === 'id') {
                next();
                if (peek().v === '(') { // 함수 호출
                    next();
                    const args = [];
                    if (peek().v !== ')') { args.push(parseOr()); while (peek().v === ',') { next(); args.push(parseOr()); } }
                    expect(')');
                    return { fn: t.v, args: args };
                }
                return { id: t.v };
            }
            if (t.v === '(') { next(); const n = parseOr(); expect(')'); return n; }
            throw new Error('예상치 못한 토큰: ' + (t.v != null ? t.v : t.t));
        }
        const ast = parseOr();
        if (peek().t !== 'eof') throw new Error('식을 다 읽지 못했어요');
        return ast;
    }

    function evalAst(n, scope) {
        if ('num' in n) return n.num;
        if ('id' in n) { if (!(n.id in scope)) throw new Error('알 수 없는 변수: ' + n.id); return scope[n.id]; }
        if ('fn' in n) {
            const f = FUNCS[n.fn];
            if (!f) throw new Error('허용되지 않은 함수: ' + n.fn);
            return f.apply(null, n.args.map(a => evalAst(a, scope)));
        }
        if (n.op === 'neg') return -evalAst(n.a, scope);
        const a = evalAst(n.a, scope), b = evalAst(n.b, scope);
        switch (n.op) {
            case '+': return a + b;
            case '-': return a - b;
            case '*': return a * b;
            case '/': if (b === 0) throw new Error('0으로 나눌 수 없어요'); return a / b;
            case '%': if (b === 0) throw new Error('0으로 나머지 연산'); return a % b;
            case '==': return a === b;
            case '!=': return a !== b;
            case '<': return a < b;
            case '<=': return a <= b;
            case '>': return a > b;
            case '>=': return a >= b;
            case '&&': return a && b;
            case '||': return a || b;
        }
        throw new Error('알 수 없는 연산: ' + n.op);
    }

    const astCache = {}; // 식 문자열 → AST (재추첨 때 재파싱 안 하려고 캐시)
    function compile(expr) {
        if (!(expr in astCache)) astCache[expr] = parse(tokenize(expr));
        return astCache[expr];
    }
    function evalExpr(expr, scope) { return evalAst(compile(expr), scope); }

    // ── 숫자 → 한글 읽기 (큰 수 단원: 만·억·조 단위) ───────────
    // 예) 50507 → "오만 오백칠", 70205 → "칠만 이백오", 10507 → "만 오백칠"
    //   · 천/백/십과 만·억·조 자리의 계수 1은 '일'을 떼고 단위만 읽음(만, 천 …).
    //   · 0인 자리는 건너뜀(0이 포함된 큰 수 읽기 핵심).
    const K_DIGITS = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
    const K_SMALL = ['천', '백', '십', '']; // 네 자리 묶음 안 자릿값(천/백/십/일)
    const K_BIG = ['', '만', '억', '조'];   // 네 자리 묶음 단위
    function readFourDigits(n) { // 0..9999 → 한글
        const d = [Math.floor(n / 1000) % 10, Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
        let s = '';
        for (let i = 0; i < 4; i++) {
            const digit = d[i];
            if (digit === 0) continue;
            // 천·백·십 자리의 계수 1은 '일'을 떼고 단위만(천, 백, 십)
            if (digit === 1 && i < 3) s += K_SMALL[i];
            else s += K_DIGITS[digit] + K_SMALL[i];
        }
        return s;
    }
    function numberToKorean(n) {
        n = Math.round(n);
        if (n === 0) return '영';
        if (n < 0) return '마이너스 ' + numberToKorean(-n);
        const groups = [];
        let x = n;
        while (x > 0) { groups.push(x % 10000); x = Math.floor(x / 10000); }
        const parts = [];
        for (let i = groups.length - 1; i >= 0; i--) {
            const g = groups[i];
            if (g === 0) continue;
            // 만·억·조 자리의 계수 1은 '일'을 떼고 단위만(만, 억 …)
            let gs = (g === 1 && i >= 1) ? '' : readFourDigits(g);
            parts.push(gs + K_BIG[i]);
        }
        return parts.join(' ');
    }

    // ── 숫자 정리/표시 ─────────────────────────────────────────
    function cleanNum(v) {
        if (typeof v !== 'number') return v;
        if (Number.isInteger(v)) return v;
        return Math.round(v * 1e9) / 1e9; // 부동소수 잡음 제거
    }
    function numToStr(v) { return String(cleanNum(v)); }

    // ── 시드 PRNG (선택: 재현 가능 출제/테스트) ────────────────
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // ── 변수 추첨 + 파생 + 제약(거부 표집) ─────────────────────
    function rollVars(vars, rng) {
        const scope = {};
        for (const name in vars) {
            const spec = vars[name];
            const step = spec.step || 1;
            const span = Math.floor((spec.max - spec.min) / step);
            scope[name] = spec.min + step * Math.floor(rng() * (span + 1));
        }
        return scope;
    }

    function buildScope(tpl, rng) {
        const scope = rollVars(tpl.vars || {}, rng);
        if (tpl.derived) {
            for (const name in tpl.derived) scope[name] = evalExpr(tpl.derived[name], scope);
        }
        if (tpl.constraints) {
            for (let i = 0; i < tpl.constraints.length; i++) {
                if (!evalExpr(tpl.constraints[i], scope)) return null; // 불만족 → 재추첨
            }
        }
        return scope;
    }

    // ── 값 포맷 (prompt·choices·정답이 같은 포매터를 공유) ──────
    function formatValue(token, scope, fmt, parts) {
        const f = fmt && fmt[token];
        if (f === 'frac') {
            const t = parts[token]; // [분자, 분모]
            return cleanNum(scope[t[0]]) + '/' + cleanNum(scope[t[1]]);
        }
        if (f === 'mixed') {
            const t = parts[token]; // [정수부, 나머지분자, 분모]
            const w = cleanNum(scope[t[0]]), r = cleanNum(scope[t[1]]), d = cleanNum(scope[t[2]]);
            if (r === 0) return String(w);
            if (w === 0) return r + '/' + d;
            return w + ' ' + r + '/' + d;
        }
        if (typeof f === 'string' && f.indexOf('dec:') === 0) {
            return Number(scope[token]).toFixed(parseInt(f.slice(4), 10));
        }
        if (f === 'korean') {
            if (!(token in scope)) throw new Error('알 수 없는 자리표시자: ' + token);
            return numberToKorean(scope[token]);
        }
        // plain / int
        if (!(token in scope)) throw new Error('알 수 없는 자리표시자: ' + token);
        return numToStr(scope[token]);
    }

    function fillPlaceholders(str, scope, fmt, parts) {
        return String(str).replace(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g,
            (_, tok) => formatValue(tok, scope, fmt, parts));
    }

    // 선택지/정답 하나를 문자열로: {…} 가 있으면 자리표시자 치환, 없으면 산술식.
    function renderChoice(str, scope, fmt, parts) {
        if (/\{[a-zA-Z_][a-zA-Z0-9_]*\}/.test(str)) return fillPlaceholders(str, scope, fmt, parts);
        return numToStr(evalExpr(str, scope));
    }

    // ── MC 선택지 생성 (0번=정답, 중복 제거, 4개로 패딩) ───────
    function buildChoices(tpl, scope) {
        const raw = (tpl.choices || []).map(c => renderChoice(c, scope, tpl.format, tpl.promptParts));
        if (!raw.length) throw new Error('선택지가 없어요');
        const correct = raw[0];
        const seen = {};
        const out = [];
        raw.forEach(c => { if (!seen[c]) { seen[c] = true; out.push(c); } });
        // 충돌로 4개 미만이면 숫자 정답 ±k 로 보충(숫자 선택지일 때만)
        const correctNum = Number(correct);
        if (String(cleanNum(correctNum)) === correct && Number.isFinite(correctNum)) {
            let k = 1;
            while (out.length < 4 && k <= 100) {
                [k, -k].forEach(delta => {
                    if (out.length >= 4) return;
                    const val = correctNum + delta;
                    if (val < 0) return;
                    const cand = numToStr(val);
                    if (!seen[cand]) { seen[cand] = true; out.push(cand); }
                });
                k++;
            }
        }
        return { choices: out, answer: correct };
    }

    // ── 인스턴스화 ─────────────────────────────────────────────
    function instantiate(q, opts) {
        if (!q || !q.template) return q; // 템플릿 없으면 그대로(완전 하위호환)
        opts = opts || {};
        const tpl = q.template;
        const rng = (opts.seed != null) ? mulberry32(opts.seed) : Math.random;
        const maxAttempts = opts.maxAttempts || 200;

        let scope = null;
        for (let i = 0; i < maxAttempts; i++) {
            try {
                const s = buildScope(tpl, rng);
                if (s) { scope = s; break; }
            } catch (e) { /* 0 나눗셈 등 → 재추첨 */ }
        }
        if (!scope) {
            console.warn('[QuestionTemplate] 제약을 만족하는 값을 찾지 못했어요:', q.id);
            return Object.assign({}, q, { __templateFailed: true });
        }

        const base = {
            id: q.id, grade: q.grade, unitId: q.unitId,
            skillId: q.skillId, difficulty: q.difficulty, type: q.type,
        };
        try {
            base.prompt = fillPlaceholders(tpl.prompt, scope, tpl.format, tpl.promptParts);
            if (q.type === 'mc') {
                const built = buildChoices(tpl, scope);
                base.choices = built.choices;
                base.answer = built.answer; // 0번 선택지와 글자까지 동일(같은 포매터)
            } else {
                base.answer = cleanNum(evalExpr(tpl.answer, scope));
                const tol = tpl.tolerance;
                base.tolerance = (typeof tol === 'string') ? evalExpr(tol, scope) : (tol || 0);
            }
        } catch (e) {
            console.warn('[QuestionTemplate] 문제 생성 실패:', q.id, e && e.message);
            return Object.assign({}, q, { __templateFailed: true });
        }
        if (tpl.figure) {
            base.figure = tpl.figure;
            base._vars = Object.assign({}, scope);
        }
        return base;
    }

    window.QuestionTemplate = {
        instantiate: instantiate,
        // 검증·테스트에서 쓰는 내부 헬퍼 노출
        _evalExpr: evalExpr,
    };
})();
