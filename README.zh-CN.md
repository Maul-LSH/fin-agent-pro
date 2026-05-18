# fin-agent-pro

<p align="right">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">中文</a>
</p>

**承认未知的金融 AI。**

`fin-agent-pro` 是一个面向美股、A 股和港股的全栈金融诊断平台，服务于希望获得**基于真实数据、明确承认不确定性、且永不给买卖建议**的普通投资者。

它把公开市场数据、量化风险模型、交互式市场浏览、板块级 AI 分析、两阶段 DCF、投资组合诊断和 LLM 报告整合在一起，同时始终区分“数据真正支持了什么”和“哪些部分仍然未知”。

![fin-agent-pro 产品预览](docs/assets/readme-hero.svg)

<p align="center">
  <a href="https://github.com/Maul-LSH/fin-agent-pro"><img alt="Status" src="https://img.shields.io/badge/status-active-16a34a"></a>
  <a href="https://nextjs.org/"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black?logo=next.js"></a>
  <a href="https://fastapi.tiangolo.com/"><img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi"></a>
  <a href="https://www.python.org/"><img alt="Python" src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="Market coverage" src="https://img.shields.io/badge/markets-US%20%7C%20CN%20A%20%7C%20HK-2563eb"></a>
  <a href="https://github.com/Maul-LSH/fin-agent-pro"><img alt="Approach" src="https://img.shields.io/badge/approach-real%20data%20%2B%20explicit%20uncertainty-0f172a"></a>
  <a href="https://opensource.org/licenses/MIT"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
</p>

## 产品预览

| 板块雷达 | 市场浏览 |
| --- | --- |
| ![板块雷达预览](docs/assets/readme-sector-radar.svg) | ![市场浏览预览](docs/assets/readme-market-explorer.svg) |

![公司风险报告预览](docs/assets/readme-risk-report.svg)

## 为什么做这个项目

很多面向散户的金融工具，要么只堆原始比率却缺乏上下文，要么让 AI 对不完整数据给出过度自信的总结。`fin-agent-pro` 选择一条更克制的路线：

- 从 SEC EDGAR、Yahoo Finance、AkShare 和 Financial Modeling Prep fallback 中拉取结构化数据
- 在让 LLM 解释之前，先运行明确的风险模型
- 显示偿债压力、盈余操纵风险、现金流转化偏弱、估值压力等红旗
- 把板块问题当成板块问题来处理：解释异动、指出关键驱动公司、说明哪些地方仍然无法确定
- 尽可能把 API key 和投资组合数据保存在本地

最终形成一个更接近分析师工作流的路径：

**市场背景 -> 公司基本面 -> 风险模型 -> AI 解读 -> 明确不确定性 -> 可导出报告**

## 产品亮点

| 模块 | 能做什么 |
| --- | --- |
| **AI 财务分析** | 用自然语言询问一家公司，得到带有财务上下文、红旗信号和通俗解释的结构化风险解读。 |
| **板块雷达** | 打开任意板块卡片，查看异动，再让 AI 分析驱动因素、关键公司和仍然未知的部分。 |
| **市场浏览器** | 点击指数、热度气泡或板块排行，查看交互式 90 天走势。 |
| **风险仪表盘** | 包含 Altman Z-Score、Beneish M-Score、现金流质量、应收账款检查和五维健康评分。 |
| **两阶段 DCF** | 10 年 DCF 模型，包含 WACC、标准化 FCF、净负债调整、终值占比、敏感性分析和反向 DCF。 |
| **投资组合诊断** | 支持加权风险、行业集中度、地域暴露和单持仓告警。 |
| **多公司对比** | 可并排比较 2-4 家公司的财务、估值和风险维度。 |
| **PDF 导出** | 导出单公司报告、对比报告和投资组合诊断。 |

## 数据覆盖

| 市场 | 主要数据源 | 回退 / 缓存 |
| --- | --- | --- |
| 美股 | SEC EDGAR via `edgartools`, Yahoo Finance | Yahoo Finance 作为估值和缺失报表 fallback |
| A 股 | AkShare / EastMoney | Financial Modeling Prep（可用时）+ 本地 stale JSON cache |
| 港股 | AkShare | Financial Modeling Prep、AASTOCKS 指数 fallback + 本地 stale JSON cache |

缓存策略：

- 行情和板块数据：**30 分钟**
- FMP 财务数据：**7 天**
- stale fallback cache：当公开数据源阻断或失败时，尽量让 UI 仍然可用

