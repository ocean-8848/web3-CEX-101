# 动手实践：CEX Demo

[cex-demo/](cex-demo/README.zh-CN.md) 是一个可以完整运行的现货交易所演示系统：交易前台、运营后台、API 网关、10 个后端服务、Rust 撮合引擎、做市与链模拟器。所有资产都是测试数据，链是本地模拟链。启动方法见 [cex-demo/README.zh-CN.md](cex-demo/README.zh-CN.md) 的「快速开始」。

学习手册（[../docs/](../docs/README.md)）只讲交易所的通用知识。本页把每篇文档的知识点对应到 Demo 里的代码，并说明 Demo 实现到了什么程度、和真实交易所差在哪里。

> 💡 注意：下文里的代码路径（例如 `services/ledger-service`）都相对于 [cex-demo/](cex-demo/) 目录。

## 建议用法

1. 先读手册里的一章，理解机制。
2. 在本页找到这一章，打开对应的服务和文件。
3. 启动 Demo，按 [cex-demo/docs/demo-walkthrough.md](cex-demo/docs/demo-walkthrough.md) 走一遍相关流程，观察日志、数据库和运营后台。
4. 对照本页的「未实现」和「差异」，想一想生产级交易所还需要补什么。

## 主线 01–13

### [01 什么是 CEX：托管 + 记账 + 撮合](../docs/chapters/01-what-is-cex.md)

Demo是一个教学用的最小 CEX。三件事对应的服务如下：

| CEX 本质 | Demo服务 | 目录 |
|---|---|---|
| 托管 | 充值地址、提币单据 | `services/wallet-service` |
| 托管 | 链上扫描、确认数推进 | `services/blockchain-indexer` |
| 托管 | 对接托管商 / 热钱包广播 | `services/custody-adapter` |
| 记账 | 双分录账本、冻结、解冻 | `services/ledger-service` |
| 记账 | 成交后的资金结算 | `services/settlement-service` |
| 撮合 | Rust 内存订单簿 | `engines/matching-engine` |
| 撮合 | 订单生命周期 | `services/order-service` |
| 账户 | 注册、登录、2FA、API Key | `services/identity-service` |

Demo只做现货和加密资产，不做法币、合约和理财（见根目录 `README.zh-CN.md` 的"Demo 覆盖的能力"）。

### [02 系统总架构：一家交易所由哪些系统组成](../docs/chapters/02-system-architecture.md)

| 层 | 服务 | 目录 | 端口 | 技术 |
|---|---|---|---|---|
| ① 接入层 | 用户前端 | `apps/trader-web` | — | Next.js |
| ① 接入层 | 网关 | `services/api-gateway` | 3007 | NestJS + Redis 限流 |
| ② 交易核心 | 订单 | `services/order-service` | 3009 | NestJS |
| ② 交易核心 | 风控 | `services/risk-service` | 3008 | NestJS |
| ② 交易核心 | 撮合 | `engines/matching-engine` | 3011 | Rust，TCP JSON line |
| ② 交易核心 | 结算 | `services/settlement-service` | 3010 | NestJS |
| ③ 资金层 | 账本 | `services/ledger-service` | 3001 | PostgreSQL + Kafka outbox |
| ③ 资金层 | 钱包 | `services/wallet-service` | 3002 | NestJS |
| ③ 资金层 | 身份 | `services/identity-service` | 3005 | TOTP 2FA、RBAC |
| ④ 链上层 | 索引器 | `services/blockchain-indexer` | 3003 | EVM 扫描、重组回滚 |
| ④ 链上层 | 托管适配 | `services/custody-adapter` | 3004 | evm-hot-wallet provider |
| ⑤ 数据层 | 行情 | `services/market-data-service` | 3012 | Redis + ClickHouse |
| ⑥ 运营后台 | 运营控制台 | `apps/ops-console` | 3006 | 审核、对账、恢复 |

Demo和大型交易所的差异：

- Demo的订单服务**同步**调用结算服务。大型交易所通常让结算异步消费成交流。
- Demo的撮合引擎是单进程。没有主备，没有按交易对分片。
- 共享领域模型在 `packages/domain`。Kafka topic 规划见 `docs/event-catalog.md`。

更多运行细节见 `docs/architecture.md` 和 `docs/getting-started.md`。

### [03 账户、身份与安全](../docs/chapters/03-account-identity-security.md)

| 本章概念 | Demo位置 | 实现情况 |
|---|---|---|
| 注册、登录、会话 | `services/identity-service`：`registerCustomer`、`createCustomerSession`、`introspectCustomerSession`、`revokeCustomerSession` | 已实现，使用服务端可吊销会话 |
| TOTP 2FA | `services/identity-service/src/domain/totp.ts` | 已实现，默认 30 秒周期、6 位数字，校验支持时间窗容差 |
| API Key 签名 | `services/api-gateway/src/http/api-key-signature.ts` | 已实现，见下方说明 |
| 提币时校验 2FA | `wallet-service` 的 `requestWithdrawal` 调用 `identity-service /two-factor/verify` | 已实现 |
| 提币白名单 | `wallet-service` 的 `withdrawal-address-book` 接口 | 已实现 |
| 账户冻结 | `identity-service` 的 `freezeUser` / `unfreezeUser`；用户状态 `active / suspended / disabled` | 已实现 |
| 运营后台 RBAC | `identity-service` 的 ops 会话与 RBAC | 已实现 |
| 登录记录与设备管理 | `services/identity-service/src/application/login-security-service.ts`、`src/domain/login-security.ts`；trader-web「账户 → 设备管理 / 登录记录」 | 已实现：每次登录（成功 / 失败 / 锁定）记录时间、IP、User-Agent、设备 ID；trader-web 在 localStorage 保存长期随机设备 ID（不是设备指纹）；用户可以「退出该设备」吊销其全部会话 |
| 新设备提醒 | 同上 + `services/identity-service/src/infrastructure/http-wallet-security-notifier.ts` | 已实现：账户已有设备时，第一次出现的设备标记为新设备，并在站内信发送「新设备登录」；可选策略 `WITHDRAWAL_NEW_DEVICE_LOCK_SECONDS`（默认关闭）在新设备登录后暂停提现 |
| 登录失败锁定 | `evaluateLoginLock`（`src/domain/login-security.ts`） | 已实现：自上次成功登录起、15 分钟内 5 次密码 / 动态码错误后锁定 5 分钟（返回 429），可用 `IDENTITY_LOGIN_*` 调整 |
| 子账户、反钓鱼码 | — | 未实现，属于 MVP 之外 |

Demo API Key 签名方案与币安的差异：

- 请求头使用 `X-API-Key`、`X-API-Timestamp`、`X-API-Signature`。
- 待签名串是 `方法\nURL\n时间戳\nSHA256(请求体)`，各段用换行连接。币安直接签"查询字符串 + 请求体"。
- 时间容差由 `GATEWAY_API_KEY_MAX_DRIFT_MS` 控制，默认 300000 毫秒（5 分钟）。它相当于固定的 `recvWindow`。
- 签名比较使用 Node.js 的 `timingSafeEqual`，是常量时间比较。

### [04 钱包与托管](../docs/chapters/04-wallet-custody.md)

| 本章概念 | Demo位置 | 实现情况 |
|---|---|---|
| 充值地址分配 | `services/wallet-service`：`createDepositAddress` | 已实现，EVM 链每用户独立地址 |
| 链上监听、确认数推进 | `services/blockchain-indexer`：EVM 原生币与 ERC-20 `Transfer` 扫描 | 已实现，按阈值回调 `wallet-service /deposits/confirm` |
| 链重组处理 | `blockchain-indexer` 对非最终区块尾部重扫；记录 `block_hash` 变化 | 已实现最小版本 |
| 充值状态 | `DepositStatus = detected / confirming / confirmed / credited / failed` | 对应本章 PENDING / CONFIRMING / CREDITED / DROPPED |
| 提币状态 | `WithdrawalStatus = requested / under_review / approved / broadcasted / confirmed / failed / rejected` | 与本章状态机基本一致 |
| 提币冻结、消耗、解冻 | `wallet-service` 调用 `ledger-service` 的 `freeze` / `consume` / `release` | 已实现 |
| 签名与广播 | `services/custody-adapter`：`mock-custody`、`evm-hot-wallet` provider | 已实现，支持路由、熔断、重试 |
| 陈旧提币清理 | `reconcile-stale-withdrawals` 脚本 | 已实现 |
| 冷热分层（3.5） | `services/wallet-service` 的 treasury 模块：持仓分 充值地址 / 热钱包 / 冷钱包 三层，由 `src/domain/treasury-policy.ts` 的 `computeTreasuryHoldings` 从充值、提现、`treasury_transfers` 推导；提现一律从热钱包付出 | 已实现（账面分层；冷钱包没有真正的离线签名，见 `docs/security.md` 第 2.10 节） |
| 水位调拨 | `evaluateHotWalletWatermark`（`TREASURY_HOT_WALLET_WATERMARKS`）：高于上限提出 热→冷、低于下限提出 冷→热；提案在 ops-console「钱包与储备金」审批，提案人不能批准自己的提案 | 已实现（单人审批，无分级审批） |
| 归集（3.6） | `TreasuryService.runSweeps`：已入账充值按 (充值地址, 币种) 各发一笔 `sweep` 到热钱包，经 `custody-adapter` 广播、模拟链确认；`demo-simulator` 每 10 个块触发一次 | 已实现（不模拟 ERC-20 归集前的 Gas 补充） |
| 储备金证明（3.9） | `services/wallet-service/src/domain/proof-of-reserves.ts` 构建 Merkle 树（叶子 = 盐化用户哈希 + 各币种余额）；ops-console 生成快照；trader-web「资产 → 储备金证明」用 Web Crypto 在浏览器里逐层验证（`apps/trader-web/src/client/lib/por-verify.ts`），并展示逐币种储备率 | 已实现 Merkle 包含证明；没有 zk-SNARK，资产端没有链上地址控制权证明 |
| 钱包 vs 账本 | `GET /api/v1/wallet/treasury/reconciliation`：链上储备 vs `ledger-service` 用户负债（扣除在途提现） | 已实现 |

