/*
 * AI 리서치 보고서 · 문장별 사람 검증 위젯
 *
 * 보고서 HTML의 </body> 바로 앞에 한 줄 추가:
 *   <script src="review/review.js" data-report="보고서-ID"></script>
 *
 * - 검증 대상: id가 있는 문장 요소 (기본 선택자 ".sent[id]", data-selector로 변경 가능)
 * - 저장소: 구글시트 + Apps Script 웹 앱 (reports/review/apps-script.gs)
 * - 기록은 덮어쓰지 않고 쌓이며, 문장별 최신 기록이 현재 상태가 된다.
 * - 검증 당시 문장 내용의 지문(hash)을 함께 저장해, 문장이 바뀌면 "재검증 필요"로 표시한다.
 */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  var DS = (SCRIPT && SCRIPT.dataset) || {};
  var ENDPOINT = DS.endpoint ||
    'https://script.google.com/macros/s/AKfycbwTDIuR9hjAJolNLnrZHlXPmrkXEijPxABnIC52IRPSK4CsHylwFNESintPJTzLwmYHWA/exec';
  var REPORT = DS.report || location.pathname.split('/').pop().replace(/\.html?$/, '');
  var SEL = DS.selector || '.sent[id]';

  /* ---------------- i18n ---------------- */
  var STR = {
    ko: {
      dock: '사람 검증', loading: '검증 기록 불러오는 중…', loadFail: '검증 기록을 불러오지 못했습니다',
      verified: '검증완료', revise: '수정필요', none: '미검증', changed: '내용 변경됨 · 재검증 필요',
      progress: '{n}문장 중 {v}문장 검증 · 수정필요 {r}',
      fAll: '전체', fNone: '미검증', fRevise: '수정필요', fVerified: '검증완료', next: '다음 ↓', nothing: '해당하는 문장이 없습니다',
      name: '이름(아이디)', namePh: '예: 홍길동', key: '공식 검증 키 (선택)', keyPh: '보고서 작성자만',
      hint: '이름만 입력하면 누구나 문장마다 검증 상태와 메모를 남길 수 있습니다. 모든 기록은 공개되며 지워지지 않고 이력으로 쌓입니다.',
      status: '검증 상태', reset: '미검증으로', note: '메모', notePh: '확인한 자료, 근거, 수정 의견 등',
      save: '저장', saving: '저장 중…', saved: '저장했습니다', fail: '저장하지 못했습니다', needName: '이름을 입력하세요',
      history: '이력', noHistory: '아직 기록이 없습니다', official: '공식', close: '닫기', sentence: '문장',
      lastBy: '{name} · {time}'
    },
    en: {
      dock: 'Human review', loading: 'Loading review records…', loadFail: 'Could not load review records',
      verified: 'Verified', revise: 'Needs revision', none: 'Not reviewed', changed: 'Text changed · re-review needed',
      progress: '{v} of {n} sentences verified · {r} need revision',
      fAll: 'All', fNone: 'Not reviewed', fRevise: 'Needs revision', fVerified: 'Verified', next: 'Next ↓', nothing: 'No matching sentences',
      name: 'Name (ID)', namePh: 'e.g. Jane Doe', key: 'Official review key (optional)', keyPh: 'Report author only',
      hint: 'Anyone can leave a review status and note on each sentence by entering a name. All records are public and kept as history; nothing is deleted.',
      status: 'Status', reset: 'Mark unreviewed', note: 'Note', notePh: 'Sources checked, evidence, suggested fixes…',
      save: 'Save', saving: 'Saving…', saved: 'Saved', fail: 'Could not save', needName: 'Please enter a name',
      history: 'History', noHistory: 'No records yet', official: 'Official', close: 'Close', sentence: 'Sentence',
      lastBy: '{name} · {time}'
    },
    ja: {
      dock: '人による検証', loading: '検証記録を読み込み中…', loadFail: '検証記録を読み込めませんでした',
      verified: '検証済み', revise: '要修正', none: '未検証', changed: '本文が変更 · 再検証が必要',
      progress: '{n}文中 {v}文 検証済み · 要修正 {r}',
      fAll: 'すべて', fNone: '未検証', fRevise: '要修正', fVerified: '検証済み', next: '次へ ↓', nothing: '該当する文がありません',
      name: '名前（ID）', namePh: '例：山田太郎', key: '公式検証キー（任意）', keyPh: 'レポート作成者のみ',
      hint: '名前を入力すれば、誰でも文ごとに検証状態とメモを残せます。すべての記録は公開され、削除されず履歴として残ります。',
      status: '検証状態', reset: '未検証に戻す', note: 'メモ', notePh: '確認した資料、根拠、修正意見など',
      save: '保存', saving: '保存中…', saved: '保存しました', fail: '保存できませんでした', needName: '名前を入力してください',
      history: '履歴', noHistory: 'まだ記録がありません', official: '公式', close: '閉じる', sentence: '文',
      lastBy: '{name} · {time}'
    },
    zh: {
      dock: '人工核查', loading: '正在加载核查记录…', loadFail: '无法加载核查记录',
      verified: '已核查', revise: '需修改', none: '未核查', changed: '内容已变更 · 需重新核查',
      progress: '{n}句中已核查 {v}句 · 需修改 {r}',
      fAll: '全部', fNone: '未核查', fRevise: '需修改', fVerified: '已核查', next: '下一条 ↓', nothing: '没有符合条件的句子',
      name: '名字（ID）', namePh: '例：张三', key: '官方核查密钥（可选）', keyPh: '仅限报告作者',
      hint: '输入名字即可为每句话留下核查状态和备注。所有记录公开，不会删除，作为历史保留。',
      status: '核查状态', reset: '改为未核查', note: '备注', notePh: '核对的资料、依据、修改意见等',
      save: '保存', saving: '保存中…', saved: '已保存', fail: '保存失败', needName: '请输入名字',
      history: '历史', noHistory: '暂无记录', official: '官方', close: '关闭', sentence: '句子',
      lastBy: '{name} · {time}'
    },
    ru: {
      dock: 'Проверка человеком', loading: 'Загрузка записей проверки…', loadFail: 'Не удалось загрузить записи проверки',
      verified: 'Проверено', revise: 'Нужна правка', none: 'Не проверено', changed: 'Текст изменён · нужна повторная проверка',
      progress: 'Проверено {v} из {n} предложений · нужна правка: {r}',
      fAll: 'Все', fNone: 'Не проверено', fRevise: 'Нужна правка', fVerified: 'Проверено', next: 'Далее ↓', nothing: 'Подходящих предложений нет',
      name: 'Имя (ID)', namePh: 'напр. Иван Иванов', key: 'Ключ официальной проверки (необязательно)', keyPh: 'Только для автора доклада',
      hint: 'Указав имя, любой может оставить статус проверки и заметку к каждому предложению. Все записи публичны и сохраняются как история.',
      status: 'Статус', reset: 'Снять отметку', note: 'Заметка', notePh: 'Проверенные источники, обоснование, предложения по правке…',
      save: 'Сохранить', saving: 'Сохранение…', saved: 'Сохранено', fail: 'Не удалось сохранить', needName: 'Введите имя',
      history: 'История', noHistory: 'Записей пока нет', official: 'Официально', close: 'Закрыть', sentence: 'Предложение',
      lastBy: '{name} · {time}'
    }
  };
  function lang() {
    var l = (document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
    return STR[l] ? l : 'en';
  }
  function t(k, vars) {
    var s = STR[lang()][k];
    if (s === undefined) s = STR.en[k];
    if (vars) s = s.replace(/\{(\w+)\}/g, function (_, v) { return vars[v]; });
    return s;
  }

  /* ---------------- utils ---------------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function textOf(el) {
    var c = el.cloneNode(true);
    c.querySelectorAll('button,.conf,.rv-btn').forEach(function (n) { n.remove(); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }
  function hashOf(el) { return lang() + ':' + fnv(textOf(el)); }
  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    try {
      return d.toLocaleString(lang(), { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
  }
  var LS = {
    get: function (k) { try { return localStorage.getItem('rv_' + k) || ''; } catch (e) { return ''; } },
    set: function (k, v) { try { localStorage.setItem('rv_' + k, v); } catch (e) {} }
  };

  /* ---------------- state ---------------- */
  var bySid = {};          // sid -> [rows in time order]
  var loadState = 'loading';
  var filter = 'all';
  var openSid = null;

  function addRow(r) { (bySid[r.sid] = bySid[r.sid] || []).push(r); }
  function latest(sid) { var a = bySid[sid]; return a && a.length ? a[a.length - 1] : null; }
  function stateOf(sid, el) {
    var r = latest(sid);
    if (!r || r.status === 'pending') return 'none';
    var h = String(r.hash || '');
    if (el && h.slice(0, 3) === lang() + ':' && h !== hashOf(el)) return 'changed';
    return r.status; // verified | revise
  }
  var ICON = { verified: '✓', revise: '!', none: '○', changed: '↻' };

  /* ---------------- styles ---------------- */
  var css = [
    '.rv-btn{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;margin-left:3px;padding:0 4px;border-radius:9px;border:1px solid var(--line-2,#cfccc4);background:transparent;color:var(--muted,#7a7873);font:600 11px/1 system-ui,sans-serif;cursor:pointer;vertical-align:1px}',
    '.rv-btn:hover{border-color:var(--text,#121211);color:var(--text,#121211)}',
    '.rv-btn.rv-verified{background:var(--s3,#1baf7a);border-color:var(--s3,#1baf7a);color:#fff}',
    '.rv-btn.rv-revise{background:var(--s2,#eb6834);border-color:var(--s2,#eb6834);color:#fff}',
    '.rv-btn.rv-changed{background:var(--s4,#eda100);border-color:var(--s4,#eda100);color:#fff}',
    '.rv-btn.rv-official::after{content:"★";margin-left:2px;font-size:9px}',
    'body.rv-f-none [data-rv]:not([data-rv="none"]):not([data-rv="changed"]),body.rv-f-revise [data-rv]:not([data-rv="revise"]),body.rv-f-verified [data-rv]:not([data-rv="verified"]){opacity:.22;transition:opacity .2s}',
    '.rv-flash{outline:2px solid var(--accent,#2a78d6);outline-offset:3px;border-radius:3px}',
    '#rv-dock{position:fixed;left:14px;bottom:14px;z-index:66;font:13px/1.5 var(--font,system-ui,sans-serif);color:var(--text,#121211)}',
    '#rv-toggle{display:flex;align-items:center;gap:8px;padding:7px 12px;border-radius:20px;border:1px solid var(--line-2,#cfccc4);background:var(--surface,#fff);box-shadow:var(--shadow,0 4px 18px rgba(0,0,0,.12));color:inherit;font:inherit;font-weight:600;cursor:pointer}',
    '#rv-toggle .rv-bar{width:64px;height:6px;border-radius:3px;background:var(--surface-2,#eee);overflow:hidden;display:flex}',
    '#rv-toggle .rv-bar i{display:block;height:100%}',
    '#rv-menu{position:absolute;left:0;bottom:calc(100% + 8px);width:min(340px,calc(100vw - 28px));padding:14px;border-radius:10px;border:1px solid var(--line-2,#cfccc4);background:var(--surface,#fff);box-shadow:var(--shadow,0 6px 28px rgba(0,0,0,.15))}',
    '#rv-menu[hidden],#rv-panel[hidden]{display:none}',
    '.rv-seg{display:flex;flex-wrap:wrap;gap:4px;margin:8px 0}',
    '.rv-seg button{flex:1 1 auto;padding:5px 8px;border-radius:6px;border:1px solid var(--line-2,#cfccc4);background:transparent;color:inherit;font:inherit;font-size:12px;cursor:pointer}',
    '.rv-seg button.on{background:var(--text,#121211);border-color:var(--text,#121211);color:var(--bg,#fff)}',
    '.rv-lbl{display:block;margin:10px 0 3px;font-size:11.5px;font-weight:600;color:var(--text-2,#52514e)}',
    '.rv-in{width:100%;box-sizing:border-box;padding:7px 9px;border-radius:6px;border:1px solid var(--line-2,#cfccc4);background:var(--bg,#fff);color:inherit;font:inherit;font-size:13px}',
    'textarea.rv-in{min-height:84px;resize:vertical}',
    '.rv-hint{margin:10px 0 0;font-size:11.5px;color:var(--muted,#7a7873)}',
    '.rv-prog{font-size:12.5px;color:var(--text-2,#52514e)}',
    '#rv-panel{position:fixed;right:14px;bottom:14px;z-index:75;width:min(420px,calc(100vw - 28px));max-height:min(78vh,720px);overflow:auto;padding:16px;border-radius:10px;border:1px solid var(--line-2,#cfccc4);background:var(--surface,#fff);box-shadow:var(--shadow,0 6px 28px rgba(0,0,0,.18));font:13.5px/1.6 var(--font,system-ui,sans-serif);color:var(--text,#121211)}',
    '#rv-panel h3{margin:0 0 8px;font-size:14px;display:flex;justify-content:space-between;align-items:center}',
    '#rv-panel blockquote{margin:0 0 6px;padding:8px 10px;border-left:3px solid var(--line-2,#cfccc4);background:var(--surface-2,#f3f3f3);font-size:13px;max-height:9em;overflow:auto}',
    '.rv-x{border:0;background:transparent;color:var(--muted,#7a7873);font-size:16px;cursor:pointer}',
    '.rv-st button[data-s="verified"].on{background:var(--s3,#1baf7a);border-color:var(--s3,#1baf7a);color:#fff}',
    '.rv-st button[data-s="revise"].on{background:var(--s2,#eb6834);border-color:var(--s2,#eb6834);color:#fff}',
    '.rv-st button[data-s="pending"].on{background:var(--muted,#7a7873);border-color:var(--muted,#7a7873);color:#fff}',
    '.rv-save{margin-top:10px;width:100%;padding:8px;border-radius:6px;border:0;background:var(--accent,#2a78d6);color:#fff;font:inherit;font-weight:600;cursor:pointer}',
    '.rv-save:disabled{opacity:.6;cursor:default}',
    '.rv-msg{min-height:1.2em;margin-top:6px;font-size:12px;color:var(--text-2,#52514e)}',
    '.rv-hist{list-style:none;margin:6px 0 0;padding:0}',
    '.rv-hist li{padding:7px 0;border-top:1px solid var(--line,#e2e0da);font-size:12.5px}',
    '.rv-chip{display:inline-block;padding:0 7px;border-radius:9px;font-size:11px;font-weight:600;color:#fff;background:var(--muted,#7a7873)}',
    '.rv-chip.verified{background:var(--s3,#1baf7a)}.rv-chip.revise{background:var(--s2,#eb6834)}',
    '.rv-off{display:inline-block;margin-left:4px;padding:0 6px;border-radius:9px;font-size:10.5px;border:1px solid var(--accent,#2a78d6);color:var(--accent,#2a78d6)}',
    '.rv-meta{color:var(--muted,#7a7873);font-size:11.5px;margin-left:4px}',
    '.rv-note{margin-top:3px;white-space:pre-wrap;word-break:break-word}',
    '@media(max-width:600px){#rv-panel{right:8px;left:8px;bottom:8px;width:auto}#rv-dock{left:8px;bottom:8px}}',
    '@media print{#rv-dock,#rv-panel,.rv-btn{display:none!important}}'
  ].join('\n');
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  /* ---------------- sentence buttons ---------------- */
  function sentences() {
    var seen = {}, out = [];
    document.querySelectorAll(SEL).forEach(function (el) {
      if (el.closest('#rv-panel,#rv-dock,#drawer')) return;
      if (seen[el.id]) return;
      seen[el.id] = 1; out.push(el);
    });
    return out;
  }

  function decorate() {
    var els = sentences();
    var cnt = { verified: 0, revise: 0, none: 0, changed: 0 };
    els.forEach(function (el) {
      var sid = el.id, s = stateOf(sid, el), r = latest(sid);
      cnt[s]++;
      if (el.dataset.rv !== s) el.dataset.rv = s;
      var b = el.querySelector(':scope > .rv-btn, :scope > td:last-child > .rv-btn');
      if (!b) {
        b = document.createElement('button');
        b.type = 'button';
        b.addEventListener('click', function (ev) { ev.stopPropagation(); ev.preventDefault(); openPanel(sid); });
        var host = el.tagName === 'TR' ? (el.lastElementChild || el) : el;
        host.appendChild(b);
      }
      var cls = 'rv-btn rv-' + s + (r && r.official && s !== 'none' ? ' rv-official' : '');
      if (b.className !== cls) b.className = cls;
      if (b.textContent !== ICON[s]) b.textContent = ICON[s];
      var title = t('dock') + ': ' + t(s) + (r && s !== 'none' ? ' — ' + t('lastBy', { name: r.name, time: fmtTime(r.time) }) : '');
      if (b.title !== title) { b.title = title; b.setAttribute('aria-label', title); }
    });
    updateDock(els.length, cnt);
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; decorate(); });
  }

  /* ---------------- dock (progress · filter · settings) ---------------- */
  var dock = document.createElement('div');
  dock.id = 'rv-dock';
  dock.innerHTML = '<button type="button" id="rv-toggle" aria-expanded="false"></button><div id="rv-menu" hidden></div>';
  document.body.appendChild(dock);
  var toggle = dock.querySelector('#rv-toggle');
  var menu = dock.querySelector('#rv-menu');
  var lastCnt = null, lastN = 0, menuLang = null, lastToggle = '';

  toggle.addEventListener('click', function () {
    var open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) renderMenu();
  });

  function updateDock(n, cnt) {
    lastN = n; lastCnt = cnt;
    var w = function (k) { return n ? (cnt[k] / n * 100).toFixed(2) + '%' : '0'; };
    var label = loadState === 'loading' ? t('loading') :
      loadState === 'fail' ? t('loadFail') :
      t('dock') + ' ' + cnt.verified + '/' + n;
    var html = '<span>' + esc(label) + '</span><span class="rv-bar">' +
      '<i style="width:' + w('verified') + ';background:var(--s3,#1baf7a)"></i>' +
      '<i style="width:' + w('changed') + ';background:var(--s4,#eda100)"></i>' +
      '<i style="width:' + w('revise') + ';background:var(--s2,#eb6834)"></i></span>';
    if (lastToggle !== html) { lastToggle = html; toggle.innerHTML = html; }
    if (!menu.hidden) {
      if (menuLang !== lang()) renderMenu();
      else { var p = menu.querySelector('.rv-prog'); if (p) p.textContent = progText(); }
    }
  }
  function progText() {
    var c = lastCnt || { verified: 0, revise: 0 };
    return t('progress', { n: lastN, v: c.verified, r: c.revise });
  }

  function renderMenu() {
    menuLang = lang();
    var f = function (k, lbl) { return '<button type="button" data-f="' + k + '" class="' + (filter === k ? 'on' : '') + '">' + esc(t(lbl)) + '</button>'; };
    menu.innerHTML =
      '<div class="rv-prog">' + esc(progText()) + '</div>' +
      '<div class="rv-seg">' + f('all', 'fAll') + f('none', 'fNone') + f('revise', 'fRevise') + f('verified', 'fVerified') + '</div>' +
      '<div class="rv-seg"><button type="button" data-next>' + esc(t('next')) + '</button></div>' +
      '<label class="rv-lbl" for="rv-name">' + esc(t('name')) + '</label>' +
      '<input class="rv-in" id="rv-name" maxlength="30" placeholder="' + esc(t('namePh')) + '" value="' + esc(LS.get('name')) + '">' +
      '<label class="rv-lbl" for="rv-key">' + esc(t('key')) + '</label>' +
      '<input class="rv-in" id="rv-key" type="password" autocomplete="off" placeholder="' + esc(t('keyPh')) + '" value="' + esc(LS.get('key')) + '">' +
      '<p class="rv-hint">' + esc(t('hint')) + '</p>';
    menu.querySelectorAll('[data-f]').forEach(function (b) {
      b.onclick = function () { setFilter(b.dataset.f); renderMenu(); };
    });
    menu.querySelector('[data-next]').onclick = jumpNext;
    menu.querySelector('#rv-name').oninput = function (e) { LS.set('name', e.target.value.trim()); };
    menu.querySelector('#rv-key').oninput = function (e) { LS.set('key', e.target.value.trim()); };
  }

  function setFilter(k) {
    filter = k;
    document.body.classList.remove('rv-f-none', 'rv-f-revise', 'rv-f-verified');
    if (k !== 'all') document.body.classList.add('rv-f-' + k);
  }
  function matches(el) {
    var s = el.dataset.rv;
    if (filter === 'none') return s === 'none' || s === 'changed';
    if (filter === 'all') return true;
    return s === filter;
  }
  function jumpNext() {
    var els = sentences().filter(matches);
    if (!els.length) { flashMsg(t('nothing')); return; }
    if (window.innerWidth < 700) { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    var target = els.find(function (el) { return el.getBoundingClientRect().top > window.innerHeight * 0.55; }) || els[0];
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('rv-flash');
    setTimeout(function () { target.classList.remove('rv-flash'); }, 1800);
  }
  function flashMsg(m) {
    var p = menu.querySelector('.rv-prog');
    if (!p) return;
    p.textContent = m;
    setTimeout(function () { p.textContent = progText(); }, 1600);
  }

  /* ---------------- sentence panel ---------------- */
  var panel = document.createElement('div');
  panel.id = 'rv-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  document.body.appendChild(panel);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) closePanel(); });

  function closePanel() { panel.hidden = true; openSid = null; }

  function openPanel(sid) {
    var el = document.getElementById(sid);
    if (!el) return;
    openSid = sid;
    var cur = stateOf(sid, el), r = latest(sid);
    var pick = cur === 'verified' || cur === 'revise' ? cur : (cur === 'changed' && r ? r.status : 'verified');
    var hist = (bySid[sid] || []).slice().reverse();
    var name = LS.get('name');
    panel.innerHTML =
      '<h3><span>' + esc(t('dock')) + ' · <span class="rv-chip ' + (cur === 'verified' || cur === 'revise' ? cur : '') + '">' + esc(t(cur)) + '</span></span>' +
      '<button type="button" class="rv-x" aria-label="' + esc(t('close')) + '">✕</button></h3>' +
      '<blockquote>' + esc(textOf(el)) + '</blockquote>' +
      '<span class="rv-lbl">' + esc(t('status')) + '</span>' +
      '<div class="rv-seg rv-st">' +
        '<button type="button" data-s="verified">✓ ' + esc(t('verified')) + '</button>' +
        '<button type="button" data-s="revise">! ' + esc(t('revise')) + '</button>' +
        '<button type="button" data-s="pending">○ ' + esc(t('reset')) + '</button>' +
      '</div>' +
      '<label class="rv-lbl" for="rv-note">' + esc(t('note')) + '</label>' +
      '<textarea class="rv-in" id="rv-note" maxlength="1000" placeholder="' + esc(t('notePh')) + '"></textarea>' +
      '<label class="rv-lbl" for="rv-pname">' + esc(t('name')) + '</label>' +
      '<input class="rv-in" id="rv-pname" maxlength="30" placeholder="' + esc(t('namePh')) + '" value="' + esc(name) + '">' +
      '<button type="button" class="rv-save">' + esc(t('save')) + '</button>' +
      '<div class="rv-msg" aria-live="polite"></div>' +
      '<span class="rv-lbl">' + esc(t('history')) + ' (' + hist.length + ')</span>' +
      (hist.length ? '<ul class="rv-hist">' + hist.map(function (h) {
        var s = h.status === 'pending' ? 'none' : h.status;
        return '<li><span class="rv-chip ' + esc(s) + '">' + esc(t(s)) + '</span>' +
          (h.official ? '<span class="rv-off">' + esc(t('official')) + '</span>' : '') +
          '<span class="rv-meta">' + esc(t('lastBy', { name: h.name, time: fmtTime(h.time) })) + '</span>' +
          (h.note ? '<div class="rv-note">' + esc(h.note) + '</div>' : '') + '</li>';
      }).join('') + '</ul>' : '<div class="rv-hint">' + esc(t('noHistory')) + '</div>');
    panel.hidden = false;

    var chosen = pick;
    var segBtns = panel.querySelectorAll('.rv-st button');
    var mark = function () { segBtns.forEach(function (b) { b.classList.toggle('on', b.dataset.s === chosen); }); };
    segBtns.forEach(function (b) { b.onclick = function () { chosen = b.dataset.s; mark(); }; });
    mark();
    panel.querySelector('.rv-x').onclick = closePanel;
    var saveBtn = panel.querySelector('.rv-save');
    var msg = panel.querySelector('.rv-msg');
    var nameIn = panel.querySelector('#rv-pname');
    (name ? panel.querySelector('#rv-note') : nameIn).focus({ preventScroll: true });

    saveBtn.onclick = function () {
      var nm = nameIn.value.trim();
      if (!nm) { msg.textContent = t('needName'); nameIn.focus(); return; }
      LS.set('name', nm);
      var row = {
        report: REPORT, sid: sid, hash: hashOf(el), status: chosen,
        note: panel.querySelector('#rv-note').value.trim(), name: nm
      };
      var key = LS.get('key');
      saveBtn.disabled = true;
      saveBtn.textContent = t('saving');
      msg.textContent = '';
      fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(Object.assign({ key: key || undefined }, row)) })
        .then(function (res) { return res.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || 'error');
          addRow(Object.assign(row, { time: new Date().toISOString(), official: !!j.official }));
          decorate();
          if (openSid === sid) openPanel(sid);
          var m = panel.querySelector('.rv-msg');
          if (m) m.textContent = t('saved');
        })
        .catch(function (err) {
          saveBtn.disabled = false;
          saveBtn.textContent = t('save');
          msg.textContent = t('fail') + ' (' + err.message + ')';
        });
    };
  }

  /* ---------------- load ---------------- */
  function load() {
    fetch(ENDPOINT + '?report=' + encodeURIComponent(REPORT))
      .then(function (res) { return res.json(); })
      .then(function (j) {
        if (!j || !j.ok) throw new Error('bad response');
        bySid = {};
        j.rows.forEach(addRow);
        loadState = 'ok';
        decorate();
      })
      .catch(function () { loadState = 'fail'; decorate(); });
  }

  var IGNORE = '#rv-dock,#rv-panel,#tip,#toast';
  new MutationObserver(function (recs) {
    for (var i = 0; i < recs.length; i++) {
      var n = recs[i].target;
      var e = n.nodeType === 1 ? n : n.parentElement;
      if (!e || !e.closest(IGNORE)) { schedule(); return; }
    }
  }).observe(document.body, { childList: true, subtree: true });
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  decorate();
  load();
})();