## 架构

![fin-agent-pro 架构图](docs/assets/readme-architecture.svg)

```text
fin-agent-pro/
├── backend/
│   ├── api.py                    # FastAPI 入口
│   ├── routers/
│   │   ├── markets.py            # 市场概览、板块、关注度、历史走势
│   │   ├── analysis.py           # AI 分析与多公司对比
│   │   ├── valuation.py          # DCF 与敏感性接口
│   │   └── portfolio.py          # 投资组合诊断
│   └── core/
│       ├── data.py               # 统一公司数据接入
│       ├── data_sec.py           # SEC EDGAR 接入
│       ├── fmp.py                # Financial Modeling Prep fallback 客户端
│       ├── markets.py            # 指数数据与历史走势
│       ├── sectors.py            # 板块排行与历史走势
│       ├── attention.py          # 板块关注度 / 波动评分
│       ├── risk.py               # Altman、Beneish、现金质量、红旗信号
│       ├── dcf.py                # WACC + 两阶段 DCF 引擎
│       └── agent.py              # LLM 编排与报告生成
│
└── frontend/
    ├── app/
    │   ├── analysis/             # AI 报告工作区
    │   ├── markets/[market]/     # 市场浏览器
    │   ├── portfolio/
    │   ├── compare/
    │   └── valuation/
    ├── components/               # 产品 UI 组件
    └── lib/                      # API 客户端、国际化、全局上下文
```

## 技术栈

**前端**

- Next.js App Router
- React 19
- TypeScript
- Tailwind CSS v4
- Framer Motion
- Recharts
- jsPDF + html2canvas-pro

**后端**

- Python 3.11+
- FastAPI
- Pydantic
- yfinance
- AkShare
- edgartools
- Financial Modeling Prep fallback client

**AI 提供方**

- Anthropic Claude
- OpenAI
- DeepSeek（通过 OpenAI-compatible 接口）

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/Maul-LSH/fin-agent-pro.git
cd fin-agent-pro
```

### 2. 启动后端

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

cp .env.example .env
uvicorn api:app --reload --port 8000
```

推荐的后端环境变量：

```bash
SEC_EDGAR_IDENTITY="Your Name your.email@example.com"
FMP_API_KEY="your-financial-modeling-prep-key"
CORS_ALLOW_ORIGINS=http://localhost:3000
LOG_LEVEL=info
```

`FMP_API_KEY` 不是必需项，但当 AkShare 或 EastMoney 阻断请求时，建议配置它来增强 A 股 / 港股 fallback 覆盖。

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 如何使用

1. 在顶部导航选择市场：美股、A 股或港股
2. 点击指数、板块气泡或板块排行，查看交互式走势
3. 从板块卡片进入 **板块雷达**，理解异动、驱动因素和关键公司
4. 打开 **AI 分析**，查看完整的公司级财务报告
5. 使用 **DCF 估值** 构建两阶段内在价值模型
6. 使用 **投资组合** 诊断集中度和加权风险
7. 在需要快照时导出 PDF

## 隐私模型

- LLM 提供方 API key 存储在浏览器 `localStorage`
- 投资组合数据只保存在本地浏览器
- 不需要用户账户
- 不包含追踪或分析埋点
- 后端 `.env` 属于本地配置，不应被提交

## 路线图

- [x] Apple 风格首页和市场路由
- [x] 全页 AI 分析工作区
- [x] 面向市场主题的板块雷达工作流
- [x] 交互式市场详情图表
- [x] SEC EDGAR 美股数据接入
- [x] FMP fallback + 持久 stale cache
- [x] 含 WACC 与反向 DCF 的两阶段 DCF
- [ ] 为风险模型和 DCF 增加自动化测试
- [ ] 增加 Vercel + Render 部署文档
- [ ] 增加后端编译和前端 lint/typecheck 的 CI
- [ ] 增加更丰富的港股和 A 股板块 fallback 提供方

## 灵感来源

本项目借鉴了 Anthropic 开源 [financial-services agent templates](https://github.com/anthropics/financial-services) 中的一些 prompt engineering 模式，尤其是人设设定、行为约束和分步式报告结构，并把这些思路重新改造成更适合普通投资者使用的产品。

## 免责声明

本项目仅用于教育和研究目的，不构成财务建议、投资建议，也不构成买入或卖出任何证券的推荐。公开数据源可能延迟、不完整或不可用。请始终进行独立判断。

## 许可证

MIT License。详见 [LICENSE](LICENSE)。
