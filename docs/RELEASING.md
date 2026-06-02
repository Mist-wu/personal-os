# 发版说明

## 当前状态

- **npm**：[`pi-everos-memory@0.1.0`](https://www.npmjs.com/package/pi-everos-memory) 已发布 ✅
- **GitHub Release**：[v0.1.0](https://github.com/Mist-wu/pi-everos-memory/releases/tag/v0.1.0) ✅
- 安装：`pi install npm:pi-everos-memory`

后续版本按下方「发布新版本」流程操作。

## 一次性准备

- **npm 登录**：`npm login`（账号 `mistwu`）。
- **2FA**：账号开启了双因子认证，`npm publish` 时需附带验证码：

  ```bash
  npm publish --access public --otp=<6位验证码>
  ```

  或在 [npm Access Tokens](https://www.npmjs.com/settings/mistwu/tokens) 生成 **Granular Token**（含 publish 权限、允许绕过 2FA），写入本机：

  ```bash
  npm config set //registry.npmjs.org/:_authToken=<token>
  ```

- **CI 自动发布（可选）**：把同一枚 token 设为 GitHub 仓库 **Settings → Secrets → Actions** 的 `NPM_TOKEN`。

## 发布新版本

1. 更新 `CHANGELOG.md`，bump 版本：

   ```bash
   npm version patch   # 或 minor / major；会改 package.json 并打 git tag
   ```

2. 推送代码与 tag（HTTPS 远端缺 `workflow` scope 时改用 SSH）：

   ```bash
   git push git@github.com:Mist-wu/pi-everos-memory.git main --tags
   ```

3. 发布到 npm：

   ```bash
   npm run verify
   npm publish --access public          # 必要时加 --otp=<验证码>
   ```

   > 已配置 `NPM_TOKEN` 时，推 tag 后 [Release workflow](https://github.com/Mist-wu/pi-everos-memory/actions/workflows/release.yml) 会自动 `npm publish`，可跳过本步。

4. 创建 GitHub Release（说明从 CHANGELOG 复制）：

   ```bash
   gh release create vX.Y.Z --title vX.Y.Z \
     --notes "$(awk '/^## \[X.Y.Z\]/{p=1;next} /^## \[/{p=0} p' CHANGELOG.md)"
   ```

   也可在 GitHub 网页 **Releases → Draft new release** 填写说明。

## 排错

- **`cannot publish over the previously published versions: X.Y.Z`** — 该版本已存在 registry，先 bump 版本再发。
- **`403 ... Two-factor authentication ... required`** — 加 `--otp=<验证码>`，或改用带 bypass-2FA 的 Granular Token。
- **`refusing to allow an OAuth App to ... workflow ... without workflow scope`** — `git push` 改用 SSH 远端。
- **`npm` 命令长时间无响应** — 多为到 `registry.npmjs.org` 的网络延迟；`npm publish` 还会先跑 `prepack`（typecheck+test）。可用 `curl -sS https://registry.npmjs.org/pi-everos-memory/latest` 快速确认是否已发布。

## CI 可选：Trusted Publishing

在 npm 包设置里为 `Mist-wu/pi-everos-memory` 配置 GitHub Actions Trusted Publisher 后，可去掉 `NPM_TOKEN`，改用 OIDC（workflow 已开启 `id-token: write`）。
