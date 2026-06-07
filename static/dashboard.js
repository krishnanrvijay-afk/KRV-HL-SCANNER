/* ── Bounce Scanner II — dashboard.js ──────────────────────────────────────── */
let STATE       = null;
let activeFilter = 'ALL';
let lastScanAt  = null;

// ── Fetch state every 2s ──────────────────────────────────────────────────────
async function fetchState() {
  try {
    const r = await fetch('/api/state');
    if (!r.ok) return;
    STATE = await r.json();
    render();
  } catch (e) { /* network blip */ }
}

setInterval(fetchState, 2000);
fetchState();

// ── Filter ────────────────────────────────────────────────────────────────────
function setFilter(el) {
  activeFilter = el.dataset.filter;
  document.querySelectorAll('.fp').forEach(f => f.classList.remove('active'));
  el.classList.add('active');
  if (STATE) render();
}

// ── Master render ─────────────────────────────────────────────────────────────
function render() {
  renderHeader();
  renderCards();
  renderAlerts();
  renderTrades();
  renderSnapshot();
}

// ── Header ────────────────────────────────────────────────────────────────────
function renderHeader() {
  const { btc_regime, daily, account, circuit_breaker, scan_count, last_scan_at } = STATE;

  // Regime
  const regimeEl = document.getElementById('h-regime');
  const pill = document.getElementById('h-regime');
  regimeEl.textContent = btc_regime || '—';
  regimeEl.className   = 'hstat-value ' + (
    btc_regime === 'Strong Bull' ? 'green' :
    btc_regime === 'Strong Bear' ? 'red' : 'grey'
  );

  // Daily PnL
  const pnlEl = document.getElementById('h-pnl');
  pnlEl.textContent = `$${(daily?.pnl || 0).toFixed(2)}`;
  pnlEl.className   = 'hstat-value ' + ((daily?.pnl || 0) >= 0 ? 'green' : 'red');

  // Margin
  document.getElementById('h-margin').textContent =
    `$${Math.round(account?.margin_deployed || 0).toLocaleString()}`;

  // Scans
  document.getElementById('h-scans').textContent = scan_count || 0;

  // Paper badge
  const pb = document.getElementById('paper-badge');
  pb.style.display = account?.paper_mode ? 'block' : 'none';

  // Circuit breaker
  const cb = document.getElementById('cb-badge');
  cb.style.display = circuit_breaker?.active ? 'block' : 'none';

  // Scan status
  if (last_scan_at && last_scan_at !== lastScanAt) {
    lastScanAt = last_scan_at;
    const d = new Date(last_scan_at * 1000);
    document.getElementById('scan-status').innerHTML =
      `last scan <span>${d.toLocaleTimeString()}</span> · scan #${scan_count}`;
  }
}

// ── Pair cards ────────────────────────────────────────────────────────────────
function renderCards() {
  const grid   = document.getElementById('card-grid');
  const pairs  = STATE.pair_states || [];
  const alerts = STATE.alerts || [];
  const trades = STATE.open_trades || {};

  const html = pairs.filter(p => {
    if (activeFilter === 'ALL')          return true;
    if (activeFilter === 'ALERTS')       return alerts.some(a => a.symbol === p.symbol);
    if (activeFilter === 'BOUNCE_SHORT') return p.short_score === 4;
    if (activeFilter === 'BOUNCE_LONG')  return p.long_score === 4;
    if (activeFilter === 'COOLDOWN')     return (p.cooldown_short > 0 || p.cooldown_long > 0);
    return true;
  }).map(p => buildCard(p, alerts, trades)).join('');

  grid.innerHTML = html || '<div style="padding:40px;color:#333;text-align:center;">No pairs match filter</div>';
}

