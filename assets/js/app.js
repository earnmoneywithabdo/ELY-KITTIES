(() => {
  const C = window.EK_CONFIG;
  const N = C.kitties || 32;
  const KEY = 'elykitties_wl_v1';
  const $ = (s) => document.querySelector(s);
  const site = () => C.siteUrl || location.origin + location.pathname;
  const xUrl = 'https://x.com/' + C.xHandle;
  const postUrl = C.tweetId ? `https://x.com/${C.xHandle}/status/${C.tweetId}` : xUrl;
  const img = (i) => `assets/img/k/${i + 1}.png`;

  // ── links ────────────────────────────────────────────────
  document.querySelectorAll('.xh').forEach((el) => (el.textContent = '@' + C.xHandle));
  $('#navX').href = $('#footX').href = xUrl;
  $('#footX').textContent = '@' + C.xHandle;
  $('#tFollow').href = `https://x.com/intent/follow?screen_name=${C.xHandle}`;
  $('#tLike').href = postUrl;
  $('#tReply').href = C.tweetId ? `https://x.com/intent/tweet?in_reply_to=${C.tweetId}` : postUrl;
  $('#stSupply').textContent = C.supply.toLocaleString('en-US');

  // ── storage (may throw in private mode) ──────────────────
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } };
  const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

  // ── hero + rail ──────────────────────────────────────────
  let h = 0;
  setInterval(() => { h = (h + 1) % N; $('#heroKitty').src = img(h); $('#heroNo').textContent = '#' + (h + 1); }, 1400);
  const rail = $('#rail');
  for (let k = 0; k < 2; k++) for (let i = 0; i < N; i++) {
    const im = document.createElement('img'); im.src = img(i); im.alt = ''; im.loading = 'lazy'; rail.appendChild(im);
  }

  // ── tasks ────────────────────────────────────────────────
  const state = load() || {};
  const tasks = new Set(state.tasks || []);
  const paint = () => document.querySelectorAll('.task').forEach((t) => t.classList.toggle('done', tasks.has(t.dataset.task)));
  document.querySelectorAll('.task a').forEach((a) => a.addEventListener('click', () => {
    tasks.add(a.closest('.task').dataset.task); save({ ...(load() || {}), tasks: [...tasks] }); paint();
  }));
  paint();

  // ── referral ─────────────────────────────────────────────
  const CODE_RE = /^EK-[A-Z0-9]{6}$/;
  const ref = (new URLSearchParams(location.search).get('ref') || '').toUpperCase();
  if (CODE_RE.test(ref)) { $('#refLine').hidden = false; $('#refCode').textContent = ref; }
  const newCode = () => {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(6));
    return 'EK-' + [...r].map((x) => a[x % a.length]).join('');
  };

  // ── validation ───────────────────────────────────────────
  const V = {
    handle: (v) => /^[A-Za-z0-9_]{2,15}$/.test(v) || 'Enter a valid X handle.',
    wallet: (v) => /^0x[a-fA-F0-9]{40}$/.test(v) || 'Enter a valid EVM wallet (0x… 42 characters).',
    reply: (v) => /^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d{5,25}/i.test(v) || 'Paste the link to your reply on X.',
  };
  const ERR = {
    wallet_taken: 'This wallet is already registered by another handle.',
    handle_taken: 'This X handle is already registered with another wallet.',
    busy: 'Too many entries right now. Try again in a few seconds.',
  };
  const fail = (m) => { $('#formErr').textContent = m; };

  if (state.handle) { $('#fHandle').value = state.handle; $('#fWallet').value = state.wallet; $('#fReply').value = state.reply; }

  $('#wlForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = { handle: $('#fHandle').value.trim().replace(/^@+/, ''), wallet: $('#fWallet').value.trim(), reply: $('#fReply').value.trim() };
    document.querySelectorAll('.field').forEach((f) => f.classList.remove('bad'));
    for (const k of ['handle', 'wallet', 'reply']) {
      const ok = V[k](d[k]);
      if (ok !== true) { $('#f' + k[0].toUpperCase() + k.slice(1)).closest('.field').classList.add('bad'); return fail(ok); }
    }
    if (tasks.size < 3) return fail('Complete all three tasks above first.');
    const prev = load() || {};
    const code = prev.code || newCode();
    const body = { ...d, code, refby: CODE_RE.test(ref) && ref !== code ? ref : '', ua: navigator.userAgent };
    const btn = $('#submitBtn'); btn.disabled = true; btn.textContent = 'Submitting…'; fail('');
    try {
      let res;
      if (C.sheetEndpoint) {
        const r = await fetch(C.sheetEndpoint, { method: 'POST', body: JSON.stringify(body) }); // text/plain: no CORS preflight
        res = await r.json();
      } else {
        res = { ok: true, code, queue: prev.queue || 1 + Math.floor(Math.random() * 400), referrals: 0, demo: true };
      }
      if (!res.ok) return fail(ERR[res.error] || 'Something went wrong (' + res.error + '). Try again.');
      const rec = { ...prev, ...d, code, queue: res.queue, referrals: res.referrals || 0, tasks: [...tasks], date: prev.date || Date.now() };
      save(rec); show(rec, true);
    } catch { fail('Network error. Check your connection and try again.'); }
    finally { btn.disabled = false; btn.textContent = 'Submit application'; }
  });

  // ── result ───────────────────────────────────────────────
  const refLink = (code) => site() + '?ref=' + code;
  const kittyFor = (w) => { let x = 0; for (const c of w.toLowerCase()) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x % N; };
  const pad = (q) => '#' + String(q).padStart(4, '0');
  const pips = (n) => Array.from({ length: 10 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');

  async function show(rec, scroll) {
    $('#formCard').hidden = true; $('#result').hidden = false;
    $('#rHandle').textContent = '@' + rec.handle;
    $('#rCode').textContent = rec.code; $('#rQueue').textContent = pad(rec.queue);
    $('#rRefs').textContent = rec.referrals || 0; $('#pips').innerHTML = pips(rec.referrals || 0);
    await drawCard(rec);
    if (scroll) $('#apply').scrollIntoView({ behavior: 'smooth' });
    if (C.sheetEndpoint) try {
      const j = await (await fetch(C.sheetEndpoint + '?code=' + encodeURIComponent(rec.code))).json();
      if (j.ok && j.found) {
        rec.queue = j.queue; rec.referrals = j.referrals; save(rec);
        $('#rQueue').textContent = pad(rec.queue); $('#rRefs').textContent = rec.referrals; $('#pips').innerHTML = pips(rec.referrals);
      }
    } catch {}
  }

  $('#btnEdit').onclick = () => { $('#result').hidden = true; $('#formCard').hidden = false; };
  $('#btnDownload').onclick = () => {
    const rec = load(), a = document.createElement('a');
    a.download = `ely-kitties-pass-${rec.handle}.png`; a.href = $('#card').toDataURL('image/png'); a.click(); toast('Pass downloaded');
  };
  $('#btnShare').onclick = () => {
    const rec = load();
    const text = `🌿 I just applied for the @${C.xHandle} whitelist.\n\n2,222 fully on-chain kitties on @Enter_Elysium.\n\nApply here:`;
    window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(refLink(rec.code))}`, '_blank', 'noopener');
  };
  $('#btnCopy').onclick = async () => {
    const link = refLink(load().code);
    try { await navigator.clipboard.writeText(link); toast('Referral link copied'); } catch { prompt('Copy your link', link); }
  };
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 1800); }

  // ── Elysian Pass (1200x675) ──────────────────────────────
  async function drawCard(rec) {
    await Promise.all(['700 40px Silkscreen', '700 20px "JetBrains Mono"', '500 20px "JetBrains Mono"', '600 20px Inter']
      .map((f) => document.fonts.load(f))).catch(() => {});
    const cv = $('#card'), g = cv.getContext('2d'), W = 1200, H = 675;
    const P = { bg: '#071716', bg2: '#123c3a', mint: '#97fce4', mint2: '#3ec4a8', text: '#effffa', mute: '#8fb5ad', line: 'rgba(151,252,228,.18)', gold: '#ffd65c' };
    const k = kittyFor(rec.wallet);
    const kit = await new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = img(k); });

    const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#0a2423'); grd.addColorStop(1, P.bg);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(330, 340, 20, 330, 340, 420);
    glow.addColorStop(0, 'rgba(151,252,228,.28)'); glow.addColorStop(1, 'rgba(151,252,228,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // pixel stars
    let s = 7; for (const ch of rec.code) s = (s * 33 + ch.charCodeAt(0)) >>> 0;
    g.fillStyle = 'rgba(151,252,228,.5)';
    for (let i = 0; i < 40; i++) { s = (s * 1103515245 + 12345) >>> 0; g.fillRect(s % W, (s >>> 12) % H, 3, 3); }
    // frame
    g.strokeStyle = P.line; g.lineWidth = 2; g.strokeRect(24, 24, W - 48, H - 48);
    g.strokeStyle = P.mint; g.lineWidth = 4;
    for (const [x, y, dx, dy] of [[24, 24, 1, 1], [W - 24, 24, -1, 1], [24, H - 24, 1, -1], [W - 24, H - 24, -1, -1]]) {
      g.beginPath(); g.moveTo(x, y + dy * 40); g.lineTo(x, y); g.lineTo(x + dx * 40, y); g.stroke();
    }

    // kitty
    const kx = 90, ky = 130, ks = 400;
    g.strokeStyle = 'rgba(151,252,228,.35)'; g.setLineDash([6, 8]); g.lineWidth = 2;
    g.beginPath(); g.arc(kx + ks / 2, ky + ks / 2, ks / 2 + 34, 0, 7); g.stroke(); g.setLineDash([]);
    g.imageSmoothingEnabled = false; g.drawImage(kit, kx, ky, ks, ks);
    g.strokeStyle = P.mint; g.lineWidth = 3; g.strokeRect(kx, ky, ks, ks);
    g.fillStyle = P.mute; g.font = '600 18px "JetBrains Mono"'; g.textBaseline = 'alphabetic';
    g.fillText(`GUARDIAN · ELY KITTY #${k + 1}`, kx, ky + ks + 48);

    // header
    g.fillStyle = P.mint; g.font = '700 26px Silkscreen'; g.fillText('ELY KITTIES', 90, 86);
    g.textAlign = 'right'; g.fillStyle = P.mute; g.font = '700 18px "JetBrains Mono"'; g.fillText('ELYSIAN PASS · WHITELIST', W - 70, 84); g.textAlign = 'left';

    // details
    const x0 = 600;
    g.fillStyle = P.mute; g.font = '700 16px "JetBrains Mono"'; g.fillText('HOLDER', x0, 160);
    g.fillStyle = P.text; let sz = 54; g.font = `700 ${sz}px Silkscreen`;
    const hd = '@' + rec.handle; while (g.measureText(hd).width > 520 && sz > 26) { sz -= 2; g.font = `700 ${sz}px Silkscreen`; }
    g.fillText(hd, x0, 220);
    const rows = [['WALLET', rec.wallet.slice(0, 8) + '…' + rec.wallet.slice(-6)], ['PASS CODE', rec.code], ['POSITION', pad(rec.queue)], ['NETWORK', 'ELYSIUM']];
    rows.forEach(([a, b], i) => {
      const y = 290 + i * 58;
      g.strokeStyle = P.line; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y + 20); g.lineTo(W - 70, y + 20); g.stroke();
      g.fillStyle = P.mute; g.font = '700 15px "JetBrains Mono"'; g.fillText(a, x0, y);
      g.fillStyle = i === 1 ? P.mint : P.text; g.font = '700 24px "JetBrains Mono"'; g.textAlign = 'right'; g.fillText(b, W - 70, y); g.textAlign = 'left';
    });
    // status pill
    g.fillStyle = P.mint; roundRect(g, x0, 530, 220, 46, 23); g.fill();
    g.fillStyle = '#062420'; g.font = '700 18px Silkscreen'; g.fillText('APPLIED', x0 + 44, 560);
    g.beginPath(); g.arc(x0 + 24, 553, 6, 0, 7); g.fill();
    g.fillStyle = P.mute; g.font = '500 16px "JetBrains Mono"'; g.textAlign = 'right';
    g.fillText((C.siteUrl || '').replace(/^https?:\/\//, '') || '@' + C.xHandle, W - 70, 560);
    g.fillText('2,222 ON-CHAIN KITTIES', W - 70, 600); g.textAlign = 'left';
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  if (state.code && state.handle) show(state, false);
})();
