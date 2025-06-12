# macOS 签名发布流程文档

本文档详细介绍了如何使用 GitHub Actions 自动化构建和发布经过代码签名的 macOS 应用程序。

## 📋 工作流概览

### 工作流配置文件：`publish.yml`

```yaml
name: "publish"

on:
  push:
    branches:
      - release

jobs:
  publish-tauri:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            args: '--target universal-apple-darwin'
    runs-on: ${{ matrix.platform }}
```

## 🚀 工作流程详解

### 1. 触发条件
- **触发分支**: `release`
- **触发方式**: 当代码推送到 `release` 分支时自动执行
- **构建目标**: Universal macOS 应用（同时支持 Intel 和 Apple Silicon）

### 2. 构建步骤详解

#### 步骤 1: 代码检出
```yaml
- uses: actions/checkout@v4
```
- 从 GitHub 仓库拉取最新代码
- 包含所有必要的源文件和配置

#### 步骤 2: Node.js 环境设置
```yaml
- name: setup node
  uses: actions/setup-node@v4
  with:
    node-version: lts/*
```
- 安装 Node.js LTS 版本
- 为前端构建提供运行环境

#### 步骤 3: Rust 工具链安装
```yaml
- name: install Rust stable
  uses: dtolnay/rust-toolchain@stable
  with:
    targets: 'aarch64-apple-darwin,x86_64-apple-darwin'
```
- 安装 Rust 稳定版本
- 添加 ARM64 和 x86_64 编译目标
- 支持 Universal Binary 构建

#### 步骤 4: 前端依赖安装
```yaml
- name: install frontend dependencies
  run: yarn install # 注意：应改为 npm install
```
⚠️ **注意**: 根据项目规范，应使用 `npm install` 而不是 `yarn install`

#### 步骤 5: Apple 开发者证书导入
```yaml
- name: import Apple Developer Certificate
  env:
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
  run: |
    echo $APPLE_CERTIFICATE | base64 --decode > certificate.p12
    security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security default-keychain -s build.keychain
    security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
    security set-keychain-settings -t 3600 -u build.keychain
    security import certificate.p12 -k build.keychain -P "$APPLE_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
    security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" build.keychain
    security find-identity -v -p codesigning build.keychain
```

**详细解释**:
1. **证书解码**: 将 Base64 编码的证书解码为 .p12 文件
2. **钥匙串创建**: 创建临时构建钥匙串
3. **钥匙串设置**: 设置为默认钥匙串并解锁
4. **超时设置**: 防止钥匙串自动锁定（3600秒）
5. **证书导入**: 将 .p12 证书导入钥匙串
6. **权限设置**: 允许 codesign 工具访问证书
7. **验证导入**: 确认证书成功导入

#### 步骤 6: 证书验证
```yaml
- name: verify certificate
  run: |
    CERT_INFO=$(security find-identity -v -p codesigning build.keychain | grep "Developer ID Application")
    CERT_ID=$(echo "$CERT_INFO" | awk -F'"' '{print $2}')
    echo "CERT_ID=$CERT_ID" >> $GITHUB_ENV
    echo "Certificate imported."
```
- 查找并验证开发者证书
- 提取证书 ID 并设置为环境变量
- 为后续签名步骤准备

#### 步骤 7: 构建和发布
```yaml
- name: build and publish
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    APPLE_ID: ${{ secrets.APPLE_ID }}
    APPLE_ID_PASSWORD: ${{ secrets.APPLE_ID_PASSWORD }}
    APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
    APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
    APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
    APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    APPLE_SIGNING_IDENTITY: ${{ env.CERT_ID }}
  with:
    tagName: app-v__VERSION__
    releaseName: "App v__VERSION__"
    releaseBody: "See the assets to download this version and install."
    releaseDraft: true
    prerelease: false
    args: '--target universal-apple-darwin'
```

## 🔐 环境变量详解

### GitHub Secrets 配置

以下环境变量需要在 GitHub 仓库的 Settings > Secrets and variables > Actions 中配置：

#### 🍎 Apple 开发者相关

