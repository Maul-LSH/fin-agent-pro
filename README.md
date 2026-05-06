
# fin-agent-pro

AI-powered financial analysis tool with risk detection · US & China A-shares.

**Live demo:** *(coming soon — deploying to Vercel + Render)*

## Features

- 🗺️ Real-time market heatmap (sector attention × volatility)
- 🤖 AI-powered company analysis (Claude / GPT-4o / DeepSeek)
- 🛡️ Financial fraud detection: Altman Z-Score, Beneish M-Score
- 📊 Risk dashboard: 5-dimension health radar + red flag cards
- 🌗 Dark / Light / System theme · 中 / EN i18n

## Tech stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS v4, Framer Motion, Recharts
- **Backend:** FastAPI, yfinance, AkShare
- **AI:** Anthropic Claude, OpenAI, DeepSeek

## Architecture
fin-agent-pro/
├── backend/          # FastAPI REST API
│   ├── api.py        # Routes
│   └── core/         # Business logic
│       ├── markets.py, sectors.py
│       ├── attention.py    # Sector heatmap scoring
│       ├── risk.py         # Fraud detection
│       └── agent.py        # LLM orchestration
└── frontend/         # Next.js app
├── app/
├── components/
└── lib/
## Run locally

**Backend:**
```bash
cd backend
pip install -r requirements.txt
uvicorn api:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## License
MIT
