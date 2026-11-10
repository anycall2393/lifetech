/**
 * ===============================================
 * 🧬 생명 기술 질문 챗봇 v13 (GitHub판 서버)
 *    중3 기술 6단원 · 생명 기술의 이해 (Google Apps Script + Gemini)
 * ===============================================
 *
 * 화면(index.html)은 GitHub에 올리고, 이 파일은 Apps Script에 붙여넣어 '웹 앱'으로 배포합니다.
 *
 * ✅ 선생님이 바꿀 곳
 *   1. GEMINI_API_KEY  : AI 스튜디오(aistudio.google.com)에서 받은 키  ← 필수
 *   2. YOUTUBE_API_KEY : 유튜브 검색 키  ← 선택
 *   ⚠️ 키가 들어 있는 이 파일을 GitHub에 올리지 마세요. (GitHub에는 키가 빈 파일만)
 *      '초기설정'을 한 번 실행하면 키가 스크립트 속성에 저장되어, 그 뒤로는 코드에서 키를 지워도 됩니다.
 *
 * ⚡ v12 속도 개선 (서버가 하는 일을 크게 줄였어요)
 *   - 영상(내장 목록·선생님 추천) / 사진 / 위키백과 / 포털 검색 → 학생 브라우저가 직접 찾음 (서버를 거치지 않음)
 *   - 서버는 질문 1개에 'AI 답변' 1번만 처리 (예전에는 답변·영상·기록 3번)
 *   - 뉴스 검색과 AI 답변을 동시에 요청
 *   - 수업 낱말이 들어 있는 질문은 반 전체가 같은 답을 6시간 동안 바로 받음 (저장된 답)
 *   - 사용량 초과(429)면 기다리지 않고 곧바로 다른 모델로
 *   - 기록 저장은 한 번에 묶어서
 *
 * 🧑‍🏫 처음 설치하면: '초기설정' → '연결점검' 순서로 ▶ 실행
 *    코드를 바꾼 뒤에는 반드시 [배포 → 배포 관리 → 연필(수정) → 버전: 새 버전 → 배포]
 */

const APP_VERSION = 'v13';

// ① AI 스튜디오 API 키
const GEMINI_API_KEY = '여기에_AI_스튜디오_API_키를_붙여넣으세요';

// ② (선택) 유튜브 데이터 API 키 — 비워 두어도 내장 영상·선생님 추천 영상은 바로 나옵니다.
const YOUTUBE_API_KEY = '';

// 앞에서부터 시도 (Flash-Lite가 가장 빠름). 없는 모델은 자동으로 건너뜁니다.
const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const MAX_OUTPUT_TOKENS = 450;

const CACHE_SECONDS = 21600;          // 같은 질문 답 저장 시간(6시간)
const SHEET_NAME = '질문기록';
const SEARCH_SHEET_NAME = '검색기록';
const VIDEO_SHEET_NAME = '영상목록';   // 선생님 추천 영상 (키워드 | 유튜브 주소 | 제목 | 채널)

// 기능 켜기(true) · 끄기(false) — 영상·사진은 화면(index.html)에서 찾습니다.
const USE_WEB = true;
const USE_VIDEO = true;

const WIKI_COUNT = 2;
const NEWS_COUNT = 3;
const VIDEO_COUNT = 3;

/* ---------- 예시 질문 (index.html과 같게 유지) — '예시답변미리만들기'가 미리 답을 만들어 둠 ---------- */
const EXAMPLES = {
  all:     ['생명 기술이 무엇인가요?', '4가지 생명 기술의 차이를 알려주세요.', '생명 기술 최신 뉴스를 찾아 주세요.'],
  nuclear: ['복제 양 돌리는 어떻게 만들어졌나요?', '핵 이식 과정 영상을 찾아 주세요.', '복제 양 돌리 사진을 보여 주세요.'],
  gene:    ['대장균으로 인슐린을 어떻게 만드나요?', 'GMO 식품은 안전한가요?', 'GMO 관련 최신 뉴스를 찾아 주세요.'],
  fusion:  ['포마토는 어떻게 만들어졌나요?', '세포 융합과 유전자 재조합은 뭐가 달라요?', '세포 융합 자료를 찾아 주세요.'],
  tissue:  ['조직 배양으로 묘목을 대량으로 만드는 방법은?', '조직 배양 영상을 찾아 주세요.', '조직 배양 사진을 보여 주세요.']
};

/* ---------- 주제 ---------- */
const TOPICS = {
  all:     { name: '생명 기술 전반',    query: '생명 기술',        wiki: '생명공학' },
  nuclear: { name: '핵 이식 기술',      query: '핵 이식 기술',      wiki: '체세포 핵 이식' },
  gene:    { name: '유전자 재조합 기술', query: '유전자 재조합 기술', wiki: '유전자 재조합' },
  fusion:  { name: '세포 융합 기술',    query: '세포 융합 기술',    wiki: '세포 융합' },
  tissue:  { name: '조직 배양 기술',    query: '조직 배양 기술',    wiki: '조직 배양' }
};

/* ---------- 어떤 검색을 켤지 정하는 말 (index.html과 같게 유지) ---------- */
const WEB_WORDS   = /찾아|검색|자료|최신|최근|요즘|뉴스|기사|링크|출처|사이트|웹|인터넷|올해|작년|현재|지금/;
const WEB_NAMED   = /자료|최신|최근|요즘|뉴스|기사|링크|출처|사이트|웹|인터넷|올해|작년|현재|지금/;
const NEWS_WORDS  = /최신|최근|요즘|뉴스|기사|올해|작년|현재|지금/;
const VIDEO_WORDS = /유튜브|youtube|영상|동영상|비디오/i;
const PHOTO_WORDS = /사진|이미지|그림|보여\s*줘|보여\s*주/;
const PHOTO_NAMED = /사진|이미지|그림/;

// 생명 기술 관련 낱말 (질문이 수업과 관련 있는지 확인)
const BIO_TERMS = /생명|핵|이식|복제|돌리|스너피|유전자|재조합|gmo|세포|융합|포마토|무추|항체|클론|조직|배양|씨감자|딸기|난초|피부|인슐린|대장균|dna|배지|바이오|생물/i;

// 앞 대화를 이어서 묻는 말 → 이런 말이 있으면 앞 대화를 함께 보내고, 답을 저장하지 않음
const FOLLOW_WORDS = /그럼|그러면|그런데|근데|그래서|그것|그건|그게|그거|그\s|이것|이건|이게|방금|아까|앞에서|위에서|다시|더\s|또\s|계속|자세히|쉽게|요약/;

// 위키백과에서 함께 찾아볼 낱말 (위에서부터 먼저 맞는 것)
const WIKI_TERMS = [
  [/돌리|복제\s*양/, '복제 양 돌리'],
  [/스너피|복제\s*개/, '스너피'],
  [/핵\s*이식|핵\s*치환|체세포/, '체세포 핵 이식'],
  [/인슐린/, '인슐린'],
  [/대장균/, '대장균'],
  [/gmo|유전자\s*변형/i, '유전자 변형 생물'],
  [/유전자\s*재조합|재조합/, '유전자 재조합'],
  [/포마토/, '포마토'],
  [/단일\s*클론|항체/, '단일클론항체'],
  [/세포\s*융합|융합/, '세포 융합'],
  [/조직\s*배양|배양/, '조직 배양'],
  [/복제/, '생물 복제']
];

