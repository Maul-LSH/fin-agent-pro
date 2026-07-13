# fin-agent-pro

<p align="right">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">中文</a>
</p>

**The financial AI that admits what it doesn't know.**

`fin-agent-pro` is a full-stack financial diagnostics platform for US equities, China A-shares, and Hong Kong stocks. It is built for retail investors who want **honest financial analysis grounded in real data, explicit uncertainty, and zero buy/sell advice**.

It combines public-market data, statement-level risk cross-checks, quantitative models, behavior-first market heatmaps, sector-level AI analysis, valuation frameworks with editable drivers, portfolio diagnostics, and full-page LLM-generated reports — while keeping a bright line between what the data supports and what remains unknown.

![fin-agent-pro product preview](docs/assets/readme-hero.svg)

<p align="center">
  <a href="https://github.com/Maul-LSH/fin-agent-pro"><img alt="Status" src="https://img.shields.io/badge/status-active-16a34a"></a>
  <a href="https://nextjs.org/"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js"></a>
  <a href="https://fastapi.tiangolo.com/"><img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi"></a>
  <a href="https://www.python.org/"><img alt="Python" src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="Market coverage" src="https://img.shields.io/badge/markets-US%20%7C%20CN%20A%20%7C%20HK-2563eb"></a>
  <a href="https://github.com/Maul-LSH/fin-agent-pro"><img alt="Approach" src="https://img.shields.io/badge/approach-real%20data%20%2B%20explicit%20uncertainty-0f172a"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
</p>

## Product Previews

| Sector Radar | Market Explorer |
| --- | --- |
| ![Sector radar preview](docs/assets/readme-sector-radar.svg) | ![Market explorer preview](docs/assets/readme-market-explorer.svg) |

![Company risk report preview](docs/assets/readme-risk-report.svg)

## Why This Exists

Most retail finance tools either show raw ratios without context or ask an AI model to summarize incomplete data with too much confidence. `fin-agent-pro` takes a more disciplined route:

- Pull structured data from SEC EDGAR, Yahoo Finance, AkShare, and Financial Modeling Prep fallback endpoints.
- Run explicit risk models and eight financial-statement cross-check scenarios before asking the LLM to explain the results.
- Surface red flags such as solvency stress, earnings-manipulation risk, weak cash conversion, revenue-recognition pressure, inventory buildup, goodwill impairment risk, hidden debt, and valuation pressure.
- Treat sector questions as sector questions — mapping the move, the key companies driving it, and what still cannot be known.
- Treat valuation as a framework problem, not a single answer: DCF, market price, Wall Street targets, editable business drivers, growth, margins, and multiples can all point in different directions.
- Keep user keys and portfolio data local wherever possible.

The result is a practical analyst-style workflow:

**market context -> company fundamentals -> statement cross-checks -> risk model -> valuation framework -> AI explanation -> explicit uncertainty -> exportable full-page report**

## Product Highlights

| Area | What It Does |
| --- | --- |
| **AI Financial Analysis** | Ask about a company in natural language and get a full-page financial report with risk-control methods, statement evidence, red flags, disclosure-review prompts, and plain-English interpretation. |
| **Sector Radar** | Open any sector card to inspect the move, then ask AI for a sector-level read of the drivers, key companies, and remaining unknowns. |
| **Behavior Heatmap** | “News lags. Trading behavior doesn't.” See where capital attention and volatility are clustering now — not what to buy, but where to look. |
| **Market Explorer** | Click market indices, heatmap bubbles, or sector rankings to inspect interactive 90-day movement charts. |
| **Risk Dashboard** | Altman Z-Score, Beneish M-Score, cash-flow quality, receivables checks, five-dimension health scoring, and eight statement-risk scenarios with disclosure-note checklists. |
| **Valuation Workspace** | 10-year two-stage DCF plus WACC build-up, ticker/company-name recognition, valuation framework classification, editable driver-based SOTP models, market-implied assumptions, valuation multiples, margin trends, and Wall Street target-price consensus. |
| **Executable Driver Models** | Supported companies can move beyond one growth slider. Tesla, for example, can be decomposed into Auto, Energy, FSD subscription, and Robotaxi assumptions with segment revenue, profit, value, SOTP per-share value, and market gap recalculated live. |
| **High-Growth Caveats** | For hyper-growth companies, DCF is clearly labeled as unstable and treated as a scenario test rather than a target-price verdict. |
| **Portfolio Diagnostic** | Weighted portfolio risk, pie-chart concentration views, sector exposure, geographic exposure, and per-holding warning signals. |
| **Multi-Company Compare** | Compare 2-4 companies side by side with visual grids, health bars, best-value markers, financials, valuation, and risk dimensions. |
| **Unified Workspaces** | AI analysis, valuation, portfolio diagnostics, and company comparison share the same interaction model: overview first, floating input controls, collapsible controls while reading, click-away return, and full-page results. |
| **Local Workspace Memory** | Portfolio holdings, compare tickers, DCF assumptions/results, and analysis inputs are restored when you return to a workflow. |
| **PDF Export** | Export AI analysis, valuation, comparison, and portfolio diagnostic reports. |

