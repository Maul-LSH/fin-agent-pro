# fin-agent-pro

<p align="right">
  <a href="./README.md">English</a> ·
  <a href="./README.zh-CN.md">中文</a>
</p>

**承认未知的金融 AI。**

`fin-agent-pro` 是一个面向美股、A 股和港股的全栈金融诊断平台，服务于希望获得**基于真实数据、明确承认不确定性、且永不给买卖建议**的普通投资者。

它把公开市场数据、财报交叉验证、量化风险模型、交易行为优先的市场热力图、板块级 AI 分析、多视角估值上下文、投资组合诊断和整页 LLM 报告整合在一起，同时始终区分“数据真正支持了什么”和“哪些部分仍然未知”。

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
- 在让 LLM 解释之前，先运行明确的风险模型和八大财报交叉验证场景
- 显示偿债压力、盈余操纵风险、现金流转化偏弱、收入确认压力、存货积压、商誉减值、隐性债务、估值压力等红旗
- 把板块问题当成板块问题来处理：解释异动、指出关键驱动公司、说明哪些地方仍然无法确定
- 把估值当成“分歧地图”，而不是单一答案：DCF、市场价、华尔街目标价、增长、利润率和估值倍数可能同时给出不同信号
- 尽可能把 API key 和投资组合数据保存在本地

最终形成一个更接近分析师工作流的路径：

**市场背景 -> 公司基本面 -> 财报交叉验证 -> 风险模型 -> 估值上下文 -> AI 解读 -> 明确不确定性 -> 可导出整页报告**

## 产品亮点

| 模块 | 能做什么 |
| --- | --- |
| **AI 财务分析** | 用自然语言询问一家公司，得到整页财务报告，包含风险控制方法、财报证据、红旗信号、披露核查项和通俗解释。 |
| **板块雷达** | 打开任意板块卡片，查看异动，再让 AI 分析驱动因素、关键公司和仍然未知的部分。 |
| **行为热力图** | “新闻滞后，交易行为不会。” 查看资金关注和波动正集中在哪里——不是告诉你买什么，而是告诉你该往哪看。 |
| **市场浏览器** | 点击指数、热度气泡或板块排行，查看交互式 90 天走势。 |
| **风险仪表盘** | 包含 Altman Z-Score、Beneish M-Score、现金流质量、应收账款检查、五维健康评分和八大财报风险场景。 |
| **估值工作区** | 10 年两阶段 DCF，加上 WACC 构成、数据来源说明、反向隐含增长、Forward P/E、PEG、EV/Sales、EV/Revenue Growth、利润率趋势和华尔街目标价共识。 |
| **高增长 Caveat** | 对超级增长公司，明确提示 DCF 会极不稳定，并把内在价值作为情景测试，而不是目标价定论。 |
| **投资组合诊断** | 支持加权风险、饼状图集中度视图、行业暴露、地域暴露和单持仓告警。 |
| **多公司对比** | 用直观网格、健康度横条和相对更优标记，并排比较 2-4 家公司的财务、估值和风险维度。 |
| **统一工作区体验** | AI 分析、估值、投资组合诊断和多公司对比采用同一交互：先看介绍、再输入、悬浮控制、阅读时折叠、点击空白返回介绍页、结果整页展示。 |
| **本地工作区记忆** | 投资组合、对比 ticker、DCF 假设/结果、AI 分析输入都会在你回到页面时恢复。 |
| **PDF 导出** | 导出 AI 分析、估值、多公司对比和投资组合诊断报告。 |

## 财报风险引擎

风险引擎现在不再只依赖单一模型分数。除了 Altman、Beneish、现金流质量和应收账款检查之外，还会运行八大财报交叉验证场景：