// 교육용으로 믿을 만한 유튜브 채널은 앞쪽에
const EDU_CHANNELS = /EBS|교육|과학|사이언스|YTN|KBS|MBC|SBS|JTBC|국립|진흥|연구|대학|박물관|농촌진흥청|식약처|정부|다큐/i;

// 생각(thinking) 끄는 설정 후보 (모델마다 받는 설정이 달라 차례로 시도)
const THINKING_OPTIONS = [{ thinkingBudget: 0 }, { thinkingLevel: 'minimal' }, null];

/* ---------- Gemini 지시문 ---------- */
const SYSTEM_PROMPT = `
너는 중학교 3학년 기술 수업(2015 개정 교육과정, 6단원 '생명 기술의 이해')의 '생명 기술 도우미'야.

[말투] 반드시 친절한 해요체(~해요, ~예요, ~할까요?)로만 답해. 반말(~해, ~이야, ~단다)은 절대 쓰지 마.

[답변 원칙]
1. 중학교 3학년이 이해할 수 있는 쉬운 말로, 인사말 없이 핵심부터 바로 말해요.
2. 길이는 아주 짧게: 설명 3문장 + '생각해 보기' 1줄, 모두 합쳐 250자 안팎. 덧붙이는 말·반복·맺음말은 쓰지 마요. 목록은 꼭 필요할 때만 3개 이내로 써요.
3. 실제 사례를 1개 이상 들어 줘요.
4. 마지막 줄에는 더 생각해 볼 짧은 질문을 하나 던져 줘요. (예: "🤔 생각해 보기: ...")
5. 서식은 **굵게**, 줄바꿈, '- ' 목록만 사용해요. 표·제목(#)·코드블록·인터넷 주소(URL)는 쓰지 마요.
6. 확실하지 않은 내용은 지어내지 말고 "선생님께 한 번 더 확인해 보세요"라고 말해요.
7. 장점과 함께 생명 존중·안전성·생태계 영향 같은 윤리적 쟁점도 균형 있게 다뤄요. 한쪽 입장을 강요하지 마요.
8. 숙제나 수행평가 답을 통째로 써 달라고 하면 정답 대신 생각의 실마리(힌트)를 줘요.
9. 생명 기술과 관계없는 질문은 짧게 답하고 생명 기술 이야기로 이끌어요. 부적절한 질문은 정중히 거절해요.
10. 이 챗봇은 찾은 자료 링크·유튜브 영상·사진을 답변 아래에 자동으로 붙여 줘요. "보여 줄 수 없다"고 말하지 말고, "찾아 두었다"고 장담하지도 마요.

[수업 핵심 내용 – 이 범위를 기준으로 설명해요]
- 생명 기술: 생물의 특성과 기능을 이용해 인간에게 유용한 물질이나 생물을 만들어 내는 기술. 식량, 의료, 환경, 에너지 분야에 활용됨.
- 핵 이식 기술: 핵을 제거한 난자(난세포)에 다른 개체의 체세포 핵을 넣어, 핵을 준 개체와 유전적으로 같은 개체를 만드는 기술.
  예) 복제 양 '돌리'(1996, 영국), 복제 개 '스너피'(2005, 한국), 멸종 위기 동물 보존, 우수 가축 복제.
  쟁점) 복제 동물의 건강 문제, 생명 윤리, 유전적 다양성 감소.
- 유전자 재조합 기술: 특정 생물의 유용한 유전자를 잘라 내어 다른 생물의 DNA에 끼워 넣는 기술.
  예) 사람 인슐린 유전자를 넣은 대장균으로 인슐린 생산, 해충 저항성 옥수수, 제초제 저항성 콩, 잘 무르지 않는 토마토 등 GMO.
  쟁점) GMO 식품의 안전성, 생태계 교란 가능성, 표시제.
- 세포 융합 기술: 서로 다른 두 종류의 세포를 하나로 합쳐 두 세포의 특징을 함께 가진 잡종 세포를 만드는 기술.
  예) 포마토(감자+토마토), 무추(무+배추), 단일 클론 항체(암 진단·치료).
- 조직 배양 기술: 생물의 조직이나 세포 일부를 떼어 영양분이 든 배지에서 길러 새로운 개체나 조직을 얻는 기술.
  예) 바이러스 없는 씨감자·딸기 묘목 대량 생산, 난초 대량 번식, 멸종 위기 식물 보존, 인공 피부.
- 비교: 핵 이식 '똑같은 개체 만들기', 유전자 재조합 '필요한 유전자만 옮기기', 세포 융합 '세포를 통째로 합치기', 조직 배양 '일부를 길러 늘리기'.
`;

const HINT_WEB = '\n\n(안내: 위 [인터넷 검색 결과]를 바탕으로 중학생 눈높이로 정리해 줘요. 검색 결과와 수업 내용에 없는 사실은 지어내지 마요. 뉴스는 제목에서 알 수 있는 내용만 말해요. 자료 링크는 화면에 자동으로 붙으니 본문에 주소를 쓰지 마요.)';
const HINT_WEB_EMPTY = '\n\n(안내: 인터넷 자료 링크는 화면에 따로 붙어요. 수업 내용으로 답해 주고, 찾은 자료가 있다고 장담하지는 마요.)';
const HINT_VIDEO = '\n\n(안내: 학생이 영상을 보고 싶어 해요. 영상 칸은 답변 아래에 따로 붙어요. 본문은 2~3문장으로 짧게 설명하고, 영상을 볼 때 눈여겨볼 점을 한 문장 덧붙여 줘요. "영상을 준비했다/찾았다"처럼 영상이 있다고 장담하는 말은 하지 마요.)';
const HINT_CUSTOM = '\n\n(안내: 학생이 직접 적은 주제예요. 생명 기술과 관련 있으면 수업의 4가지 생명 기술(핵 이식·유전자 재조합·세포 융합·조직 배양) 중 어떤 것과 연결되는지 한 문장 덧붙여 줘요. 생명 기술과 관계없거나 부적절한 주제면 정중히 생명 기술 주제로 이끌어 줘요.)';
const HINT_PHOTO = '\n\n(안내: 학생이 사진을 보고 싶어 해요. 사진은 답변 아래에 자동으로 붙어요. 사진에서 눈여겨볼 점을 한 문장 넣어 줘요.)';

/* ===============================================
 * 🌐 웹앱 (GitHub의 index.html이 이 주소로 요청을 보냄)
 * =============================================== */