### [05 账本：交易所真正的心脏](../docs/chapters/05-ledger.md)

Demo的 `services/ledger-service` 是资金事实源。设计见 [docs/ledger-service-design.md](cex-demo/docs/ledger-service-design.md)。

| 本章概念 | Demo实现 |
|---|---|
| 双分录 | `postJournal`：一个 journal 带多条 entries，校验同一资产借贷平衡（错误码 `JOURNAL_NOT_BALANCED`） |
| 借贷方向 | 用户账户按负债类处理：`credit` 增加可用余额，`debit` 减少 |
| 幂等 | `ledger_journals.idempotency_key` 有唯一约束；同键同内容（含并发）返回原 journal，同键不同内容返回 409 `DUPLICATE_IDEMPOTENCY_KEY`，并发撞唯一索引也不会变成 500（[`journal-idempotency.ts`](cex-demo/services/ledger-service/src/application/journal-idempotency.ts)） |
| 冻结状态机 | `balance_locks` 表，状态 `locked` → `consumed` / `released`；`remaining_amount` 支持部分成交 |
| 余额分层 | `balances` 表的 `available` 和 `locked` 两列 |
| 快照可重建 | `reconcile-balances` 脚本用 `ledger_entries` + 活跃锁重算快照 |
| 流水回放 | `replay-account` 脚本按时间序回放单个账户 |
| 精确算术 | `src/domain/money.ts` 用 BigInt，按 18 位小数换算；数据库用 `numeric(36, 18)` |
| Outbox | `outbox_events` 与账本同事务提交；`publish-outbox` 发布到 Kafka，带重试和死信 |
| 告警 | `check-alerts` 覆盖 outbox 堆积、死信、超时锁、快照不一致、负余额 |
| 用户负债 / 储备对账 | `GET /ops/liabilities`（`src/application/ledger-liabilities.ts`）汇总用户账户可用 + 冻结；wallet-service 用它与链上储备做逐币种覆盖率对账，并为储备金证明生成叶子。本章的"热钱包资产"科目没有记进账本：链上持仓由 wallet-service treasury 单独记录（见 [docs/ledger-service-design.md](cex-demo/docs/ledger-service-design.md) 第 4 节） |

Demo与生产级账本的差距：

- 没有手续费账户分桶。手续费账户是单个 `platform:spot:fee:<asset>`。
- 钱包 vs 账本对账基于 treasury 自己记录的持仓，没有和真实链上地址余额、托管方报告做三方对账，也没有定时任务。
- 冻结记录本身不写 journal，只更新快照和锁表。本章的交互页把冻结也写成分录，便于观察。

### [06 订单与撮合](../docs/chapters/06-order-matching.md)

| 主题 | Demo实现 | 与生产级做法的差距 |
|---|---|---|
| 撮合内核 | `engines/matching-engine`：Rust，TCP + JSON line 协议，支持 `submit` / `cancel` / `snapshot` / `reset` / `seed` | 结构清晰，适合学习 |
| 订单簿数据结构 | `OrderBook { bids: Vec, asks: Vec }`，每次插入后整体排序 | 生产级用红黑树/跳表 + 双向链表 + 哈希索引 |
| 优先级 | 价格优先，同价按 `created_at` 时间排序 | 一致 |
| 订单类型 / TIF | `limit`、`market`；`gtc`、`ioc`、`fok`；FOK 先累加可成交量再决定 | 未实现 OCO、冰山 |
| Post-Only | 引擎 `submit` 带 `post_only: true`：到达时若与对手盘最优价交叉就整单拒绝（`post_only_would_take`），订单簿不变；`order-service` 把订单记为 `rejected` 并解冻全部资金；`risk-service` 只允许 GTC 限价单 | 一致；未实现"价格自动调整为挂单价"（post-only slide） |
| 自成交预防 STP | 引擎 `submit` / `seed` 带 `owner_id`（账户 ID），`stp_mode` 支持 `expire_taker`（默认）/ `expire_maker` / `expire_both`；被撤的挂单在响应 `expiredMakers` 中返回，由 `order-service` 置为 `cancelled` 并按剩余量解冻（`engines/matching-engine/src/main.rs`、`services/order-service/src/application/order-application-service.ts`） | 一致；生产级还会按用户组 / 子账户设置 STP 范围 |
| 止损单 | `stop_limit` / `stop_market` + `triggerPrice`：`order-service` 以 `pending_trigger` 存库并冻结资金，`StopOrderTriggerWorker`（`services/order-service/src/application/stop-order-trigger-worker.ts`）按最新成交价判断（买 ≥ / 卖 ≤ 触发价），用比较交换（CAS）把订单幂等地提交给引擎；触发前可撤单 | 触发在撮合引擎之外、按轮询检查，触发与成交之间有毫秒级延迟；生产级在引擎内按成交事件即时触发 |
| 并发模型 | `Arc<Mutex<HashMap<market, OrderBook>>>`，所有交易对共享一把锁 | 生产级按交易对分片、单线程、无锁 |
| 数值 | `f64` + `0.00000001` 容差比较 | 生产级用整数 tick / step |
| 恢复 | `order-service` 的 `POST /api/v1/orders/ops/replay-engine` 从数据库读出挂单，用 `seed` 重建订单簿 | 没有定序器和事件日志，重建依赖数据库快照，不是逐条重放 |
| 精度校验 | `risk-service` 校验最小数量、价格 step、数量 step、价格偏离 | 与币安 filters 思路一致 |
| 订单状态 | `order-service`：（止损单 `pending_trigger` →）`pending_risk` → `accepted` / `partially_filled` → `filled` / `cancelled` / `rejected` | 多了 `pending_risk`、`recovery_pending` 等编排状态；`pending_risk` 只在一次下单请求内存在，冻结失败或撮合提交失败都会收敛到 `rejected`（冻结失败原因为 `ORDER_FREEZE_FAILED`） |

相关文件：

- [engines/matching-engine/src/main.rs](cex-demo/engines/matching-engine/src/main.rs)：`submit_order`、`crosses`、`sum_executable_quantity`、`same_owner`（STP）
- [services/order-service/src/application/stop-order-trigger.ts](cex-demo/services/order-service/src/application/stop-order-trigger.ts)：止损触发规则
- [services/order-service/README.md](cex-demo/services/order-service/README.md)
- [docs/architecture.md](cex-demo/docs/architecture.md)

> 💡 注意：Demo撮合内核的 `created_at` 由调用方传入。这和"时间戳由定序器写入"的思路一致，有利于重放的确定性。

### [07 清算结算与手续费](../docs/chapters/07-clearing-settlement-fees.md)

Demo的 `services/settlement-service` 负责结算。主链说明见 [docs/architecture.md](cex-demo/docs/architecture.md)。

| 本章概念 | Demo实现 |
|---|---|
| 结算入口 | `POST /api/v1/settlement/trades/settle`，当前由 `order-service` **同步**调用（不是异步消费） |
| 幂等 | 按 `tradeId` 幂等；journal 幂等键为 `spot_trade:base:<tradeId>` 和 `spot_trade:quote:<tradeId>` |
| 清算中间户 | `platform:spot:settlement:<asset>`：先 `consumeBalance` 把冻结转入，再 `postJournal` 转给对手方 |
| 手续费账户 | `platform:spot:fee:<asset>`（卖方 quote 费、买方 base 费各入对应资产的账户），未分桶 |
| 手续费规则 | 双边收费：卖方按 `sellerFeeRate` 收 quote，买方按 `buyerFeeRate` 收 base；Maker / Taker 费率按订单在本笔成交中的角色区分 |
| VIP 等级 | `config/fee-tiers.json` 定义 VIP0–VIP3（30 日 USDT 成交量门槛 + Maker / Taker 费率，VIP0 = 市场默认费率），由 `packages/domain/src/fee-tiers.ts` 校验；`order-service` 的 `src/application/fee-tier-service.ts` 在成交时解析双方等级（运营指定 > 做市商计划 > 30 日成交量），费率取 `min(等级费率, 市场费率)` |
| 费率记录与重放 | 费率和等级写进 `spot_trades`（`buyer_fee_rate` / `buyer_fee_tier` 等）与 `trade.executed`，`settlement-service` 只按记录值收费并在 `trade_settlements` 保存一份，重放同一笔成交手续费不变 |
| 部分成交 | 买方 quote 按实际成交额部分消耗冻结，冻结记录保留 `remaining_amount` |
| 失败补偿 | recovery jobs：自动重试、单笔人工恢复 `POST /trades/:tradeId/recover`、终态失败标记 |
| 结算报表 | 物化汇总表驱动的 settlement report |

Demo与本章的差距：

- 没有平台币抵扣和返佣；VIP 成交量只统计 USDT 计价市场，没有资产余额（持仓）维度的等级条件。
- 结算是同步调用。改成"消息队列 + 消费端幂等"后，才是 3.1 图中的形态。

### [08 行情](../docs/chapters/08-market-data.md)

| 主题 | Demo实现 | 与生产级做法的差距 |
|---|---|---|
| 行情服务 | `services/market-data-service`，HTTP 端口 3012 | — |
| REST | `tickers`、`ticker`、`depth`、`trades` 四个接口 | 缺少 K 线查询接口 |
| 公共 WebSocket | `WS /api/v1/market-data/ws`，频道 `ticker` / `depth` / `trades` | 每次事件推送完整快照，不是增量；没有 `U` / `u` 序号 |
| 事件来源 | 订阅 Redis 频道 `web3-cex:trading.events` | 生产级通常用 Kafka 等可重放的总线 |
| 深度生成 | 从 `order-service` 拉取挂单列表，`aggregateLevels` 按价格汇总 | 生产级直接消费撮合引擎的订单簿变化事件 |
| K 线 | ClickHouse 物化视图生成 `1m` K 线 | 还没有更长周期 |
| 快照缓存 | Redis 存 ticker / depth / trades 快照 | 思路一致 |
| 私有推送 | `api-gateway` 的 `/api/v1/gateway/realtime`，频道 `orders` / `trades` / `notifications` / `balances`，需要 token 或 API Key 签名 | 思路一致 |

