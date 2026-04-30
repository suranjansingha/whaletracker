# Stratefai Whale Lead Engine — Phase 1

A recursive, self-healing on-chain whale activity monitor that converts blockchain events into enriched social leads using **official APIs only**.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Polling Loop (tick)                 │
│                                                      │
│  Task 1: Whale Hunter                                │
│    Etherscan getLogs API ──► Infura RPC (failover)  │
│    Filter: balance > MIN_ETH_BALANCE                 │
│                   │                                  │
│  Task 2: Identity Resolver                           │
│    DeBank OpenAPI ──► ENS Subgraph (failover)        │
│                   │                                  │
│  Task 3: Enrichment Waterfall                        │
│    Clay API ──► Apollo API ──► skip gracefully       │
│                   │                                  │
│  Archive: whale_leads.json (upsert/deduplicated)     │
└─────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# 1. Clone and install
npm install

# 2. Configure
cp .env.example .env
# Edit .env with your API keys and contract addresses

# 3. Run
npm start

# 4. Watch mode (auto-restarts on file changes)
npm run dev
```

## Configuration (.env)

| Variable | Required | Description |
|---|---|---|
| `ETH_API_KEY` | ✓* | Etherscan API key — [get one here](https://etherscan.io/myapikey) |
| `INFURA_RPC` | ✓* | Infura RPC URL — [get one here](https://infura.io/) |
| `TARGET_CONTRACTS` | ✓ | Comma-separated contract addresses to monitor |
| `DEBANK_API_KEY` | Optional | DeBank Cloud API key for social handle resolution |
| `CLAY_API_KEY` | Optional | Clay People API key for Telegram enrichment |
| `APOLLO_API_KEY` | Optional | Apollo.io API key for enrichment |
| `MIN_ETH_BALANCE` | Optional | Minimum ETH to qualify (default: 20) |
| `POLL_INTERVAL_MS` | Optional | Poll interval in ms (default: 30000) |

\* At least one of `ETH_API_KEY` or `INFURA_RPC` is required.

## Output: whale_leads.json

```json
{
  "meta": { "total": 3, "lastUpdated": "2026-04-29T..." },
  "leads": [
    {
      "address": "0xabc...",
      "ethBalance": 142.7,
      "sourceContract": "0x...",
      "ensName": "vitalik.eth",
      "twitterHandle": "VitalikButerin",
      "telegramHandle": null,
      "tags": ["#HighConvictionWhale", "#WealthAutomation", "#AlphaSignals"],
      "firstSeen": "...",
      "lastUpdated": "..."
    }
  ]
}
```

## Failover Logic

| Step | Primary | Failover | Action if both fail |
|---|---|---|---|
| Fetch logs | Etherscan API | Infura `eth_getLogs` | Skip contract for this tick |
| Resolve identity | DeBank OpenAPI | ENS subgraph | Store as `unresolved` |
| Enrich | Clay | Apollo | Store as `enrichment_unavailable` |

## Getting API Keys

- **Etherscan**: https://etherscan.io/myapikey (free tier: 5 req/s)
- **Infura**: https://infura.io/ (free tier: 100k req/day)
- **DeBank Cloud**: https://cloud.debank.com/ (paid)
- **Clay**: https://clay.com/ (paid)
- **Apollo**: https://apollo.io/ (free tier available)