/** 웹앱 주소를 브라우저에서 열면 보이는 확인 화면 */
function doGet() {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;padding:24px;font-size:18px">✅ 서버 작동 중 · 생명 기술 질문 챗봇 ' + APP_VERSION +
    '<p style="font-size:14px;color:#555">학생은 GitHub 주소로 들어와요. 이 주소(…/exec)는 index.html의 API_URL에 넣는 주소예요.</p></div>'
  ).setTitle('생명 기술 질문 챗봇 서버');
}

/** 화면이 보내는 요청: { action, args } → { ok, result } 또는 { ok:false, error } */
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = ACTIONS[body.action];
    if (!fn) throw new Error('알 수 없는 요청이에요: ' + body.action);
    out = { ok: true, result: fn(body.args || {}) };
  } catch (err) {
    console.error(err && err.stack || err);
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

const ACTIONS = {
  warmup: warmup_,
  ask: ask_,
  videos: videos_,
  videosFor: function (a) {   // 예전 화면(v11 GitHub판)과도 맞도록
    const T = topicInfo_(a.topic, a.custom);
    return videos_({ query: makeQuery_(String(a.question || '').slice(0, 500), T, a.history), topic: T.key });
  },
  log: log_,
  bench: bench_
};

/** ⚡ 모델 속도 비교: 모델마다 같은 질문을 한 번씩 보내 시간을 재고, 빠른 순서로 쓰도록 기억
 *  (화면에서 /점검 을 보내거나, 편집기에서 '모델속도비교'를 ▶ 실행) */
function bench_() {
  const cache = CacheService.getScriptCache();
  if (cache.get('bench_lock')) return { skipped: true, message: '방금 쟀어요. 1분 뒤에 다시 해 주세요.', order: (loadState_(cache.get('gstate') || ''), modelOrder_()) };
  cache.put('bench_lock', '1', 60);
  loadState_('');
  GS_.bad = {}; GS_.busy = {};
  const contents = buildContents_(topicInfo_('all'), '핵 이식 기술이 뭐예요?', [], { web: false, video: false, photo: false }, null);
  const results = [];
  GEMINI_MODELS.forEach(function (model) {
    for (let t = 0; t < THINKING_OPTIONS.length; t++) {
      const s = { model: model, think: t };
      const t0 = Date.now();
      const res = fetch_(geminiReq_(s, contents));
      const ms = Date.now() - t0;
      const code = res ? res.getResponseCode() : 0;
      if (isKeyError_(res)) { results.push({ model: model, think: t, code: code, ms: ms }); return; }
      noteResult_(s, code);
      let chars = 0;
      if (code === 200) { try { chars = readGemini_(res).length; } catch (e) {} }
      results.push({ model: model, think: t, code: code, ms: ms, chars: chars });
      if (code !== 400) return;
    }
  });
  const ok = results.filter(function (r) { return r.code === 200; }).sort(function (a, b) { return a.ms - b.ms; });
  GS_.order = ok.map(function (r) { return r.model; });
  GS_.busy = {};
  GS_DIRTY_ = 2;
  saveState_();
  return { results: results, order: modelOrder_() };
}

/** 화면이 열릴 때 서버를 미리 깨우고, 버전과 선생님 추천 영상 목록을 알려 줌 */
function warmup_() {
  return {
    version: APP_VERSION,
    teacherVideos: USE_VIDEO ? teacherVideos_() : [],
    yt: !!YOUTUBE_API_KEY,        // 유튜브 API 키가 있으면 화면이 모자란 영상을 서버에 더 물어봄
    moreVideos: USE_VIDEO
  };
}

/* ===============================================
 * 💬 질문 처리
 *   받는 값: { name, topic, custom, question, history, isExample, query, wiki:[{title,summary,url}] }
 *   돌려주는 값: { ok, answer, sources(뉴스 등), videoQuery, query, cached }
 * =============================================== */
function ask_(a) {
  const name = String(a.name || '').trim().slice(0, 30);
  const question = String(a.question || '').trim().slice(0, 500);
  if (!name) return { ok: false, answer: '이름을 먼저 입력해 주세요.' };
  if (!question) return { ok: false, answer: '질문을 입력해 주세요.' };

  const T = topicInfo_(a.topic, a.custom);
  const want = detectIntent_(question);
  const fullHistory = Array.isArray(a.history) ? a.history.slice(-4) : [];

  // ⚡ 수업 낱말이 들어 있고 앞 대화를 가리키는 말이 없으면 '혼자서도 뜻이 통하는 질문'
  //    → 앞 대화를 보내지 않고(더 빠름), 답을 저장해 반 전체가 함께 씀
  const standalone = a.isExample || (related_(question, T) && !FOLLOW_WORDS.test(question));
  const history = standalone ? [] : fullHistory;
  const canCache = !history.length;

  const cache = CacheService.getScriptCache();
  const key = cacheKey_(T, question);
  const got = cache.getAll([key, 'gstate']);   // 저장된 답과 모델 상태를 한 번에 읽기
  if (canCache && got[key]) {
    try { const saved = JSON.parse(got[key]); saved.cached = true; return saved; } catch (e) {}
  }

  try {
    const t0 = Date.now();
    TRIES_ = [];
    const setup = getSetup_(got.gstate || '');
    const q = cleanText_(a.query, 60) || makeQuery_(question, T, fullHistory);

    // 📖 위키백과: 화면이 찾아서 보내 줌 (안 보냈으면 서버가 직접 찾음)
    const wikiGiven = Array.isArray(a.wiki);
    let sources = [];      // AI에게 보여 줄 자료
    let extra = [];        // 화면에 돌려줄 자료 (화면이 이미 가진 위키백과는 빼고)
    if (wikiGiven) {
      sources = a.wiki.slice(0, 3).map(function (w) {
        return { kind: '백과', title: cleanText_(w && w.title, 80), url: '', site: '위키백과', date: '', summary: cleanText_(w && w.summary, 300) };
      }).filter(function (w) { return w.title; });
    }

    const newsFirst = want.web && NEWS_WORDS.test(question);   // 뉴스를 물으면 뉴스 제목을 AI에게 먼저 보여 줘야 함
    let gRes, contents;

    if (want.web && (newsFirst || !wikiGiven)) {
      /* ---------- 자료를 먼저 찾고 → AI ---------- */
      const b = new Batch_();
      b.add('news', newsReq_(q, newsFirst));
      if (!wikiGiven) {
        b.add('wiki', wikiReq_(q));
        const term = pick_(WIKI_TERMS, question + ' ' + q, T.wiki);
        if (term !== q) b.add('wiki2', wikiReq_(term));
      }
      b.run();
      if (!wikiGiven) {
        const wiki = uniqueByUrl_(readWiki_(b.get('wiki')).concat(readWiki_(b.get('wiki2')))).slice(0, WIKI_COUNT);
        sources = wiki;
        extra = wiki;
      }
      const news = readNews_(b.get('news')).slice(0, NEWS_COUNT);
      sources = sources.concat(news);
      extra = extra.concat(news);
      contents = buildContents_(T, question, history, want, sources);
      gRes = geminiFetch_(setup, contents);
    } else if (want.web) {
      /* ---------- ⚡ AI와 뉴스를 동시에 ---------- */
      contents = buildContents_(T, question, history, want, sources);
      const b = new Batch_();
      b.add('gemini', geminiReq_(setup, contents));
      b.add('news', newsReq_(q, false));
      const tb = Date.now();
      b.run();
      gRes = b.get('gemini');
      TRIES_.push({ model: setup.model, think: setup.think, code: gRes ? gRes.getResponseCode() : 0, ms: Date.now() - tb, withNews: true });
      extra = readNews_(b.get('news')).slice(0, NEWS_COUNT);
    } else {
      /* ---------- ⚡ AI만 ---------- */
      contents = buildContents_(T, question, history, want, null);
      gRes = geminiFetch_(setup, contents);
    }

    const answer = finishGemini_(gRes, setup, contents);

    const out = {
      ok: true,
      answer: answer,
      sources: extra.map(function (s) { return { kind: s.kind, title: s.title, url: s.url, site: s.site, date: s.date }; }),
      videoQuery: want.video ? q : '',
      query: { web: want.web ? q : '', video: want.video ? q : '' }
    };

    if (canCache) {
      try { cache.put(key, JSON.stringify(out), CACHE_SECONDS); } catch (e) {}
    }
    // 속도 점검용: 어떤 모델을 몇 번 불렀고 얼마나 걸렸는지 (저장된 답에는 넣지 않음)
    out.dbg = { tries: TRIES_, serverMs: Date.now() - t0 };
    return out;
  } catch (e) {
    return { ok: false, answer: e.message };
  }
}

/** 주제 정보 만들기 (탭 5개 + 직접 입력) */
function topicInfo_(topicKey, customTopic) {
  const custom = String(customTopic || '').replace(/[<>\[\]{}"'`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 20);
  if (topicKey === 'custom' && custom) {
    return { key: 'custom', custom: custom, name: '직접 입력: ' + custom, query: custom, wiki: custom };
  }
  if (!TOPICS[topicKey]) topicKey = 'all';
  const t = TOPICS[topicKey];
  return { key: topicKey, custom: '', name: t.name, query: t.query, wiki: t.wiki };
}

/** 어떤 검색을 켤지 정하기 — '찾아 줘', '보여 줘'는 영상·사진을 콕 집어 말했으면 그쪽만 */
function detectIntent_(question) {
  const video = USE_VIDEO && VIDEO_WORDS.test(question);
  const photo = PHOTO_WORDS.test(question) && (PHOTO_NAMED.test(question) || !video);
  const web = USE_WEB && WEB_WORDS.test(question) && (WEB_NAMED.test(question) || (!video && !photo));
  return { web: web, video: video, photo: photo };
}

/** 수업 낱말이 있거나, 직접 입력한 주제가 들어 있으면 '관련 있는 말' */
function related_(text, T) {
  text = String(text || '');
  return BIO_TERMS.test(text) || !!(T.custom && text.replace(/\s/g, '').indexOf(T.custom.replace(/\s/g, '')) >= 0);
}

/* ===============================================
 * 🔤 검색어 만들기 (화면이 검색어를 안 보냈을 때만 사용)
 * =============================================== */
function makeQuery_(question, T, history) {
  history = Array.isArray(history) ? history : [];
  let q = cleanQuery_(question);
  if (!related_(q, T)) {
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i];
      if (h && h.role === 'user' && related_(h.text, T)) { q = cleanQuery_(h.text); break; }
    }
  }
  if (!related_(q, T)) return T.query;
  const core = T.query.replace(/ 기술$/, '');
  if (T.key !== 'all' && q.replace(/\s/g, '').indexOf(core.replace(/\s/g, '')) < 0) q = core + ' ' + q;
  return q.slice(0, 60);
}

function cleanQuery_(text) {
  return String(text || '')
    .replace(/유튜브|youtube|동영상|영상|비디오|사진|이미지|그림|자료|최신|최근|요즘|뉴스|기사|링크|출처|사이트|인터넷|웹/gi, ' ')
    .replace(/찾아\s*(줘|주세요|줄래|봐|봐요)?|보여\s*(줘|주세요|줄래)?|알려\s*(줘|주세요)?|검색해?\s*(줘|주세요)?|설명\S*/g, ' ')
    .replace(/못\s*찾\S*|왜|어떻게|무엇|뭐|뭔가요|인가요|있나요|없나요|거야|관련(된)?|있으면|좀|주세요|해\s*줘|에\s*대한|대한|있는/g, ' ')
    .replace(/(을|를|이랑|하고|에서)(?=\s|$)/g, ' ')
    .replace(/[?？!.~,"'()]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function cleanText_(s, max) {
  return String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** 목록에서 먼저 맞는 낱말 고르기 */
function pick_(list, text, fallback) {
  for (let i = 0; i < list.length; i++) if (list[i][0].test(text)) return list[i][1];
  return fallback;
}

/* ===============================================
 * 🤖 Gemini
 * =============================================== */

let KEY_ = null;
function apiKey_() {
  if (KEY_) return KEY_;
  let k = (GEMINI_API_KEY && GEMINI_API_KEY.indexOf('여기에') !== 0) ? GEMINI_API_KEY : '';
  if (!k) k = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY') || '';
  k = k.trim();
  if (!k) throw new Error('⚠️ 선생님: Code.gs 맨 위에 AI 스튜디오 API 키를 입력해 주세요.');
  KEY_ = k;
  return k;
}

function buildContents_(T, question, history, want, sources) {
  const contents = [];
  history.forEach(function (h) {
    if (h && (h.role === 'user' || h.role === 'model') && h.text) {
      contents.push({ role: h.role, parts: [{ text: String(h.text).slice(0, 800) }] });
    }
  });

  let text = '[선택한 주제: ' + T.name + ']\n' + question;
  if (T.custom) text += HINT_CUSTOM;
  if (want.web) {
    if (sources && sources.length) {
      text += '\n\n[인터넷 검색 결과]\n' + sources.map(function (s, i) {
        return (i + 1) + '. [' + s.kind + '] ' + s.title + ' (' + s.site + (s.date ? ', ' + s.date : '') + ')' +
          (s.summary ? '\n   내용: ' + s.summary : '');
      }).join('\n') + HINT_WEB;
    } else {
      text += HINT_WEB_EMPTY;
    }
  }
  if (want.video) text += HINT_VIDEO;
  if (want.photo) text += HINT_PHOTO;
  contents.push({ role: 'user', parts: [{ text: text }] });
  return contents;
}

/* ---------- 모델 상태: 어떤 모델이 빠른지·되는지 기억 ----------
 * think : 모델마다 통한 '생각 끄기' 설정 번호      (오래 기억)
 * bad   : 없는 모델(404)                           (오래 기억)
 * order : '모델속도비교'로 잰 빠른 순서             (오래 기억)
 * busy  : 사용량 초과(429)·서버 오류가 난 모델 → 1분만 쉬고 다시 씀 (잠깐만 기억)
 *         ※ 바쁜 모델 대신 쓴 느린 모델에 눌러앉지 않도록, 바쁨은 오래 기억하지 않아요. */
let GS_ = null;        // 이번 요청에서 읽은 모델 상태
let GS_DIRTY_ = 0;     // 1: 캐시만 다시 쓰기, 2: 스크립트 속성까지
let TRIES_ = [];       // 이번 요청에서 Gemini를 부른 기록 (속도 점검용)
const BUSY_MS = 60000;

function loadState_(cached) {
  let raw = cached;
  if (!raw) {
    raw = PropertiesService.getScriptProperties().getProperty('GEMINI_STATE');
    GS_DIRTY_ = 1;
  }
  let st = null;
  if (raw) { try { st = JSON.parse(raw); } catch (e) {} }
  GS_ = { think: (st && st.think) || {}, bad: (st && st.bad) || {}, busy: (st && st.busy) || {}, order: (st && st.order) || [] };
  return GS_;
}

function modelOrder_() {
  const order = (GS_.order || []).filter(function (m) { return GEMINI_MODELS.indexOf(m) >= 0; });
  GEMINI_MODELS.forEach(function (m) { if (order.indexOf(m) < 0) order.push(m); });
  return order;
}

/** 지금 쓸 모델 고르기: 빠른 순서대로, 없는 모델·잠깐 바쁜 모델은 건너뜀 */
function getSetup_(cached) {
  if (!GS_ || cached !== undefined) loadState_(cached);
  const now = Date.now();
  const order = modelOrder_().filter(function (m) { return !GS_.bad[m]; });
  const free = order.filter(function (m) { return !(GS_.busy[m] > now); });
  const model = free[0] || order[0] || GEMINI_MODELS[0];
  return { model: model, think: GS_.think[model] || 0 };
}

function noteResult_(setup, code) {
  if (code === 200) {
    if (GS_.busy[setup.model]) { delete GS_.busy[setup.model]; GS_DIRTY_ = Math.max(GS_DIRTY_, 1); }
    if ((GS_.think[setup.model] || 0) !== setup.think) { GS_.think[setup.model] = setup.think; GS_DIRTY_ = 2; }
  } else if (code === 404) {
    GS_.bad[setup.model] = true; GS_DIRTY_ = 2;
  } else if (code !== 400) {
    GS_.busy[setup.model] = Date.now() + BUSY_MS; GS_DIRTY_ = Math.max(GS_DIRTY_, 1);
  }
}

function saveState_() {
  if (!GS_ || !GS_DIRTY_) return;
  try {
    CacheService.getScriptCache().put('gstate', JSON.stringify(GS_), CACHE_SECONDS);
    if (GS_DIRTY_ === 2) {
      PropertiesService.getScriptProperties().setProperty('GEMINI_STATE',
        JSON.stringify({ think: GS_.think, bad: GS_.bad, order: GS_.order }));
    }
  } catch (e) {}
  GS_DIRTY_ = 0;
}

/** Gemini 한 번 부르기 + 걸린 시간 기록 */
function geminiFetch_(setup, contents, extra) {
  const t = Date.now();
  const res = fetch_(geminiReq_(setup, contents, extra));
  TRIES_.push({ model: setup.model, think: setup.think, code: res ? res.getResponseCode() : 0, ms: Date.now() - t });
  return res;
}

function geminiReq_(setup, contents, extra) {
  const config = { temperature: 0.5, maxOutputTokens: MAX_OUTPUT_TOKENS };
  const thinking = THINKING_OPTIONS[setup.think];
  if (thinking) config.thinkingConfig = thinking;
  const payload = { contents: contents, generationConfig: config };
  if (extra && extra.tools) { payload.tools = extra.tools; config.temperature = 0.2; config.maxOutputTokens = 400; }
  else payload.systemInstruction = { parts: [{ text: SYSTEM_PROMPT }] };
  return {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/' + setup.model + ':generateContent',
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': apiKey_() },
    muteHttpExceptions: true,
    payload: JSON.stringify(payload)
  };
}

/** 첫 응답이 성공이면 그대로, 실패면 다른 모델·설정을 '기다리지 않고' 차례로 시도 */
function finishGemini_(res, setup, contents) {
  try {
    let last = res;
    let code = last ? last.getResponseCode() : 0;
    if (isKeyError_(last)) return readGemini_(last);
    noteResult_(setup, code);
    if (code === 200) return readGemini_(last);

    const tried = {};
    tried[setup.model + '|' + setup.think] = true;
    const skip = {};
    if (code !== 400) skip[setup.model] = true;   // 설정 문제(400)가 아니면 그 모델은 통째로 건너뜀
    const models = modelOrder_();
    for (let m = 0; m < models.length; m++) {
      const model = models[m];
      if (skip[model] || GS_.bad[model]) continue;
      for (let t = 0; t < THINKING_OPTIONS.length; t++) {
        if (tried[model + '|' + t]) continue;
        const s = { model: model, think: t };
        last = geminiFetch_(s, contents);
        code = last ? last.getResponseCode() : 0;
        if (isKeyError_(last)) return readGemini_(last);
        noteResult_(s, code);
        if (code === 200) return readGemini_(last);
        if (code === 400) continue;   // 안 맞는 설정 → 다음 설정
        break;                        // 없는 모델·사용량 초과·서버 오류 → 다음 모델
      }
    }
    return readGemini_(last);
  } finally {
    saveState_();
  }
}

function isKeyError_(res) {
  if (!res) return false;
  const code = res.getResponseCode();
  return code === 403 || (code === 400 && /API key|API_KEY/i.test(res.getContentText().slice(0, 500)));
}

function readGemini_(res) {
  const code = res ? res.getResponseCode() : 0;
  if (code === 429) throw new Error('지금 질문하는 친구들이 많아요. 10초 뒤에 다시 보내 주세요. 🙏');
  if (code === 400 || code === 403) throw new Error('⚠️ API 키 또는 모델 설정에 문제가 있어요. 선생님께 알려 주세요. (코드 ' + code + ')');
  if (code === 404) throw new Error('⚠️ 모델 이름을 찾을 수 없어요. 선생님께 알려 주세요.');
  if (code !== 200) throw new Error('답변을 가져오지 못했어요. 잠시 후 다시 시도해 주세요. (코드 ' + code + ')');

  const data = JSON.parse(res.getContentText());
  const cand = data.candidates && data.candidates[0];
  const parts = (cand && cand.content && cand.content.parts) || [];
  const text = parts.filter(function (p) { return p.text && !p.thought; })
    .map(function (p) { return p.text; }).join('').trim();
  if (text) return text;
  if (cand && cand.finishReason === 'SAFETY') return '이 질문에는 답하기 어려워요. 생명 기술과 관련된 다른 질문을 해 볼까요? 🌱';
  throw new Error('답변이 비어 있어요. 질문을 조금 바꿔서 다시 보내 주세요.');
}

/* ===============================================
 * 🌐 웹 검색: 구글 뉴스 + 위키백과 (키 필요 없음)
 * =============================================== */

function wikiReq_(query) {
  return {
    url: 'https://ko.wikipedia.org/w/api.php?' + toQuery_({
      action: 'query', format: 'json', redirects: '1',
      generator: 'search', gsrsearch: query, gsrlimit: '3', gsrnamespace: '0',
      prop: 'extracts|info', exintro: '1', explaintext: '1', exchars: '350', exlimit: '3', inprop: 'url'
    }),
    muteHttpExceptions: true
  };
}

function readWiki_(res) {
  try {
    if (!res || res.getResponseCode() !== 200) return [];
    const pages = (JSON.parse(res.getContentText()).query || {}).pages;
    if (!pages) return [];
    return Object.keys(pages).map(function (k) { return pages[k]; })
      .sort(function (a, b) { return (a.index || 0) - (b.index || 0); })
      .filter(function (p) { return p.fullurl && p.title; })
      .map(function (p) {
        return {
          kind: '백과', title: p.title, url: p.fullurl, site: '위키백과', date: '',
          summary: String(p.extract || '').replace(/\s+/g, ' ').slice(0, 300)
        };
      });
  } catch (e) {
    console.error('위키백과 읽기 오류: ' + e.message);
    return [];
  }
}

function newsReq_(query, recentOnly) {
  return {
    url: 'https://news.google.com/rss/search?q=' + encodeURIComponent(query + (recentOnly ? ' when:1y' : '')) +
      '&hl=ko&gl=KR&ceid=KR:ko',
    muteHttpExceptions: true
  };
}

function readNews_(res) {
  try {
    if (!res || res.getResponseCode() !== 200) return [];
    return res.getContentText().split('<item>').slice(1, 9).map(function (it) {
      const source = xmlText_(it, 'source');
      let title = xmlText_(it, 'title');
      if (source && title.slice(-source.length - 3) === ' - ' + source) title = title.slice(0, -source.length - 3);
      const pub = xmlText_(it, 'pubDate');
      let date = '';
      try { date = pub ? Utilities.formatDate(new Date(pub), 'Asia/Seoul', 'yyyy.MM.dd') : ''; } catch (e) {}
      return { kind: '뉴스', title: title.slice(0, 120), url: xmlText_(it, 'link'), site: source || '뉴스', date: date, summary: '' };
    }).filter(function (n) { return n.title && /^https?:\/\//.test(n.url); });
  } catch (e) {
    console.error('뉴스 읽기 오류: ' + e.message);
    return [];
  }
}

function xmlText_(xml, tag) {
  const m = xml.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>'));
  return m ? decodeEntities_(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '')).trim() : '';
}

/* ===============================================
 * ▶️ 영상 — 내장 목록과 선생님 추천은 화면이 바로 보여 줌.
 *    서버는 '그래도 모자랄 때'만: ① 유튜브 API(키가 있을 때) → ② Gemini 구글 검색
 *    (서버는 youtube.com에 접속하지 않음 → 느려지거나 막히지 않음)
 *    돌려주는 값: { videos: [{ id, title, channel, thumb, url, trusted }], more }
 * =============================================== */
function videos_(a) {
  const query = cleanText_(a.query, 60);
  const more = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  if (!USE_VIDEO || !query) return { videos: [], more: more };

  const cache = CacheService.getScriptCache();
  const key = 'v_' + hash_(APP_VERSION + '|' + query);
  const hit = cache.get(key);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  let videos = [];
  if (YOUTUBE_API_KEY) {
    videos = sortEdu_(readYtApi_(fetch_(ytApiReq_(query)))).map(function (v) { v.trusted = true; return v; });
  }
  if (videos.length < VIDEO_COUNT) {
    try { videos = videos.concat(sortEdu_(geminiVideos_(query))); } catch (e) { console.error('영상 찾기 오류: ' + e.message); }
  }

  const out = { videos: uniqueByUrl_(videos).slice(0, 6), more: more };
  if (out.videos.length) { try { cache.put(key, JSON.stringify(out), CACHE_SECONDS); } catch (e) {} }
  return out;
}

/** '영상목록' 시트의 선생님 추천 영상 전체 (10분 저장) → 화면이 키워드로 골라 씀 */
function teacherVideos_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('tv');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  let list = [];
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(VIDEO_SHEET_NAME);
    if (sh && sh.getLastRow() >= 2) {
      list = sh.getRange(2, 1, Math.min(sh.getLastRow() - 1, 200), 4).getValues().map(function (r) {
        const id = youtubeId_(r[1]);
        const keys = String(r[0]).split(/[,，]/).map(function (k) { return k.replace(/\s/g, '').toLowerCase(); }).filter(Boolean);
        if (!id || !keys.length) return null;
        return { keys: keys, id: id, title: String(r[2] || '선생님 추천 영상').slice(0, 80), channel: String(r[3] || '').slice(0, 40) };
      }).filter(Boolean);
    }
  } catch (e) {
    console.error('영상목록 읽기 오류: ' + e.message);
  }
  try { cache.put('tv', JSON.stringify(list), 600); } catch (e) {}
  return list;
}

/** (키 있을 때) 유튜브 데이터 API — 제한 모드 */
function ytApiReq_(query) {
  return {
    url: 'https://www.googleapis.com/youtube/v3/search?' + toQuery_({
      part: 'snippet', q: query, type: 'video', maxResults: String(VIDEO_COUNT),
      safeSearch: 'strict', regionCode: 'KR', relevanceLanguage: 'ko', videoEmbeddable: 'true',
      key: YOUTUBE_API_KEY
    }),
    muteHttpExceptions: true
  };
}

function readYtApi_(res) {
  try {
    if (!res || res.getResponseCode() !== 200) {
      if (res) console.error('유튜브 API 실패: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
      return [];
    }
    return (JSON.parse(res.getContentText()).items || [])
      .filter(function (it) { return it.id && it.id.videoId; })
      .map(function (it) {
        const sn = it.snippet || {};
        return video_(it.id.videoId, decodeEntities_(sn.title || ''), decodeEntities_(sn.channelTitle || ''));
      });
  } catch (e) {
    console.error('유튜브 API 읽기 오류: ' + e.message);
    return [];
  }
}

/** Gemini 구글 검색으로 유튜브 영상 후보 찾기 (화면이 썸네일로 진짜 영상인지 한 번 더 확인) */
function geminiVideos_(query) {
  const prompt = '구글 검색으로 유튜브(youtube.com)에서 "' + query + '"을(를) 설명하는 한국어 교육 영상을 찾아 줘. ' +
    '중학생이 보기 알맞은 영상(EBS, 과학 교육 채널, 방송사, 공공기관 등)을 우선해. ' +
    '찾은 영상마다 한 줄에 하나씩 [영상: https://www.youtube.com/watch?v=영상ID | 영상 제목 | 채널 이름] 형식으로 최대 5개만 적고 다른 말은 쓰지 마. ' +
    '검색 결과에서 실제로 확인한 주소만 적어.';
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  const extra = { tools: [{ google_search: {} }] };
  let res = fetch_(geminiReq_(getSetup_(CacheService.getScriptCache().get('gstate') || ''), contents, extra));
  if (!res || res.getResponseCode() !== 200) {
    res = fetch_(geminiReq_({ model: GEMINI_MODELS[1], think: 2 }, contents, extra));
  }
  const cand = readVideoFinder_(res);
  const list = cand.items.slice();

  // 검색 링크(구글 서버 주소)가 가리키는 진짜 주소에서 유튜브 영상 찾기
  const links = cand.redirects.slice(0, 8);
  if (links.length) {
    const b = new Batch_();
    links.forEach(function (u, i) { b.add('r' + i, { url: u, method: 'get', followRedirects: false, muteHttpExceptions: true }); });
    b.run();
    links.forEach(function (u, i) {
      const id = youtubeId_(locationOf_(b.get('r' + i)));
      if (id && !list.some(function (v) { return v.id === id; })) list.push(video_(id, '유튜브 영상', ''));
    });
  }
  return list;
}

/** 영상 후보 꺼내기: { items: 영상 목록, redirects: 진짜 주소를 알아내야 하는 검색 링크 } */
function readVideoFinder_(res) {
  const out = { items: [], redirects: [] };
  try {
    if (!res || res.getResponseCode() !== 200) {
      if (res) console.error('영상 찾기(Gemini 검색) 실패: ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
      return out;
    }
    const cand = (JSON.parse(res.getContentText()).candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || []).map(function (p) { return p.text || ''; }).join('\n');
    const seen = {};
    text.split('\n').forEach(function (line) {
      const id = youtubeId_(line);
      if (!id || seen[id]) return;
      seen[id] = true;
      const m = line.match(/\[\s*영상\s*:\s*[^|\]]*\|\s*([^|\]]*)(?:\|\s*([^\]]*))?\]/);
      out.items.push(video_(id, (m && m[1].trim()) || '유튜브 영상', (m && m[2] && m[2].trim()) || ''));
    });

    const chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
    chunks.forEach(function (c) {
      const uri = c && c.web && c.web.uri;
      if (!uri) return;
      const id = youtubeId_(uri);
      if (id) { if (!seen[id]) { seen[id] = true; out.items.push(video_(id, '유튜브 영상', '')); } return; }
      if (/grounding-api-redirect/.test(uri)) out.redirects.push(uri);
    });
  } catch (e) {
    console.error('영상 후보 읽기 오류: ' + e.message);
  }
  return out;
}

/** 검색 링크가 가리키는 진짜 주소 */
function locationOf_(res) {
  try {
    if (!res) return '';
    const code = res.getResponseCode();
    if (code < 300 || code >= 400) return '';
    const h = res.getAllHeaders();
    return String(h.Location || h.location || '');
  } catch (e) {
    return '';
  }
}

/** 주소에서 유튜브 영상 ID 꺼내기 */
function youtubeId_(url) {
  const m = String(url || '').match(/(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

/** 교육 채널을 앞으로 (나머지 순서는 유지) */
function sortEdu_(list) {
  return list.map(function (v, i) { return { v: v, i: i, e: EDU_CHANNELS.test(v.channel) ? 0 : 1 }; })
    .sort(function (a, b) { return a.e - b.e || a.i - b.i; })
    .map(function (x) { return x.v; });
}

function video_(id, title, channel) {
  return {
    id: id,
    title: String(title).slice(0, 80),
    channel: String(channel).slice(0, 40),
    thumb: 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg',
    url: 'https://www.youtube.com/watch?v=' + id
  };
}

/* ===============================================
 * 🛠 도구
 * =============================================== */

/** 여러 요청을 한 번에 보내는 묶음 */
function Batch_() { this.names = []; this.reqs = []; this.res = {}; }
Batch_.prototype.add = function (name, req) { this.names.push(name); this.reqs.push(req); };
Batch_.prototype.get = function (name) { return this.res[name] || null; };
Batch_.prototype.run = function () {
  if (!this.reqs.length) return;
  let list;
  try {
    list = UrlFetchApp.fetchAll(this.reqs);
  } catch (e) {
    // 묶음 요청이 통째로 실패하면 하나씩 (실패한 것만 비워 둠)
    console.error('동시 요청 실패, 하나씩 다시: ' + e.message);
    list = this.reqs.map(function (r) { return fetch_(r); });
  }
  for (let i = 0; i < this.names.length; i++) this.res[this.names[i]] = list[i];
};

/** 요청 하나 보내기 (연결 자체가 안 되면 null) */
function fetch_(req) {
  try {
    return UrlFetchApp.fetch(req.url, req);
  } catch (e) {
    console.error('요청 실패: ' + e.message);
    return null;
  }
}

function uniqueByUrl_(list) {
  const seen = {};
  return list.filter(function (x) { if (seen[x.url]) return false; seen[x.url] = true; return true; });
}

function toQuery_(params) {
  return Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
}

function decodeEntities_(s) {
  return String(s).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function hash_(text) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text, Utilities.Charset.UTF_8));
}

function cacheKey_(T, question) {
  const norm = String(question).replace(/\s+/g, ' ').replace(/[?？!.~]+$/, '').trim().toLowerCase();
  return 'q_' + hash_(APP_VERSION + '|' + T.key + '|' + T.custom + '|' + norm);
}

/* ===============================================
 * 🗂 기록 저장 (답을 보여 준 뒤 화면이 따로 호출 → 학생은 기다리지 않음)
 *   받는 값: { name, topic, custom, question, answer, ok, found:[{type,title,url}], query, seconds }
 * =============================================== */
function log_(a) {
  try {
    const now = new Date();
    const topic = topicInfo_(a.topic, a.custom).name;
    const name = String(a.name || '').slice(0, 30);
    const question = String(a.question || '').slice(0, 500);
    const found = Array.isArray(a.found) ? a.found.slice(0, 15) : [];
    const query = a.query || {};

    // 질문기록: 한 줄 추가 (잠금 없이도 안전)
    getSheet_().appendRow([
      now, name, topic, question,
      String(a.answer || '').slice(0, 5000),
      a.ok ? '정상' : '오류',
      found.map(function (f) { return '[' + f.type + '] ' + String(f.title || '').slice(0, 60) + ' ' + f.url; }).join('\n').slice(0, 5000),
      a.seconds ? Number(a.seconds) : ''
    ]);

    // 검색기록: 찾은 자료를 한 번에 묶어서 쓰기 (예전에는 자료 1개마다 따로 써서 느렸음)
    if (found.length) {
      const rows = found.map(function (f) {
        const kw = f.type === '영상' ? query.video : f.type === '사진' ? query.photo : query.web;
        return [now, name, topic, question, String(f.type || ''), kw || '', String(f.title || '').slice(0, 200), String(f.url || '').slice(0, 1000)];
      });
      const sh = getSearchSheet_();
      const lock = LockService.getScriptLock();
      if (lock.tryLock(8000)) {
        try { sh.getRange(sh.getLastRow() + 1, 1, rows.length, 8).setValues(rows); }
        finally { lock.releaseLock(); }
      } else {
        rows.forEach(function (r) { sh.appendRow(r); });
      }
    }
  } catch (e) {
    console.error('기록 저장 실패: ' + e.message);
  }
  return true;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    header_(sh, ['시간', '이름', '주제', '질문', '답변', '상태', '찾은 자료', '걸린 시간(초)']);
    sh.setFrozenRows(1);
    [150, 110, 140, 300, 500, 60, 360, 80].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
    sh.getRange('D:E').setWrap(true);
    sh.getRange('G:G').setWrap(true);
  }
  return sh;
}

function getSearchSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SEARCH_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SEARCH_SHEET_NAME);
    header_(sh, ['시간', '이름', '주제', '질문', '종류', '검색어', '제목', '주소']);
    sh.setFrozenRows(1);
    [150, 110, 140, 260, 60, 160, 280, 360].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
  }
  return sh;
}

