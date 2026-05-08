# 📈 fin-agent-pro

> **AI-Powered Financial Risk Detection Platform.**
> Engineered with Next.js 15, FastAPI, and LLM agents (Claude / GPT-4o / DeepSeek) for US equities & China A-Shares.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## 🚀 Overview

`fin-agent-pro` is a full-stack financial analysis platform that helps non-finance users identify company risks in seconds. It combines academically grounded quantitative models (Altman Z-Score, Beneish M-Score) with LLM-powered analysis to translate complex filings into accessible insights — without ever giving buy/sell recommendations.

The product is positioned for **risk detection and diagnostic analysis**, not strategy generation, with strong compliance guardrails throughout.

## ✨ Core Features

* 🛡️ **Financial Fraud Detection** — Altman Z-Score (bankruptcy risk) and Beneish M-Score (earnings manipulation), with cash-flow quality and AR anomaly checks.
* 📊 **5-Dimension Risk Dashboard** — Profitability, Solvency, Cash Flow, Revenue Quality, Valuation; rendered as an animated radial gauge with red-flag cards.
* 🗺️ **Sector Attention Heatmap** — Volume-anomaly + volatility scoring across US (11 GICS sectors) and China A-Shares.
* 🆚 **Apple-Style Multi-Company Comparison** — Side-by-side metrics across 2-4 tickers with best-value highlights.
* 🧮 **DCF Model Builder** — Interactive Discounted Cash Flow valuation with adjustable WACC, growth rate, and terminal growth, plus three-scenario sensitivity analysis.
* 💼 **Portfolio Diagnostic** — Weighted risk scoring, sector concentration warnings, and per-stock signals (diagnostic only — never returns buy/sell recommendations).
* 📄 **PDF Export** — Single-company reports, comparison reports, and portfolio diagnostics.
* 🌗 **Dark / Light / System Theme · 中 / EN i18n**.

## 💻 Tech Stack

* **Frontend:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Framer Motion · Recharts · jsPDF + html2canvas-pro.
* **Backend:** Python 3.11+ · FastAPI · Pydantic · Domain-driven router architecture.
* **Data Sources:** SEC EDGAR (via edgartools, institutional-grade) for US equities with automatic Yahoo Finance fallback · AkShare for China A-Shares.
* **AI:** Direct integration with Anthropic Claude SDK · OpenAI SDK · DeepSeek (OpenAI-compatible).
* **Deployment (planned):** Vercel (frontend) + Render (backend).

## 🏗️ Architecture

```
fin-agent-pro/
├── backend/                       # FastAPI REST API
│   ├── api.py                    # App entry: CORS + register routers (47 lines)
│   ├── routers/                  # Domain-driven routing
│   │   ├── health.py
│   │   ├── markets.py            # /api/markets, /api/sectors, /api/attention
│   │   ├── analysis.py           # /api/analyze + /api/compare
│   │   ├── valuation.py          # /api/dcf + /api/dcf/sensitivity
│   │   └── portfolio.py          # /api/portfolio/diagnose
│   ├── core/                     # Business logic (framework-agnostic)
│   │   ├── data.py               # Unified data ingestion entry
│   │   ├── data_sec.py           # SEC EDGAR ingestion via edgartools
│   │   ├── markets.py
│   │   ├── sectors.py
│   │   ├── attention.py          # Sector heatmap scoring
│   │   ├── risk.py               # Altman Z, Beneish M, cash quality
│   │   ├── dcf.py                # DCF + sensitivity
│   │   ├── portfolio.py          # Portfolio diagnosis
│   │   └── agent.py              # LLM orchestration
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/                      # Next.js app
    ├── app/                      # App Router pages
    ├── components/               # AnalysisChat, RiskDashboard, CompareView,
    │                             # DCFCalculator, PortfolioView, ...
    └── lib/                      # AppContext (theme + i18n), API client
```

## 🛣️ Roadmap

- [x] **Phase 1 — Foundation & Quant Models**
  - [x] Next.js + FastAPI full-stack setup
  - [x] Altman Z-Score + Beneish M-Score implementations
  - [x] US equities (yfinance) + China A-Shares (AkShare)
- [x] **Phase 2 — Advanced Analysis**
  - [x] Apple-style multi-company comparison
  - [x] DCF valuation calculator with three-scenario sensitivity
  - [x] PDF export (single + comparison + portfolio reports)
  - [x] Portfolio diagnostic (weighted risk + sector concentration + individual signals)
- [x] **Phase 3 — Architecture & Data Quality**
  - [x] Domain-driven router refactor (monolithic 346-line `api.py` → 5 router modules)
  - [x] Adapted prompt patterns from Anthropic's open-source [financial-services agent templates](https://github.com/anthropics/financial-services) (persona framing, guardrails, step-wise workflow)
  - [x] SEC EDGAR direct ingestion via edgartools, with Yahoo Finance fallback
- [ ] **Phase 4 — Production**
  - [ ] Deploy to Vercel + Render
  - [ ] Redis caching for high-frequency ticker queries
  - [ ] Pytest coverage for quantitative risk models

## 🛠️ Getting Started

### Prerequisites
* Node.js 18+
* Python 3.11+
* An API key from one of: [Anthropic](https://console.anthropic.com), [OpenAI](https://platform.openai.com), or [DeepSeek](https://platform.deepseek.com)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Maul-LSH/fin-agent-pro.git
   cd fin-agent-pro
   ```

2. **Setup Backend (FastAPI):**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt

   # Optional: configure SEC EDGAR identity for institutional-grade data
   cp .env.example .env
   # Edit .env and set SEC_EDGAR_IDENTITY to your name + email

   uvicorn api:app --reload --port 8000
   ```

3. **Setup Frontend (Next.js):**
   ```bash
   cd ../frontend
   npm install
   npm run dev
   ```
   Navigate to `http://localhost:3000` to view the app.

## 🔒 Privacy & Data Handling

This application is designed to be privacy-first:

- **API keys never leave your browser.** Your LLM API key is stored only in
  your browser's `localStorage`, scoped to this domain. It is sent directly
  to the LLM provider (Anthropic / OpenAI / DeepSeek) when you make a request,
  but is never transmitted to or stored on this app's backend.
- **No user accounts, no tracking.** This app does not collect personal data,
  use cookies for tracking, or run analytics.
- **Portfolio data is local.** Holdings entered in the portfolio diagnostic
  feature are stored only in your browser; nothing is sent to a server.
- **You're in control.** Open browser DevTools → Storage → Local Storage to
  inspect or clear all stored data at any time.

For institutional-grade US filings data, this app integrates with SEC EDGAR
(public, no authentication required; identity disclosed per SEC fair-access
policy via the `SEC_EDGAR_IDENTITY` environment variable).

## 🙏 Inspiration & Credits

Prompt-engineering patterns adapted from
[Anthropic's open-source financial-services agent templates](https://github.com/anthropics/financial-services)
— specifically the persona framing, guardrail clauses, and step-wise workflow
structure from the Earnings Reviewer agent. The original templates target
institutional analysts with FactSet / Daloopa / Capital IQ data; this project
re-implements the same patterns for a retail-investor context using free data
sources (SEC EDGAR, Yahoo Finance, AkShare).

## ⚖️ Disclaimer

**Not Financial Advice.** This project is for educational and research purposes
only. The quantitative models and AI-generated summaries do not constitute
investment advice. Stock investments carry risk. Always conduct your own due
diligence before making financial decisions.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
