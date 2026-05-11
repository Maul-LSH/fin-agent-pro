"""
core/agent.py — LLM Agent 模块
- call_llm: 统一 LLM 调用接口（Claude / OpenAI / DeepSeek）
- extract_company_and_intent: 第一步意图理解
- generate_analysis: 第二步财务分析生成
"""

import json
import re


# ─────────────────────────────────────────
# LLM 统一调用层
# ─────────────────────────────────────────
def call_llm(
    prompt: str,
    system: str,
    api_key: str,
    provider: str,
    max_tokens: int = 2000,
) -> str:
    """根据 provider 路由到对应的 LLM"""
    p = provider.lower()
    if "claude" in p:
        return _call_claude(prompt, system, api_key, max_tokens)
    if "deepseek" in p:
        return _call_deepseek(prompt, system, api_key, max_tokens)
    return _call_openai(prompt, system, api_key, max_tokens)


def _call_claude(prompt: str, system: str, api_key: str, max_tokens: int) -> str:
    import anthropic

    client = anthropic.Anthropic(api_key=api_key)
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": prompt}],
    )
    return msg.content[0].text


def _call_openai(prompt: str, system: str, api_key: str, max_tokens: int) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=api_key)
    resp = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return resp.choices[0].message.content


def _call_deepseek(prompt: str, system: str, api_key: str, max_tokens: int) -> str:
    """DeepSeek 用 OpenAI 兼容协议"""
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url="https://api.deepseek.com")
    resp = client.chat.completions.create(
        model="deepseek-chat",
        max_tokens=max_tokens,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
    )
    return resp.choices[0].message.content


# ─────────────────────────────────────────
# 第一步：理解用户意图
# ─────────────────────────────────────────
def extract_company_and_intent(
    user_input: str,
    llm_api_key: str,
    provider: str,
    lang: str = "zh",
) -> dict:
    """
    抽取：公司名、ticker、市场、分析类型、时间
    """
    system = """You are an expert assistant that extracts stock analysis intents from user queries.
Handle US stocks, China A-shares, and Hong Kong stocks.

Output STRICT JSON only, no extra text, no markdown fences.

Schema:
{
  "company_name": string or null,
  "ticker": string or null,
  "market": "us" | "cn" | "hk" | null,
  "analysis_types": array (subset of ["financial", "valuation", "risk"]),
  "period": string (year, default "2024")
}

Examples:
"Analyze Apple's 2023 financials" -> {"company_name": "Apple", "ticker": "AAPL", "market": "us", "analysis_types": ["financial"], "period": "2023"}
"帮我看看茅台的估值和风险" -> {"company_name": "贵州茅台", "ticker": "600519", "market": "cn", "analysis_types": ["valuation", "risk"], "period": "2024"}
"Tesla overvalued?" -> {"company_name": "Tesla", "ticker": "TSLA", "market": "us", "analysis_types": ["valuation"], "period": "2024"}
"宁德时代怎么样" -> {"company_name": "宁德时代", "ticker": "300750", "market": "cn", "analysis_types": ["financial", "valuation", "risk"], "period": "2024"}
"分析腾讯" -> {"company_name": "腾讯控股", "ticker": "00700", "market": "hk", "analysis_types": ["financial", "valuation", "risk"], "period": "2024"}
"Tencent 2023" -> {"company_name": "Tencent Holdings", "ticker": "00700", "market": "hk", "analysis_types": ["financial", "valuation", "risk"], "period": "2023"}
"分析汇丰控股" -> {"company_name": "HSBC Holdings", "ticker": "00005", "market": "hk", "analysis_types": ["financial", "valuation", "risk"], "period": "2024"}
"分析 600519" -> {"company_name": null, "ticker": "600519", "market": "cn", "analysis_types": ["financial", "valuation", "risk"], "period": "2024"}

Rules:
- For well-known companies (large/mid cap), you MUST give the correct ticker from your knowledge.
- US tickers: use the standard symbol (e.g., "AAPL", "TSLA"). NEVER add exchange prefix.
- China A-share tickers: 6-digit codes (e.g., "002261", "300750", "600519"). NEVER add suffixes.
- Hong Kong tickers: 5-digit codes with leading zeros (e.g., "00700" for Tencent, "00005" for HSBC, "00388" for HKEX, "09988" for Alibaba HK, "01810" for Xiaomi).
- If user enters a 6-digit number, treat as China A-share. If 4-5 digits, treat as Hong Kong.
- If you genuinely don't know a small company's ticker, set ticker to null.
- Default period to "2024", default analysis_types to all three.
- Period must be a 4-digit year ≤ current year. If user asks about a future year, use 2024."""

    prompt = f"User query: {user_input}"

    try:
        raw = call_llm(prompt, system, llm_api_key, provider, max_tokens=300)
        raw = re.sub(r"```json|```", "", raw).strip()
        result = json.loads(raw)
        result.setdefault("analysis_types", ["financial", "valuation", "risk"])
        result.setdefault("period", "2024")
        return result
    except Exception:
        return {
            "company_name": None,
            "ticker": None,
            "market": None,
            "analysis_types": ["financial", "valuation", "risk"],
            "period": "2024",
        }