/** 영상목록 시트: 선생님이 고른 영상을 키워드와 함께 적어 두면 가장 먼저 보여 줌 */
function getVideoSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(VIDEO_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(VIDEO_SHEET_NAME);
    header_(sh, ['키워드 (쉼표로 여러 개)', '유튜브 주소', '제목 (선택)', '채널 (선택)']);
    sh.setFrozenRows(1);
    [220, 360, 280, 160].forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
    sh.getRange('A1').setNote('예) 핵 이식, 핵이식, 복제 양, 돌리\n학생 질문 속 검색어에 이 키워드가 들어 있으면 이 영상을 가장 먼저 보여 줘요. (고친 뒤 10분 안에 반영)');
  }
  return sh;
}

function header_(sh, headers) {
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold').setBackground('#2f855a').setFontColor('#ffffff');
}

/* ===============================================
 * 🧑‍🏫 선생님용 (함수 선택 → ▶ 실행 → 아래 '실행 로그' 확인)
 * =============================================== */

/** ① 처음 한 번: 시트 3개 만들기 + 권한 허용 + 키를 스크립트 속성에 저장 */
function 초기설정() {
  getSheet_();
  getSearchSheet_();
  getVideoSheet_();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  LockService.getScriptLock();
  if (GEMINI_API_KEY && GEMINI_API_KEY.indexOf('여기에') !== 0) {
    PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', GEMINI_API_KEY.trim());
    console.log('🔑 키를 스크립트 속성에 저장했어요. 이제 코드의 GEMINI_API_KEY를 처음 글자("여기에_…")로 되돌려도 작동해요.');
  }
  CacheService.getScriptCache().removeAll(['tv', 'gstate', 'bench_lock']);
  console.log('✅ 질문기록 · 검색기록 · 영상목록 시트 준비 완료 (' + APP_VERSION + ')');
}