function buildCard(p, alerts, trades) {
  const sym     = p.symbol;
  const price   = p.price || 0;
  const j15m    = p.j15m  || 0;
  const j1h     = p.j1h   || 0;
  const j5m     = p.j5m   || 0;
  const rsi15m  = p.rsi15m || 0;
  const bidPct  = p.bid_pct || 0;
  const askPct  = p.ask_pct || 0;
  const adx1h   = p.adx1h  || 0;
  const trend   = p.trend   || 'Neutral';
  const inTrade = p.in_trade;
  const cdS     = p.cooldown_short || 0;
  const cdL     = p.cooldown_long  || 0;

  // Gate pass/fail for SHORT (j15m>80, j1h>60, rsi>65, ask>=55)
  const sg1 = j15m   > 80,  sg2 = j1h > 60,  sg3 = rsi15m > 65, sg4 = askPct >= 55;
  // Gate pass/fail for LONG (j15m<20, j1h<40, rsi<35, bid>=55)
  const lg1 = j15m   < 20,  lg2 = j1h < 40,  lg3 = rsi15m < 35, lg4 = bidPct  >= 55;

  const shortPass = sg1 && sg2 && sg3 && sg4;
  const longPass  = lg1 && lg2 && lg3 && lg4;

  // Trend chip per timeframe: approximate 5m/15m from j values
  const chip5m  = trendChip('5M',  j5m  > 55 ? 'Strong Bull' : j5m  < 45 ? 'Strong Bear' : 'Neutral');
  const chip15m = trendChip('15M', j15m > 55 ? 'Strong Bull' : j15m < 45 ? 'Strong Bear' : 'Neutral');
  const chip1h  = trendChip('1H',  trend);

  // Gate rows — show both directions
  const gateShort = `
    <div class="gate-row">
      ${gateItem('J15M', j15m.toFixed(0), sg1)} 
      ${gateItem('J1H', j1h.toFixed(0), sg2)} 
      ${gateItem('RSI', rsi15m.toFixed(0), sg3)} 
      ${gateItem('DEPTH', askPct.toFixed(0)+'%', sg4)}
      <span style="font-family:'JetBrains Mono',monospace;font-size:8px;color:#ff4444;font-weight:700;margin-left:2px;">▼SHORT</span>
    </div>`;
  const gateLong = `
    <div class="gate-row">
      ${gateItem('J15M', j15m.toFixed(0), lg1)} 
      ${gateItem('J1H', j1h.toFixed(0), lg2)} 
      ${gateItem('RSI', rsi15m.toFixed(0), lg3)} 
      ${gateItem('DEPTH', bidPct.toFixed(0)+'%', lg4)}
      <span style="font-family:'JetBrains Mono',monospace;font-size:8px;color:#00ff88;font-weight:700;margin-left:2px;">▲LONG</span>
    </div>`;

  const j15mColor  = j15m  >= 80 ? 'red'   : j15m  <= 20 ? 'green' : 'white';
  const j1hColor   = j1h   >= 60 ? 'amber' : j1h   <= 40 ? 'green' : 'white';
  const rsiColor   = rsi15m >= 65 ? 'red'  : rsi15m <= 35 ? 'green' : 'white';
  const adxColor   = adx1h >= 50 ? 'amber' : adx1h >= 25 ? 'white' : 'grey';

  const inTradeEl = inTrade
    ? `<span class="in-trade-badge">IN TRADE</span>` : '';
  const cdEl = (cdS > 0 || cdL > 0)
    ? `<span class="cooldown-tag">CD ${Math.max(cdS, cdL)}s</span>` : '';

  const scoreEl = shortPass
    ? `<span class="score-badge sb-pass-short">BOUNCE SHORT ✓</span>`
    : longPass
    ? `<span class="score-badge sb-pass-long">BOUNCE LONG ✓</span>`
    : `<span class="score-badge sb-fail">SCANNING</span>`;

  return `<div class="pair-card">
    <div class="card-top">
      <div class="card-sym">${sym}</div>
      <div class="card-price">
        ${fmtPrice(price)}
        <span class="pch grey">${adxColor === 'amber' ? '⚡' : ''} ADX <span class="${adxColor}">${adx1h.toFixed(1)}</span></span>
      </div>
    </div>
    ${gateShort}
    ${gateLong}
    <div class="ind-row">
      <div class="ind-item"><div class="ind-label">J15M</div><div class="ind-value ${j15mColor}">${j15m.toFixed(1)}</div></div>
      <div class="ind-item"><div class="ind-label">J1H</div><div class="ind-value ${j1hColor}">${j1h.toFixed(1)}</div></div>
      <div class="ind-item"><div class="ind-label">RSI15</div><div class="ind-value ${rsiColor}">${rsi15m.toFixed(1)}</div></div>
      <div class="ind-item"><div class="ind-label">BID%</div><div class="ind-value ${bidPct >= 55 ? 'green' : 'grey'}">${bidPct.toFixed(0)}%</div></div>
      <div class="ind-item"><div class="ind-label">ASK%</div><div class="ind-value ${askPct >= 55 ? 'red' : 'grey'}">${askPct.toFixed(0)}%</div></div>
    </div>
    <div class="ma-strip">${chip5m}${chip15m}${chip1h}</div>
    <div class="card-bottom">
      ${scoreEl}
      <div style="display:flex;gap:5px;align-items:center;">${cdEl}${inTradeEl}</div>
    </div>
  </div>`;
}