## Statement-Risk Engine

The risk engine now goes beyond single-model scoring. In addition to Altman, Beneish, cash-flow quality, and receivables checks, it runs eight statement-level scenarios:

| Scenario | What It Cross-Checks |
| --- | --- |
| Fixed assets inflated | PPE changes, capex, depreciation rate, and revenue capacity. |
| Inventory overstatement | Inventory growth, turnover days, revenue growth, cash conversion, and write-down prompts. |
| Revenue inflation / early recognition | Revenue, receivables, contract liabilities, and cash collection. |
| Paper profit vs. cash flow | Net income, operating cash flow, and working-capital causes. |
| Off-balance-sheet / hidden debt | Interest cost, debt rollovers, payables pressure, guarantees, and contingencies. |
| Margin and cost structure anomalies | Gross margin, SG&A ratio, product mix, capitalized expenses, and segment disclosure. |
| Goodwill and intangibles impairment | Goodwill-to-equity, intangible-asset weight, acquisition premium, and impairment-test assumptions. |
| Short-term liquidity deterioration | Current ratio, cash buffer, short debt vs. cash, and operating cash coverage. |

Each scenario returns evidence, risk level, missing data, next steps, and the disclosure-note sections a user should review in the company's filings.

## Workspace Interaction Model

The main workflows now behave like proper analysis workspaces rather than small calculators:

- Each page opens with a short overview explaining what the workflow is for and what output the user will get.
- The input panel sits low on the first screen, then moves into a floating control bar once the user interacts.
- While reading results, the floating controls collapse to translucent inputs so they do not block the report.
- Clicking blank space outside the controls returns to the overview page.
- Results occupy the full page and can be exported to PDF.

## Valuation Philosophy

`fin-agent-pro` does not pretend that one model can tell you what a company is “really” worth. The valuation page is designed to pick the right framework first, then show disagreement:

```text
Our DCF scenario      vs.      Current market price      vs.      Wall St. target
```

For a high-growth stock, that spread is often the signal. The app places DCF next to valuation-framework classification, Forward P/E, PEG, EV/Sales, EV/Revenue Growth, revenue growth, earnings growth, gross margin, operating margin, market-implied growth, and analyst target-price consensus.

The current valuation engine includes:

- **Ticker resolution:** inputs such as `Tesla`, `特斯拉`, or `摩根大通` can resolve to the appropriate US-listed ticker before valuation runs.
- **Framework generator:** companies are mapped into valuation archetypes such as stable FCF compounder, software/cloud platform, AI semiconductor cycle, growth optionality company, bank, REIT, pharma/biotech pipeline, or energy/commodity producer.
- **Driver library:** framework templates expose the relevant revenue, margin, capital, probability, optionality, financial-sector, or real-asset drivers.
- **Executable driver valuation:** the first live driver model supports Tesla-style optionality SOTP across Auto, Energy, FSD subscription, and Robotaxi.
- **Market-implied assumptions:** the model back-solves what the current market price must believe, including required FCF growth, terminal growth, market premium versus the DCF case, terminal-value dependence, and optionality premium where relevant.

Tesla is the canonical example: a simple DCF may sit far below the current market price, but the editable driver model turns that gap into explicit assumptions around vehicle deliveries, ASP, Energy growth, FSD attach rate, monthly ARPU, Robotaxi TAM, market share, take rate, and success probability.

When a company shows high-growth or high-volatility traits, DCF is explicitly marked as **extremely unstable**. The intrinsic value is presented as a scenario output, not a verdict.

Analyst targets are treated the same way: useful as a second opinion, but not as truth. The current Wall Street target card is sourced from Yahoo Finance via yfinance; it may be delayed or incomplete. If Yahoo Finance provides recent firm-level rating actions, the card can open a side drawer with the available coverage history. If it only provides aggregate consensus, the UI says so instead of inventing precision.

## Market Heatmap Principle

> **News lags. Trading behavior doesn't.**

The sector heatmap is built around behavior, not headlines. Bigger bubbles mean more market attention; deeper colors mean higher volatility. It is not a buy/sell signal. It is a map of where to look next.

## Data Coverage

| Market | Primary Sources | Fallback / Cache |
| --- | --- | --- |
| US equities | SEC EDGAR via `edgartools`, Yahoo Finance | Yahoo Finance fallback for valuation and missing statements |
| China A-shares | AkShare / EastMoney | Financial Modeling Prep where available, plus stale local JSON cache |
| Hong Kong stocks | AkShare | Financial Modeling Prep, AASTOCKS index fallback, plus stale local JSON cache |

Caching policy:

- Market quotes, sector data, and behavior heatmap inputs: **30 minutes**
- Financial statements from FMP: **7 days**
- Stale fallback cache: keeps the UI usable when public data providers block or fail

## Architecture

![fin-agent-pro architecture](docs/assets/readme-architecture.svg)

