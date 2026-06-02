# 发版说明

## 首次发布 npm（一次性）

1. 在 [npmjs.com](https://www.npmjs.com) 注册并登录本机：

   ```bash
   npm login
   ```

2. 确认包名未被占用：`npm view pi-everos-memory` 应 404。

3. 本地发版（与 `package.json` 版本一致）：

   ```bash
   npm run verify
   npm publish --access public
   ```

## 后续版本

1. 更新 `CHANGELOG.md`， bump `package.json` 版本（或 `npm version patch|minor|major`）。
2. 提交并打 tag：`git tag v0.1.1 && git push origin main --tags`
3. 在 GitHub 仓库 **Settings → Secrets → Actions** 添加 `NPM_TOKEN`（npm Access Token，类型 Automation 或 Publish）。
4. 推送 tag 后 [Release workflow](https://github.com/Mist-wu/pi-everos-memory/actions/workflows/release.yml) 会自动 `npm publish`。
5. 创建 GitHub Release（说明从 CHANGELOG 复制）：

   ```bash
   gh release create v0.1.1 --title v0.1.1 --notes "$(awk '/^## \[0.1.1\]/,/^## \[/{if(/^## \[/ && !/0.1.1/) exit; print}' CHANGELOG.md)"
   ```

也可在 GitHub 网页 **Releases → Draft new release** 填写说明。

## CI 可选：Trusted Publishing

在 npm 包设置里为 `Mist-wu/pi-everos-memory` 配置 GitHub Actions Trusted Publisher 后，可去掉 `NPM_TOKEN`，改用 OIDC（workflow 已开启 `id-token: write`）。