/** ② 연결 점검: 검색 서비스와 Gemini가 되는지, 얼마나 걸리는지 확인 */
function 연결점검() {
  let t = Date.now();
  const b = new Batch_();
  b.add('wiki', wikiReq_('조직 배양'));
  b.add('news', newsReq_('조직 배양', false));
  if (YOUTUBE_API_KEY) b.add('yt', ytApiReq_('식물 조직 배양'));
  b.run();
  console.log('구글 뉴스: ' + (readNews_(b.get('news')).length ? '✅' : '❌'));
  console.log('위키백과(예비용 — 평소에는 학생 브라우저가 직접 찾음): ' + (readWiki_(b.get('wiki')).length ? '✅' : '❌'));
  if (YOUTUBE_API_KEY) console.log('유튜브 API: ' + (readYtApi_(b.get('yt')).length ? '✅' : '❌ (키 또는 사용 설정 확인)'));
  console.log('영상목록 시트(선생님 추천): ' + teacherVideos_().length + '개');
  console.log('(검색 확인: ' + ((Date.now() - t) / 1000).toFixed(1) + '초)');

  CacheService.getScriptCache().remove('bench_lock');
  try {
    apiKey_();
    const r = bench_();
    r.results.forEach(function (x) {
      console.log('Gemini ' + x.model + ' (생각 끄기 설정 ' + x.think + '): ' +
        (x.code === 200 ? '✅ ' + (x.ms / 1000).toFixed(1) + '초 · ' + x.chars + '자' : '❌ 코드 ' + x.code));
    });
    console.log('→ 앞으로 쓰는 순서: ' + r.order.join(' → ') + '  (맨 앞 모델의 시간이 학생이 기다리는 시간의 대부분이에요)');
  } catch (e) {
    console.log('Gemini: ❌ ' + e.message);
  }
}

