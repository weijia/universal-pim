# Universal PIM

通用联系人与消息管理工具 (Universal Personal Information Manager)

## 功能特点

- 📇 **通讯录管理** - 轻松管理联系人，支持搜索、归档和常用标记
- 💬 **消息记录** - 查看和管理与联系人的聊天记录和短信
- 🔍 **快速搜索** - 全局搜索联系人和消息
- 🗂️ **归档功能** - 将不常用的联系人归档，保持列表整洁
- ⭐ **常用联系人** - 标记常用联系人，自动排序到最前面
- 🔄 **WebDAV同步** - 支持将数据同步到WebDAV服务器

## 技术栈

- Vue 3 + Composition API
- Vite
- Pinia (状态管理)
- PouchDB (本地数据存储)
- WebDAV (远程数据同步)

## 开始使用

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

## 数据存储

所有数据都保存在浏览器的本地存储中（IndexedDB）：
- 联系人数据
- 消息记录
- 应用设置

## WebDAV 同步

配置 WebDAV 服务器后，可以将数据同步到远程服务器进行备份。

## License

MIT
