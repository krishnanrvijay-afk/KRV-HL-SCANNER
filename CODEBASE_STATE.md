# CODEBASE STATE -- bounce-scanner-deux
  ## Last updated: 2322eace538c0606aeca2ef46765729f723bceaa

  ## PAIRS (config.py)
  PAIRS = ["DOGE", "SUI", "BTC", "LINK", "ETH", "NEAR", "XRP", "SOL", "WIF", "AVAX", "HYPE", "ZEC", "TON", "@107", "@8", "@1"]

  ## KEY CONFIG VALUES (config.py)
  PAPER_MODE: True
  SCAN_INTERVAL_SECONDS: 30
  J15M_SHORT_GATE: 80
  J15M_LONG_GATE: 20
  J1H_SHORT_MIN: 60
  J1H_LONG_MAX: 40
  DEPTH_GATE_PCT: 55
  ADX_FADE_MAX: 60
  COOLDOWN_SECONDS: 1800
  MARGIN_PER_TRADE: 2000.0

  ## KEY FUNCTIONS -- scanner.py
  _compute_stochastic: L75 -- params: (candles: list[dict], k_period: int = 14, slow_period: int = 3, d_period: int = 3) -> tuple[float, float]
  _last_stoch declaration: L20
  _last_stoch_fast declaration: L21
  _btc_j1h declaration: L26 -- default: 50.0
  BTC_CORRELATION: L28
  scan loop -- BTC capture: L394  (_btc_j1h = j1h)
  regime gate block: L408

  ## KEY FUNCTIONS -- main.py
  /api/state endpoint: L1355
  /api/pair endpoint: L1372
  pair_states builder: L867  (app_state.pair_states = await scan_pair_state(hl_client))
  cache_bust in template context: L1351  ("cache_bust": int(time.time()))
  _do_open_trade: L610

  ## KEY FUNCTIONS -- dashboard.js
  _ovStochHtml: L2078
  _ovRender: L2314
  _btcRegime: L1728
  _getBtcRegime: L312
  _renderBtcRegimePill: L339
  openPairOverlay: L1876
  _ovActionsHtml: L2260
  _ovVerdictHtml: L1989
  _ovScanConfHtml: L2225
  BTC_CORRELATION const: L11

  ## PAIR_STATES FIELDS -- what /api/state returns per pair
  (built by scan_pair_state in scanner.py, states.append block L620-650)
  - symbol
  - price
  - j5m
  - j15m
  - j1h
  - rsi15m
  - stoch_k
  - stoch_d
  - stoch_k_prev
  - stoch_d_prev
  - stoch_k_fast
  - stoch_d_fast
  - stoch_k_prev_fast
  - stoch_d_prev_fast
  - rsi1h
  - atr15m
  - adx1h
  - bid_pct
  - ask_pct
  - trend
  - ma10
  - ma30
  - ma60
  - short_score
  - short_tier
  - long_score
  - long_tier
  - cooldown_short
  - cooldown_long

  ## /api/pair RESPONSE FIELDS
  (main.py L1455-1495)
  - symbol
  - price
  - change_24h
  - j15m
  - j1h
  - rsi15m
  - adx
  - atr
  - bid_pct
  - ask_pct
  - stoch_k
  - stoch_d
  - stoch_k_prev
  - stoch_d_prev
  - stoch_k_fast
  - stoch_d_fast
  - stoch_k_prev_fast
  - stoch_d_prev_fast
  - gate_long  (list of 4 bools: [j15m<20, j1h<40, stoch_gate_long, bid_pct>=55])
  - gate_short (list of 4 bools: [j15m>80, j1h>60, stoch_gate_short, ask_pct>=55])
  - score_long
  - score_short
  - alert
  - alert_state
  - alert_age_seconds
  - in_trade_long
  - in_trade_short
  - last_scan_summaries
  - recent_alerts
  - confluence_long
  - confluence_short
  - trend
  - session_halted_long
  - session_halted_short
  - large_sl_cooldown_long_remaining
  - large_sl_cooldown_short_remaining
  - session_halt_reason

  ## SUPABASE TABLE -- hl_trade_log columns
  (close-row insert L461-490; open-row insert L585-604; extra analytics columns added via ALTER TABLE)

  Close-row columns (L461-490):
  - pair
  - direction
  - tier
  - leverage
  - exchange
  - entry_price
  - exit_price
  - sl
  - tp1
  - tp2
  - exit_reason
  - pnl_dollars
  - r_value
  - open_time
  - close_time
  - duration_seconds
  - stoch_k
  - stoch_d
  - session_opened
  - j15m_entry
  - j1h_entry
  - stoch_k_entry
  - stoch_d_entry
  - rsi_entry
  - depth_pct_entry
  - chg24h_entry
  - mae_r
  - mfe_r

  Open-row extra columns (L585-604, via _open_trade_log_row):
  - pair, direction, tier, leverage, exchange, entry_price, sl, tp1, tp2, open_time
  - session_opened, j15m_entry, j1h_entry, stoch_k_entry, stoch_d_entry
  - rsi_entry, depth_pct_entry, chg24h_entry

  ## DASHBOARD.JS SCRIPT TAG
  <script src="/static/dashboard.js?v={{ cache_bust }}"></script>

  ## CURRENT HEAD: 2322eace538c0606aeca2ef46765729f723bceaa
  