# ─────────────────────────────────────────
# 第二步：生成财务分析报告
# ─────────────────────────────────────────
def generate_analysis(
    company_name: str,
    ticker: str,
    market: str,
    financial_data: dict,
    analysis_types: list,
    period: str,
    llm_api_key: str,
    provider: str,
    lang: str = "zh",
) -> str:
    """根据财务数据生成结构化分析报告"""

    data_text = _format_financial_data(financial_data)
    instructions = _build_instructions(analysis_types, lang)

    # ⚠️ 关键：明确告诉 LLM 不要用 LaTeX/Markdown 数学公式语法
    # 防止它把数字写成 $416.16$ billion 这种被 Streamlit 错误渲染成 LaTeX
    no_latex_rule = (
        "CRITICAL FORMATTING RULE: Never use LaTeX or math formula syntax. "
        "Never wrap numbers, currencies, or units in $ or $$ characters. "
        "Write '416 billion USD' or '416B' or 'USD 416 billion' — never '$416 billion$' "
        "or '$416B$'. Currency symbols like '$' are OK only when not paired (e.g. '$416B'). "
        "When in doubt, write currency in words ('USD', '人民币') instead of using $."
    )

    if lang == "en":
        system = f"""You are a senior equity research associate. Given a public company's filings, you produce a retail-investor-friendly post-earnings risk read covering financial health, valuation context, and risk signals.

## Workflow

1. **Read the data.** Parse the financial statements provided. Treat the data block as the only source of truth.
2. **Identify the variance.** Highlight what is unusual — outsized growth, margin compression, cash-flow vs. net-income gaps, leverage shifts.
3. **Frame the read.** Translate technical metrics into plain English, with each conclusion backed by a specific number from the data.
4. **Surface risk signals.** Connect the numbers to known risk patterns (earnings quality, balance-sheet stress, valuation extremes).
5. **Close with disclosure.** End with: "*This analysis is based solely on public financial data and does not constitute investment advice.*"

## Guardrails

- **Cite every number.** If a figure cannot be sourced from the data block above, do not include it. Never fabricate numbers, ratios, or peer benchmarks.
- **No buy/sell recommendations.** State facts and observations only. Never use phrases like "should buy", "recommend selling", "good time to invest".
- **Treat narrative claims with skepticism.** If management commentary contradicts the numbers, prioritize the numbers.
- **Adapted from prompt patterns in Anthropic's open-source financial-services agent templates** (persona framing, guardrail clauses, step-wise workflow).

{no_latex_rule}

Use Markdown formatting. Respond in English."""
        market_label_en = {"us": "US Stock", "cn": "China A-Share", "hk": "Hong Kong Stock"}.get(market, "Stock")
        prompt = f"""Please analyze:

Company: {company_name} ({ticker})
Market: {market_label_en}
Period: FY {period}

Financial Data:
{data_text}

Generate a report with these sections:
{instructions}"""
    else:
        system = f"""你是一名资深的股票研究员，专门为普通投资者解读上市公司财务数据。给定一家公司的公开财报，你需要产出一份易懂的财务健康度 + 估值背景 + 风险信号分析报告。

## 工作流程

1. **读取数据。**只基于下方提供的数据块进行分析，把它当成唯一的事实来源。
2. **识别异常。**指出不寻常的信号——超常增长、利润率压缩、现金流与净利润的背离、杠杆变化等。
3. **构建解读。**把专业指标翻译成大白话，每个结论都要有具体数据支撑。
4. **发现风险信号。**把数字与已知的风险模式关联（盈利质量、资产负债表压力、估值极端）。
5. **结尾披露。**报告末尾必须注明：「*以上分析仅基于公开财务数据，不构成投资建议。*」

## 行为准则

- **每个数字都要有出处。**如果某个数字不在上方数据块里，就不要写。绝不编造数字、比率、行业平均水平。
- **绝不给买卖建议。**只陈述事实和观察。不要使用「应该买入」「建议卖出」「现在是好时机」这类表述。
- **对管理层说辞保持怀疑。**如果叙述性描述与数字冲突，以数字为准。
- **本 prompt 借鉴了 Anthropic 开源金融服务 agent 模板的 prompt engineering 模式**（人设设定、行为准则、步骤化工作流）。

{no_latex_rule}

用 Markdown 格式输出，使用中文回答。"""
        market_label_zh = {"us": "美股", "cn": "A股", "hk": "港股"}.get(market, "股票")
        prompt = f"""请对以下公司进行财务分析：

公司：{company_name}（{ticker}）
市场：{market_label_zh}
分析年度：{period}年

财务数据：
{data_text}

请按以下结构生成分析报告：
{instructions}"""

    return call_llm(prompt, system, llm_api_key, provider, max_tokens=2500)