/** ⚡ 모델마다 속도를 재서 가장 빠른 모델부터 쓰게 함 (느려졌다 싶으면 ▶ 실행) */
function 모델속도비교() {
  CacheService.getScriptCache().remove('bench_lock');
  const r = bench_();
  r.results.forEach(function (x) { console.log(x.model + ' / 설정 ' + x.think + ' → ' + (x.code === 200 ? (x.ms / 1000).toFixed(1) + '초' : '코드 ' + x.code)); });
  console.log('→ 쓰는 순서: ' + r.order.join(' → '));
}

/** ③ 실제 질문으로 시험 (시트에 '테스트'로 기록됨) */
function 검색테스트() {
  [
    ['all', '포마토가 뭐예요?'],
    ['gene', 'GMO 관련 최신 뉴스 찾아 주세요'],
    ['all', '핵이식 기술 자료 찾아줘'],
    ['custom', '줄기세포의 장단점을 설명해줘', '줄기세포']
  ].forEach(function (x) {
    const t0 = Date.now();
    const r = ask_({ name: '테스트', topic: x[0], question: x[1], custom: x[2] });
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('■ ' + x[1] + ' → ' + sec + '초' + (r.cached ? ' (저장된 답)' : '') + ' · 자료 ' + (r.sources || []).length + '개\n' + r.answer);
    log_({ name: '테스트', topic: x[0], custom: x[2], question: x[1], answer: r.answer, ok: r.ok,
           found: (r.sources || []).map(function (s) { return { type: '웹', title: s.title, url: s.url }; }), query: r.query, seconds: sec });
  });
}

/** ⚡ 예시 질문의 답을 미리 만들어 두기 (6시간 동안 학생이 누르면 바로 나옴) */
function 예시답변미리만들기() {
  const t0 = Date.now();
  let n = 0;
  Object.keys(EXAMPLES).forEach(function (k) {
    EXAMPLES[k].forEach(function (q) {
      try { if (ask_({ name: '미리준비', topic: k, question: q, isExample: true }).ok) n++; }
      catch (e) { console.error('미리 만들기 실패: ' + q + ' / ' + e.message); }
    });
  });
  console.log('✅ 예시 질문 ' + n + '개 준비 완료 (' + ((Date.now() - t0) / 1000).toFixed(1) + '초)');
}

/** ⚡ 5시간마다 '예시답변미리만들기'를 자동 실행 (한 번만 ▶ 실행하면 됨) */
function 미리만들기자동설치() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === '예시답변미리만들기') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('예시답변미리만들기').timeBased().everyHours(5).create();
  예시답변미리만들기();
  console.log('✅ 5시간마다 예시 답변을 자동으로 미리 만들어요.');
}
