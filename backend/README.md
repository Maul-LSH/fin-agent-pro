# fin-agent backend

FastAPI backend for fin-agent. Wraps the `core/` business logic into REST APIs.

## Run locally

```bash
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

Then visit:
- http://localhost:8000 — health check
- http://localhost:8000/docs — interactive Swagger UI (automatic API docs)

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/markets/{us\|cn}` | Market index overview |
| GET | `/api/sectors/{market}/{category}` | Sector ranking |
| GET | `/api/attention/{us\|cn}` | Sector attention + volatility scores (for quadrant chart) |
| GET | `/api/sector/history?market=us&identifier=XLK&days=90` | Sector price history |
| GET | `/api/sector/holdings?etf_ticker=XLK&top_n=5` | ETF top holdings |
| POST | `/api/analyze` | Full AI analysis flow |

## Architecture

```
backend/
├── core/             # Business logic (framework-agnostic)
│   ├── data.py
│   ├── markets.py
│   ├── sectors.py
│   ├── attention.py  # NEW: attention/volatility scoring
│   ├── holdings.py   # NEW: ETF top holdings
│   ├── agent.py
│   └── utils.py
├── api.py            # FastAPI REST routes (thin wrapper)
└── requirements.txt
```