# ─────────────────────────────────────────
# 内部辅助
# ─────────────────────────────────────────
def _format_financial_data(data: dict) -> str:
    lines = []
    section_map = {
        "valuation": "📈 Valuation / 估值",
        "income": "💰 Income Statement / 利润表",
        "balance": "🏦 Balance Sheet / 资产负债表",
        "cashflow": "💵 Cash Flow / 现金流量表",
        "indicators": "📊 Key Indicators / 核心指标",
    }
    for key, title in section_map.items():
        if key in data and isinstance(data[key], dict):
            section_lines = []
            for metric, value in data[key].items():
                if value is not None:
                    section_lines.append(f"  - {metric}: {value}")
            if section_lines:
                lines.append(f"\n{title}:")
                lines.extend(section_lines)
    for key, value in data.items():
        if key.endswith("_error") and value:
            lines.append(f"\n⚠️ {key}: {value}")
    return "\n".join(lines) if lines else "No financial data available."


def _build_instructions(analysis_types: list, lang: str) -> str:
    instructions = []
    if lang == "en":
        if "financial" in analysis_types:
            instructions.append("""
**1. Financial Health**
- Profitability: Revenue, net income, ROE, gross/net margins
- Solvency: Debt levels, leverage ratios
- Cash flow: Does operating cash flow match net income?
""")
        if "valuation" in analysis_types:
            instructions.append("""
**2. Valuation**
- Interpret current PE, PB, PS levels
- Is valuation reasonable given profitability?
""")
        if "risk" in analysis_types:
            instructions.append("""
**3. Risk Assessment**
- Financial risks (debt, cash burn)
- Operating risks visible in numbers
- Overall risk level (Low / Medium / High) with reasoning
""")
        instructions.append("""
**4. One-Line Summary**
A single sentence capturing the company's current financial story.
""")
    else:
        if "financial" in analysis_types:
            instructions.append("""
**一、财务健康度**
- 盈利能力：营收、净利润规模，ROE、毛利率、净利率
- 偿债能力：负债水平、杠杆率
- 现金流：经营现金流和净利润是否匹配
""")
        if "valuation" in analysis_types:
            instructions.append("""
**二、估值分析**
- 解读当前 PE、PB、PS 水平
- 结合盈利能力判断估值是否合理
""")
        if "risk" in analysis_types:
            instructions.append("""
**三、风险排查**
- 财务风险（负债、现金消耗等）
- 经营层面风险
- 整体风险等级（低 / 中 / 高），并说明理由
""")
        instructions.append("""
**四、一句话总结**
用一句话概括这家公司当前的核心财务特征。
""")
    return "\n".join(instructions)