相关文件：

- [services/market-data-service/README.md](cex-demo/services/market-data-service/README.md)
- [services/market-data-service/src/http/market-data-realtime-server.ts](cex-demo/services/market-data-service/src/http/market-data-realtime-server.ts)
- [docs/architecture.md](cex-demo/docs/architecture.md)

> 💡 注意：Demo每次推送完整深度快照。它简单可靠，但消息体积大。练习：给它加上递增的 `updateId`，并改成增量推送，然后按 3.4 节的规则写一个客户端。

### [09 风控](../docs/chapters/09-risk-control.md)

| 风控层 | Demo现状 | 位置 |
|---|---|---|
| 交易前：余额 | ✅ 已实现。调用 ledger-service 查询可用余额，返回需冻结的资产和金额 | `services/risk-service/src/application/risk-application-service.ts` |
| 交易前：价格保护带 | ✅ 已实现。`maxPriceDeviationRatio` 为 0.2（即 ±20%） | `packages/domain/src/index.ts` 的 `SPOT_MARKET_DEFINITIONS` |
| 交易前：精度与最小数量 | ✅ 已实现。`minQuantity`、`priceStep`、`quantityStep` | 同上 |
| 交易前：参考价 | ⚠️ 来自环境变量 `RISK_REFERENCE_PRICE_*`，不是实时行情 | `services/risk-service/README.md` |
| 限频 | ✅ 已实现。API 网关用**固定窗口计数器**：窗口 60 秒，匿名 30 次，已认证 120 次；超限返回 429 | `services/api-gateway/src/infrastructure/redis-rate-limiter.ts` |
| 资金：提币审核 | ✅ 已有状态 `under_review` 和人工审核动作 | `services/wallet-service/src/domain/types.ts` |
| 资金：限额、黑名单、KYT | ✅ 单笔 / 日累计限额和 KYC 分级限额；简化 KYT：规则评分（黑名单 → 拦截，混币 / 高风险标签 +70，首次地址 +10、首次且大额 +40、地址簿新地址 +30，白名单 / 已用过的地址不加分），≥60 高风险强制双人复核；运营后台「用户与资产 → 地址黑名单」维护黑名单（带原因、审计、`ops.risk.manage` 权限），新加入的地址会自动拒绝待审核提现并解冻资金。没有接入真实 KYT 供应商，地址标签是演示数据 | `services/wallet-service/src/domain/withdrawal-risk.ts`、`withdrawal-policy.ts`；`docs/security.md` 第 2.7 节 |
| 交易中：STP、刷量监察 | ❌ 未实现 | — |
| 账户：设备与盗号检测 | ⚠️ 已实现登录记录、新设备识别与站内提醒、按设备吊销会话、登录失败临时锁定、可选的新设备提现锁（默认关闭）；没有设备指纹、IP 信誉和异常登录评分 | `services/identity-service/src/application/login-security-service.ts`；`docs/security.md` 第 2.2 节 |

如果要补齐，建议按以下顺序：

1. 把参考价切换到 market-data-service 的实时价格，并加"参考价过期即暂停"。
2. 把 wallet-service 内的规则评分接到真实 KYT 数据源（地址标签、资金来源多跳暴露），并支持影子模式试运行新规则。
3. 把固定窗口限频改成令牌桶或滑动窗口。固定窗口在窗口边界允许 2 倍突发。
4. 在撮合引擎加 STP 参数。
5. 新增一个异步"市场监察"消费者，订阅成交事件。

### [10 合约与永续合约](../docs/chapters/10-derivatives-futures.md)

Demo**只实现了现货交易**，没有任何衍生品功能。代码中不存在合约、杠杆、标记价格或强平相关的服务。

如果要增加 U 本位永续合约，至少需要新增以下组件：

| 新组件 | 职责 | 依赖的现有服务 |
|---|---|---|
| index-price-service | 聚合多个外部现货价格，计算指数价格 | market-data-service |
| mark-price-service | 计算标记价格、溢价指数、资金费率 | index-price-service |
| futures-order-service + 合约撮合 | 合约订单簿与撮合；支持只减仓（reduce-only） | 可复用 order-service 的撮合模式 |
| position-service | 维护仓位、开仓均价、未实现盈亏 | ledger-service |
| margin-risk-service | 开仓前检查初始保证金与杠杆分层 | 现有 risk-service 的模式 |
| liquidation-engine | 订阅标记价格，计算保证金率，接管仓位 | position-service、futures 撮合 |
| insurance-fund 账户 | 在账本中新增保险基金账户类型 | ledger-service |
| funding-settlement job | 每个周期按资金费率在多空之间记账 | ledger-service、settlement-service |

现有服务需要的改动：

1. ledger-service 增加账户类型：合约保证金账户、保险基金账户、资金费中转账户。
2. risk-service 目前只校验现货订单（`POST /api/v1/risk/spot-orders/validate`）。需要增加合约订单校验接口。
3. 事件目录（`docs/event-catalog.md`）增加 `position.opened`、`position.liquidated`、`funding.settled` 等事件。

### [11 产品生态及其背后实现](../docs/chapters/11-products-ecosystem.md)

Demo MVP 只覆盖现货交易，不做法币入金（见 `README.zh-CN.md` 的"Demo 覆盖的能力"）。本章产品在仓库中的对应关系：

| 本章产品 | 仓库现状 | 可以复用的服务 |
|---|---|---|
| 杠杆/借贷 | 未实现 | `ledger-service`（冻结/解冻）、`risk-service`（前置校验） |
| 闪兑 | 未实现 | `order-service`（可以把对冲单作为市价单提交） |
| P2P | 未实现 | `ledger-service` 的冻结/释放就是担保托管的基础 |
| 法币出入金 | 明确不在 MVP 范围 | — |
| 理财 | 未实现 | `ledger-service` 的内部划转分录 |
| 上币 | 部分：交易对配置 | `matching-engine` 的 market 配置、`blockchain-indexer` 的链支持 |
| Pay | 未实现 | `ledger-service` 的 `postJournal` 可以实现账本内划转 |

关键观察：Demo的 `ledger-service` 已提供 `freezeBalance`、`releaseBalance`、`consumeBalance`。P2P 担保托管的"冻结 → 放币 / 解冻"正好映射到这三个操作。后续扩展产品时，应在账本之上新增产品服务，而不是修改账本本身。

### [12 商业逻辑：交易所如何赚钱](../docs/chapters/12-business-model.md)

| 本章概念 | 仓库现状 |
|---|---|
| 交易手续费 | `settlement-service` 在成交结算时生成手续费分录（见 `services/settlement-service/README.md` "生成手续费入账"） |
| 手续费账户对账 | Demo未实现专门的手续费日级对账。手续费账户 `platform:spot:fee:<asset>` 和其他账户一样，由 `ledger-service` 的 `reconcile-balances` 按 journal 校验余额快照（见 `docs/ledger-service-design.md` 第 11 节） |
| 费率等级、VIP | 已实现：`config/fee-tiers.json`（VIP0–VIP3，按 30 日 USDT 成交量，VIP0 = 市场默认费率），`order-service` 的 `src/application/fee-tier-service.ts` 在成交时解析等级并把费率写进成交；用户在 trader-web 账户页「手续费等级」查看等级、30 日成交量和升级进度，下单面板按本人费率预估手续费 |
| 返佣、BNB 抵扣 | 未实现 |
| 做市商计划 | 部分实现：`config/fee-tiers.json` 的 `marketMakers` 列出做市账户（演示的两个做市账户固定 VIP0），ops-console 用户详情可为任意账户「指定」等级（备注必填、写审计，见 `spot_fee_tier_override_audit`）；没有负费率（返还）。做市流动性由 `demo-simulator` 模拟 |
| 地区合规路由 | 未实现。`identity-service` 已有 KYC 状态字段，可作为扩展入口 |

建议的扩展顺序（【分析】）：先实现"费率配置表 + Maker/Taker 区分"，再实现 VIP 等级，最后实现返佣。原因是返佣涉及跨用户的分账，需要账本支持更多科目。

### [13 可靠性与安全事故](../docs/chapters/13-reliability-security-incidents.md)

