# Changelog

888CloudSSH 的變更紀錄使用日期，不使用版本號。

## 2026-09-23

### Fixed

- 修正 Email OTP 寄出後在測試模式自動填入驗證碼的問題，改由使用者自行輸入收到的驗證碼。

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
