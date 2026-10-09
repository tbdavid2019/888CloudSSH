# Changelog

888CloudSSH 的變更紀錄使用日期，不使用版本號。

## 2026-10-09

### Added

- 於登入與連線入口處新增「Hugging Face Chat 免登入一鍵體驗」卡片（`quick-trial-card` / `quick-hf-chat-btn`）：
  - 登入入口一鍵直連：位於登入介面卡片最上方（全面相容 Email OTP、Passkey、GitHub 登入或匿名連線等模式），任何訪客皆可免登入、免填帳號密碼，一鍵直連 `chat.hf.co:22` 即時體驗 Hugging Face AI 終端。
  - 後端試用授權與白名單安全防護：
    - `/api/ssh` 支援 `trial=chat.hf.co` 試用標記：即使在強制要求登入（`REQUIRE_AUTH` / `REQUIRE_GITHUB_AUTH`）的環境中，仍安全放行對 `chat.hf.co` 的試用連線。
    - `SSHSessionDO` 透過 `x-ssh-trial` 標頭實施嚴格目標主機校驗，若試用連線嘗試存取非 `chat.hf.co` 主機立即回傳 `1008 Forbidden` 並關閉連線，杜絕任何繞過登入存取內部或私有主機的風險。
  - 完整多國語系適配：繁體中文、簡體中文與英文同步提供 `auth.hfChatTitle`、`auth.hfChatFreeBadge`、`auth.hfChatTrialDesc` 與 `auth.hfChatTrialAction`。
  - 測試案例覆蓋：新增前端體驗卡片元件與點擊直連邏輯單元測試，以及後端強制登入模式下試用穿透與非法目標主機阻斷的安全性測試。
- 支援匿名與免密 SSH 連線（如 Hugging Face 終端 `ssh chat.hf.co` 等公共服務）：
  - 前端連接介面（`auth-form.ts`）：
    - 主機位址欄位支援智慧指令解析（`parseSSHDestination`）：自動解析並相容 `ssh [user@]host [-p port]`、`user@host`、`host:port` 及 `[ipv6]:port`，自動填入主機、連接埠與使用者名稱。
    - 使用者名稱與密碼改為選填：移除使用者名稱輸入框的 `required` 限制，並在標籤加上「可選」提示；密碼模式不再強制攔截空密碼，允許匿名或免密帳號直接發起連線。
    - 標籤頁與最近連線記錄展示優化：使用者名稱為空時自動隱藏 `@` 前綴，乾淨展示主機位址。
    - 多國語系同步：補齊繁體中文、簡體中文與英文的 `auth.validationHost` 詞條。
  - 後端與 Durable Objects（`durable-object.ts` / `ssh-session.ts`）：
    - `SSHSessionDO` 放寬憑據門禁：解除對使用者名稱與密碼的強制非空要求，僅保留主機位址與私鑰模式下的私鑰校驗，將未提供的憑據自動歸一化為空字串。
    - `SSHSession` 認證狀態機優化：未輸入密碼時智慧調整認證優先序，若伺服器支援 `keyboard-interactive` 則優先發起，適配 `chat.hf.co` 即時接受互動認證並指派 PTY 開啟 Shell 的協議行為。
  - 自動化測試：補齊前端指令解析、免密選填與後端匿名連線狀態機完整測試案例。
- 更新 `README.md` 與文件視覺資源：
  - 新增「免登入即時體驗 (Instant Demo)」專題章節，介紹 Hugging Face AI 終端一鍵直連、匿名 SSH 連線、智慧指令語法解析與邊緣白名單防護機制。
  - 附上登入頁試用入口（`quick-trial-login-zh.png`、`quick-trial-login-en.png`）與連線終端（`quick-trial-terminal.png`）高解析實機截圖與視覺說明。
  - 修復試用卡片標題與免登入標籤在各語系下的折行問題，加入 `whitespace-nowrap` 確保各語系排版美觀工整。

### Fixed