| 变量名 | 用途 | 获取方式 |
|--------|------|----------|
| `APPLE_CERTIFICATE` | 开发者签名证书 | 从 Keychain Access 导出 .p12 文件，转换为 Base64 |
| `APPLE_CERTIFICATE_PASSWORD` | 证书密码 | 导出 .p12 文件时设置的密码 |
| `APPLE_ID` | Apple ID 邮箱 | 开发者账号邮箱地址 |
| `APPLE_ID_PASSWORD` | Apple ID 密码 | Apple ID 的登录密码 |
| `APPLE_PASSWORD` | App-specific 密码 | 在 appleid.apple.com 生成的应用专用密码 |
| `APPLE_TEAM_ID` | 开发者团队 ID | 在 Apple Developer 后台查看 |

#### 🔧 构建相关

| 变量名 | 用途 | 说明 |
|--------|------|------|
| `GITHUB_TOKEN` | GitHub API 访问令牌 | GitHub 自动提供，用于创建 Release |
| `KEYCHAIN_PASSWORD` | 临时钥匙串密码 | 自定义密码，用于保护构建期间的钥匙串 |
| `APPLE_SIGNING_IDENTITY` | 签名身份标识 | 从证书中提取，工作流自动设置 |

### 📋 获取证书和配置步骤

#### 1. 获取 Apple 开发者证书

```bash
# 1. 在 macOS 上打开 Keychain Access
# 2. 找到 "Developer ID Application: Your Name (Team ID)" 证书
# 3. 右键点击 -> 导出
# 4. 选择 .p12 格式，设置密码
# 5. 转换为 Base64：
base64 -i certificate.p12 | pbcopy
```

#### 2. 获取 Team ID
- 登录 [Apple Developer](https://developer.apple.com/)
- 进入 Account -> Membership
- 复制 Team ID

#### 3. 生成应用专用密码
- 登录 [Apple ID 管理页面](https://appleid.apple.com/)
- 进入 Sign-In and Security -> App-Specific Passwords
- 生成新的应用专用密码

## 📦 发布配置

### Release 设置
```yaml
tagName: app-v__VERSION__           # 标签格式：app-v1.0.0
releaseName: "App v__VERSION__"     # 发布名称：App v1.0.0
releaseBody: "See the assets to download this version and install."
releaseDraft: true                  # 创建草稿版本
prerelease: false                   # 非预发布版本
```

### 构建参数
```yaml
args: '--target universal-apple-darwin'
```
- 构建 Universal Binary
- 同时支持 Intel (x86_64) 和 Apple Silicon (ARM64)
- 一个安装包适用于所有 Mac 用户

## 🚀 使用流程

### 1. 配置 Secrets
在 GitHub 仓库中配置所有必需的 Secrets

### 2. 推送到发布分支
```bash
# 切换到 release 分支
git checkout release

# 合并最新代码
git merge main

# 推送触发构建
git push origin release
```

### 3. 监控构建过程
- 在 GitHub Actions 页面查看构建进度
- 检查各个步骤的执行状态
- 查看详细日志排查问题

### 4. 发布管理
- 构建成功后在 Releases 页面查看草稿
- 编辑发布说明
- 发布正式版本

## 🛠️ 故障排除

### 常见问题

#### 证书相关问题
```
❌ 错误: "No signing identity found"
✅ 解决: 检查 APPLE_CERTIFICATE 和 APPLE_CERTIFICATE_PASSWORD 是否正确
```

#### 公证失败
```
❌ 错误: "Notarization failed"
✅ 解决: 
- 检查 APPLE_ID 和 APPLE_PASSWORD 是否正确
- 确认使用应用专用密码而非 Apple ID 密码
- 验证 APPLE_TEAM_ID 是否匹配
```

#### 构建失败
```
❌ 错误: "Build failed"
✅ 解决:
- 确认 Rust toolchain 正确安装
- 检查前端依赖是否完整
- 验证 Tauri 配置是否正确
```

### 调试技巧

1. **本地测试签名**:
```bash
# 检查本地证书
security find-identity -v -p codesigning

# 测试签名
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" path/to/app
```

2. **验证公证**:
```bash
# 检查公证状态
xcrun stapler validate path/to/app

# 查看公证历史
xcrun altool --notarization-history 0 -u "your@email.com" -p "@keychain:altool"
```

## 📚 相关资源

- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Tauri 构建指南](https://tauri.app/v1/guides/building/)
- [GitHub Actions 文档](https://docs.github.com/en/actions)

---

💡 **提示**: 首次设置可能需要一些时间来配置所有证书和密钥，建议先在测试仓库中验证流程后再应用到生产环境。 