```text
fin-agent-pro/
├── backend/
│   ├── api.py                    # FastAPI app entrypoint
│   ├── routers/
│   │   ├── markets.py            # market overview, sectors, attention, history
│   │   ├── analysis.py           # AI analysis and company comparison
│   │   ├── valuation.py          # DCF, framework, symbol resolution, driver valuation endpoints
│   │   └── portfolio.py          # portfolio diagnostics
│   └── core/
│       ├── data.py               # unified company data ingestion
│       ├── data_sec.py           # SEC EDGAR ingestion
│       ├── fmp.py                # Financial Modeling Prep fallback client
│       ├── markets.py            # index data and history
│       ├── sectors.py            # sector rankings and history
│       ├── attention.py          # sector attention / volatility scoring
│       ├── risk.py               # Altman, Beneish, cash quality, red flags
│       ├── dcf.py                # WACC + two-stage DCF engine + market-implied assumptions
│       ├── valuation_framework.py # framework classification + driver templates
│       ├── driver_valuation.py   # executable driver-based SOTP models
│       ├── symbols.py            # company-name / ticker resolution
│       └── agent.py              # LLM orchestration and report generation
│
└── frontend/
    ├── app/
    │   ├── analysis/             # full AI report workspace
    │   ├── markets/[market]/     # market explorer
    │   ├── portfolio/
    │   ├── compare/
    │   └── valuation/
    ├── components/               # product UI components
    └── lib/                      # API client, i18n, app context
```

## Tech Stack

**Frontend**

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Recharts
- jsPDF + html2canvas-pro

**Backend**

- Python 3.11+
- FastAPI
- Pydantic
- yfinance
- AkShare
- edgartools
- Financial Modeling Prep fallback client

**AI Providers**

- Anthropic Claude
- OpenAI
- DeepSeek through an OpenAI-compatible interface

## Quick Start

### 1. Clone

```bash
git clone https://github.com/Maul-LSH/fin-agent-pro.git
cd fin-agent-pro
```

### 2. Start the Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
uvicorn api:app --reload --port 8000
```

Recommended backend environment variables:

```bash
SEC_EDGAR_IDENTITY="Your Name your.email@example.com"
FMP_API_KEY="your-financial-modeling-prep-key"
CORS_ALLOW_ORIGINS=http://localhost:3000
LOG_LEVEL=info
```

`FMP_API_KEY` is optional, but recommended for China A-share / Hong Kong fallback coverage when AkShare or EastMoney blocks requests.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Using the App

1. Pick a market from the top navigation: US, China A, or Hong Kong.
2. Click an index, sector bubble, or sector ranking row to inspect the interactive movement chart.
3. From a sector card, open **Sector Radar** to understand the move, its likely drivers, and the key companies behind it.
4. Open **AI Analysis** for a full-page company-level financial report workspace.
5. Use **Valuation** to compare DCF, market price, Wall Street targets, multiples, growth, margin quality, valuation frameworks, editable drivers, and market-implied assumptions.
6. Use **Portfolio** to diagnose concentration and weighted risk.
7. Return to any workflow without re-entering your previous tickers or assumptions.
8. Export reports to PDF when you need a snapshot.

## Privacy Model

- LLM provider API keys are stored in your browser `localStorage`.
- Portfolio holdings are stored locally in your browser.
- DCF assumptions/results, compare tickers/results, and analysis workspace inputs are stored locally for workflow continuity.
- No user accounts are required.
- No tracking or analytics are included.
- Backend `.env` values are local configuration and should not be committed.

## Roadmap

- [x] Apple-style homepage and market routes
- [x] Full-page AI analysis workspace
- [x] Sector radar workflow for market-theme analysis
- [x] Interactive market detail charts
- [x] SEC EDGAR ingestion for US equities
- [x] FMP fallback + persistent stale cache
- [x] Two-stage DCF with WACC build-up and implied-growth reverse DCF
- [x] Valuation framework generator with ticker/name resolution and driver templates
- [x] Executable Tesla driver valuation across Auto, Energy, FSD subscription, and Robotaxi
- [x] Market-implied assumptions for required growth, terminal growth, valuation premium, and optionality gap
- [x] Valuation context with analyst targets, multiples, margin trends, and high-growth caveats
- [x] Behavior-first sector heatmap messaging across US, China A, and Hong Kong market pages
- [x] Local workflow memory for valuation, compare, analysis, and portfolio modules
- [ ] Add automated tests for risk and DCF models
- [ ] Add deployment docs for Vercel + Render
- [ ] Add CI checks for backend compile and frontend lint/typecheck
- [ ] Add richer HK and A-share sector fallback providers

## Inspiration

Prompt-engineering patterns were adapted from Anthropic's open-source [financial-services agent templates](https://github.com/anthropics/financial-services), especially persona framing, guardrail clauses, and step-wise report structure. This project reworks those ideas for a retail-investor-friendly product using accessible data sources.

## Disclaimer

This project is for educational and research purposes only. It is not financial advice, investment advice, or a recommendation to buy or sell any security. Public data sources can be delayed, incomplete, or unavailable. Always conduct your own due diligence.

## License

MIT License. See [LICENSE](LICENSE).
