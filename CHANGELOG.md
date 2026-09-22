# Changelog

888CloudSSH 的變更紀錄使用日期，不使用版本號。

## 2026-09-22

### Added

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
