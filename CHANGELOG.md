# Changelog

888CloudSSH 的變更紀錄使用日期，不使用版本號。

## 2026-09-23

### Added

- 新增 Touch ID / Passkey (FIDO2 / WebAuthn) 硬體無密碼身分驗證支援：
  - 核心加密層：零外部依賴、純 Web Crypto 原生 ECDSA P-256 (ES256) 驗證、DER 轉 IEEE P1363 簽名標準轉換、CBOR/COSE 公鑰解析、RP ID 雜湊校驗、使用者在場 (UP) 驗證與防重放挑戰機制。
  - Durable Objects 持久化：`AccountDO` 新增 `passkeys` SQLite 表與管理路由；`AccountDirectoryDO` 新增全域 `credential_id` 映射索引與 120 秒挑戰碼快顯。
  - Worker API 路由：提供 `/api/auth/passkey/register-challenge`、`/api/auth/passkey/register`、`/api/auth/passkey/login-challenge`、`/api/auth/passkey/login`、`/api/user/passkeys`。
  - 前端使用者介面：登入頁新增「Touch ID / Passkey 快速登入」一鍵驗證；使用者空間頂部導覽列新增「Touch ID」指紋按鈕，提供管理彈窗（裝置命名、註冊、列表與刪除，全流程採用無障礙非同步彈窗）。
- 修復 `https://ssh.david888.com` 的 Open Graph、Twitter Card、SEO 與靜態資源問題：
  - 後端靜態資源服務器：支援 `/favicon.svg`、`/apple-touch-icon.png`、`/og-image.png`（1200x630 專屬社群分享卡）、`/site.webmanifest`（PWA 規範）、`/robots.txt`。
  - 補齊完整 `<head>` 標籤：`og:title`、`og:description`、`og:image`、`og:url`、`og:site_name`、`og:locale`、`twitter:card`、`canonical`、`theme-color`、以及 Schema.org JSON-LD 結構化資料。
  - 將登入區塊品牌標題改為語意化 `<h1>` 標籤，解決缺少主標題警告。
- 新增使用者自主緊急救援碼管理功能：
  - 後端提供 `GET /api/user/recovery-codes/status`（查詢剩餘有效組數）與 `POST /api/user/recovery-codes/regenerate`（作廢舊碼並重新生成 10 組全新救援碼）。
  - 前端使用者空間頂部導覽列新增「緊急救援碼」按鈕（盾牌圖示），登入使用者可隨時查看有效救援碼剩餘數量，並支援一鍵重新生成、複製全部與下載 `.txt` 備份檔。
- 更新 `README.md`：
  - 繪製完整的多層身分驗證架構圖（Mermaid 視覺化繪製瀏覽器、Cloudflare Workers、Durable Objects 與外部服務互動）。
  - 更新 Touch ID / Passkey 與 Resend 發信等最新功能介紹與環境變數說明。
- 設定 Resend API 密鑰與寄件網域 `no-reply@vip.david888.com`，全面啟用真實 Email OTP 發信。

### Fixed

- 修復 Email OTP / Passkey 帳號使用 AI Agent 時報「尚未配置 AI 接口」的問題：
  - 根本原因修復：Email / Passkey 帳號在 SQLite 中 `github_id` 為 `0`，而 AI 設定存在 `acc_xxx` 專屬分區中。過去 `SSHSession` 的 `fetchAgentAIConfig`、`memoryProvider` 與 `detectRemoteOS` 僅取 `githubId` 作為分區鍵，導致查詢了空的 `0` 分區而回傳 404。
  - 多通道憑據與分區貫穿：`SSHConnectionConfig` 與 `SSHSessionOptions` 新增 `instanceId` 與 `accountId`，在保存伺服器 Token 連接與直連 SSH 升級通道中完整傳遞已驗證分區 ID，統一透過 `getUserDBTarget()` 定位分區。
  - 單一使用者備援解密機制：`UserDBDO` 的 `handleGetAIConfig` 與 `handleGetAIConfigDecrypted` 新增單使用者保底查詢（`LIMIT 1`），確保在分區隔離環境下均能順利取得並解密 API Key。
  - 安全強化（Codex Code Review）：在 Worker 升級處理常式（Direct / Token / Resume）中強制剝離客戶端傳入的 `x-authenticated-*` 偽造標頭，僅允許由 Worker 經過 Session 驗證後注入受信任身分，杜絕身分偽造與憑據外洩風險。