function gateItem(label, val, pass) {
  return `<div class="gate-item">
    <div class="gate-dot ${pass ? 'pass' : 'fail'}"></div>
    <div class="gate-label">${label}</div>
    <div class="gate-val ${pass ? (label.includes('SHORT') || label === 'DEPTH' && val.includes('%') ? 'red' : 'green') : 'grey'}">&nbsp;${val}</div>
  </div>`;
}

function trendChip(label, trend) {
  const cls = trend === 'Strong Bull' ? 'ma-bull' : trend === 'Strong Bear' ? 'ma-bear' : 'ma-neutral';
  const sym = trend === 'Strong Bull' ? '▲' : trend === 'Strong Bear' ? '▼' : '—';
  return `<span class="ma-chip ${cls}">${label} ${sym}</span>`;
}

// ── Alerts panel ──────────────────────────────────────────────────────────────
function renderAlerts() {
  const alerts = STATE.alerts || [];
  const trades = STATE.open_trades || {};
  document.getElementById('alert-count').textContent = alerts.length;

  if (!alerts.length) {
    document.getElementById('alerts-wrap').innerHTML = '<div class="no-alerts">No alerts yet</div>';
    return;
  }

  document.getElementById('alerts-wrap').innerHTML = alerts.map(a => buildAlertCard(a, trades)).join('');
}

function buildAlertCard(a, trades) {
  const isShort   = a.direction === 'SHORT';
  const dirClass  = isShort ? 'short-card' : 'long-card';
  const dirPill   = isShort ? '<span class="ac-dir dir-short">BOUNCE SHORT</span>' : '<span class="ac-dir dir-long">BOUNCE LONG</span>';
  const tierClass = a.tier === 'HIGH_PROB' ? 'tp-high' : a.tier === 'STRONG' ? 'tp-strong' : 'tp-regular';
  const inTrade   = a.is_in_trade;
  const key       = `${a.symbol}${a.direction}`;
  const tradeOpen = key in trades;

  const stamp = inTrade || tradeOpen
    ? `<div class="in-trade-stamp">IN TRADE</div>` : '';

  const disHL   = (inTrade || tradeOpen) ? 'disabled' : '';
  const disMEXC = (inTrade || tradeOpen) ? 'disabled' : '';

  const elapsed = a.fired_at ? Math.floor((Date.now() / 1000) - a.fired_at) : 0;
  const elapsed_str = elapsed < 60 ? `${elapsed}s ago` : `${Math.floor(elapsed/60)}m ago`;

  return `<div class="alert-card ${dirClass}">
    ${stamp}
    <div class="ac-top">
      <div class="ac-sym">${a.symbol}</div>
      <div style="display:flex;gap:4px;align-items:center;">
        ${dirPill}
        <span class="tier-pill ${tierClass}">${a.tier} ${a.leverage}x</span>
      </div>
    </div>
    <div class="ac-prices">
      <div class="ac-px"><div class="ac-px-label">ENTRY</div><div class="ac-px-val white">${fmtPrice(a.entry_price)}</div></div>
      <div class="ac-px"><div class="ac-px-label">SL (ATR)</div><div class="ac-px-val red">${fmtPrice(a.sl_price)}</div></div>
      <div class="ac-px"><div class="ac-px-label">TP1</div><div class="ac-px-val green">${fmtPrice(a.tp1_price)}</div></div>
    </div>
    <div class="ac-meta">
      <div class="ac-meta-item"><span class="ac-meta-label">TP2 </span><span class="ac-meta-val">${fmtPrice(a.tp2_price)}</span></div>
      <div class="ac-meta-item"><span class="ac-meta-label">J15M </span><span class="ac-meta-val ${a.j15m >= 80 || a.j15m <= 20 ? 'green' : 'grey'}">${(a.j15m||0).toFixed(1)}</span></div>
      <div class="ac-meta-item"><span class="ac-meta-label">J1H </span><span class="ac-meta-val">${(a.j1h||0).toFixed(1)}</span></div>
      <div class="ac-meta-item"><span class="ac-meta-label">RSI </span><span class="ac-meta-val">${(a.rsi15m||0).toFixed(1)}</span></div>
      <div class="ac-meta-item"><span class="ac-meta-label">ATR </span><span class="ac-meta-val amber">${(a.atr15m||0).toFixed(4)}</span></div>
      <div class="ac-meta-item"><span class="ac-meta-label grey">${elapsed_str}</span></div>
    </div>
    <div class="ac-btns">
      <button class="ac-btn btn-hl"   ${disHL}   onclick="openTrade('${a.symbol}','${a.direction}','HL',${a.leverage})">OPEN HL</button>
      <button class="ac-btn btn-mexc" ${disMEXC} onclick="openTrade('${a.symbol}','${a.direction}','MEXC',${a.leverage})">OPEN MEXC</button>
    </div>
  </div>`;
}

