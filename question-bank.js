/* 문제 은행 로더 (공용)
   📚 문제 은행을 (학년·학기)별 샤드 파일로 나눠 두고, 필요한 조각만 골라 읽는다.
      data/questions/index.json(매니페스트)에 샤드 목록이 있고, 엔진은 이걸 먼저 읽은 뒤
      범위(누적 랭크)나 단원(unitId)에 해당하는 샤드만 fetch 한다.
      빌드 도구가 없으므로 <script>로 불러 window.QuestionBank 전역으로 쓴다.

   사용 예)
     QuestionBank.basePath = 'data/questions/';      // (data/ 안의 페이지는 'questions/')
     const qs = await QuestionBank.loadByRank(7);     // 1학년1학기 ~ 4학년1학기 누적
     const qs = await QuestionBank.loadByUnits(['4-4']); // 특정 단원만
     const qs = await QuestionBank.loadAll();         // 전체 (검증·빌더용)
*/
(function () {
    'use strict';

    const api = {
        basePath: 'data/questions/', // 페이지 위치에 맞게 바꿔 쓴다(예: data/ 안에서는 'questions/')
        _manifest: null,
        _shardCache: {}, // file -> questions[]
    };

    function url(file) { return api.basePath + file; }

    // (학년, 학기) → 누적 순위 (math-diagnostic.js와 동일 규칙)
    function rankOf(grade, semester) {
        return (grade - 1) * 2 + (semester === 2 ? 2 : 1);
    }

    api.loadManifest = async function () {
        if (api._manifest) return api._manifest;
        const res = await fetch(url('index.json'));
        if (!res.ok) throw new Error('문제 은행 목록(index.json)을 불러오지 못했어요');
        api._manifest = await res.json();
        return api._manifest;
    };

    async function loadShardFile(file) {
        if (api._shardCache[file]) return api._shardCache[file];
        const res = await fetch(url(file));
        if (!res.ok) throw new Error('문제 조각을 불러오지 못했어요: ' + file);
        const data = await res.json();
        const qs = data.questions || [];
        api._shardCache[file] = qs;
        return qs;
    }

    // 샤드 여러 개를 읽어 id 기준 중복 없이 합친다.
    async function mergeShards(shards) {
        const lists = await Promise.all(shards.map(s => loadShardFile(s.file)));
        const seen = new Set();
        const out = [];
        lists.forEach(qs => qs.forEach(q => {
            if (!seen.has(q.id)) { seen.add(q.id); out.push(q); }
        }));
        return out;
    }

    // 누적 범위(maxRank 이하)의 샤드만 → 문항 배열
    api.loadByRank = async function (maxRank) {
        const m = await api.loadManifest();
        const shards = (m.shards || []).filter(s => rankOf(s.grade, s.semester) <= maxRank);
        return mergeShards(shards);
    };

    // 특정 단원(unitId)을 포함한 샤드만 읽고, 그 단원 문항만 추려서 반환
    api.loadByUnits = async function (unitIds) {
        const m = await api.loadManifest();
        const want = new Set(unitIds);
        const shards = (m.shards || []).filter(s => (s.units || []).some(u => want.has(u)));
        const all = await mergeShards(shards);
        return all.filter(q => want.has(q.unitId));
    };

    // 전체 문항 (검증 페이지·빌더 커버리지용)
    api.loadAll = async function () {
        const m = await api.loadManifest();
        return mergeShards(m.shards || []);
    };

    window.QuestionBank = api;
})();
