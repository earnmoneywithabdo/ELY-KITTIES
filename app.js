/* Ely Kitties — mint launchpad (Arc Runners / Kiyomi mint mechanics) */
(function () {
  'use strict';
  var C = window.MINT_CONFIG, R = window.EK_KITTIES;
  var E = window.ethers;
  var $ = function (id) { return document.getElementById(id); };

  var ABI = [
    'function totalSupply() view returns (uint256)',
    'function maxSupply() view returns (uint256)',
    'function price() view returns (uint256)',
    'function maxPerTx() view returns (uint256)',
    'function saleActive() view returns (bool)',
    'function owner() view returns (address)',
    'function mint(uint256 qty) payable',
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
    // owner-only (admin panel)
    'function setSaleActive(bool)', 'function setPrice(uint256)', 'function setMaxPerTx(uint256)',
    'function setMaxSupply(uint256)', 'function ownerMint(address,uint256)', 'function withdraw()',
    'function tokenSVG(uint256) view returns (string)'
  ];
  var UMAX = E.MaxUint256;
  var GAS_BUFFER = E.parseEther('0.0005');  // leave this much HYPE for gas
  var FREE_FALLBACK_CAP = 20n;            // only used if price is 0 and max/tx is unlimited

  var hasAddr = /^0x[a-fA-F0-9]{40}$/.test(C.contract);
  // The public Elysium RPC rate-limits (429) and then answers calls with empty data,
  // so reads rotate through every RPC in the list until one answers.
  var RPCS = [C.rpcUrl].concat(C.rpcFallbacks || []);
  var rpcIdx = 0;
  function mkReader(i) { return new E.JsonRpcProvider(RPCS[i], C.chainId, { staticNetwork: true, batchMaxCount: 1 }); }
  var reader = mkReader(0);
  var ro = hasAddr ? new E.Contract(C.contract, ABI, reader) : null;
  function nextRpc() {
    if (RPCS.length < 2) return;
    rpcIdx = (rpcIdx + 1) % RPCS.length;
    reader = mkReader(rpcIdx);
    if (hasAddr) ro = new E.Contract(C.contract, ABI, reader);
    if (artC) artC = new E.Contract(C.renderer, RENDER_ABI, reader);
  }

  var S = { loaded: false, minted: 0n, supply: BigInt(C.totalSupply), price: E.parseEther(C.priceEth), perTx: UMAX, sale: false };
  // paint the last numbers we saw instantly, then refresh from chain
  var CACHE_KEY = 'elykitties_sale_v1';
  try {
    var c0 = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (c0 && c0.contract === C.contract) {
      S.minted = BigInt(c0.minted); S.supply = BigInt(c0.supply); S.price = BigInt(c0.price);
      S.perTx = BigInt(c0.perTx); S.sale = !!c0.sale; S.loaded = true;
    }
  } catch (x) {}
  var W = { w: null, account: null, chainId: null, bal: 0n, contract: null, owner: false };
  var busy = false, seq = 0, fails = 0;

  /* ---------- static ---------- */
  document.querySelectorAll('.cur').forEach(function (s) { s.textContent = C.currencySymbol; });
  $('title').textContent = C.name; $('tagline').textContent = C.tagline;
  $('wlLink').href = C.wlSite; $('xLink').href = 'https://x.com/' + C.xHandle;
  $('netName').textContent = C.chainName; $('yr').textContent = new Date().getFullYear();
  $('footNet').textContent = C.chainName + (hasAddr ? ' · ' + short(C.contract) : '');
  if (hasAddr) {
    $('contractLink').textContent = '· contract ' + short(C.contract);
    if (C.blockExplorer) $('contractLink').href = C.blockExplorer + '/address/' + C.contract;
  } else $('contractLink').textContent = '· contract not deployed';

  // on-chain art: the renderer draws any id, minted or not
  var RENDER_ABI = ['function tokenSVG(uint256) view returns (string)'];
  var artC = /^0x[a-fA-F0-9]{40}$/.test(C.renderer || '') ? new E.Contract(C.renderer, RENDER_ABI, reader) : null;
  var svgCache = {};
  function artFor(id) { return R[(id * 7 + 3) % R.length]; }
  function onchainSVG(id) {
    if (svgCache[id]) return Promise.resolve(svgCache[id]);
    if (!artC) return Promise.reject(new Error('no renderer'));
    return artC.tokenSVG(id).then(function (svg) {
      var url = 'data:image/svg+xml;base64,' + btoa(svg);
      svgCache[id] = url; return url;
    });
  }
  function paintOnchain(img, id) {
    onchainSVG(id).then(function (url) { img.src = url; }).catch(function () {});
  }

  // art stage
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var cur = 0, picked = false;
  $('thumbs').innerHTML = R.map(function (r, i) {
    return '<button data-i="' + i + '" style="background:' + r[2] + '" aria-label="' + r[1] + '"><img class="px" src="assets/img/k/' + r[0] + '.png" alt=""></button>';
  }).join('');
  function showKitty(i) {
    cur = i; var r = R[i];
    $('stageImg').src = 'assets/img/k/' + r[0] + '.png'; $('stageImg').alt = r[1];
    $('stageArt').style.background = r[2];
    $('stageName').textContent = r[1].toUpperCase();
    $('stageNo').textContent = pad(i + 1) + ' / ' + pad(R.length);
    document.querySelectorAll('#thumbs button').forEach(function (b, k) { b.classList.toggle('on', k === i); });
  }
  $('thumbs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { picked = true; showKitty(+b.dataset.i); stageOnchain(+b.dataset.i); } });
  showKitty(0);
  // the stage cycles the real on-chain art once the renderer answers
  function stageOnchain(i) { paintOnchain($('stageImg'), i + 1); }
  stageOnchain(0);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(function () {
    if (picked) return;
    var n = (cur + 1) % R.length;
    showKitty(n); stageOnchain(n);
  }, 1800);

  /* ---------- helpers ---------- */
  function short(a) { return a.slice(0, 6) + '…' + a.slice(-4); }
  function money(wei) {
    if (wei === 0n) return 'FREE';
    var n = Number(E.formatEther(wei));
    var txt = n >= 100 ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : String(+n.toFixed(n < 0.001 ? 8 : n < 1 ? 6 : 4));
    return txt + ' ' + C.currencySymbol;
  }
  function note(msg, cls) { $('note').className = 'status' + (cls ? ' ' + cls : ''); $('note').innerHTML = msg || ''; }
  var tt;
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function txLink(h) { return C.blockExplorer ? ' <a href="' + C.blockExplorer + '/tx/' + h + '" target="_blank" rel="noopener">View tx</a>' : ''; }
  function errMsg(e) {
    var code = e && (e.code || (e.info && e.info.error && e.info.error.code));
    if (code === 4001 || code === 'ACTION_REJECTED') return 'You rejected the request in your wallet.';
    if (code === -32002) return 'Your wallet already has a pending request — open it to continue.';
    var m = (e && (e.reason || e.shortMessage || e.message)) || 'Transaction failed';
    if (/insufficient funds/i.test(m)) return 'Not enough ' + C.currencySymbol + ' for gas.';
    return m.replace(/^execution reverted:?\s*/i, '').slice(0, 140);
  }

  // ─── mint start gate (Kiyomi) ───
  var MINT_START = C.mintStart ? new Date(C.mintStart).getTime() : 0;
  function startOpen() { return !MINT_START || Date.now() >= MINT_START; }
  function fmtLeft(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
    var p = function (n) { return String(n).padStart(2, '0'); };
    return (d > 0 ? d + 'd ' : '') + p(h) + ':' + p(m) + ':' + p(sec);
  }

  // Max = how many they can afford at the mint price, capped by maxPerTx (Kiyomi) and what's left.
  function maxMintable() {
    var left = S.supply > S.minted ? S.supply - S.minted : 0n;
    var n;
    if (S.price > 0n) {
      var spend = W.bal > GAS_BUFFER ? W.bal - GAS_BUFFER : 0n;
      n = spend / S.price;
    } else {
      n = S.perTx === UMAX ? FREE_FALLBACK_CAP : S.perTx;
    }
    if (S.perTx < n) n = S.perTx;
    if (left < n) n = left;
    return n;
  }

  /* ---------- reads ---------- */
  function readOnChain() {
    if (!ro) { paint(); return Promise.resolve(); }
    var my = ++seq;
    return reader.getBlockNumber().then(function (bn) {
      var o = { blockTag: bn };
      var who = W.account;   // a poll started before connect must not write a stale balance
      return Promise.all([ro.totalSupply(o), ro.maxSupply(o), ro.price(o), ro.maxPerTx(o), ro.saleActive(o),
        who ? reader.getBalance(who, bn) : Promise.resolve(null)]).then(function (v) { v.who = who; return v; });
    }).then(function (v) {
      if (my !== seq) return;
      S.minted = v[0]; S.supply = v[1]; S.price = v[2]; S.perTx = v[3]; S.sale = v[4]; S.loaded = true;
      if (v.who && v.who === W.account) W.bal = v[5];
      $('netPill').className = 'net ok';
      fails = 0;
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ contract: C.contract, minted: String(S.minted), supply: String(S.supply),
        price: String(S.price), perTx: String(S.perTx), sale: S.sale })); } catch (x) {}
      paint();
    }).catch(function (e) {
      if (my !== seq) return;
      console.warn('[EK] read failed on ' + RPCS[rpcIdx], e);
      nextRpc();                                   // try the other RPC straight away
      if (++fails <= 6) setTimeout(readOnChain, 1000);
      if (fails > 2) $('netPill').className = 'net bad';
      if (!S.loaded && fails > 2) { $('liveLabel').textContent = 'Cannot reach ' + C.chainName; }
    });
  }

  /* ---------- paint ---------- */
  var CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square"/></svg>';

  function paint() {
    var soldOut = S.loaded && S.minted >= S.supply;
    var n = maxMintable();

    $('price').textContent = 'FREE';
    $('minted').textContent = Number(S.minted).toLocaleString() + ' / ' + Number(S.supply).toLocaleString();
    $('meterFill').style.width = (S.supply > 0n ? Math.min(100, Number(S.minted * 10000n / S.supply) / 100) : 0) + '%';

    var live = S.loaded && S.sale && startOpen() && !soldOut;
    $('kicker').classList.toggle('idle', !live);
    $('liveLabel').textContent = !hasAddr ? 'Contract not deployed' : !S.loaded ? 'Loading sale…' : soldOut ? 'Sold out'
      : !startOpen() ? 'Mint starts in ' + fmtLeft(MINT_START - Date.now()) : S.sale ? 'Mint live' : 'Sale paused';

    // eligibility (Kiyomi-style line)
    var ok = false, msg = 'Not eligible — connect wallet';
    if (W.account) {
      if (!hasAddr) msg = 'Mint not deployed yet';
      else if (W.chainId !== C.chainId) msg = 'Wrong network — add / switch to ' + C.chainName;
      else if (S.price > 0n && n < 1n && !soldOut) msg = 'Not enough ' + C.currencySymbol + ' to cover the mint fee';
      else if (soldOut) msg = 'Sold out';
      else { ok = true; msg = "You're eligible to mint"; }
    }
    $('elig').className = 'elig' + (ok ? ' ok' : '');
    $('elig').innerHTML = (ok ? CHECK : CROSS) + '<span>' + msg + '</span>';

    // button
    var b = $('mintBtn'), label, enabled = false;
    if (busy) label = 'Minting…';
    else if (!hasAddr) label = 'Mint not deployed';
    else if (!startOpen()) label = 'Mint starts in ' + fmtLeft(MINT_START - Date.now());
    else if (!W.account) { label = 'Connect to Mint'; enabled = true; }
    else if (W.chainId !== C.chainId) { label = 'Switch to ' + C.chainName; enabled = true; }
    else if (soldOut) label = 'Sold out';
    else if (!S.sale) label = 'Sale paused';
    else if (n < 1n) label = 'Not enough ' + C.currencySymbol;
    else { label = 'Mint'; enabled = true; }
    b.textContent = label; b.disabled = !enabled;

    $('connectBtn').textContent = W.account ? short(W.account) : 'Connect wallet';
    $('connectBtn').classList.toggle('connected', !!W.account);
  }
  setInterval(function () { if (MINT_START && !startOpen()) paint(); }, 1000);

  /* ---------- wallet discovery (EIP-6963) ---------- */
  var found = new Map();
  addEventListener('eip6963:announceProvider', function (e) {
    var d = e.detail;
    if (d && d.info && d.info.uuid && d.provider) {
      found.set(d.info.uuid, d);
      if (!W.account && localStorage.getItem('elykitties_connected')) autoConnect();
    }
  });
  dispatchEvent(new Event('eip6963:requestProvider'));

  function legacyName(p) {
    if (p.isRabby) return 'Rabby'; if (p.isCoinbaseWallet) return 'Coinbase Wallet';
    if (p.isTrust || p.isTrustWallet) return 'Trust Wallet'; if (p.isOkxWallet || p.isOKExWallet) return 'OKX Wallet';
    if (p.isBraveWallet) return 'Brave Wallet'; if (p.isMetaMask) return 'MetaMask';
    return 'Browser wallet';
  }
  function walletList() {
    var a = Array.from(found.values());
    if (a.length) return a;
    if (!window.ethereum) return [];
    var ps = window.ethereum.providers && window.ethereum.providers.length ? window.ethereum.providers : [window.ethereum];
    return ps.map(function (p, i) { return { info: { uuid: 'legacy' + i, name: legacyName(p), icon: '' }, provider: p }; });
  }

  $('connectBtn').onclick = function () { W.account ? disconnect() : openPicker(); };
  document.addEventListener('click', function (e) { if (!e.target.closest('.wallet-wrap')) $('picker').hidden = true; });

  function openPicker() {
    var list = walletList();
    if (!list.length) {
      if (/android|iphone|ipad|ipod/i.test(navigator.userAgent)) { location.href = 'https://metamask.app.link/dapp/' + location.host + location.pathname; return; }
      note('No wallet found. Install <a href="https://metamask.io/download/" target="_blank" rel="noopener">MetaMask</a> or Rabby, then reload.', 'err'); return;
    }
    if (list.length === 1) return connectWith(list[0]);
    var pk = $('picker');
    pk.innerHTML = '<p>Choose wallet</p>' + list.map(function (w, i) {
      return '<button data-i="' + i + '">' + (w.info.icon ? '<img src="' + w.info.icon + '" alt="">' : '') + w.info.name + '</button>';
    }).join('');
    pk.hidden = false;
    pk.onclick = function (e) { var b = e.target.closest('button'); if (b) { pk.hidden = true; connectWith(list[+b.dataset.i]); } };
  }

  function connectWith(w, silent) {
    var p = w.provider;
    return p.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' }).then(function (accs) {
      if (!accs || !accs.length) { if (!silent) throw new Error('Unlock your wallet and try again.'); return; }
      if (W.w && W.w.provider.removeListener) { W.w.provider.removeListener('accountsChanged', onAccounts); W.w.provider.removeListener('chainChanged', onChain); }
      W.w = w; W.account = E.getAddress(accs[0]);
      if (p.on) { p.on('accountsChanged', onAccounts); p.on('chainChanged', onChain); }
      localStorage.setItem('elykitties_connected', w.info.uuid);
      return p.request({ method: 'eth_chainId' }).then(function (cid) {
        W.chainId = parseInt(cid, 16);
        if (!silent) note('');
        var ready = afterConnect();
        // wallet on the wrong network? ask it to switch, adding Elysium if it doesn't know it yet
        if (!silent && W.chainId !== C.chainId) {
          return ready.then(function () {
            note('Add / switch to ' + C.chainName + ' in your wallet…');
            return ensureChain().then(function () { note(''); }, function (e) {
              note(errMsg(e) + ' You need ' + C.chainName + ' to mint.', 'err');
            });
          });
        }
        return ready;
      });
    }).catch(function (e) { if (!silent) note(errMsg(e), 'err'); });
  }
  var autoTried = false;
  function autoConnect() {
    if (autoTried || W.account) return;
    var id = localStorage.getItem('elykitties_connected');
    var w = walletList().filter(function (x) { return x.info.uuid === id; })[0] || walletList()[0];
    if (!w) return;
    autoTried = true;
    connectWith(w, true);
  }
  function afterConnect() {
    paint();
    return readOnChain().then(function () { checkOwner(); loadMine(); });
  }
  function onAccounts(accs) { if (!accs || !accs.length) return disconnect(); W.account = E.getAddress(accs[0]); afterConnect(); }
  function onChain(cid) { W.chainId = parseInt(cid, 16); afterConnect(); }
  function disconnect() {
    W.account = null; W.bal = 0n; W.owner = false;
    localStorage.removeItem('elykitties_connected');
    $('adminBtn').hidden = true; $('mine').hidden = true;
    paint();
  }

  function addChain() {
    return W.w.provider.request({ method: 'wallet_addEthereumChain', params: [{
      chainId: '0x' + C.chainId.toString(16),
      chainName: C.chainName,
      rpcUrls: [C.rpcUrl],
      nativeCurrency: { name: C.currencySymbol, symbol: C.currencySymbol, decimals: 18 },
      blockExplorerUrls: C.blockExplorer ? [C.blockExplorer] : undefined
    }] });
  }
  function ensureChain() {
    var p = W.w.provider, hex = '0x' + C.chainId.toString(16);
    return p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }).catch(function (e) {
      var code = e && (e.code || (e.data && e.data.originalError && e.data.originalError.code));
      // 4902 = wallet doesn't know this chain yet; some wallets only say so in the message
      if (code === 4902 || /unrecognized chain|not added|add.*network/i.test(e && e.message || '')) {
        return addChain().then(function () {
          // most wallets switch as part of adding; ask again in case they didn't
          return p.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] }).catch(function () {});
        });
      }
      throw e;
    }).then(function () { return p.request({ method: 'eth_chainId' }); }).then(function (cid) {
      W.chainId = parseInt(cid, 16);
      paint();
      if (W.chainId === C.chainId) { readOnChain(); checkOwner(); loadMine(); }
    });
  }

  function signer() {
    var bp = new E.BrowserProvider(W.w.provider);
    bp.pollingInterval = 1000;
    return bp.getSigner(W.account).then(function (s) { return new E.Contract(C.contract, ABI, s); });
  }

  /* ---------- mint (Kiyomi: one click mints the max you can afford) ---------- */
  $('mintBtn').onclick = function () {
    if (!W.account) return openPicker();
    if (W.chainId !== C.chainId) return ensureChain().catch(function (e) { note(errMsg(e), 'err'); });
    if (!startOpen()) return note("Mint hasn't started yet.", 'err');
    readOnChain().then(function () {
      var n = maxMintable();
      if (n < 1n) return note('Not enough ' + C.currencySymbol + ' to cover the mint price.', 'err');
      busy = true; paint();
      note('Confirm in your wallet…');
      var value = S.price * n;
      return signer().then(function (c) {
        return c[C.mintFnName].staticCall(n, { value: value }).then(function () { return c[C.mintFnName](n, { value: value }); });
      }).then(function (tx) {
        note('Minting ' + Number(n) + (n > 1n ? ' kitties' : ' kitty') + '… waiting for confirmation' + txLink(tx.hash));
        return tx.wait();
      }).then(function (rc) {
        busy = false;
        note('🌿 Minted ' + Number(n) + (n > 1n ? ' Ely Kitties' : ' Ely Kitty') + '! Welcome to the fields.' + txLink(rc.hash), 'ok');
        toast('Welcome to the Elysian fields 🌿');
        var fresh = [];
        rc.logs.forEach(function (l) { try { var ev = ro.interface.parseLog(l); if (ev && ev.name === 'Transfer') fresh.push(Number(ev.args.tokenId)); } catch (x) {} });
        return readOnChain().then(function () { return loadMine(fresh); });
      });
    }).catch(function (e) { busy = false; paint(); note(errMsg(e), 'err'); });
  };

  /* ---------- your kitties ---------- */
  function loadMine(fresh) {
    if (!ro || !W.account) return;
    var me = W.account;
    return ro.queryFilter(ro.filters.Transfer(E.ZeroAddress, me), 0).then(function (logs) {
      if (me !== W.account) return;
      var ids = logs.map(function (l) { return Number(l.args.tokenId); }).sort(function (a, b) { return b - a; });
      $('mine').hidden = !ids.length;
      $('mineGrid').innerHTML = ids.slice(0, 60).map(function (id) {
        var r = artFor(id), isNew = fresh && fresh.indexOf(id) >= 0;
        return '<div class="token' + (isNew ? ' new' : '') + '"><img class="px" data-id="' + id + '" style="background:' + r[2] + '" src="assets/img/k/' + r[0] + '.png" alt="Ely Kitty #' + id + '"><span>#' + id + '<i>ON-CHAIN</i></span></div>';
      }).join('');
      document.querySelectorAll('#mineGrid img[data-id]').forEach(function (img) { paintOnchain(img, +img.dataset.id); });
    }).catch(function (e) { console.warn('[EK] could not load your kitties', e); });
  }

  /* ---------- admin panel (owner only, same controls as Kiyomi) ---------- */
  function aNote(msg, cls) { $('aNote').textContent = msg; $('aNote').className = 'anote ' + (cls || ''); }
  function checkOwner() {
    W.owner = false; $('adminBtn').hidden = true;
    if (!ro || !W.account) return;
    ro.owner().then(function (o) {
      if (o && W.account && o.toLowerCase() === W.account.toLowerCase()) { W.owner = true; $('adminBtn').hidden = false; }
    }).catch(function () {});
  }
  function openAdmin() {
    if (!W.owner) return;
    $('asheet').hidden = false;
    aNote('Loading current values…');
    return Promise.all([ro.saleActive(), ro.price(), ro.maxSupply(), ro.maxPerTx(), reader.getBalance(C.contract)]).then(function (v) {
      $('aSaleState').textContent = v[0] ? 'ACTIVE' : 'PAUSED'; $('aSaleState').className = 'astate ' + (v[0] ? 'on' : 'off');
      $('aPrice').value = E.formatEther(v[1]);
      $('aSupply').value = v[2].toString();
      $('aPerTx').value = v[3] === UMAX ? '0' : v[3].toString();
      $('aBalState').textContent = (+E.formatEther(v[4])).toFixed(4) + ' ' + C.currencySymbol;
      aNote('');
    }).catch(function () { aNote('Could not read contract — check the address in config.js.', 'err'); });
  }
  function closeAdmin() { $('asheet').hidden = true; }
  $('adminBtn').onclick = openAdmin;
  $('aclose').onclick = closeAdmin;
  $('asheet').onclick = function (e) { if (e.target === $('asheet')) closeAdmin(); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAdmin(); });

  function adminTx(fn, label) {
    if (!W.owner) return aNote('Only the contract owner can do that.', 'err');
    var btns = document.querySelectorAll('.abtn');
    btns.forEach(function (b) { b.disabled = true; });
    aNote('Confirm in your wallet…');
    return signer().then(fn).then(function (tx) {
      aNote(label + ' — waiting for confirmation…');
      return tx.wait();
    }).then(function () {
      return Promise.all([readOnChain(), openAdmin()]).then(function () { aNote(label + ' ✓ done.', 'ok'); });
    }).catch(function (e) { aNote(errMsg(e), 'err'); })
      .then(function () { btns.forEach(function (b) { b.disabled = false; }); });
  }

  document.querySelectorAll('.abtn').forEach(function (btn) {
    btn.onclick = function () {
      var act = btn.dataset.act, v;
      if (act === 'toggleSale') { var on = $('aSaleState').textContent === 'ACTIVE'; return adminTx(function (c) { return c.setSaleActive(!on); }, (on ? 'Pausing' : 'Opening') + ' sale'); }
      if (act === 'setPrice') {
        v = ($('aPrice').value || '').trim();
        if (v === '' || isNaN(+v) || +v < 0) return aNote('Enter a price ≥ 0.', 'err');
        return adminTx(function (c) { return c.setPrice(E.parseEther(v)); }, 'Set price to ' + v + ' ' + C.currencySymbol);
      }
      if (act === 'setSupply') {
        v = parseInt($('aSupply').value, 10);
        if (!(v > 0)) return aNote('Enter a supply ≥ 1.', 'err');
        if (BigInt(v) < S.minted) return aNote('Supply can’t be below the ' + S.minted + ' already minted.', 'err');
        return adminTx(function (c) { return c.setMaxSupply(v); }, 'Set supply to ' + v);
      }
      if (act === 'setPerTx') {
        v = parseInt($('aPerTx').value, 10);
        if (isNaN(v) || v < 0) return aNote('Enter 0 (unlimited) or a positive number.', 'err');
        return adminTx(function (c) { return c.setMaxPerTx(v === 0 ? UMAX : v); }, 'Set max/tx to ' + (v === 0 ? 'unlimited' : v));
      }
      if (act === 'ownerMint') {
        var to = ($('aMintTo').value || '').trim(), qty = parseInt($('aMintQty').value, 10);
        if (!E.isAddress(to)) return aNote('Enter a valid recipient address.', 'err');
        if (!(qty > 0)) return aNote('Enter a quantity ≥ 1.', 'err');
        return adminTx(function (c) { return c.ownerMint(to, qty); }, 'Minted ' + qty + ' to ' + to.slice(0, 6) + '…');
      }
      if (act === 'withdraw') return adminTx(function (c) { return c.withdraw(); }, 'Withdraw');
    };
  });

  /* ---------- boot ---------- */
  paint();
  readOnChain();
  setInterval(readOnChain, 8000);
  if (localStorage.getItem('elykitties_connected')) { autoConnect(); setTimeout(autoConnect, 350); }
})();
