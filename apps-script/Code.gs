/**
 * ELY KITTIES — whitelist backend (Google Apps Script + Google Sheets)
 * -------------------------------------------------------------------
 * SETUP
 *  1. Create a Google Sheet.
 *  2. Extensions → Apps Script. Delete the placeholder, paste this file, save.
 *  3. Run `setup` once (▶) and approve the permission prompt.
 *  4. Deploy → New deployment → type "Web app".
 *       Execute as:      Me
 *       Who has access:  Anyone
 *     Deploy and copy the /exec URL.
 *  5. Paste it into assets/js/config.js → sheetEndpoint.
 *
 *  Changed this code later? Deploy → Manage deployments → edit → New version
 *  (a new deployment gets a different URL).
 */

var SHEET_NAME = 'Applications';
var HEADERS = ['Timestamp', 'Code', 'X Handle', 'Wallet', 'Reply Link', 'Referred By', 'Referrals', 'Queue', 'User Agent'];
var C = { TS: 1, CODE: 2, HANDLE: 3, WALLET: 4, REPLY: 5, REFBY: 6, REFS: 7, QUEUE: 8, UA: 9 };
var CODE_RE = /^EK-[A-Z0-9]{6}$/;

function setup() {
  var sh = sheet();
  SpreadsheetApp.getActive().toast('Ready — ' + Math.max(0, sh.getLastRow() - 1) + ' application(s).');
}

function sheet() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(C.WALLET, 380);
    sh.setColumnWidth(C.REPLY, 320);
  }
  return sh;
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return reply({ ok: false, error: 'busy' }, e); }
  try {
    var b = {};
    try { b = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
    var handle = String(b.handle || '').trim().replace(/^@+/, '');
    var wallet = String(b.wallet || '').trim();
    var link = String(b.reply || '').trim();
    var code = String(b.code || '').trim().toUpperCase();
    var refby = String(b.refby || '').trim().toUpperCase();

    if (!/^[A-Za-z0-9_]{2,15}$/.test(handle)) return reply({ ok: false, error: 'bad_handle' }, e);
    if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return reply({ ok: false, error: 'bad_wallet' }, e);
    if (!/^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}/i.test(link)) return reply({ ok: false, error: 'bad_reply' }, e);
    if (!CODE_RE.test(code)) return reply({ ok: false, error: 'bad_code' }, e);
    if (refby && (!CODE_RE.test(refby) || refby === code)) refby = '';

    var sh = sheet();
    var rows = readAll(sh);
    var mine = -1;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (String(r[C.CODE - 1]).toUpperCase() === code ||
          String(r[C.WALLET - 1]).toLowerCase() === wallet.toLowerCase() ||
          String(r[C.HANDLE - 1]).toLowerCase() === ('@' + handle).toLowerCase()) { mine = i; break; }
    }
    // a wallet can't be claimed by two different applicants
    if (mine >= 0 && String(rows[mine][C.CODE - 1]).toUpperCase() !== code) {
      if (String(rows[mine][C.WALLET - 1]).toLowerCase() === wallet.toLowerCase()) return reply({ ok: false, error: 'wallet_taken' }, e);
      return reply({ ok: false, error: 'handle_taken' }, e);
    }

    var now = new Date(), ua = String(b.ua || '').slice(0, 200), queue;
    if (mine >= 0) {
      queue = rows[mine][C.QUEUE - 1] || mine + 1;
      var keptRef = rows[mine][C.REFBY - 1] || refby;
      sh.getRange(mine + 2, 1, 1, HEADERS.length).setValues([[now, code, '@' + handle, wallet, link, keptRef, rows[mine][C.REFS - 1] || 0, queue, ua]]);
      refby = keptRef;
    } else {
      queue = rows.length + 1;
      sh.appendRow([now, code, '@' + handle, wallet, link, refby, 0, queue, ua]);
    }
    if (refby) recount(sh, refby);
    return reply({ ok: true, updated: mine >= 0, code: code, queue: queue, referrals: recount(sh, code) }, e);
  } catch (err) {
    return reply({ ok: false, error: String(err) }, e);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'ping') return reply({ ok: true }, e);
  var code = String(p.code || '').trim().toUpperCase();
  if (!CODE_RE.test(code)) return reply({ ok: false, error: 'bad_code' }, e);
  var rows = readAll(sheet()), mine = -1;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][C.CODE - 1]).toUpperCase() === code) { mine = i; break; }
  return reply({ ok: true, found: mine >= 0, queue: mine >= 0 ? rows[mine][C.QUEUE - 1] || mine + 1 : null,
                 referrals: countRefs(rows, code), total: rows.length }, e);
}

function readAll(sh) {
  var last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, HEADERS.length).getValues();
}
function countRefs(rows, code) {
  var n = 0;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][C.REFBY - 1]).toUpperCase() === code) n++;
  return n;
}
function recount(sh, code) {
  var rows = readAll(sh), n = countRefs(rows, code);
  for (var i = 0; i < rows.length; i++) if (String(rows[i][C.CODE - 1]).toUpperCase() === code) { sh.getRange(i + 2, C.REFS).setValue(n); break; }
  return n;
}
function reply(obj, e) {
  var json = JSON.stringify(obj), cb = e && e.parameter && e.parameter.callback;
  if (cb && /^[A-Za-z_$][\w$]*$/.test(cb))
    return ContentService.createTextOutput(cb + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
