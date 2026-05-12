# Universal PIM - GitHub 部署指南

## 项目已创建完成

项目位于 `/workspace/universal-pim`，包含以下功能：

### 功能特性
- 📇 **通讯录管理** - 支持搜索、归档、常用标记
- 💬 **消息记录** - 查看和管理聊天记录
- 🔍 **全局搜索** - 搜索联系人和消息
- 🗂️ **归档功能** - 将不常用联系人归档
- ⭐ **常用联系人** - 自动排序到最前面
- 🔄 **WebDAV同步** - 支持远程数据备份

### 技术栈
- Vue 3 + Vite
- Pinia (状态管理)
- PouchDB (本地存储)
- WebDAV (远程同步)

---

## GitHub 部署步骤

### 1. 创建 GitHub 仓库

在 GitHub 上手动创建仓库 `universal-pim`，然后运行以下命令：

```bash
cd universal-pim
git remote add origin https://github.com/YOUR_USERNAME/universal-pim.git
git push -u origin master
```

### 2. 设置 GitHub Secrets

在 Windows 上打开命令提示符，运行：

```cmd
set USERNAME=YOUR_GITHUB_USERNAME
set PROJ=universal-pim
set WEBDAV_PASSWORD=UvPwuraoEQAzY5jC
set WEBDAV_USERNAME=richard4321
set WEBDAV_URL=https://miya.teracloud.jp/dav/
```

然后设置 secrets：

```cmd
gh secret set WEBDAV_URL --repo %USERNAME%/%PROJ% --body %WEBDAV_URL%
gh secret set WEBDAV_USERNAME --repo %USERNAME%/%PROJ% --body %WEBDAV_USERNAME%
gh secret set WEBDAV_PASSWORD --repo %USERNAME%/%PROJ% --body %WEBDAV_PASSWORD%
```

### 3. 发布到 GitHub Pages

有两种发布方式：

#### 方式一：推送代码自动发布
```bash
git push origin master
```
访问：`https://YOUR_USERNAME.github.io/universal-pim/`

#### 方式二：打 tag 发布到 release
```bash
git tag v1.0.0
git push origin v1.0.0
```
- 无 tag 推送 → 上传到 `online/universal-pim/{时间戳}/`
- 有 tag 推送 → 发布到 `online/universal-pim/release/`

---

## WebDAV 同步说明

### 配置
在应用设置中配置 WebDAV 服务器：
- 配置名以 `webdav` 开头
- 支持数据备份和恢复

### 同步规则
| 操作 | 路径 |
|------|------|
| 日常 push | `online/universal-pim/{timestamp}/` |
| tag 发布 | `online/universal-pim/release/` |

---

## 本地开发

```bash
cd universal-pim
npm install
npm run dev
```

构建生产版本：
```bash
npm run build
```