| 本章概念 | 仓库实现 | 位置 |
|---|---|---|
| 撮合快照 | `matching-engine` 支持 book snapshot / reset / seed | `engines/matching-engine/src/main.rs` |
| 订单簿重放 | `order-service` 支持订单簿 replay 和异常检测 | `services/order-service/README.md` |
| 账本重放与对账 | `ledger-service` 的 `reconcile-balances`、`replay-account`、`check-alerts` | `docs/ledger-service-design.md` 第 11 节、`docs/troubleshooting.md` 第 6.4 节 |
| 降级与紧急开关 | 单市场交易开关（市场 `halted`，拒绝新单、撤单放行）；全站提币暂停、单资产提币暂停、API 写入冻结（只读模式，撤单放行）三个紧急开关，由 risk-service 持久化，在 api-gateway、wallet-service（申请 / 审批 / 广播）和下单风控中执行，ops-console「系统运维 → 紧急开关」操作（必填原因、二次确认、审计，仅 `ops_admin`）；trader-web 显示暂停 / 只读提示 | `services/risk-service/src/application/control-switch-service.ts`、`services/api-gateway/src/http/api-gateway-control-switch.guard.ts`、`apps/ops-console/client/features/controls-tab.tsx`、`docs/security.md` 第 2.11 节 |
| 告警分级 | 已实现 P1/P2/P3：账本、对账、紧急开关、托管、链上观察、钱包、交易域与交易运行时告警逐条定级（P1 资金正确性 / 资金出口，P2 核心链路受损，P3 非核心），运营总览和系统运维按级别排序、着色、计数；没有值班呼叫 | `apps/ops-console/src/domain/alert-severity.ts`、`docs/security.md` 第 2.12 节 |
| 对账与熔断 | ledger-service 定时（演示栈 30 秒）做余额对账与委托冻结对账，不平时自动暂停该币种提现并产生 P1 告警，人工恢复前需一轮一致的对账 | `services/ledger-service/src/application/reconciliation-job.ts`、`docs/ledger-service-design.md` 第 11.5 节 |
| 审计日志 | `ops_action_audit_logs` 记录运营写操作的操作人、角色、权限、目标、请求 / 响应和结果；`withdrawal_audit_logs` 记录提现各状态的操作人、`trace_id` 和前后快照 | `docs/security.md` 第 2.8 节 |
| 权限控制 | 6 个运营角色映射到细粒度权限，提现审核（`ops_reviewer`）与账本执行（`ops_finance_operator`）分属不同角色 | `services/identity-service/src/domain/rbac.ts`、`docs/security.md` 第 2.2 节 |
| 托管熔断 | `custody-adapter` 多 provider 路由、失败熔断、健康检查 | `services/custody-adapter/README.md`、`docs/fault-lab.md` |
| 排障顺序 | 先看日志和状态，先只读检查，再修复；不直接手改余额或状态列 | `docs/troubleshooting.md` 第 1、6.4 节 |

关键观察：Demo的排障原则"不直接手改余额快照或状态列"，正是对 FTX 和 Mt.Gox 教训的工程化表达。账本只追加不覆盖，所有资金变更可回放。

当前缺口（来自仓库文档）：撮合引擎是单进程，没有热备和自动主备切换；多机房部署不在 MVP 范围内。

## 下篇 · 产品深潜 P01–P11

### [P01 杠杆与借贷：全仓/逐仓杠杆、Binance Loans、VIP 借贷](../docs/products/P01-margin-and-loans.md)

Demo没有实现杠杆、借贷、计息或强平。可以复用的部分：

| 本章需要 | Demo现有 | 文件 |
|---|---|---|
| 借款 / 还款 / 计息分录 | 双分录过账与幂等键 | `services/ledger-service/src/domain/types.ts`（`PostJournalCommand.idempotencyKey`） |
| 金额精度（避免浮点误差） | 18 位小数的 BigInt 金额 | `services/ledger-service/src/domain/money.ts` |
| 账户类型 | 只有 main、spot、funding、fee 等 | `packages/domain/src/index.ts`（需新增 margin、loan_pool、interest_receivable） |
| 借款前额度检查 | 只校验现货订单 | `services/risk-service/src/application/risk-application-service.ts` |

### [P02 闪兑、大宗 OTC 与快捷买币](../docs/products/P02-convert-otc.md)

| 本章能力 | Demo 代码位置 |
|---|---|
| 账本原子划转 | `postJournal`，见 `services/ledger-service/src/application/ledger-application-service.ts` 第 70 行 |
| 冻结与扣减 | 同文件 `freezeBalance`（第 105 行）、`consumeBalance`（第 227 行） |
| 对冲下单 | `services/order-service/src/application/order-application-service.ts` |
| 中间价与深度 | `services/market-data-service` |
| 限额与反欺诈 | `services/risk-service/src` |
| 收入归类 | 未实现 |
| 法币通道对账 | Demo不做法币入金（见[cex-demo/README.zh-CN.md](cex-demo/README.zh-CN.md)） |

Demo 没有 `convert-service`、`quote-engine`、`hedge-service`、`otc-desk`、`fiat-gateway`。如果要扩展，业界通用做法是新增产品服务，调用已有的账本和订单服务，不修改账本本身。

### [P03 P2P 交易与法币充提](../docs/products/P03-p2p-fiat.md)

| 本章能力 | Demo 代码位置 |
|---|---|
| P2P 托管 = 冻结 | `freezeBalance`，`services/ledger-service/src/application/ledger-application-service.ts` 第 105 行 |
| 取消 = 解冻 | 同文件 `releaseBalance`（第 174 行） |
| 放币 = 扣减 + 入账 | 同文件 `consumeBalance`（第 227 行）、`postJournal`（第 70 行） |
| 实名与 2FA | `services/identity-service` |
| 限额与反诈 | `services/risk-service/src` |
| 法币对账 | Demo不做法币入金（见[cex-demo/README.zh-CN.md](cex-demo/README.zh-CN.md)） |
| 反洗钱 | 未实现 |

### [P04 高级衍生品：多资产保证金、统一账户与组合保证金、期权、风险限额](../docs/products/P04-advanced-derivatives.md)

Demo只实现现货，不含合约、期权或组合保证金（见第 10 章 §6）。可以参考的模式：

| 本章需要 | Demo可参考的模式 | 文件 |
|---|---|---|
| 交易前限额校验 | 现货下单风控校验入口 | `services/risk-service/src/application/risk-application-service.ts`（`validateSpotOrder`） |
| 多资产记账 | 资产代码与账户类型 | `packages/domain/src/index.ts` |
| 期权结算划转 | 幂等过账 | `services/ledger-service/src/domain/types.ts` |

### [P05 理财：活期、定期、质押与定投](../docs/products/P05-earn-savings-staking.md)

[CEX Demo](cex-demo/) 没有理财产品。可复用和需新增的部分：

| 能力 | 仓库现状 | 需要新增 |
|---|---|---|
| 内部划转 | [ledger-application-service.ts](cex-demo/services/ledger-service/src/application/ledger-application-service.ts) 的 `postJournal`（第 70 行）已支持幂等分录 | 无 |
| 赎回冻结 | 同文件 `freezeBalance` / `consumeBalance`（第 105、227 行） | 无 |
| 理财科目 | [packages/domain/src/index.ts](cex-demo/packages/domain/src/index.ts) 的 `AccountType` 只有 main/spot/funding/fee 等 | 新增 `earn` 账户类型和"利息支出"平台账户 |
| 产品服务 | 无 | `earn-service`：产品配置、额度、持仓、赎回额度 |
| 计息批处理 | 无 | 快照 + 批量分录任务，参考 `src/scripts/reconcile-balances.ts` 的批处理结构 |
| 质押 | [custody-adapter](cex-demo/services/custody-adapter) 只做充提签名 | 验证者管理、汇率更新任务 |

### [P06 结构化产品：双币投资与鲨鱼鳍](../docs/products/P06-structured-products.md)

[CEX Demo](cex-demo/) 没有理财或结构化产品，也没有期权市场。

| 能力 | 仓库现状 | 需要新增 |
|---|---|---|
| 申购冻结、结算扣减 | [ledger-application-service.ts](cex-demo/services/ledger-service/src/application/ledger-application-service.ts) 的 `freezeBalance`、`consumeBalance`、`postJournal` | 双币持仓科目、平台对冲账户 |
| 指数价格 | [market-data-service](cex-demo/services/market-data-service) 只提供本所行情 | 多交易所指数和时间均价 |
| 期权定价 | 无 | `pricing-engine`：Black-Scholes、IV 曲面、报价有效期 |
| 对冲 | 无 | `hedge-engine`：净敞口汇总、下单到 [order-service](cex-demo/services/order-service) |
| 适当性测评 | [identity-service](cex-demo/services/identity-service) 只有 KYC | 测评问卷、产品风险等级 |

### [P07 上币与新币发行：Launchpad、Launchpool、空投与 Alpha](../docs/products/P07-listing-launch.md)

| 主题 | Demo实现 | 差距 |
|---|---|---|
| 交易对参数 | [packages/domain/src/index.ts](cex-demo/packages/domain/src/index.ts) 的 `SPOT_MARKET_DEFINITIONS`：`priceStep`、`quantityStep`、`minQuantity`、`maxPriceDeviationRatio` | 交易对写死在代码里，只有 BTC-USDT、ETH-USDT；没有上币后台 |
| 参数校验 | [services/risk-service/src/application/risk-application-service.ts](cex-demo/services/risk-service/src/application/risk-application-service.ts) 校验 step 对齐和价格偏离 | 对应 `PRICE_FILTER`、`LOT_SIZE`、`PERCENT_PRICE` 思路 |
| 冻结与发放 | [services/ledger-service/src/application/ledger-application-service.ts](cex-demo/services/ledger-service/src/application/ledger-application-service.ts) 的 `freezeBalance` / `releaseBalance` / `postJournal` | 可用来实现 Launchpad 冻结和退款；没有快照服务和活动服务 |
| 开盘保护 | 无集合竞价 | 撮合引擎只支持连续撮合 |

### [P08 策略交易与跟单：网格、定投、TWAP 与 Copy Trading](../docs/products/P08-strategy-copy-trading.md)

| 主题 | Demo实现 | 差距 |
|---|---|---|
| 下单入口 | [services/order-service/src/application/order-application-service.ts](cex-demo/services/order-service/src/application/order-application-service.ts) 的 `createOrder` / `cancelOrder` | 策略引擎可以作为它的调用方；Demo没有策略引擎 |
| 限频 | [services/api-gateway/src/infrastructure/redis-rate-limiter.ts](cex-demo/services/api-gateway/src/infrastructure/redis-rate-limiter.ts) | 网关层按请求限频；没有"单策略"维度的限频 |
| 下单风控 | [services/risk-service/src/application/risk-application-service.ts](cex-demo/services/risk-service/src/application/risk-application-service.ts) | 策略子单会经过同样的 step 和价格偏离校验 |
| 自动化任务 | order-service 中的 `SpotOrderAutomationExecution`（恢复、重放） | 这是运维自动化，不是交易策略 |
| 撮合 | [engines/matching-engine/src/main.rs](cex-demo/engines/matching-engine/src/main.rs) | 只有连续撮合，不感知订单来源 |

