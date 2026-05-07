# fin-agent-pro

> AI-powered stock analysis tool with risk detection · US & China A-shares.

A full-stack financial analysis platform that helps non-finance users spot company risks in 30 seconds. Bring your own LLM API key (Claude / OpenAI / DeepSeek).

## Features

- 🗺️ **Real-time market heatmap** — sector attention × volatility scoring (no social media scraping)
- 🤖 **AI-powered company analysis** — Claude / GPT-4o / DeepSeek with retail-investor-tuned prompts
- 🛡️ **Financial fraud detection** — Altman Z-Score, Beneish M-Score, cash-flow quality, AR anomaly
- 📊 **Risk dashboard** — 5-dimension health radar + red-flag cards + animated gauge
- 🆚 **Apple-style multi-company comparison** — side-by-side metrics with best-value highlights
- 🧮 **DCF Model Builder** — discounted cash flow with three-scenario sensitivity analysis
- 💼 **Portfolio diagnostic** — weighted risk + sector concentration + per-stock signals (no buy/sell recommendations)
- 📄 **PDF export** — single-company reports + comparison reports + portfolio diagnostics
- 🌗 **Dark / Light / System** theme · 中 / EN i18n

## Tech stack

- **Frontend:** Next.js 15, TypeScript, Tailwind CSS v4, Framer Motion, Recharts
- **Backend:** FastAPI, yfinance, AkShare
- **AI:** Anthropic Claude, OpenAI, DeepSeek
- **PDF export:** jsPDF + html2canvas-pro

## Inspiration & credits

Prompt engineering patterns adapted from
[Anthropic's open-source financial-services agent templates](https://github.com/anthropics/financial-services)
— specifically the persona framing, guardrail clauses, and step-wise workflow
structure used in the Earnings Reviewer and Market Researcher agents.
The original templates target institutional analysts with FactSet / Daloopa /
Capital IQ data; this project re-implements the same patterns for a
retail-investor context using free data sources (Yahoo Finance, AkShare).

## Run locally

Backend:

    cd backend
    pip install -r requirements.txt
    uvicorn api:app --reload --port 8000

Frontend (new terminal):

    cd frontend
    npm install
    npm run dev

Visit http://localhost:3000

## Architecture

    fin-agent-pro/
    ├── backend/                  # FastAPI REST API
    │   ├── api.py               # Routes
    │   └── core/                # Business logic
    │       ├── markets.py
    │       ├── sectors.py
    │       ├── attention.py     # Sector heatmap scoring
    │       ├── risk.py          # Fraud detection models
    │       ├── dcf.py           # DCF + sensitivity analysis
    │       ├── portfolio.py     # Portfolio diagnosis
    │       └── agent.py         # LLM orchestration
    │
    └── frontend/                 # Next.js app
        ├── app/
        ├── components/
        └── lib/

## Disclaimer

This tool is for educational use only. All output is AI-generated commentary
on public financial data and **does not constitute investment advice**. Stock
investments carry risk.

## License

MIT — see LICENSE file.
