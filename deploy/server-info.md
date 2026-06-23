# 服务器信息

> 这个文件只记录部署所需的非敏感信息。数据库密码、SSH 私钥、宝塔密码等敏感内容不要提交到仓库。

## 当前服务器

- 公网 IP：`119.23.45.149`
- 部署目录：`/www/wwwroot/jxc`
- 应用名称：`jxc`
- 应用端口：`3010`
- 访问地址：`https://jxc.aiboxpro.cn/`
- 反向代理：Nginx -> `http://127.0.0.1:3010`

## 运行环境

- Node.js：`20.9+`，建议 `22 LTS`
- 包管理：`npm ci`
- 进程管理：`pm2`
- 数据库：`PostgreSQL`
- Web 服务：`Nginx`

## 数据库

- 数据库名：`jxc`
- 数据库用户：`jxc_user`
- 数据库主机：`127.0.0.1`
- 数据库端口：`5432`
- Prisma schema：`public`
- 环境变量示例：

```env
DATABASE_URL="postgresql://jxc_user:数据库密码@127.0.0.1:5432/jxc?schema=public"
APP_URL="https://jxc.aiboxpro.cn"
```

## 部署命令

```bash
cd /www/wwwroot/jxc
npm ci
npm run db:migrate
npm run db:seed
npm run build
pm2 start npm --name jxc -- start
pm2 save
```

## 更新命令

```bash
cd /www/wwwroot/jxc
npm ci
npm run db:migrate
npm run build
pm2 restart jxc
```

## 本次部署问题记录

### 1. 旧库已有结构，但 Prisma 没有初始化迁移记录

现象：

```text
ERROR: type "OrderStatus" already exists
Migration name: 20260622000000_init
```

处理：

```bash
npx prisma migrate resolve --applied 20260622000000_init
npm run db:migrate
```

说明：这是旧数据库已经有表和 enum，但 `_prisma_migrations` 没记录初始化迁移导致的。不要删库。

### 2. 服务器旧目录不是 Git 仓库

现象：

```text
fatal: not a git repository (or any of the parent directories): .git
```

处理：备份旧目录和 `.env`，重新 clone GitHub 仓库。

```bash
cd /www/wwwroot
cp jxc/.env /tmp/jxc.env
sudo mv jxc jxc_bak_$(date +%Y%m%d_%H%M%S)
sudo git clone https://github.com/a18173809908-maker/JXC.git jxc
sudo cp /tmp/jxc.env jxc/.env
sudo chown -R admin:admin jxc
```

### 3. `/www/wwwroot` 父目录权限导致无法重命名

现象：

```text
mv: cannot move 'jxc' to 'jxc_bak_...': Permission denied
```

原因：`/www/wwwroot` 属于 `root:root`，普通 `admin` 用户不能在父目录内重命名目录。使用 `sudo mv` 或宝塔文件管理器处理。

### 4. Nginx 反向代理头导致 Server Actions 被拒绝

现象：

```text
Invalid Server Actions request
x-forwarded-host header with value 127.0.0.1 does not match origin jxc.aiboxpro.cn
```

处理：站点反代到 `http://127.0.0.1:3010`，并设置真实 host。

```nginx
location / {
  proxy_pass http://127.0.0.1:3010;
  proxy_http_version 1.1;

  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Port $server_port;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

修改后：

```bash
sudo nginx -t
sudo nginx -s reload
pm2 restart jxc
```

### 5. `psql` 不识别 Prisma 的 `?schema=public`

现象：

```text
psql: error: invalid URI query parameter: "schema"
```

处理：shell 中去掉 query 参数后再给 `psql` 和 `pg_dump` 使用。

```bash
set -a
source .env
set +a
DB_URL="${DATABASE_URL%%\?schema=*}"
psql "$DB_URL"
```

### 6. 保留客户和供应商，清空测试业务数据

不要执行 `prisma migrate reset`，它会清空整库。只清业务表：

```sql
BEGIN;

TRUNCATE TABLE
  "ExchangeOutItem",
  "ExchangeReturnItem",
  "ExchangeOrder",
  "ReturnOrderItem",
  "ReturnOrder",
  "OutboundOrderItem",
  "OutboundOrder",
  "SalesOrderItem",
  "SalesOrder",
  "StockMovement",
  "StockBatch",
  "PurchaseOrderItem",
  "PurchaseOrder",
  "ProductExternalCode",
  "Product"
RESTART IDENTITY CASCADE;

COMMIT;
```

## 待补充

- SSH 用户名：
- SSH 端口：
- 域名：
- 宝塔面板地址：
- PostgreSQL 管理方式：