### [P09 支付与卡：Binance Pay、礼品卡、Binance Card](../docs/products/P09-pay-and-card.md)

Demo没有 Pay、礼品卡、卡服务。可以用账本服务的三个接口模拟：

- 站内转账 ≈ `postJournal`：见 `services/ledger-service/src/application/ledger-application-service.ts`。
- 礼品卡创建与兑换 ≈ `freezeBalance` + `consumeBalance`，同一文件。
- 账户类型定义见 `packages/domain/src/index.ts` 的 `AccountType`。若要做 Pay，可增加 `pay_in_transit`、`giftcard_liability` 两种类型。

### [P10 Web3 钱包：CEX 与链上世界的边界](../docs/products/P10-web3-wallet.md)

Demo没有用户自托管钱包，只有交易所侧托管。

- 链上签名与广播：`services/custody-adapter/src/infrastructure/evm-custody-provider.ts`。它对应图 2.2 中"币安热钱包"的位置，不对应用户的 MPC 钱包。
- 扫链与确认数：`services/blockchain-indexer/`，对应图 2.2 第 ⑤ 步。
- 托管提供方抽象：`services/custody-adapter/src/domain/provider.ts`。接入第三方 MPC 托管时，可以在这里新增一个 provider。

### [P11 增长与机构：返佣、营销资产、VIP、经纪商、做市商、场外结算](../docs/products/P11-growth-institutional.md)

- 账户类型：`packages/domain/src/index.ts` 的 `AccountType` 已有 `main`、`spot`、`funding`、`fee`。实现体验金时，可增加 `trial_fund` 和 `marketing_budget` 两种类型，提币服务只读取 `funding` 的可用余额。
- 返佣与营销分录：可用 `services/ledger-service/src/application/ledger-application-service.ts` 的 `postJournal` 实现，幂等键用"用户 + 周期"。
- API Key 签名：`services/api-gateway/src/http/api-key-signature.ts`。Demo没有子账户和经纪商；扩展时需在 Key 上增加"所属主账户"和"权限范围"字段。
- 运营权限（RBAC）：`services/identity-service/src/domain/rbac.ts`，可作为子账户权限模型的参考。

## 下篇 · 幕后核心 B01–B12

### [B01 合规防护：KYC、交易监控、KYT、Travel Rule 与制裁筛查](../docs/backstage/B01-compliance.md)

Demo（[CEX Demo](cex-demo/)）是现货交易 MVP，合规模块大部分未实现。

| 合规能力 | Demo现状 | 位置 |
|---|---|---|
| KYC 字段 | ✅ 用户带 `kyc_tier`，`unverified → L1 → L2` 逐级申请、运营审核，证件号只做格式校验并脱敏存储 | `services/identity-service/src/domain/kyc.ts` |
| KYC/KYB 状态管理 | ⚠️ KYC 由 identity-service 实现，等级决定提现限额；没有 KYB（机构认证） | `docs/domain-model.md` 第 7 节 |
| AML、Travel Rule | ❌ Demo未实现，架构文档把它列为与真实交易所的差异 | `docs/architecture.md` 第 9 节 |
| 提币人工审核 | ✅ 已有审核动作，测试用例的审核备注为 "passed aml review" | `services/wallet-service/src/__tests__/wallet-application-service.test.ts` |
| 高风险地址强制人工审核 | ⚠️ 简化 KYT：提现时按规则给目标地址打分并保存分数、等级和原因；黑名单（制裁 / 被盗资金 / 混币，带演示种子）直接拦截，已在队列中的提现自动拒绝并解冻；混币等高风险标签强制两名运营复核；运营后台可按风险等级筛选。没有真实 KYT 供应商和多跳资金溯源 | `services/wallet-service/src/domain/withdrawal-risk.ts`；`docs/security.md` 第 2.7 节 |
| KYC/AML 供应商接入 | ❌ Demo未实现，KYC 不接任何第三方核验 | `docs/security.md` 第 1.2 节 |

如果要补齐，建议按以下顺序：

1. 在 identity-service 增加 KYC 状态机（4.1 节），状态变更写审计事件。
2. 把 wallet-service 的规则评分接到真实 KYT 数据源，制裁名单改为定期同步（OFAC 等），并为命中记录生成合规告警。
3. 新增异步交易监控消费者，订阅充值、提币、成交事件，输出告警表。
4. 新增案件表：告警 → 案件 → 结论 → 报告编号。
5. Travel Rule 网关作为 wallet-service 的前置检查，先支持"自托管地址声明"。

### [B02 平台安全防护](../docs/backstage/B02-platform-security.md)

| 本篇概念 | Demo位置 | 实现情况 |
|---|---|---|
| 运营后台 RBAC、职责分离 | [`services/identity-service/src/domain/rbac.ts`](cex-demo/services/identity-service/src/domain/rbac.ts) | 已实现。`ops_reviewer`（审核提币）和 `ops_finance_operator`（执行账本）是不同角色；`ops_admin` 仍拥有全部权限 |
| 运营操作审计 | [`apps/ops-console/sql/001_schema.sql`](cex-demo/apps/ops-console/sql/001_schema.sql) 的 `ops_action_audit_logs` 表；[`apps/ops-console/src/domain/action-audit.ts`](cex-demo/apps/ops-console/src/domain/action-audit.ts) | 已实现。审计写入普通 Postgres 表，不是 WORM 存储 |
| 服务间鉴权 | [`services/identity-service/src/http/internal-service-auth.guard.ts`](cex-demo/services/identity-service/src/http/internal-service-auth.guard.ts) | 已实现 HMAC 共享密钥鉴权，覆盖 identity / wallet / ledger / order / risk / settlement / blockchain-indexer / custody-adapter，均带调用方白名单；所有服务默认监听 `127.0.0.1`。尚未升级到 mTLS |
| 网关审计与限流 | [`services/api-gateway/src/http/api-gateway-audit.interceptor.ts`](cex-demo/services/api-gateway/src/http/api-gateway-audit.interceptor.ts)、[`api-gateway-rate-limit.guard.ts`](cex-demo/services/api-gateway/src/http/api-gateway-rate-limit.guard.ts) | 已实现；客户端 IP 默认取 socket 对端地址，仅在 `GATEWAY_TRUST_PROXY=true` 时信任 `X-Forwarded-For`（[`client-ip.ts`](cex-demo/services/api-gateway/src/http/client-ip.ts)） |
| 安全基线与紧急开关 | [`docs/security.md`](cex-demo/docs/security.md) 第 2、4 节（紧急开关见第 2.11 节）；[`services/risk-service/src/application/control-switch-service.ts`](cex-demo/services/risk-service/src/application/control-switch-service.ts) | 已编写，按代码列出已实现的控制和缺口。紧急开关：单市场暂停（市场 `halted`）、全站 / 单资产提币暂停、API 写入冻结，开关权限 `ops.controls.manage` 只给 `ops_admin`，每次变更必填原因并写审计；对账不平时自动暂停单资产提币。变更单（开关的双人审批）流程未实现 |
| 威胁模型 | [`docs/security.md`](cex-demo/docs/security.md) 第 3 节 | 已编写。按资产列出威胁、现有缓解和真实 CEX 的做法；第 4 节把"`custody-adapter` 从环境变量读私钥 / 助记词"列为最高风险缺口 |
| 签名策略引擎、MPC/HSM、意图校验 | — | 未实现。`custody-adapter` 仍可用环境变量中的私钥直接签名 |
| 四眼审批、JIT、PAM | [`docs/security.md`](cex-demo/docs/security.md) 第 2.7 节 | ⚠️ 只有提现大额双人审批（超过分资产阈值需两名不同运营批准，同一人不能批两次）；JIT、PAM 未实现 |

关键观察：Demo只对超过阈值的大额提现做双人审批，阈值以下单人审批即可推进广播。这正是本篇第 4.5 节四眼原则要解决的问题。

### [B03 账户安全风控](../docs/backstage/B03-account-security.md)

| 本篇概念 | Demo位置 | 实现情况 |
|---|---|---|
| TOTP 2FA | [`services/identity-service/src/domain/totp.ts`](cex-demo/services/identity-service/src/domain/totp.ts) | 已实现 |
| 密码哈希 | [`services/identity-service/src/domain/password.ts`](cex-demo/services/identity-service/src/domain/password.ts) | 已实现（PBKDF2） |
| 会话吊销、账户冻结 | [`services/identity-service/src/application/identity-application-service.ts`](cex-demo/services/identity-service/src/application/identity-application-service.ts) | 已实现 |
| API Key 签名校验 | [`services/api-gateway/src/http/api-key-signature.ts`](cex-demo/services/api-gateway/src/http/api-key-signature.ts) | 已实现 HMAC + 5 分钟时间窗、nonce 防重放、`read / trade / withdraw` scope；没有 IP 白名单 |
| 提币白名单 | [`services/wallet-service/src/application/wallet-application-service.ts`](cex-demo/services/wallet-service/src/application/wallet-application-service.ts) 的 `whitelistWithdrawalAddress` 与 `requireWhitelist` 规则 | 已实现；新增地址或修改 2FA 后有安全冷却期（`WITHDRAWAL_SECURITY_COOLDOWN_SECONDS`） |
| 登录记录、新设备提醒、设备管理 | [`services/identity-service/src/application/login-security-service.ts`](cex-demo/services/identity-service/src/application/login-security-service.ts) | 已实现：登录事件（时间 / IP / UA / 设备 ID / 结果）、新设备站内提醒、按设备吊销会话（用户在 trader-web 账户页、运营在用户详情）；设备 ID 是 trader-web 保存的随机值而不是设备指纹；新设备登录后暂停提现是可选策略（`WITHDRAWAL_NEW_DEVICE_LOCK_SECONDS`，默认关闭），没有新设备强制 2FA 挑战 |
| 撞库防护 | [`services/identity-service/src/domain/login-security.ts`](cex-demo/services/identity-service/src/domain/login-security.ts) 的 `evaluateLoginLock` | 已实现：连续 5 次密码 / 动态码错误锁定 5 分钟（按账户计，可配置）；没有按 IP 的限速和验证码 |
| 会话存储风险 | [`docs/security.md`](cex-demo/docs/security.md) 第 2.4 节 | 已缓解：token 由 Web Host / BFF 写入 `HttpOnly; SameSite=Strict` Cookie，页面脚本读不到；写操作走 double-submit CSRF。仍没有 CSP 等安全响应头 |
| 风险评分、挑战升级、Passkey | — | 未实现 |

