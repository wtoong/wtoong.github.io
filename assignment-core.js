/* 과제(시험지) 공용 코어 — DOM 없는 순수 로직
   🎯 "선생님이 범위·seed로 시험지 한 장을 고정 → 학생이 같은 시험지를 푼다"를 위한 엔진.
      같은 (범위·제외단원·문제수·seed)면 **항상 똑같은 문제 구성**이 나오도록 시드 RNG로
      문제 선택과 템플릿 인스턴스화를 모두 결정적으로 만든다(선생님 미리보기 == 학생 풀이).

   window.Assignment 로 노출. 선생님 도구(math-assign.js)와 학생 풀이(math-assignment.js)가 공유.

   config 형태:
     { from:'1-1', to:'4-1', drop:['2-3', ...], n:10, seed:837261 }
       from/to : 'g-s' (학년-학기). from~to 사이(누적 랭크)의 문제에서 출제.
       drop    : 범위 안에서 제외할 단원(unitId) 목록 (기본=전부 포함).
       n       : 문제 수.
       seed    : 시험지 고정값(정수).
*/
(function () {
    'use strict';

    const CURRICULUM_URL = 'data/math-curriculum.json';

    // ── 시드 RNG (question-template.js의 것과 동일한 mulberry32) ──
    function mulberry32(seed) {
        let a = (seed >>> 0) || 1;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    // 시드 셔플(Fisher–Yates) — rng를 받아 결정적으로 섞는다.
    function shuffle(arr, rng) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // 단원번호로 학기 추정 (curriculum에 semester 없을 때): 1~2번=1학기, 3번 이상=2학기
    function deriveSemester(unitId) {
        const n = parseInt(String(unitId).split('-')[1], 10);
        return n >= 3 ? 2 : 1;
    }
    // (학년, 학기) → 누적 순위. 1학년1학기=1 … 6학년2학기=12
    function rankOf(grade, sem) { return (grade - 1) * 2 + (sem === 2 ? 2 : 1); }
    function levelLabel(grade, sem) { return `${grade}학년 ${sem}학기`; }
    // 'g-s' 문자열 → {grade, sem, rank} (잘못된 값이면 null)
    function parseLevel(str) {
        const m = /^(\d)-(\d)$/.exec(String(str || '').trim());
        if (!m) return null;
        const grade = +m[1], sem = +m[2];
        if (grade < 1 || grade > 6 || (sem !== 1 && sem !== 2)) return null;
        return { grade, sem, rank: rankOf(grade, sem) };
    }
    function randomSeed() { return Math.floor(Math.random() * 900000) + 100000; } // 6자리

    // ── 데이터 캐시 ─────────────────────────────────────────────
    let curriculum = null;
    const unitName = {}, unitGrade = {}, unitSemester = {}, skillName = {};
    let ready = false;

    async function prepare() {
        if (ready) return true;
        try {
            const cRes = await fetch(CURRICULUM_URL);
            if (!cRes.ok) return false;
            curriculum = await cRes.json();
            await QuestionBank.loadManifest();
            (curriculum.grades || []).forEach(g => (g.units || []).forEach(u => {
                unitName[u.unitId] = u.unitName;
                unitGrade[u.unitId] = g.grade;
                unitSemester[u.unitId] = u.semester || deriveSemester(u.unitId);
                (u.skills || []).forEach(s => { skillName[s.skillId] = s.skillName; });
            }));
            ready = true;
            return true;
        } catch (e) { return false; }
    }

    // 한 학기(학년·학기)의 단원 목록 (순서 유지)
    function unitsForLevel(grade, sem) {
        const g = (curriculum && curriculum.grades || []).find(x => x.grade === grade);
        if (!g) return [];
        return (g.units || [])
            .filter(u => (u.semester || deriveSemester(u.unitId)) === sem)
            .map(u => ({ unitId: u.unitId, unitName: u.unitName }));
    }
    // from~to 범위 안의 (학년,학기) 레벨들을 순서대로
    function levelsInRange(fromRank, toRank) {
        const out = [];
        for (let g = 1; g <= 6; g++) for (let s = 1; s <= 2; s++) {
            const r = rankOf(g, s);
            if (r >= fromRank && r <= toRank) out.push({ grade: g, sem: s, rank: r });
        }
        return out;
    }
    function unitRank(unitId) {
        return rankOf(unitGrade[unitId] || 0, unitSemester[unitId] || 1);
    }

    // ── 시험지 만들기 (결정적) ───────────────────────────────────
    //   범위 안(제외 단원 빼고) 문제를 단원별로 모아, seed로 섞고 라운드로빈으로 골라
    //   단원이 골고루 섞이게 한다. 그 뒤 템플릿 문항은 seed에서 파생한 값으로 인스턴스화.
    async function buildQuiz(cfg) {
        const from = parseLevel(cfg.from), to = parseLevel(cfg.to);
        if (!from || !to) return { quizList: [], note: '범위가 올바르지 않아요', eligible: 0 };
        const lo = Math.min(from.rank, to.rank), hi = Math.max(from.rank, to.rank);
        const drop = new Set(cfg.drop || []);
        const n = Math.max(1, cfg.n | 0);
        const seed = (cfg.seed | 0) || 1;

        // 필요한 샤드만: 범위 안 레벨들의 단원을 모아 그 단원으로 로드
        const wantUnits = [];
        levelsInRange(lo, hi).forEach(lv => unitsForLevel(lv.grade, lv.sem).forEach(u => {
            if (!drop.has(u.unitId)) wantUnits.push(u.unitId);
        }));
        let bank = [];
        try { bank = await QuestionBank.loadByUnits(wantUnits); }
        catch (e) { return { quizList: [], note: '문제를 불러오지 못했어요', eligible: 0 }; }

        const eligible = bank.filter(q => {
            const r = unitRank(q.unitId);
            return r >= lo && r <= hi && !drop.has(q.unitId);
        });

        // 단원별로 묶어 seed로 섞기
        const rng = mulberry32(seed);
        const byUnit = {};
        eligible.forEach(q => { (byUnit[q.unitId] = byUnit[q.unitId] || []).push(q); });
        const unitIds = shuffle(Object.keys(byUnit), rng);
        unitIds.forEach(u => { byUnit[u] = shuffle(byUnit[u], rng); });

        // 라운드로빈으로 골고루 뽑기
        const chosen = [];
        let progress = true;
        while (chosen.length < n && progress) {
            progress = false;
            for (const u of unitIds) {
                if (byUnit[u].length) { chosen.push(byUnit[u].pop()); progress = true; }
                if (chosen.length >= n) break;
            }
        }

        // 템플릿 문항 인스턴스화 (seed에서 파생한 문항별 시드 → 결정적)
        const quizList = chosen.map(q => {
            if (!window.QuestionTemplate) return q;
            const qSeed = Math.floor(rng() * 4294967296);
            return window.QuestionTemplate.instantiate(q, { seed: qSeed });
        });

        let note = '';
        if (!eligible.length) note = '이 범위에는 아직 문제가 없어요 😢';
        else if (quizList.length < n) note = `이 범위 문제가 ${n}개보다 적어서 ${quizList.length}개만 있어요!`;
        return { quizList, note, eligible: eligible.length };
    }

    // ── URL 파라미터 ↔ config ───────────────────────────────────
    function toParams(cfg) {
        const p = new URLSearchParams();
        p.set('from', cfg.from);
        p.set('to', cfg.to);
        if (cfg.drop && cfg.drop.length) p.set('drop', cfg.drop.join(','));
        p.set('n', cfg.n);
        p.set('seed', cfg.seed);
        return p.toString();
    }
    function fromParams(params) {
        const from = params.get('from'), to = params.get('to');
        const seed = parseInt(params.get('seed'), 10);
        if (!parseLevel(from) || !parseLevel(to) || !seed) return null;
        const drop = (params.get('drop') || '').split(',').map(s => s.trim()).filter(Boolean);
        const n = parseInt(params.get('n'), 10);
        return { from, to, drop, n: [5, 10, 15, 20, 25, 30].includes(n) ? n : 10, seed };
    }

    // ── 결과 복원 코드 (유니코드 안전 base64) ────────────────────
    function encodeResult(payload) {
        const json = JSON.stringify(payload);
        return btoa(unescape(encodeURIComponent(json)));
    }
    function decodeResult(code) {
        try {
            const json = decodeURIComponent(escape(atob(String(code).trim())));
            return JSON.parse(json);
        } catch (e) { return null; }
    }

    window.Assignment = {
        prepare, buildQuiz,
        unitsForLevel, levelsInRange,
        parseLevel, rankOf, levelLabel, randomSeed,
        toParams, fromParams, encodeResult, decodeResult,
        // 맵 접근자
        unitName: id => unitName[id] || id,
        unitGrade: id => unitGrade[id],
        unitSemester: id => unitSemester[id],
        skillName: id => skillName[id] || id,
        get grades() { return (curriculum && curriculum.grades) || []; },
    };
})();
