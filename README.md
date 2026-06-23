# 食品进销存

面向便利店供货业务的进销存系统，第一版覆盖商品、客户、供应商、采购入库、销售订单、销售出库、批次库存和保质期提醒。

## 技术栈

- Next.js
- Prisma
- PostgreSQL
- Tailwind CSS

## 本地启动

1. 复制环境变量：

```bash
cp .env.example .env
```

2. 修改 `.env` 里的 `DATABASE_URL`。

3. 初始化数据库：

```bash
npm run db:dev
npm run db:seed
```

4. 启动：

```bash
npm run dev
```

## 生产部署

服务器需要 Node.js 20.9+、PostgreSQL、PM2 和 Nginx。部署命令见 `deploy/baota.md`。