关键观察：Demo早期把 token 放在 `localStorage`，恶意浏览器扩展可直接读取，正是本篇"恶意插件"剧本的现实版本；现在改为 HttpOnly Cookie 后页面脚本读不到 token，但扩展仍可在页面里代用户发起操作，所以敏感操作还需要 2FA 等二次确认。

### [B04 系统对账（全链路）](../docs/backstage/B04-reconciliation.md)

Demo（`CEX Demo`）实现了 R1–R4 的一部分、订单冻结 ↔ 账本冻结对账、定时对账与按币种的提币熔断、提币在途的超时清理，以及一个简化版 R5（钱包 vs 账本逐币种覆盖率对账，覆盖率不足只告警 P1、不接熔断）和储备金证明。R6–R8 未实现。

| 本章概念 | Demo实现 | 状态 |
|---|---|---|
| R4 流水 ↔ 快照 | `ledger-service` 的 `reconcile-balances` 脚本：对每个 `(account_id, asset_code)`，用 `ledger_entries` 净额减去活跃 `balance_locks`，得到期望可用和期望冻结，与 `balances` 快照比较；差异原因为 `available_mismatch` / `locked_mismatch` / `total_mismatch` | 已实现 |
| 单账户定位 | `replay-account` 脚本：按时间序回放 `entry_credit`、`entry_debit`、`lock`、`release`、`consume`，输出每一步后的余额，并与快照比较 | 已实现 |
| 对账告警阈值 | `check-alerts` 中 `LEDGER_ALERT_MAX_BALANCE_MISMATCHES`、负余额、超时锁等阈值；ops-console 把对账差异、负余额定为 P1 | 已实现 |
| 订单冻结 ↔ 账本冻结 | `ledger-service` 的 `order-lock-reconciliation.ts`：对每个账户 + 币种，比较「order-service 的未成交部分冻结 + 账本快照中尚未消耗的成交」与账本 `spot_order` 冻结；刚下单 / 刚成交 / 恢复中的委托按在途处理（第 5.4 节的「能被在途清单解释」） | 已实现 |
| 定时对账 | `ledger-service` 的 `reconciliation-job.ts`：每 `RECONCILIATION_INTERVAL_SECONDS`（演示栈 30 秒）跑余额对账 + 订单冻结对账，结果写入 `ledger_reconciliation_runs`，ops-console「账本对账」展示历史 | 已实现 |
| 熔断：对账不平就停提币 | `reconciliation-breaker.ts`：余额对账不平立即暂停该币种提币；订单冻结不一致需同一委托连续 2 轮才触发，首轮只告警 P2；经 `risk-service` 紧急开关自动暂停（来源「对账熔断」）并告警 P1；恢复必须人工，且要有一轮一致的对账（第 5.4 节最后一条）。故障实验室可注入差额演示 | 已实现。对账任务失败时Demo按「部分完成 / 失败」告警，不按不平处理（未 Fail-Closed） |
| 对账 HTTP 接口 | `GET/POST /api/v1/ledger/ops/reconciliation`、`/ops/replay` | 已实现 |
| R2 成交 ↔ 结算 | `settlement-service` 按市场维护消费者检查点；`executionSequence` 小于检查点、或相等且 `replayCursor` 不大于检查点时按重复处理；出现断档时抛出 `SETTLEMENT_EVENT_SEQUENCE_GAP`；支持 `trade-executed/replay` | 已实现 |
| R5（简化）钱包 ↔ 账本 | `wallet-service` 的 `GET /api/v1/wallet/treasury/reconciliation`：逐币种比较链上储备（充值地址 + 热钱包 + 冷钱包 + 在途内部转账，来自 treasury 记录）与 `ledger-service` 用户负债（`GET /ops/liabilities`，扣除已广播未确认的在途提现），输出储备率、盈余与 `covered` / `shortfall`；ops-console「钱包与储备金」页展示。与真实 R5 的差别：持仓来自 treasury 自己的转账记录而不是节点 / 索引器读取的地址余额，且是覆盖率检查（储备 ≥ 负债）而非逐笔相等 | 已实现（简化） |
| 对外快照（5.3 节 PoR） | ops-console 生成储备金证明快照（Merkle 根 + 逐币种储备率），用户在 trader-web「资产 → 储备金证明」自行验证叶子；叶子数据来自账本用户负债（`GET /ops/liabilities/users`） | 已实现（无 zk 证明） |
| R1 订单 ↔ 撮合 | `order-service` 的 `getAnomalies`：发现 `engine_missing_open_order`、`engine_orphan_order`、`db_open_order_without_resting_quantity`；`replay-engine` 用数据库中的挂单重建订单簿 | 已实现 |
| 提币在途超时 | `wallet-service` 的 `reconcile-stale-withdrawals`：默认 30 分钟，待审的拒绝，已批准的重新广播 | 已实现 |
| 运营入口 | `ops-console` 提供财务对账、账户 replay 页面 | 已实现 |
| R6 / R7 / R8、双人审批调账 | — | 未实现 |

相关文件：

- [ledger-ops.ts](cex-demo/services/ledger-service/src/application/ledger-ops.ts)（`buildBalanceReconciliationReport`、`buildAccountReplayReport`）
- [ledger-ops-reporter.ts](cex-demo/services/ledger-service/src/infrastructure/ledger-ops-reporter.ts)（读取快照、流水净额、活跃锁的 SQL）
- [reconcile-balances.ts](cex-demo/services/ledger-service/src/scripts/reconcile-balances.ts)、[replay-account.ts](cex-demo/services/ledger-service/src/scripts/replay-account.ts)
- [settlement-application-service.ts](cex-demo/services/settlement-service/src/application/settlement-application-service.ts)（序号断档检测）
- [order-ops-service.ts](cex-demo/services/order-service/src/application/order-ops-service.ts)（订单 ↔ 撮合异常、`replayEngineBook`）
- [wallet-ops-service.ts](cex-demo/services/wallet-service/src/application/wallet-ops-service.ts)（`reconcileStaleWithdrawals`）
- [reconciliation-job.ts](cex-demo/services/ledger-service/src/application/reconciliation-job.ts)、[order-lock-reconciliation.ts](cex-demo/services/ledger-service/src/application/order-lock-reconciliation.ts)、[reconciliation-breaker.ts](cex-demo/services/ledger-service/src/application/reconciliation-breaker.ts)（定时对账、订单冻结对账、熔断）
- [treasury-policy.ts](cex-demo/services/wallet-service/src/domain/treasury-policy.ts)（`computeTreasuryHoldings`、`buildReserveReconciliation`）、[ledger-liabilities.ts](cex-demo/services/ledger-service/src/application/ledger-liabilities.ts)（用户负债）
- [ledger-service-design.md](cex-demo/docs/ledger-service-design.md) 第 11 节、[troubleshooting.md](cex-demo/docs/troubleshooting.md) 第 6.4 节

排障顺序（来自Demo排障文档）：先跑只读检查（`reconcile-balances`），再用 `replay-account` 区分单账户问题和历史回填问题；**不直接手改余额快照或状态列**；最后才做 backfill 或人工补记。这和本章第 4 节的原则一致。

> 💡 注意：`reconcile-balances` 的 `LEDGER_RECONCILE_FAIL_ON_MISMATCH` 默认为 `true`，发现差异时进程退出码为 1，适合接入外部定时任务做"不平即告警"。服务内的定时对账任务则直接接到了提币开关（对账熔断）。

### [B05 业务风控](../docs/backstage/B05-business-risk.md)

Demo（`CEX Demo`）的风控以**交易前**校验和撮合内的自成交预防为主，另有一个事后的市场监控批量扫描；没有营销反作弊和信用风险。

| 本章概念 | Demo实现 | 状态 |
|---|---|---|
| 价格保护带 | `risk-service` 校验价格偏离参考价上限；参考价来自本地配置（`RISK_REFERENCE_PRICE_BTC_USDT` 等） | 已实现（简化） |
| 下单规则 | `risk-service` 校验最小数量、价格 / 数量 step、可用余额；Post-Only 仅限 GTC 限价单；止损单的触发价必须在参考价偏离上限内、止损限价的委托价相对触发价也受同一上限约束 | 已实现 |
| 自成交预防 STP | 撮合引擎按账户 ID（`owner_id`）阻止同一账户的买卖单互相成交，模式 `expire_taker`（默认）/ `expire_maker` / `expire_both`；下单时可传 `stpMode`，被过期的订单在历史委托中显示原因（`engines/matching-engine/src/main.rs`、`services/order-service/src/application/order-application-service.ts`） | 已实现（按账户；未实现按用户组 / 关联账户） |
| 市场监控（幌骗 / 对敲 / 拉盘） | `risk-service` 每分钟从 `order-service` 读取成交与快撤单窗口（`GET /api/v1/surveillance/activity`），检测对敲 / 自成交、成交集中、幌骗、价格异动（`src/domain/surveillance.ts`），告警带证据并在 ops-console「市场监控」确认 / 忽略（备注必填、审计）；做市商账户只标注不告警。同账户自成交已被 STP 在撮合内阻止，对敲检测作为事后兜底（同一用户跨账户的成交） | 已实现（简化：按同一用户判断，未用登录设备 / IP 做关联图；批量扫描而非流式） |
| 营销反作弊、关联图 | — | 未实现（Demo没有营销活动） |
| 信用风险 / 保险基金 | — | 未实现（Demo只有现货） |
| 风险参数治理 | 参数通过环境变量配置（市场监控阈值为 `RISK_SURVEILLANCE_*`），无审批流程 | 未实现 |

