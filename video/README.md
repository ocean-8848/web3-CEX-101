# 视频系列：交易所系统技术讲解（主线 17 集 + 幕后核心 12 集 + 产品深潜 11 集）

> 来源：主线 01–13 章。每集 10–15 分钟，技术教学风格。
> 形式：每集一个动画讲解页（`slides/EPxx-*.html`），口播写在页面里；渲染脚本自动合成配音、字幕和章节，输出 MP4。
> **观看**：用浏览器打开 [index.html](index.html)（选集播放器）。成片在 `output/`，口播稿在 [scripts/](scripts/README.md)。

## 1. 剧集表

| 集 | 标题 | 来源章节 | 交互实验（可补录屏） |
|---|---|---|---|
| EP01 | 交易所到底是什么：托管、记账、撮合 | 01 | — |
| EP02 | 一张图看懂交易所架构 | 02（分层、各层职责） | architecture-explorer |
| EP03 | 一笔订单的旅程：调用链、同步异步与故障 | 02（调用链、故障） | architecture-explorer |
| EP04 | 账户与身份：登录、2FA、API 签名、KYC | 03 | — |
| EP05 | 充值：地址、确认数与链重组 | 04（充值部分） | deposit-withdraw-sim |
| EP06 | 提币、冷热钱包与储备金证明 | 04（提币、钱包、PoR） | deposit-withdraw-sim · proof-of-reserves |
| EP07 | 账本：双分录与冻结 | 05（记账、余额分层、生命周期） | ledger-double-entry |
| EP08 | 账本可靠性：幂等、对账与热点账户 | 05（幂等、对账、热点、outbox） | ledger-double-entry |
| EP09 | 订单簿与撮合规则 | 06（订单簿、订单类型、TIF、状态机） | order-book-matching |
| EP10 | 撮合引擎内部：数据结构、定序与重放 | 06（实现、确定性、精度、STP） | order-book-matching |
| EP11 | 成交之后：清算、结算与手续费 | 07 | ledger-double-entry |
| EP12 | 行情：深度、K 线与增量同步 | 08 | depth-slippage |
| EP13 | 风控：交易前、交易中与限流 | 09 | risk-rules-lab |
| EP14 | 永续合约：资金费率与标记价格 | 10（前半） | perpetual-liquidation |
| EP15 | 保证金与强平：保险基金和 ADL | 10（后半） | perpetual-liquidation |
| EP16 | 交易所怎么赚钱：产品生态与商业模式 | 11、12 | revenue-model |
| EP17 | 交易所怎样倒下：可靠性与事故复盘 | 13 | — |

### 下篇一 · 幕后核心（B 系列，12 集）

| 集 | 标题 | 来源 | 交互实验 |
|---|---|---|---|
| B01 | 合规防护：KYC、反洗钱与 Travel Rule | backstage/B01 | aml-graph |
| B02 | 平台安全：密钥、内控与供应链 | backstage/B02 | — |
| B03 | 账户安全：盗号攻击链与逐层防御 | backstage/B03 | ato-defense |
| B04 | 系统对账：全链路对账与提币熔断 | backstage/B04 | reconciliation-lab |
| B05 | 业务风控：薅羊毛、市场操纵与信用风险 | backstage/B05 | market-surveillance |
| B06 | 金库与流动性：储备、调拨与挤兑压力 | backstage/B06 | deposit-withdraw-sim |
| B07 | 应急响应：事故分级、止血与追回 | backstage/B07 | — |
| B08 | 实时风控平台：特征、规则、模型与灰度 | backstage/B08 | risk-pipeline-lab |
| B09 | 全球监管与牌照：一家交易所怎样分区经营 | backstage/B09 | license-matrix |
| B10 | 税务报送与数据隐私：交易所也是信息报送人 | backstage/B10 | — |
| B11 | 安全工程：把安全做进研发与运营 | backstage/B11 | — |
| B12 | 安全事故案例库：防线是怎样被突破的 | backstage/B12 | incident-explorer |

### 下篇二 · 产品深潜（P 系列，11 集）

| 集 | 标题 | 来源 | 交互实验 |
|---|---|---|---|
| P01 | 杠杆与借贷：钱从哪来，利率怎么定 | products/P01 | margin-loan-lab |
| P02 | 闪兑与 OTC：平台报价背后的风险 | products/P02 | convert-rfq |
| P03 | P2P 与法币通道：担保交易和反诈 | products/P03 | p2p-escrow |
| P04 | 合约进阶：统一账户、组合保证金与期权 | products/P04 | perpetual-liquidation |
| P05 | 存币生息：活期、定期与流动性质押 | products/P05 | — |
| P06 | 双币投资：高收益背后的期权 | products/P06 | dual-investment |
| P07 | 上币与新币分发：Launchpad、Launchpool 与空投 | products/P07 | launchpool-calc |
| P08 | 策略交易与跟单：网格、定投与带单分润 | products/P08 | grid-bot |
| P09 | 支付与卡：Binance Pay、礼品卡与加密借记卡 | products/P09 | — |
| P10 | Web3 钱包：MPC、DEX 聚合与授权风险 | products/P10 | — |
| P11 | 增长与机构：推荐返佣、VIP、经纪商与做市商 | products/P11 | — |