// ── Open trades panel ─────────────────────────────────────────────────────────
function renderTrades() {
  const trades = STATE.open_trades || {};
  const keys   = Object.keys(trades);
  document.getElementById('trade-count').textContent = keys.length;

  if (!keys.length) {
    document.getElementById('trades-wrap').innerHTML = '<div class="no-alerts">No open trades</div>';
    return;
  }

  document.getElementById('trades-wrap').innerHTML = keys.map(k => {
    const t    = trades[k];
    const pnl  = t.unrealized_pnl || 0;
    const r    = t.r || 0;
    const isL  = t.direction === 'LONG';
    const cls  = isL ? 'long-card' : 'short-card';
    const pnlC = pnl >= 0 ? 'pos' : 'neg';
    const exch = t.exchange || 'HL';
    const elapsed = t.elapsed_s || 0;
    const elapsed_str = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed/60)}m`;

    return `<div class="trade-card ${cls}">
      <div class="tc-top">
        <span class="tc-sym">${t.symbol} <span style="font-size:10px;font-family:'JetBrains Mono',monospace;color:${isL?'#00ff88':'#ff4444'}">${t.direction}</span></span>
        <span class="tc-pnl ${pnlC}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${r >= 0 ? '+' : ''}${r.toFixed(2)}R)</span>
      </div>
      <div class="tc-meta">
        <span>entry <span>${fmtPrice(t.entry_price)}</span></span>
        <span>sl <span>${fmtPrice(t.sl_price)}</span></span>
        <span>tp1 <span>${fmtPrice(t.tp1_price)}</span></span>
        <span>${exch}</span>
        <span>${t.tier || ''} ${t.leverage||''}x</span>
        <span>${elapsed_str}</span>
        ${t.paper ? '<span style="color:#66aaff;">PAPER</span>' : ''}
      </div>
      <button class="tc-close-btn" onclick="closeTrade('${t.symbol}','${t.direction}')">CLOSE</button>
    </div>`;
  }).join('');
}

// ── Market snapshot ───────────────────────────────────────────────────────────
function renderSnapshot() {
  const pairs = STATE.pair_states || [];
  const bulls = pairs.filter(p => p.trend === 'Strong Bull').map(p => p.symbol);
  const bears = pairs.filter(p => p.trend === 'Strong Bear').map(p => p.symbol);
  const ob    = pairs.filter(p => p.j15m >= 80).map(p => p.symbol);
  const os    = pairs.filter(p => p.j15m <= 20).map(p => p.symbol);

  const chips = (arr, color) => arr.map(s =>
    `<span class="snap-sym" style="color:${color}">${s}</span>`
  ).join('') || '<span style="color:#333;font-size:9px;">none</span>';

  document.getElementById('snapshot-wrap').innerHTML = `
    <div class="snap-title">MARKET SNAPSHOT</div>
    <div class="snap-row"><span class="snap-label">BULL TREND 1H</span><div class="snap-vals">${chips(bulls,'#00ff88')}</div></div>
    <div class="snap-row"><span class="snap-label">BEAR TREND 1H</span><div class="snap-vals">${chips(bears,'#ff4444')}</div></div>
    <div class="snap-row"><span class="snap-label">J15M OVERBOUGHT</span><div class="snap-vals">${chips(ob,'#ff4444')}</div></div>
    <div class="snap-row"><span class="snap-label">J15M OVERSOLD</span><div class="snap-vals">${chips(os,'#00ff88')}</div></div>
  `;
}

// ── Trade actions ─────────────────────────────────────────────────────────────
async function openTrade(symbol, direction, exchange, leverage) {
  try {
    const r = await fetch('/api/trade/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, direction, exchange, leverage }),
    });
    const d = await r.json();
    if (!r.ok) { alert(`Open failed: ${d.detail || d.msg}`); return; }
    fetchState();
  } catch (e) { alert('Request failed'); }
}

async function closeTrade(symbol, direction) {
  if (!confirm(`Close ${symbol} ${direction}?`)) return;
  try {
    const r = await fetch('/api/trade/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol, direction }),
    });
    const d = await r.json();
    if (!r.ok) { alert(`Close failed: ${d.detail || d.msg}`); return; }
    fetchState();
  } catch (e) { alert('Request failed'); }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtPrice(p) {
  if (!p) return '—';
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 1)    return p.toFixed(4);
  return p.toFixed(6);
}