相关文件：[services/risk-service/README.md](cex-demo/services/risk-service/README.md)、[risk-application-service.ts](cex-demo/services/risk-service/src/application/risk-application-service.ts)、[surveillance.ts](cex-demo/services/risk-service/src/domain/surveillance.ts)、[surveillance-service.ts](cex-demo/services/risk-service/src/application/surveillance-service.ts)。

> 💡 注意：想亲手触发告警，可以在交易前台反复挂出大额买单后几秒内撤销（幌骗；自买自卖会先被 STP 拦下，不会成交），再到 ops-console「市场监控」点「立即扫描」，步骤见 [使用手册 08](cex-demo/docs/manual/08-ops-trading-and-ledger.md)。`order-service` 的成交记录带 `executionSequence` 和 `replayCursor`，可以按市场有序回放，是做流式监控所需的"有序订单流"。

### [B06 资金与流动性管理：金库运营、敞口对冲与挤兑压力测试](../docs/backstage/B06-treasury-liquidity.md)

Demo（[CEX Demo](cex-demo/)）实现了一个最小的金库运营模块：wallet-service 的 treasury 记录冷热分层持仓，按水位提出调拨并走运营审批，做逐币种储备率对账并生成储备金证明。

| 金库能力 | Demo现状 | 位置 |
|---|---|---|
| 平台账户分类 | ✅ 账户类型包含 `fee`、`opening_balance` 等；`hot_wallet`、`cold_wallet`、`withdrawal_pending` 仍是保留类型——链上持仓刻意不记入账本，由 treasury 单独记录，账本只记用户负债 | `packages/domain/src/index.ts`、`docs/ledger-service-design.md` 第 4 节 |
| 热冷分层 | ✅ 充值地址 / 热钱包 / 冷钱包三层持仓，提现从热钱包付出，内部转账广播到确认之间计为"在途"。冷钱包没有真正的离线签名（演示中同样经 custody-adapter 广播） | `services/wallet-service/src/domain/treasury-policy.ts`、`docs/architecture.md` 第 5.4 节 |
| 归集 | ✅ 已入账充值按 (充值地址, 币种) 归集到热钱包；模拟器每 10 个块触发，运营也可「立即归集」 | `services/wallet-service/src/application/treasury-service.ts`（`runSweeps`） |
| 水位与调拨审批 | ✅ `TREASURY_HOT_WALLET_WATERMARKS` 每币种上下限；高于上限提出 热→冷、低于下限提出 冷→热（回到上下限中点）；提案需另一名有提现审核权限的运营批准，批准前校验来源余额，动作写操作审计 | ops-console「钱包与储备金」页、`apps/ops-console/src/application/treasury-application-service.ts` |
| 逐币种储备率 | ✅ 储备（充值地址 + 热 + 冷 + 在途）÷ 净负债（账本用户负债 − 在途提现），另给热钱包覆盖率 | `GET /api/v1/wallet/treasury/reconciliation`、`services/ledger-service/src/application/ledger-liabilities.ts` |
| 储备金证明 | ✅ Merkle 树 + 用户在交易前台自行验证；无 zk 证明 | `services/wallet-service/src/domain/proof-of-reserves.ts`、`apps/trader-web/src/client/lib/por-verify.ts` |
| 账本对账 | ✅ `reconcile-balances` 脚本和运维接口，不受 treasury 影响 | `services/ledger-service/README.md` |
| 陈旧提币清理 | ✅ `reconcile-stale-withdrawals` | `services/wallet-service/README.md` |
| 对账频率 | ⚠️ 钱包 vs 账本对账按需查询（运营页每 15 秒刷新），没有定时任务、告警和"储备不足即停提现"的熔断 | — |
| 分级审批、白名单变更审批、跨链再平衡、敞口对冲、压力测试 | ❌ 未实现 | — |

演示简化：演示账户和做市商的余额来自期初权益账户，`demo:bootstrap` 与模拟器的"储备补足"把这部分记为平台资金上链（genesis），让储备率保持在 120% 左右；设置 `DEMO_RESERVE_KEEPER_ENABLED=false` 可以观察储备不足。

如果要继续补齐，建议按以下顺序：

1. 给钱包 vs 账本对账加定时任务与告警，储备率低于 100% 时自动暂停对应币种提现（见 [B04](../docs/backstage/B04-reconciliation.md) 第 5.4 节）。
2. 按金额分级审批冷→热调拨，加入时间窗和单笔上限。
3. 写一个离线脚本：读取负债和热钱包余额，按情景表输出耗尽时间。

### [B07 应急响应](../docs/backstage/B07-incident-response.md)

| 本篇概念 | Demo位置 | 实现情况 |
|---|---|---|
| 告警分级 P1/P2/P3 | [`apps/ops-console/src/domain/alert-severity.ts`](cex-demo/apps/ops-console/src/domain/alert-severity.ts) | 已实现。每条告警按规则表定为 P1（资金正确性 / 资金出口）、P2（核心链路受损）、P3（非核心），运营总览与系统运维按级别排序、着色、计数；没有值班呼叫 |
| 处置原则 | [`docs/troubleshooting.md`](cex-demo/docs/troubleshooting.md) 第 6.4 节 | 没有成文的事件处置原则；排障文档要求先跑只读检查再修复，不直接手改余额或状态列 |
| 紧急开关 | [`services/risk-service/src/application/control-switch-service.ts`](cex-demo/services/risk-service/src/application/control-switch-service.ts)、[`apps/ops-console/client/features/controls-tab.tsx`](cex-demo/apps/ops-console/client/features/controls-tab.tsx) | 已实现：单市场交易开关（`halted`）、全站提币暂停、单资产提币暂停、API 写入冻结（撤单放行）；必填原因、二次确认、审计，仅 `ops_admin` 可操作 |
| 对账异常处置 | [`docs/ledger-service-design.md`](cex-demo/docs/ledger-service-design.md) 第 11 节 | 有余额对账、单账户回放、阈值告警，以及定时对账 + 对账熔断：不平时自动暂停相关资产提币（决策树 A5）并告警 P1，恢复需人工且要一轮一致的对账 |
| 排障顺序与 runbook | [`docs/troubleshooting.md`](cex-demo/docs/troubleshooting.md) 第 1、6 节 | 已编写。先看日志和状态，先只读检查，再修复 |
| 运营操作审计 | [`apps/ops-console/src/domain/action-audit.ts`](cex-demo/apps/ops-console/src/domain/action-audit.ts) | 已实现。事件中的人工操作可追溯 |
| 账户冻结 | [`services/identity-service/src/application/identity-application-service.ts`](cex-demo/services/identity-service/src/application/identity-application-service.ts) | 已实现 `freezeUser` / `unfreezeUser` |
| 战情室工具、复盘模板 | — | 未实现（自动熔断见上方「对账异常处置」） |

关键观察：Demo的"上线前检查清单"包含"紧急开关验证通过"和"对账流程演练完成"。这对应本篇第 4.7 节的演练要求。

### [B08 实时风控平台工程](../docs/backstage/B08-risk-platform.md)

Demo的风控是**单个同步服务**，没有事件总线、特征库和模型。

| 本篇概念 | Demo位置 | 实现情况 |
|---|---|---|
| 交易前同步检查 | [`services/risk-service/src/application/risk-application-service.ts`](cex-demo/services/risk-service/src/application/risk-application-service.ts) 的 `validateSpotOrder` | 已实现：价格偏离、最小数量、可用余额；每项检查写入 `checks` 数组，相当于简化的原因码 |
| 决策结果结构 | [`services/risk-service/src/domain/types.ts`](cex-demo/services/risk-service/src/domain/types.ts) 的 `RiskCheckResult` | 只有 `passed` / `failed` 两种状态，没有挑战、暂扣、审核 |
| 风控故障时的默认动作 | [`services/order-service/src/infrastructure/http-risk-client.ts`](cex-demo/services/order-service/src/infrastructure/http-risk-client.ts) | 风控返回非 2xx 时抛出 `RISK_UPSTREAM_FAILED`，订单不创建。效果上是 Fail-Closed，但没有显式的降级配置 |
| 速度计数器 | [`services/api-gateway/src/infrastructure/redis-rate-limiter.ts`](cex-demo/services/api-gateway/src/infrastructure/redis-rate-limiter.ts) | Redis `INCR` 固定窗口计数。只用于限频，没有作为风控特征输出 |
| 决策日志 | [`services/api-gateway/src/http/api-gateway-audit.interceptor.ts`](cex-demo/services/api-gateway/src/http/api-gateway-audit.interceptor.ts) | 记录请求、状态码和 `durationMs`。没有特征快照、规则版本、模型版本 |
| 转审核与案件 | [`services/wallet-service/src/application/wallet-application-service.ts`](cex-demo/services/wallet-service/src/application/wallet-application-service.ts) 的 `requestWithdrawal` | 每笔提币初始 `reviewStatus` 都是 `pending`，即全部人工审核。没有风险分排序、案件合并、结论码 |
| 事件总线、在线 / 离线特征库、图引擎 | — | 未实现 |
| 规则 DSL、版本、影子、金丝雀、回测 | — | 未实现；风控参数来自环境变量和 `SPOT_MARKET_DEFINITIONS` |
| 模型服务、漂移监控 | — | 未实现 |

