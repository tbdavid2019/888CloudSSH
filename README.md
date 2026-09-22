# 888CloudSSH

獨立維護的 Web SSH 工作台，部署在 Cloudflare Workers 上。

本專案由 [CloudSSH](https://github.com/newbietan/CloudSSH) 衍生而來，感謝原作者 [TanXin (@newbietan)](https://github.com/newbietan) 以及所有歷史貢獻者提供 SSH、SFTP、Cloudflare Workers 與安全架構基礎。888CloudSSH 目前獨立維護，不同步原作者倉庫。

## 功能

- 瀏覽器 SSH 終端與多工作階段分頁
- SFTP 檔案管理、批次傳輸與線上編輯
- 密碼、私鑰與 SSH `keyboard-interactive`／OTP 認證
- SSH 跳板鏈與 Cloudflare Tunnel
- GitHub OAuth、指定 GitHub 使用者白名單與匿名模式控制
- AI Agent、命令片段與伺服器工作記憶
- 主機指紋 TOFU、DNS rebinding SSRF 防護與分享會話審計
- 繁體中文、簡體中文與 English
- 預設佈景：Standard Dark

## 部署

### Cloudflare Workers

需要 Node.js、pnpm、Wrangler 與 Cloudflare Workers 帳號。

```bash
pnpm install --frozen-lockfile
cd frontend && pnpm install --frozen-lockfile && cd ..
pnpm run build:frontend
wrangler deploy --env="" --keep-vars
```

`wrangler.toml` 的 Worker 名稱目前是 `cloudssh`。請先設定正確的 Cloudflare account ID，或在 Wrangler 設定中指定 `account_id`。

### GitHub OAuth

在 Cloudflare Workers 的 Variables and Secrets 設定：

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `BASE_URL`
- `GITHUB_ALLOWED_USER_IDS`（可選，逗號分隔的 GitHub 數字 ID）
- `REQUIRE_GITHUB_AUTH=true`（可選，強制登入後才能使用 SSH）

GitHub OAuth 是 CloudSSH 帳號登入方式。SSH 伺服器的 OTP 由遠端 SSH `keyboard-interactive` 認證流程提供；本專案目前不寄送 Email OTP。

## 本地開發

```bash
pnpm install --frozen-lockfile
cd frontend && pnpm install --frozen-lockfile && cd ..
pnpm run dev
```

常用檢查：

```bash
pnpm run typecheck
pnpm test
pnpm run build:frontend
pnpm run verify
```

前端語系偏好儲存在瀏覽器 `localStorage` 的 `cloudssh_locale`。沒有已存偏好時，預設使用 English；使用者切換語言後會保留選擇。

## 專案結構

```text
src/       Cloudflare Worker、Durable Objects、SSH/SFTP 協定與 Agent
frontend/  TypeScript、Vite、xterm.js 與 UI
tests/     Vitest、Playwright、SSH 與 Worker 測試
docs/      GitHub Pages 主題編輯器
```

## 變更紀錄

請參閱 [CHANGELOG.md](CHANGELOG.md)。後續紀錄使用日期，不使用版本號。

## 授權與署名

目前沿用原專案的 [Apache License 2.0](LICENSE) 與 [NOTICE](NOTICE)。再發佈或修改時請保留原作者與歷史貢獻者的著作權、NOTICE 與來源說明。

888CloudSSH 的新增修改由本專案維護者負責；原專案名稱、作者與貢獻者歸屬仍以原始倉庫與 NOTICE 為準。