- 修正 Email OTP 寄出後在測試模式自動填入驗證碼的問題，改由使用者自行輸入收到的驗證碼。
- 強化 Resend API 錯誤捕捉與日誌記錄，提升發信失敗時的可排查性。
- 修復同源檢查與 Cloudflare Edge 協議適配（`origin-check.ts`）：
  - 支援現代瀏覽器 `Sec-Fetch-Site` 優先校驗（`same-origin` 與直接存取放行，嚴格阻擋 `cross-site`）。
  - 適配 Cloudflare SSL 終止後的 `http` 內部協議與客戶端 `https` Origin 比較，避免因協議或端口格式差異誤報 HTTP 403 Forbidden。
  - 優化 Passkey 登入取消或未註冊提示文案，引導使用者先以 Email 登入後再進行裝置綁定。

## 2026-09-22

### Added

- 新增 `ALLOWED_EMAILS = "oobwei@gmail.com,ooboob@gmail.com"` 白名單設定，允許多位工作區成員使用 Email OTP 登入。
- 更新登入頁面、工作區與終端頁腳的開源倉庫與文件連結為 `https://github.com/tbdavid2019/888CloudSSH`。
- 新增繁體中文優先語言偵測與切換修復（瀏覽器偏好包含 `zh` / `zh-TW` 時自動判定為繁體中文，避免按鈕與文案預設顯示簡體中文）。
- 前端實作完整工作區 Email OTP 登入介面（`EmailLoginForm`），支援驗證碼發送、60 秒倒數計時、自動焦點切換與救援碼應急登入。
- 新增首次登入 10 組一次性應急救援碼彈窗（支援一鍵複製全部與匯出 `.txt` 文字檔備份）。
- 支援環境變數 `REQUIRE_AUTH = "true"`、`BOOTSTRAP_OWNER_EMAIL = "tbdavid2019@gmail.com"`，首頁預設直接呈現工作區登入頁面。
- 新增無密碼 Email OTP 登入基礎架構、Resend 發信與救援碼應急登入後端路由。
- 新增 `AccountDirectoryDO`、`AccountDO`、`WorkspaceDO` 三層 Durable Object 骨架與 SQLite v3 遷移。
- `AccountDirectoryDO` 內建滑動窗口 IP 頻率限制，搭配可選 Turnstile 機制，提升防濫用與高可用性。
- `AccountDO` 採用內部專屬密鑰持久化救援碼雜湊，徹底解耦與 `RESEND_API_KEY` 的不當綁定。
- 新增繁體中文 `zh-TW` 語系與台灣 IT 用語校正。
- 新增英文預設語系；語系偏好保存於 `cloudssh_locale`。
- 新增 Standard Dark 預設佈景。
- 建立獨立專案 `tbdavid2019/888CloudSSH`。
- 新增 AGPL-3.0-or-later 授權文件，僅涵蓋可識別的 888CloudSSH 新增程式碼；原始程式碼繼續依 Apache 2.0 分發。

### Fixed

- 修正安全性與隱私問題：徹底移除 `/api/config` 與登入框預填 `bootstrapEmail` 的邏輯，登入輸入框保持全空，避免對外洩漏管理員 Email。
- 修正語言切換按鈕在英文模式下錯誤指向簡體中文的問題，預設切換為繁體中文。
- 修正 `email-auth-route` 未回傳 `challenge_id` 導致驗證失敗的問題。
- 修正 `AccountDO` 與 `UserDBDO` 間的 `/internal/oauth-user` 路由與帳號 ID 解析，修復 `/api/auth/me` 1101 例外。
- 修正 `UserDBDO` 在 `handleConnectServer` 中未定義 `github_id` 變數的編譯錯誤。
- 修正登入頁頁腳文字對比度以完全符合 WCAG 2 AA 標準（通過 Playwright axe 無障礙檢查）。
- 修正 OTP 驗證流程避免因未傳遞可選 Turnstile Token 造成誤攔截。

### Changed

- README 改為 888CloudSSH 獨立專案說明，並保留原作者與歷史貢獻者致謝。
- 主題編輯器同步支援繁體中文與 Standard Dark 預設佈景。
- server memory 的繁體中文相對日期使用台灣格式。
- AGENTS.md 改用 `main` 主線與短期功能分支，並要求每次 commit 同步更新本檔案。

### Verification

- `pnpm run typecheck`（零錯誤）
- `pnpm test`（78 個測試檔、871 項測試全數通過）
- `pnpm run build:frontend`（單 bundle 內聯至 `src/worker/html.ts`）
- `pnpm run test:e2e`（89 項 Chromium/WebKit E2E 測試全數通過）
- 部署驗證：成功部署至 `https://cloudssh.oobwei.workers.dev`（Version ID: `620945f1-29b9-4bd5-966e-47556ad76d12`）
