# Proposal

## Why

888CloudSSH 目前依賴 GitHub OAuth 作為帳號入口，對個人與小型團隊使用者造成第三方帳號綁定風險。專案需要一套獨立的 Email OTP 身份系統，並以 Workspace 管理多人共用的 SSH 連線與私鑰。

## What Changes

- 新增以 Email OTP 為主的無密碼 CloudSSH 帳號登入；GitHub OAuth 改為可選、預設關閉。
- 使用 Resend API 發送登入 OTP；Turnstile 為可選 Bot 防護，後端原生具備滑動窗口頻率限制，即便未啟用或 Turnstile 故障亦能安全運作。
- 簡化註冊與准入機制：以 `BOOTSTRAP_OWNER_EMAIL` 作為首位用戶安全初始（未配置時 fail closed 阻斷公網搶佔），其餘用戶全數由 Owner/Admin 發送 Workspace 邀請信加入，免除冗餘白名單配置與孤兒帳號。
- 新增以 Email + 一次性救援碼為憑證的離線應急登入機制，供 Resend 暫時故障或使用者無法收信時使用，具備單帳號連續嘗試失敗鎖定防護。
- 規範 Session Token 命名空間前綴（`acc:<accountId>:<token>` 與 `gh:<githubId>:<token>`），確保 Worker 能單跳路由至對應 DO。
- 拆分帳號目錄與工作區儲存：引進 `AccountDirectoryDO`（全局信箱/邀請查找與 OTP 挑戰）、`AccountDO`（個人帳號/片段/主題）、`WorkspaceDO`（團隊工作區/成員/共用連線/私鑰庫/共用 TOFU 指紋/審計）。
- 第一位合格登入使用者（匹配啟動配置）自動建立預設 Workspace 並成為 Owner；Owner/Admin 可透過 Email 邀請成員加入。
- 明確 Owner、Admin、Member、Viewer 權限矩陣（Viewer 為嚴格唯讀觀察者，不具備連線發起權限）。
- 新增 Workspace 共用 SSH 連線與 Private Key Vault；支援標準 OpenSSH 未加密 PEM 格式（Ed25519/RSA/ECDSA），私鑰密文保存，僅在連線流程後端解密，嚴禁匯出或回傳前端。
- 支援包含跳板機鏈（Jump Hosts）在內的 Vault 私鑰級聯解密與 Workspace 共用已知主機指紋（TOFU），若主機指紋變更須經 Owner/Admin 審核確認。
- 保留個人私有連線與私有私鑰資料，與 Workspace 共用資料隔離；提供遺留 GitHub 帳號手動關聯與資料解密重加密遷移路徑。
- 更新登入、伺服器管理、連線、審計與 UI 文案，維持 zh-CN、zh-TW、en-US 三語 i18n 完整對齊。

## Capabilities

### New Capabilities

- `identity/passwordless-email-otp`: Email OTP、Resend 發信、可選 Turnstile + 後端原生頻率限制、BOOTSTRAP 安全初始、雙欄位救援碼應急登入、Session 命名空間與 GitHub OAuth 可選策略。
- `workspace/membership`: Workspace 建立、純 Email 邀請機制、Owner/Admin/Member/Viewer 明確角色矩陣與多工作區隔離。
- `workspace/ssh-vault`: Workspace 連線記錄、OpenSSH 私鑰 Vault、加密保存、跳板機級聯授權使用、Admin 審核共用 TOFU 指紋變更與不可匯出規則。

### Modified Capabilities

- 無既有 OpenSpec capability；目前 `openspec/specs/` 尚無既有規格。

## Impact

- `src/worker/auth.ts`、`src/worker/index.ts`、`src/types.ts`、新增 `src/worker/account-do.ts`、`src/worker/workspace-do.ts`、`src/worker/account-directory-do.ts`。
- `frontend/src/auth-form.ts`、新增登入/OTP/救援碼/Workspace/Vault UI 與三端 i18n 詞條。
- `wrangler.toml` 與 Cloudflare Secrets：`RESEND_API_KEY`、`RESEND_FROM_EMAIL`、`BOOTSTRAP_OWNER_EMAIL`、可選 Turnstile 設定與 DO v3 migration tags。
- Session cookie 路由相容性、跳板機 Vault 整合與舊版 GitHub 帳號伺服器憑證解密重加密遷移路徑。
- 需要新增單元、Worker integration、E2E、權限隔離與安全回歸測試。