- 修復 Mac 觸控板雙指與滑鼠滾輪滾動終端歷史輸出問題（像 Ghostty/原生終端一樣平滑操作）：
  - 核心問題診斷：xterm.js 6.0 內部滾動處理在 macOS 觸控板發出高頻像素級微步事件（`deltaMode: 0`, `deltaY` ~ 1px–5px）時，因直接截斷整數（`Math.trunc`）導致幾乎所有微步全被捨棄為 0，且內建動畫與 macOS 觸控板慣性產生衝突，導致長輸出時雙指向上滑動無法看到上方內容。
  - 支援全螢幕 TUI 交互應用（如 `chat.hf.co` 等在正常緩衝區原位刷新、`baseY=0` 的終端應用）：原先僅在備用緩衝區轉譯按鍵，導致 `chat.hf.co` 在 normal 緩衝且無本地歷史行時調用 `scrollLines()` 空轉吞沒事件；現升級為在無本地歷史行（`baseY=0`）或備用緩衝區時，將滾輪滑動智慧轉譯為上下方向鍵序列（或 Shift/快速滑動時轉譯為 PageUp/PageDown）發送給遠端應用，完美實現 `chat.hf.co` 與 TUI 應用的順暢滾動。
  - 觸控板與滾輪累加平滑滾動（`setupWheelScrolling`）：
    - 透過 `terminal.attachCustomWheelEventHandler` 建立微步累加器（`wheelRemainder`），精準記錄每一次觸控板微步移動，跨事件平滑累計並按字元行高滾動（`scrollLines`），不遺失任何像素。
    - 停頓超時（>150ms）或手勢換向時自動重置累加器；抵達歷史頂端或底部時鉗位累加值，徹底杜絕換向時的滾動死區。
    - 支援 `Shift` 鍵 3x 加速與 `Alt` 鍵 5x 加速滾動。
    - 智慧過濾 macOS 雙指捏合縮放手勢（`ctrlKey=true`），避免 pinch-to-zoom 誤觸終端行滾動。
    - 在備用螢幕緩衝區（alternate buffer，如 `less`、`vim`、`man` 等應用且未開啟遠端滑鼠協議時）自動轉譯為上下方向鍵序列（`\x1b[A` / `\x1b[B` 或 application cursor mode `\x1bOA` / `\x1bOB`），實現像 Ghostty 一樣自然的翻頁體驗。
    - 若遠端應用開啟了滑鼠協議追蹤（如 `tmux` 開啟滑鼠、`htop` 等），放行原生滑鼠協議上報。
  - 實現終端高可見度主題滾動條（Scrollbar）：
    - 建立 `has-scrollback` 狀態追蹤（監聽 `onScroll`、`onLineFeed`、`clearBuffer` 等事件），在存在歷史輸出時常駐顯示半透明（55% 透明度）的滾動條軌道與滑塊，滑鼠懸浮或拖動時全亮並微增寬度。
    - 支援直接以滑鼠拖動滑塊或點擊滾動條軌道任意處跳轉至歷史輸出，徹底擺脫系統原生滾動條消失或不可見的問題。
    - 在無歷史滾動內容（如全新 Shell 或全螢幕 TUI 應用）時自動隱藏原生虛擬滾動條，保持介面簡潔。
  - 終端配置最佳化：將 `smoothScrollDuration` 設為 `0`，停用內部多影格補間動畫以消除與 macOS 系統級滑動慣性的衝突，並將滾輪敏感度設為流暢的基準值。
  - 自動化測試覆蓋：新增 `tests/e2e/terminal-wheel.spec.ts`，涵蓋 Mac 觸控板雙指向上/向下平滑滾動、雙指捏合防誤觸、備用螢幕翻頁轉譯以及 `baseY=0` TUI 應用滾輪轉譯等端到端測試。
- 修復免登入試用一鍵連線時 DOM 元素空指針錯誤：
  - 在強制登入環境（`REQUIRE_AUTH="true"`）下，登入卡片預設為 Email 登入元件，DOM 中不存在 `#password` 或 `#private-key` 元素。
  - 修復 `auth-form.ts` 中 `handleConnectHfChat` 與 `handleConnect` 連線建立後清空密碼與私鑰的邏輯，補上空值防護檢查（null-check），徹底解決 `Cannot set properties of null (setting 'value')` 異常觸發 catch 關閉標籤頁與彈出連線資訊不完整錯誤的問題。
- 最佳化登入與連線頁面 UI 字體與版面易讀性：
  - 提升登入卡片主體最小字體至 12pt (16px / `text-base`)，卡片最大寬度由 `max-w-md` 適度拓寬至 `max-w-lg`。
  - 將主機、連接埠、使用者名稱、密碼、OTP、救援碼等所有輸入框提升為 16px (12pt)，徹底避免小字體造成的閱讀與輸入疲勞；輸入框標籤提升為 14px (`text-sm font-bold`)。
  - 一鍵直連 Hugging Face 體驗卡片（`quick-trial-card`）文字、圖示與按鈕尺寸放大，文案自然換行不截斷，大幅提升點擊體驗與可讀性。

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

- 修復 Gemini OpenAI 相容 API 的多輪工具呼叫失敗：保留串流回應中的 `extra_content.google.thought_signature`，並隨後續對話原樣傳回；Agent 的 LLM 錯誤前綴也會依繁體中文、簡體中文或英文介面語系顯示。
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
