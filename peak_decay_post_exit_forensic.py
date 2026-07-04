import asyncio
import requests
import httpx
import os
import sys
import time
sys.path.insert(0, '.')
from hl_client import HLClient
from scanner import _compute_kdj
from supabase import create_client
from datetime import datetime, timezone

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
MARGIN = 5000
LEVERAGE = 5
POST_EXIT_WINDOW = 1800  # 30 min after exit

HL_API_URL = "https://api.hyperliquid.xyz/info"
MEXC_BASE = (
    "https://contract.mexc.com"
    "/api/v1/contract/kline"
)

def ts_to_et(ts_ms):
    return datetime.fromtimestamp(
        ts_ms / 1000,
        tz=timezone.utc
    ).strftime("%m/%d %H:%M")

def proj_pnl(entry, price, direction):
    sz = (MARGIN * LEVERAGE) / entry
    if direction == "LONG":
        return round((price - entry) * sz, 2)
    else:
        return round((entry - price) * sz, 2)

async def fetch_hl_candles(symbol, interval,
                           start_ms, end_ms):
    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": symbol,
            "interval": interval,
            "startTime": start_ms,
            "endTime": end_ms
        }
    }
    try:
        async with httpx.AsyncClient(
                timeout=30.0) as client:
            r = await client.post(
                HL_API_URL, json=payload)
            r.raise_for_status()
            data = r.json()
        if not isinstance(data, list):
            return []
        out = []
        for c in data:
            out.append({
                "t": int(c.get("t", 0)),
                "h": float(c.get("h", 0)),
                "l": float(c.get("l", 0)),
                "c": float(c.get("c", 0)),
            })
        return sorted(out, key=lambda x: x["t"])
    except Exception as e:
        return []

def fetch_mexc_candles(symbol, interval,
                       start_s, end_s):
    try:
        r = requests.get(
            f"{MEXC_BASE}/{symbol}",
            params={
                "interval": interval,
                "start": start_s,
                "end": end_s
            },
            timeout=15
        )
        r.raise_for_status()
        d = r.json()
        if not d.get("success"):
            return []
        raw = d["data"]
        out = []
        for i in range(len(raw["time"])):
            out.append({
                "t": int(raw["time"][i]) * 1000,
                "h": float(raw["high"][i]),
                "l": float(raw["low"][i]),
                "c": float(raw["close"][i]),
            })
        return sorted(out, key=lambda x: x["t"])
    except Exception as e:
        return []

async def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Fetch HL PEAK_DECAY_20 trades
    hl_rows = sb.table("hl_trade_log")\
        .select("*")\
        .eq("exit_reason", "PEAK_DECAY_20")\
        .gte("created_at",
             "2026-07-01T00:00:00+00:00")\
        .order("created_at", desc=False)\
        .execute().data

    # Fetch MEXC PEAK_DECAY_20 trades
    mx_rows = sb.table("mexc_trade_log")\
        .select("*")\
        .eq("exit_reason", "PEAK_DECAY_20")\
        .gte("created_at",
             "2026-07-01T00:00:00+00:00")\
        .order("created_at", desc=False)\
        .execute().data

    all_rows = (
        [("HL", r) for r in hl_rows] +
        [("MEXC", r) for r in mx_rows]
    )

    print(f"Found {len(hl_rows)} HL + "
          f"{len(mx_rows)} MEXC "
          f"PEAK_DECAY_20 trades")
    print()
    print(f"{'VENUE':>5} {'PAIR':>10} "
          f"{'DIR':>6} {'EXIT_PX':>10} "
          f"{'EXIT_PNL':>10} {'MFE':>6} "
          f"{'POST_PEAK':>10} {'POST_FINAL':>11} "
          f"{'CONTINUED':>10}")
    print("-" * 90)

    total_left = 0.0
    continued = 0
    reversed_ = 0
    no_data = 0

    for venue, t in all_rows:
        pair = t["pair"]
        direction = t["direction"]
        entry_price = float(t["entry_price"])
        exit_price = float(t["exit_price"])
        exit_pnl = float(t["pnl_dollars"])
        mfe_r = float(t["mfe_r"] or 0)

        # Get exit timestamp
        created_at = t["created_at"]
        dt = datetime.fromisoformat(
            created_at.replace("+00:00", "")
        ).replace(tzinfo=timezone.utc)
        trade_open_ts = int(dt.timestamp())

        # Estimate exit time from duration
        duration = int(t.get(
            "duration_seconds", 300) or 300)
        exit_ts = trade_open_ts + duration
        exit_ts_ms = exit_ts * 1000
        post_end_ts_ms = (
            exit_ts + POST_EXIT_WINDOW) * 1000

        # Fetch post-exit candles
        if venue == "HL":
            candles = await fetch_hl_candles(
                pair, "1m",
                exit_ts_ms - 60000,
                post_end_ts_ms)
        else:
            candles = fetch_mexc_candles(
                pair, "Min1",
                exit_ts - 60,
                exit_ts + POST_EXIT_WINDOW + 60)

        post_candles = [
            c for c in candles
            if c["t"] >= exit_ts_ms
        ]

        if not post_candles:
            no_data += 1
            print(f"{venue:>5} {pair:>10} "
                  f"{direction:>6} "
                  f"{exit_price:>10.4f} "
                  f"{exit_pnl:>+10.2f} "
                  f"{mfe_r:>6.3f} "
                  f"{'NO DATA':>10} "
                  f"{'':>11} "
                  f"{'':>10}")
            continue

        # Compute best post-exit price
        post_peak_pnl = 0.0
        post_final_pnl = 0.0

        for c in post_candles:
            if direction == "SHORT":
                best = c["l"]
            else:
                best = c["h"]
            hi_pnl = proj_pnl(
                entry_price, best, direction)
            cl_pnl = proj_pnl(
                entry_price, c["c"], direction)
            if hi_pnl > post_peak_pnl:
                post_peak_pnl = hi_pnl
            post_final_pnl = cl_pnl

        additional = post_peak_pnl - exit_pnl
        did_continue = additional > 10

        if did_continue:
            continued += 1
            total_left += additional
        else:
            reversed_ += 1

        flag = "CONTINUED" if did_continue \
            else "REVERSED"

        print(f"{venue:>5} {pair:>10} "
              f"{direction:>6} "
              f"{exit_price:>10.4f} "
              f"{exit_pnl:>+10.2f} "
              f"{mfe_r:>6.3f} "
              f"{post_peak_pnl:>+10.2f} "
              f"{post_final_pnl:>+11.2f} "
              f"{flag:>10}")

        await asyncio.sleep(0.3)

    print()
    print(f"CONTINUED after exit: {continued}")
    print(f"REVERSED after exit:  {reversed_}")
    print(f"NO DATA:              {no_data}")
    print(f"Additional PnL left "
          f"on table: +${total_left:.2f}")
    print("Done.")

asyncio.run(main())
