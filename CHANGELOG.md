# Changelog

888CloudSSH 的變更紀錄使用日期，不使用版本號。

## 2026-09-22

### Added

- 新增繁體中文 `zh-TW` 語系與台灣 IT 用語校正。
- 新增英文預設語系；語系偏好保存於 `cloudssh_locale`。
- 新增 Standard Dark 預設佈景。
- 建立獨立專案 `tbdavid2019/888CloudSSH`。

### Changed

- README 改為 888CloudSSH 獨立專案說明，並保留原作者與歷史貢獻者致謝。
- 主題編輯器同步支援繁體中文與 Standard Dark 預設佈景。
- server memory 的繁體中文相對日期使用台灣格式。

### Verification

- `pnpm run typecheck`
- `pnpm run build:frontend`
- `pnpm test`