如果要在Demo上补齐，建议顺序：

1. 让 `RiskCheckResult` 支持五种动作和原因码。
2. 在 risk-service 写决策日志：输入、检查结果、参数版本。
3. 把 api-gateway 的计数器扩展为按用户、按 IP 的速度特征，供提币风控读取。
4. 在 wallet-service 提币入口调用风控打分。低分自动放行，高分转审核，替代"全部人工"。
5. 为风控参数加版本号和影子开关，再做回测脚本（读决策日志重放）。

### [B09 全球监管与牌照对照：一个交易所，多套规则](../docs/backstage/B09-global-licensing.md)

Demo（[CEX Demo](cex-demo/)）是单实体现货 MVP，没有多辖区设计。

| 能力 | Demo现状 | 位置 |
|---|---|---|
| 用户 KYC 等级 | ⚠️ 领域模型有 `kyc_level` 字段，没有国家或实体字段 | `docs/domain-model.md` |
| 风控与合规需求 | ⚠️ 已实现余额、价格保护、市场暂停、提现规则（限额、KYC 分级、白名单、冷却期、双人审批）、限频、账户冻结；没有按国家或辖区区分的规则 | `docs/security.md` 第 2 节 |
| 实体路由、地理围栏 | ❌ 未设计 | — |
| 产品可用性矩阵 | ❌ 未设计；交易对没有"按辖区可见"属性 | — |
| 上币状态机与下架流程 | ❌ 未设计 | — |

如果要补齐，建议按以下顺序：

1. 在用户表增加 `residence_country`、`legal_entity_id`、`client_category`（零售 / 专业 / 机构）。
2. 新增配置表 `product_availability(entity_id, product, client_category, status)`，由后端在下单、充值、申购入口统一检查。
3. 交易对增加 `listing_status` 与 `entity_visibility`，支持"只允许提币"状态。
4. 用户每次接受条款，记录 `entity_id` 和条款版本号。

### [B10 税务信息报送与数据隐私](../docs/backstage/B10-tax-privacy.md)

Demo（[CEX Demo](cex-demo/)）是现货交易 MVP，没有税务报送和隐私治理模块。

| 能力 | Demo现状 | 位置 |
|---|---|---|
| 用户身份字段 | ⚠️ `identity_users` 只有 `email`、`status` 等字段，邮箱为明文列；没有 KYC、税务字段 | `services/identity-service/sql/001_schema.sql` |
| TOTP 密钥存储 | ⚠️ `user_two_factor_profiles.secret` 为 `text` 列，未做字段级加密 | `services/identity-service/sql/001_schema.sql` |
| API Key 存储 | ✅ 只存 `token_hash` 和前缀，不存明文 | `services/identity-service/sql/001_schema.sql` |
| 运营 RBAC | ✅ 已有角色与权限表，例如 `ops.users.read`；⚠️ 没有字段掩码和按工单授权 | `services/identity-service/src/domain/rbac.ts` |
| 审计字段 | ✅ `ops_action_audit_logs` 记录操作人、角色、所用权限、目标、请求 / 响应；`withdrawal_audit_logs` 另有 `trace_id` 和前后快照；⚠️ 只审计运营写操作，未覆盖"查看个人资料"等只读访问 | `apps/ops-console/sql/001_schema.sql`、`docs/security.md` 第 2.8 节 |
| 税务事件来源 | ⚠️ `ledger_journals.business_type` 可作为交易分类的输入；分录不记录法币估值 | `services/ledger-service/sql/001_schema.sql` |
| 删除与留存 | ❌ 外键使用 `on delete cascade`，删除用户会连带删除 2FA 资料；没有留存计划和法律保全 | `services/identity-service/sql/001_schema.sql` |
| 账本假名化 | ✅ 账本按 `account_id`、`user_id`（UUID）记账，不含姓名和邮箱，天然适合假名化 | `services/ledger-service/sql/001_schema.sql` |

如果要补齐，建议按以下顺序：

1. 在 identity-service 为邮箱和 TOTP 密钥增加字段级加密，密钥来自 KMS。
2. 新增 tax-profile 表：辖区、TIN 令牌、自我证明状态和有效期（3.3 节）。
3. 新增只读的税务事件任务：消费账本分录，按 `business_type` 映射（4.2 节），并实现 4.6 节的数量守恒检查。
4. 把"查看用户资料"写入审计日志，实现 PV-03 告警。把 `on delete cascade` 改为软删除 + 留存计划 + 法律保全标记（7.1 节）。

### [B11 安全工程：把安全做进研发与运营](../docs/backstage/B11-security-engineering.md)

| 本篇概念 | Demo位置 | 实现情况 |
|---|---|---|
| 威胁建模（STRIDE 风格的表格） | [`docs/security.md`](cex-demo/docs/security.md) 第 3 节 | 已编写。按资产列出威胁、现有缓解和真实 CEX 的做法，覆盖客户会话、登录凭证、API Key、2FA 种子、运营审批、提现链路、热钱包私钥、账本、内部服务、撮合通道、行情与私有实时流、基础设施；没有逐项编号 |
| 安全验收标准与测试计划 | [`docs/security.md`](cex-demo/docs/security.md) 第 4 节 | ⚠️ 没有成文的安全验收标准和测试计划；第 4 节按风险排序列出走向真实环境前的缺口，可作为本篇第 4.6 节发布门禁的起点 |
| 密钥不进代码与日志 | [`docs/security.md`](cex-demo/docs/security.md) 第 1.2、4 节 | ⚠️ 内部签名密钥、API Key 加密主密钥、数据库口令都有公开的默认测试值；文档把"进入密钥管理系统、可轮换"列为缺口 |
| 私钥从环境变量加载 | [`services/custody-adapter/src/infrastructure/evm-provider-config.ts`](cex-demo/services/custody-adapter/src/infrastructure/evm-provider-config.ts) | 演示用实现。违反第 4.10 节密钥管理规则，`docs/security.md` 第 4 节列为最高风险缺口 |
| 网关审计日志 | [`services/api-gateway/src/http/api-gateway-audit.interceptor.ts`](cex-demo/services/api-gateway/src/http/api-gateway-audit.interceptor.ts) | 已实现。只记录 userId、apiKeyId、sessionId 等标识，不记录请求头中的签名和令牌，符合日志卫生；`path` 记录完整 URL，若查询串中带敏感参数会进入日志 |
| 服务间鉴权 | [`services/identity-service/src/http/internal-service-auth.guard.ts`](cex-demo/services/identity-service/src/http/internal-service-auth.guard.ts) | HMAC 共享密钥 + 调用方白名单，托管（[`custody-adapter`](cex-demo/services/custody-adapter/src/http/internal-service-auth.guard.ts)）与链上索引（[`blockchain-indexer`](cex-demo/services/blockchain-indexer/src/http/internal-service-auth.guard.ts)）入口也已校验，例如 `api-gateway` 直接调托管会被拒。尚未达到第 4.8 节的 mTLS |
| 依赖锁定 | [`pnpm-lock.yaml`](cex-demo/pnpm-lock.yaml) | 有锁文件。`package.json` 使用 `^` 范围，需配合冻结锁文件安装 |
| 发布与变更 | — | Demo未实现变更单、灰度和上线前检查清单 |
| CI 安全扫描、SBOM、签名构建、SIEM、金丝雀令牌、红队 | `.github/workflows/ci.yml` | ⚠️ CI 只做构建、类型检查、单元测试和结构检查；安全扫描、SBOM 等未实现 |

关键观察：Demo已经有一份质量较高的威胁模型和验收标准，但没有 CI 把它们变成"自动阻断"。这正是 SDL 从 Level 1 走向 Level 2 的那一步：**把文档里的验收标准变成门禁里的检查项**。

### [B12 交易所安全事故案例库](../docs/backstage/B12-incident-casebook.md)

| 本篇攻击路径 | Demo现状 | 位置 |
|---|---|---|
| P1 热钱包密钥泄露 | `custody-adapter` 的 `evm-hot-wallet` provider 可从环境变量读取私钥或助记词，直接签名广播（默认走 mock provider）；安全文档把它列为最高风险缺口 | [`docs/security.md`](cex-demo/docs/security.md) 第 3、4 节、`services/custody-adapter/src/infrastructure/evm-provider-config.ts` |
| P2 签名流程操纵 | 未实现签名策略引擎和意图校验 | 同上，见 [B02 第 8 节](../docs/backstage/B02-platform-security.md) |
| P3 / P4 内部人员与员工 | 大额提现（超过分资产阈值）需两名不同运营批准，阈值以下单人审批即可推进广播；运营强制 2FA，会话 token 放在 HttpOnly Cookie | `services/wallet-service/src/domain/withdrawal-policy.ts`、`apps/ops-console/src/http/ops-session-cookie.ts` |
| P5 账户批量接管 | 已有提币 2FA、白名单、额度与 KYC 分级限额、安全冷却期，API Key 有 nonce 防重放；没有设备绑定和异常登录检测 | `services/identity-service/src/application/identity-application-service.ts`、`services/api-gateway/src/http/api-key-signature.ts` |
| P8 内部挪用 | 账本只追加、可重放，有对账命令 | 见 [13 章第 6 节](../docs/chapters/13-reliability-security-incidents.md) |
| L5 止血开关 | 单市场暂停（市场 `halted` 拒绝新单）、全站 / 单资产提币暂停、API 写入冻结（只读模式）；账本对账不平时自动暂停该资产提币 | `services/risk-service/src/application/control-switch-service.ts`、`services/ledger-service/src/application/reconciliation-breaker.ts`、`docs/security.md` 第 2.11 节 |

关键观察：Demo最突出的两个缺口，环境变量私钥和阈值以下单人审批，分别对应本篇 P1 和 P3/P4。也就是说，案例库里出现最多的两类路径，正是Demo接入真实资产前必须补齐的缺口。
