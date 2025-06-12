# GitHub Actions 工作流

本项目使用双工作流设计，将日常代码检查和版本发布分离管理。

## 📋 工作流概览

### 🔍 CI 工作流 (`ci.yml`)
**用途**: 日常代码质量检查  
**触发条件**: 
- 推送到 `main`/`master` 分支
- 创建 Pull Request

**执行内容**:
- ESLint 代码风格检查
- TypeScript 类型检查
- 前端项目构建验证
- **Python Sidecar 构建**
- Rust 代码格式和 Clippy 检查
- Tauri 应用构建测试（不打包）

### 🚀 Release 工作流 (`release.yml`)
**用途**: 版本发布和跨平台构建  
**触发条件**: 
- 推送版本标签 (格式: `v*.*.*`)

**执行内容**:
- 发布前的代码检查
- **跨平台 Python Sidecar 构建**
- 跨平台 Tauri 应用构建 (Windows, macOS, Linux)
- 自动创建 GitHub Release
- 上传构建产物

## 🛠️ 使用方法

### 日常开发流程
```bash
# 正常开发和推送
git add .
git commit -m "feat: 添加新功能"
git push origin main

# CI 工作流会自动运行代码检查和 Python Sidecar 构建
```

### 版本发布流程
```bash
# 1. 确保代码已合并到主分支
git checkout main
git pull origin main

# 2. 创建版本标签
git tag v1.0.0

# 3. 推送标签触发发布
git push origin v1.0.0

# Release 工作流会自动运行构建和发布（包含 Python Sidecar）
```

## 🏷️ 版本标签规范

### ✅ 正确格式
- `v1.0.0` - 正式版本
- `v2.1.3` - 正式版本
- `v1.0.0-alpha.1` - 内测版本
- `v1.0.0-beta` - 测试版本
- `v1.0.0-rc.1` - 候选版本

### ❌ 错误格式
- `1.0.0` - 缺少 'v' 前缀
- `version-1.0` - 格式不正确
- `v1.0` - 缺少补丁版本号

## 📦 构建产物

发布成功后，可以在 GitHub Releases 页面下载：

| 平台 | 文件类型 | 说明 |
|------|----------|------|
| **Windows** | `.msi` | Windows 安装包（推荐） |
| **Windows** | `.exe` | 可执行文件 |
| **macOS** | `.dmg` | 磁盘镜像（通用版本） |
| **Linux** | `.AppImage` | 便携版，无需安装 |
| **Linux** | `.deb` | Debian/Ubuntu 安装包 |

> 📝 **注意**: 所有构建产物都包含预构建的 Python Sidecar 二进制文件

## 🔧 工作流配置

### CI 工作流特性
- ⚡ 快速检查：只运行必要的代码质量检查
- 🔄 并行执行：多个检查步骤同时运行
- 🐍 **Python 集成**：自动构建和验证 Python Sidecar
- 📝 清晰反馈：提供详细的检查结果

### Release 工作流特性
- 🛡️ 多重验证：发布前进行完整检查
- 🌍 跨平台构建：支持主流操作系统
- 🐍 **Sidecar 集成**：在每个平台上构建对应的 Python Sidecar
- 📋 智能检测：自动识别预发布版本
- 📄 详细说明：自动生成发布说明

## 🐍 Python Sidecar 集成

### 构建流程
1. **环境准备**: 安装 Python 3.11 和 uv 包管理器
2. **依赖安装**: 使用 `uv sync` 安装 Python 依赖
3. **二进制构建**: 使用 PyInstaller 打包为单文件可执行程序
4. **平台适配**: 自动重命名为 Tauri 规范的文件名格式

### 输出位置
- 构建产物：`src-tauri/binaries/python-sidecar-{target-triple}{ext}`
- 支持平台：Windows (.exe)、macOS、Linux

### 本地测试
```bash
# 手动构建 Python Sidecar
npm run build-python

# 检查构建结果
ls -la src-tauri/binaries/
```

## 🚨 故障排除

### CI 检查失败
1. **ESLint 错误**：检查代码风格问题
   ```bash
   npm run lint -- --fix  # 自动修复
   ```

2. **TypeScript 错误**：检查类型错误
   ```bash
   npm run build  # 本地构建测试
   ```

3. **Python Sidecar 构建错误**：检查 Python 环境和依赖
   ```bash
   npm run build-python  # 本地测试构建
   cd python-sidecar && uv sync  # 检查 Python 依赖
   ```

4. **Rust 格式错误**：检查 Rust 代码格式
   ```bash
   cd src-tauri && cargo fmt  # 自动格式化
   ```

5. **Clippy 警告**：检查 Rust 代码质量
   ```bash
   cd src-tauri && cargo clippy --fix  # 自动修复部分问题
   ```

6. **Tauri 构建错误**：检查前后端集成
   ```bash
   npm run tauri build -- --debug  # 本地测试构建
   ```

### Release 发布失败
1. **标签格式错误**：确保使用 `v*.*.*` 格式
2. **代码检查未通过**：确保代码通过 CI 检查
3. **Python Sidecar 失败**：
   - 检查 `python-sidecar/` 目录下的 Python 代码
   - 确认 `uv` 和 `PyInstaller` 依赖正确安装
   - 查看具体平台的构建日志
4. **权限问题**：确认 GITHUB_TOKEN 权限足够
5. **依赖问题**：检查 package.json、Cargo.toml 和 pyproject.toml

### 常见问题
- **构建超时**：可能是依赖下载缓慢，重新运行即可
- **平台特定错误**：查看对应平台的构建日志
- **Python 环境问题**：确保 Python 3.11 和 uv 正确安装
- **二进制文件缺失**：检查 Python Sidecar 是否成功构建到 `src-tauri/binaries/` 目录
- **发布被跳过**：检查标签是否正确推送

## 📈 监控和维护

### 查看工作流状态
1. 访问 GitHub 仓库的 "Actions" 页面
2. 选择对应的工作流查看详细日志
3. 关注失败的步骤和错误信息
4. **Python Sidecar 步骤**: 特别关注 "构建 Python Sidecar" 步骤的日志

### 定期维护
- 定期更新 Actions 版本
- 检查依赖版本兼容性（包括 Python 依赖）
- 监控构建时间和成功率
- **Python 环境**: 定期更新 Python 版本和 uv 工具链

---

💡 **提示**: 建议在发布前先在本地运行 `npm run lint`、`npm run build` 和 `npm run build-python` 确保代码和 Python Sidecar 无误。 