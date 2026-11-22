/** @OnlyCurrentDoc */
/**
 * AI 리서치 보고서 문장 검증 API (ai-report-review-api)
 * 구글시트 "AI 리서치 보고서 검증 기록"의 확장 프로그램 → Apps Script에 붙여 넣어 사용.
 * 기록은 덮어쓰지 않고 한 줄씩 쌓는다. 화면에는 문장별 최신 상태를 보여준다.
 */
const SHEET_NAME = 'log';
const HEADERS = ['time', 'report', 'sid', 'hash', 'status', 'note', 'name', 'official'];
const STATUSES = ['verified', 'revise', 'pending']; // 검증완료 / 수정필요 / 미검증으로 되돌림
const MAX_WRITES_PER_MIN = 60;                       // 전체 저장 횟수 제한 (분당)

/** 처음 한 번 편집기에서 실행: 머리글 생성 + 권한 승인 */
function setup() {
  getSheet_();
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function clean_(v, max) {
  let s = String(v == null ? '' : v).trim().slice(0, max);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // 시트에서 수식으로 실행되지 않게
  return s;
}

/** 읽기: ?report=보고서ID → 해당 보고서의 전체 기록 */
function doGet(e) {
  const report = String((e && e.parameter && e.parameter.report) || '');
  if (!report) return json_({ ok: false, error: 'report required' });
  const sh = getSheet_();
  const n = sh.getLastRow() - 1;
  if (n <= 0) return json_({ ok: true, rows: [] });
  const rows = sh.getRange(2, 1, n, HEADERS.length).getValues()
    .filter(r => r[1] === report)
    .map(r => ({
      time: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      sid: String(r[2]),
      hash: String(r[3]),
      status: String(r[4]),
      note: String(r[5]),
      name: String(r[6]),
      official: r[7] === true,
    }));
  return json_({ ok: true, rows: rows });
}

/** 쓰기: {report, sid, hash, status, note, name, key?} */
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad json' });
  }
  const report = clean_(d.report, 100);
  const sid = clean_(d.sid, 100);
  const hash = clean_(d.hash, 64);
  const status = String(d.status || '');
  const note = clean_(d.note, 1000);
  const name = clean_(d.name, 30);
  if (!report || !sid || !name) return json_({ ok: false, error: 'missing field' });
  if (STATUSES.indexOf(status) < 0) return json_({ ok: false, error: 'bad status' });

  // 선택: 프로젝트 설정 → 스크립트 속성에 ADMIN_KEY를 넣으면, 같은 키로 저장한 기록은 "공식 검증"
  const adminKey = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  const official = !!adminKey && d.key === adminKey;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const bucket = 'w' + Math.floor(Date.now() / 60000);
    const count = Number(cache.get(bucket) || 0);
    if (count >= MAX_WRITES_PER_MIN) return json_({ ok: false, error: 'too many requests' });
    cache.put(bucket, String(count + 1), 120);

    getSheet_().appendRow([new Date(), report, sid, hash, status, note, name, official]);
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true, official: official });
}