| 场景 | 交叉验证什么 |
| --- | --- |
| 固定资产虚高 | 固定资产变化、资本开支、折旧率和收入产能匹配。 |
| 存货虚高与跌价 | 存货增速、周转天数、收入增长、现金流转化和跌价准备核查。 |
| 收入虚增与提前确认 | 收入、应收账款、合同负债和销售收现。 |
| 纸面利润与现金流背离 | 净利润、经营现金流和营运资本变化。 |
| 表外负债与隐性债务 | 隐含融资成本、借新还旧、应付账款压力、担保和或有事项。 |
| 毛利率与成本结构异常 | 毛利率、费用率、产品结构、费用资本化和分部披露。 |
| 商誉与无形资产减值 | 商誉/权益、无形资产占比、并购溢价和减值测试假设。 |
| 短期偿债能力恶化 | 流动比率、现金缓冲、短债/现金和经营现金覆盖能力。 |

每个场景都会输出证据、风险等级、缺失数据、下一步核查建议，以及用户应该回到企业财报附注中检查的披露章节。

## 工作区交互模型

主要功能不再是普通小工具，而是统一的分析工作区：

- 每个页面先展示功能介绍，说明这个工作流能解决什么问题、用户会得到什么。
- 输入区域位于首屏下方，用户交互后上移成悬浮控制栏。
- 阅读结果时，悬浮控制栏会折叠成半透明输入框，减少遮挡。
- 点击控制区外的空白位置可以返回介绍页。
- 结果以整页报告展示，并支持 PDF 导出。

## 估值哲学

`fin-agent-pro` 不假装一个模型能告诉你公司“真正值多少钱”。估值页的核心是展示分歧：

```text
我们的 DCF 情景      vs.      当前市场价格      vs.      华尔街目标价
```

对高增长股票来说，这个差距本身往往就是信号。产品会把 DCF 与 Forward P/E、PEG、EV/Sales、EV/Revenue Growth、营收增速、盈利增速、毛利率、营业利润率、市场隐含增长率和分析师目标价共识放在一起看。

当公司呈现高增长或高波动特征时，DCF 会被明确标记为**极不稳定**。内在价值是一个情景输出，不是定论。

分析师目标价也同样只是第二意见，而不是正确答案。如果 Yahoo Finance 提供近期机构评级动作，华尔街目标价卡片可以打开侧边栏查看可用覆盖记录；如果只有汇总共识，UI 会诚实说明，而不是伪造精确度。

## 热力图原则

> **新闻滞后，交易行为不会。**

行业热力图关注的是行为，而不是标题。气泡越大代表市场关注度越高，颜色越深代表波动越剧烈。它不是买卖信号，而是一张“下一步该往哪看”的地图。

## 数据覆盖

| 市场 | 主要数据源 | 回退 / 缓存 |
| --- | --- | --- |
| 美股 | SEC EDGAR via `edgartools`, Yahoo Finance | Yahoo Finance 作为估值和缺失报表 fallback |
| A 股 | AkShare / EastMoney | Financial Modeling Prep（可用时）+ 本地 stale JSON cache |
| 港股 | AkShare | Financial Modeling Prep、AASTOCKS 指数 fallback + 本地 stale JSON cache |

缓存策略：

- 行情、板块数据和行为热力图输入：**30 分钟**
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
5. 使用 **估值** 对比 DCF、市场价、华尔街目标价、估值倍数、增长和利润率质量
6. 使用 **投资组合** 诊断集中度和加权风险
7. 回到任意工作流时，不需要重新输入上次的 ticker 或假设
8. 在需要快照时导出 PDF

## 隐私模型

- LLM 提供方 API key 存储在浏览器 `localStorage`
- 投资组合数据只保存在本地浏览器
- DCF 假设/结果、对比 ticker/结果、AI 分析输入会保存在本地，用于保持工作流连续性
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
- [x] 加入分析师目标价、估值倍数、利润率趋势和高增长 caveat 的估值上下文
- [x] 在美股、A 股、港股市场页统一行为优先的热力图叙事
- [x] 为估值、对比、AI 分析和投资组合模块加入本地工作流记忆
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
