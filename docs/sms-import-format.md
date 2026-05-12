# 短信备份 JSON 导入格式说明

## 概述

Universal PIM 支持导入短信备份 JSON 文件。导入时会严格校验每条记录的格式，不符合要求的记录会被跳过并提示原因。

## JSON 格式

### 支持的文件结构

支持以下三种 JSON 结构：

**方式一：直接数组**
```json
[
  { "_id": "10020", "address": "95598", "date": "1777605195203", "body": "短信内容..." },
  { "_id": "10021", "address": "10086", "date": "1777605196000", "body": "短信内容..." }
]
```

**方式二：包含 messages 数组的对象**
```json
{
  "messages": [
    { "_id": "10020", "address": "95598", "date": "1777605195203", "body": "短信内容..." }
  ]
}
```

**方式三：包含 sms 数组的对象**
```json
{
  "sms": [
    { "_id": "10020", "address": "95598", "date": "1777605195203", "body": "短信内容..." }
  ]
}
```

### 字段说明

#### 必需字段

每条记录必须包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `_id` | string | 短信唯一标识符 |
| `address` | string | 发送方/接收方电话号码 |
| `date` | string | 时间戳（毫秒级，字符串格式的数字） |
| `body` | string | 短信内容，不能为空 |

#### 可选字段

以下字段为可选，如果存在会被保留：

| 字段 | 类型 | 说明 |
|------|------|------|
| `thread_id` | string | 会话线程 ID |
| `date_sent` | string | 发送时间戳 |
| `protocol` | string | 协议类型（0=SMS） |
| `read` | string | 是否已读（1=已读） |
| `status` | string | 状态（-1=接收成功） |
| `type` | string | 类型（1=接收，2=发送） |
| `reply_path_present` | string | 回复路径 |
| `service_center` | string | 短信服务中心号码 |
| `locked` | string | 是否锁定 |
| `error_code` | string | 错误码 |
| `seen` | string | 是否已查看 |
| `timed` | string | 是否定时发送 |
| `deleted` | string | 是否已删除 |
| `sync_state` | string | 同步状态 |
| `marker` | string | 标记 |
| `bind_id` | string | 绑定 ID |
| `mx_status` | string | MX 状态 |
| `out_time` | string | 发出时间 |
| `sim_id` | string | SIM 卡 ID |
| `block_type` | string | 拦截类型 |
| `advanced_seen` | string | 高级已查看状态 |
| `b2c_ttl` | string | B2C TTL |
| `fake_cell_type` | string | 伪基站类型 |
| `url_risky_type` | string | URL 风险类型 |
| `favorite_date` | string | 收藏日期 |
| `sub_id` | string | 子 ID |

### 完整示例

```json
[
  {
    "_id": "10020",
    "thread_id": "1148",
    "address": "955981112",
    "date": "1777605195203",
    "date_sent": "1777605191000",
    "protocol": "0",
    "read": "1",
    "status": "-1",
    "type": "1",
    "reply_path_present": "0",
    "body": "【浙江电力】【电费通知】尊敬的客户，户号：3306025133117，户名：汪维佳，4月电量290度，电费129.72元。",
    "service_center": "+8613010377500",
    "locked": "0",
    "error_code": "0",
    "seen": "1",
    "timed": "0",
    "deleted": "0",
    "sync_state": "0",
    "marker": "0",
    "bind_id": "0",
    "mx_status": "0",
    "out_time": "0",
    "sim_id": "2",
    "block_type": "0",
    "advanced_seen": "3",
    "b2c_ttl": "0",
    "fake_cell_type": "0",
    "url_risky_type": "1",
    "favorite_date": "0",
    "sub_id": "-1"
  }
]
```

## 校验规则

导入时会逐条校验，以下情况会导致记录被跳过：

1. **不是 JSON 对象** — 记录必须是 `{}` 对象，不能是数组或其他类型
2. **缺少必需字段** — `_id`、`address`、`date`、`body` 四个字段缺一不可
3. **包含未知字段** — 只接受上表中列出的字段，任何额外字段都会导致该条被跳过
4. **body 为空** — `body` 字段不能为空字符串
5. **date 不是有效时间戳** — `date` 必须是毫秒级的数字字符串（如 `"1777605195203"`）
6. **address 为空** — `address` 字段不能为空字符串

## 导入行为

- **渠道**：所有导入的消息自动归类为「短信」渠道
- **方向**：根据 `type` 字段判断（`type=2` 为发送，其他为接收）
- **联系人**：`address` 字段作为联系人名称显示
- **去重**：使用 `sms_` + 原始 `_id` 作为内部 ID，重复导入会更新而非重复创建
- **部分导入**：校验失败的记录会被跳过，不影响有效记录的导入

## 错误提示

导入完成后会显示结果摘要：
- 成功时显示导入数量
- 如果有跳过的记录，可以展开查看每条被跳过的具体原因