## 2. 讲解风格（技术教学）

- **讲师口吻**：像一位资深工程师在白板前讲课。用"我们""来看""注意这里"。不用营销腔，不用夸张形容词。
- **先问题，后机制**：每个知识点先抛出一个具体问题（"用户点了买入，钱什么时候真正扣掉？"），再拆机制。
- **具体数字推演**：每集至少 2 次用具体数值一步步算（例如强平价 45,180.72 怎样算出来）。数字标"示例"。
- **一句话一件事**：口播句子短，口语化。一个句子不超过 40 字。不用括号和英文长句。
- **比喻要准**：每集 1–2 个比喻，比喻之后立刻回到真实机制，说明比喻在哪里不成立。
- **结构固定**：开场钩子（30–60 秒）→ 本集路线图 → 3–5 个核心段落 → 常见误区或故障 → 小结（3 点）→ 下集预告。
- **事实口径**：沿用主线章节的三层口径：币安公开事实 / 业界通用做法 / 示例。口播里说"根据币安公开资料""业界通常这样做""举个示例数字"。

## 3. 动画讲解页写法

参考模板：[slides/EP00-template.html](slides/EP00-template.html)。共用样式和播放器：`slides/assets/player.css`、`player.js`（不要修改）。

- 画布固定 1920×1080，深色交易终端风格。字号大：正文 ≥ 30px，标题 ≥ 56px。
- 每个 `<section class="scene" data-title="...">` 是一个场景，`data-title` 会成为视频章节名。
- 场景末尾的 `<ol class="say">` 里，每个 `<li>` 是一步的口播。第 k 个 `<li>` 对应 step k（从 0 开始）。
- 画面元素加 `data-step="k"` 在第 k 步出现；`data-until="k"` 在第 k 步之后消失；`data-dim="k"` 从第 k 步起变暗。
- 需要逐步计算或动画（订单簿、K 线、余额变化）时，在场景上写 `data-onstep="函数名"`。函数根据步号**直接画出该步的完整状态**（幂等），不依赖上一步。
- 每个画面都要"有东西可看"：避免一屏只有一行字。每 15–25 秒画面至少变化一次。
- 不依赖网络资源（不加载外部字体或脚本），保证离线渲染一致。

### 第一轮制作经验（必须遵守）

- **每一步都要有画面**：场景的第 0 步不能只有标题。第一组画面元素用 `data-step="0"`，不要让观众对着空白听 10 秒。
- **SVG 文字颜色**：在 `<text>` 上用 `fill="#f0b90b"` 这种十六进制颜色，或 `style="fill:var(--gold)"`。不要写 `fill="var(--gold)"`，属性里的 `var()` 无效。
- **只写自己的文件**：临时脚本放在 scratchpad 里自己的子目录，不要在 `slides/` 里留下草稿或异常文件名。
- **语速**：当前配音（云希）约 290 字/分钟（含停顿）。10–15 分钟 ≈ 口播 2,900–4,000 字。

## 4. 渲染

```bash
cd video/tools && npm install
node render.mjs ../slides/EP01-what-is-cex.html
```

一次渲染全部 17 集（4 集并行，约 15–20 分钟）：

```bash
video/tools/render-all.sh
```

输出到 `video/output/`：`EPxx-*.mp4`（H.264 1080p，AAC 配音，内嵌软字幕和章节）+ `EPxx-*.srt`。

- 配音：默认使用微软神经语音"云希"（`zh-CN-YunxiNeural`，正常语速），通过 `edge-tts` 合成（需联网，`pip install edge-tts`）。风格参考知识类讲解频道：句间停顿 0.32 秒，换画面时再停 0.55 秒。
  - 换声音：`--voice zh-CN-YunjianNeural --rate -8% --pitch -2Hz`（沉稳）、`--voice zh-CN-YunyangNeural`（播音腔）。`voice-samples/` 里有 5 个对比样音。
  - 离线备选：`--engine say --voice Tingting --rate 200`（macOS 自带）。
- 画面字幕：渲染时逐句叠加在画面底部（硬字幕），同时内嵌软字幕轨。
- 想换成真人配音：用 `.srt` 作为提词稿录音，替换音轨即可；画面时间轴按句子对齐。

## 5. 口播稿

`scripts/EPxx-*.md` 由讲解页自动导出（`node tools/export-scripts.mjs`），包含每个场景的口播全文和对应画面步骤，可直接作为真人录制的提词稿。
