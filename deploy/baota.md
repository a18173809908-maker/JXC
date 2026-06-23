# 宝塔 Linux 面板部署

以下以服务器公网 IP `119.23.45.149` 为例。

## 1. 准备环境

在宝塔面板安装：

- Nginx
- PostgreSQL
- Node.js 20.9 或更高版本
- PM2 管理器

## 2. 创建数据库

```sql
CREATE DATABASE jxc;
CREATE USER jxc_user WITH ENCRYPTED PASSWORD '请改成强密码';
GRANT ALL PRIVILEGES ON DATABASE jxc TO jxc_user;
```

应用环境变量：

```bash
DATABASE_URL="postgresql://jxc_user:请改成强密码@127.0.0.1:5432/jxc?schema=public"
APP_URL="http://119.23.45.149"
```

## 3. 上传项目并安装依赖

```bash
cd /www/wwwroot
git clone <你的仓库地址> jxc
cd /www/wwwroot/jxc
npm ci
cp .env.example .env
vi .env
```

如果不走 Git，也可以把当前目录上传到 `/www/wwwroot/jxc`。

## 4. 初始化数据库并构建

```bash
npm run db:migrate
npm run db:seed
npm run build
```

## 5. PM2 启动

```bash
pm2 start npm --name jxc -- start
pm2 save
```

默认监听 `3000`。

## 6. Nginx 反向代理

新建站点后，把反向代理指向：

```text
http://127.0.0.1:3000
```

常用 Nginx 配置：

```nginx
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 7. 后续更新

```bash
cd /www/wwwroot/jxc
git pull
npm ci
npm run db:migrate
npm run build
pm2 restart jxc
```
