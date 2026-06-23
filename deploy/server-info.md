# 服务器信息

> 这个文件只记录部署所需的非敏感信息。数据库密码、SSH 私钥、宝塔密码等敏感内容不要提交到仓库。

## 当前服务器

- 公网 IP：`119.23.45.149`
- 部署目录：`/www/wwwroot/jxc`
- 应用名称：`jxc`
- 应用端口：`3000`
- 访问地址：`http://119.23.45.149`
- 反向代理：Nginx -> `http://127.0.0.1:3000`

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
APP_URL="http://119.23.45.149"
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

## 待补充

- SSH 用户名：
- SSH 端口：
- 域名：
- 宝塔面板地址：
- PostgreSQL 管理方式：
