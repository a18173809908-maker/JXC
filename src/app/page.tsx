import {
  AlertTriangle,
  Archive,
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Factory,
  LayoutDashboard,
  PackagePlus,
  Search,
  ShoppingCart,
  Store,
  Truck,
} from "lucide-react";
import Link from "next/link";
import {
  CancelSalesOrderForm,
  ConfirmExchangeInboundForm,
  ConfirmExchangeOutboundForm,
  ConfirmOutboundForm,
  ConfirmReturnInboundForm,
  CustomerForm,
  ExchangeForm,
  ProductForm,
  PurchaseForm,
  BatchImportProductsForm,
  ReturnOrderForm,
  SalesOrderForm,
  ShipOrderForm,
  StockInitForm,
  SupplierForm,
  ToggleActiveForm,
  type CustomerFormValue,
  type ProductFormValue,
  type SalesOrderFormValue,
  type SupplierFormValue,
} from "@/components/forms";
import { getDb } from "@/lib/db";
import { daysUntil, formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

type SectionKey = "overview" | "purchase" | "sales" | "outbound" | "returns" | "exchange" | "stock" | "products" | "customers" | "suppliers" | "movements";
type MasterType = "products" | "customers" | "suppliers";
type SearchParams = {
  section?: string | string[];
  type?: string | string[];
  q?: string | string[];
  id?: string | string[];
  edit?: string | string[];
  new?: string | string[];
  batch?: string | string[];
  ship?: string | string[];
  outboundEdit?: string | string[];
  return?: string | string[];
  exchange?: string | string[];
  tab?: string | string[];
  page?: string | string[];
  pageSize?: string | string[];
};

const menuItems: Array<{ key: SectionKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "overview", label: "业务概览", icon: LayoutDashboard },
  { key: "products", label: "商品档案", icon: Store },
  { key: "movements", label: "库存台账", icon: Boxes },
  { key: "purchase", label: "采购入库", icon: PackagePlus },
  { key: "sales", label: "销售订单", icon: ShoppingCart },
  { key: "customers", label: "客户档案", icon: Store },
  { key: "suppliers", label: "供应商档案", icon: Factory },
];

const sectionTitles: Record<SectionKey, string> = {
  overview: "业务概览",
  purchase: "采购入库",
  sales: "销售订单",
  outbound: "出库发货",
  returns: "退货处理",
  exchange: "换货处理",
  stock: "库存台账",
  products: "商品档案",
  customers: "客户档案",
  suppliers: "供应商档案",
  movements: "库存台账",
};

const masterTabs: Array<{ key: MasterType; label: string }> = [
  { key: "products", label: "商品" },
  { key: "customers", label: "客户" },
  { key: "suppliers", label: "供应商" },
];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSection(value: string | string[] | undefined): SectionKey {
  const section = firstParam(value);
  if (section === "masters") return "products";
  if (section === "stock") return "movements";
  if (section === "outbound" || section === "returns" || section === "exchange") return "sales";
  return menuItems.some((item) => item.key === section) ? (section as SectionKey) : "overview";
}

function sectionForMasterType(masterType: MasterType): SectionKey {
  return masterType;
}

function getMasterType(value: string | string[] | undefined, section: SectionKey): MasterType {
  if (section === "products" || section === "customers" || section === "suppliers") return section;
  const type = firstParam(value);
  return masterTabs.some((item) => item.key === type) ? (type as MasterType) : "products";
}

function like(value: string) {
  return { contains: value };
}

function positiveInt(value: string | string[] | undefined, fallback: number) {
  const parsed = Number(firstParam(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pageSizeValue(value: string | string[] | undefined) {
  const parsed = positiveInt(value, 20);
  return [20, 50, 100].includes(parsed) ? parsed : 20;
}

function paginate<T>(items: T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    currentPage,
    totalPages,
    total: items.length,
  };
}

function textIncludes(value: unknown, q: string) {
  return String(value ?? "").toLowerCase().includes(q.toLowerCase());
}

function normalizedProductUnit(unit: string) {
  return ["包", "袋", "杯", "个"].includes(unit) ? unit : "包";
}

async function loadData(params: { masterType: MasterType; q: string; id?: string; edit?: string; salesEditId?: string; outboundEditId?: string }) {
  const db = getDb();
  const q = params.q;
  const productWhere = q
    ? { OR: [{ code: like(q) }, { name: like(q) }, { spec: like(q) }, { barcode: like(q) }, { category: like(q) }] }
    : {};
  const customerWhere = q
    ? { OR: [{ code: like(q) }, { name: like(q) }, { contact: like(q) }, { phone: like(q) }, { address: like(q) }] }
    : {};
  const supplierWhere = q
    ? { OR: [{ code: like(q) }, { name: like(q) }, { contact: like(q) }, { phone: like(q) }, { address: like(q) }] }
    : {};

  const [
    products,
    customers,
    suppliers,
    batches,
    salesOrders,
    purchaseOrders,
    outboundOrders,
    returnOrders,
    exchangeOrders,
    externalCodes,
    movements,
    productCount,
    customerCount,
    supplierCount,
  ] = await Promise.all([
    db.product.findMany({ where: productWhere, include: { externalCodes: { include: { customer: true } } }, orderBy: [{ isActive: "desc" }, { code: "asc" }], take: 300 }),
    db.customer.findMany({ where: customerWhere, orderBy: [{ isActive: "desc" }, { code: "asc" }], take: 300 }),
    db.supplier.findMany({ where: supplierWhere, orderBy: [{ isActive: "desc" }, { code: "asc" }], take: 300 }),
    db.stockBatch.findMany({ include: { product: true }, orderBy: [{ expiryDate: "asc" }, { createdAt: "desc" }], take: 5000 }),
    db.salesOrder.findMany({
      include: { customer: true, items: { include: { product: true } }, outbounds: { include: { items: true } } },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    db.purchaseOrder.findMany({
      include: { supplier: true, items: { include: { product: true, stockBatch: true } } },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    db.outboundOrder.findMany({
      include: { customer: true, salesOrder: true, items: { include: { product: true, stockBatch: true, returnItems: true } } },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    db.returnOrder.findMany({
      include: { customer: true, outboundOrder: true, items: { include: { product: true, stockBatch: true } } },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    db.exchangeOrder.findMany({
      include: { customer: true, returnItems: { include: { product: true, stockBatch: true } }, outItems: { include: { product: true, stockBatch: true } } },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    db.productExternalCode.findMany({
      include: { customer: true, product: true },
      orderBy: [{ customer: { code: "asc" } }, { externalCode: "asc" }],
      take: 500,
    }),
    db.stockMovement.findMany({
      include: { product: true, stockBatch: true },
      orderBy: { createdAt: "desc" },
      take: 2000,
    }),
    db.product.count(),
    db.customer.count(),
    db.supplier.count(),
  ]);

  const detail =
    params.masterType === "products" && params.id
      ? await db.product.findUnique({
          where: { id: params.id },
          include: {
            stockBatches: { orderBy: { expiryDate: "asc" }, take: 50 },
            stockMovements: { orderBy: { createdAt: "desc" }, take: 50 },
            purchaseItems: { include: { purchaseOrder: { include: { supplier: true } } }, take: 50 },
            salesItems: { include: { salesOrder: { include: { customer: true } } }, take: 50 },
            outboundItems: { include: { outboundOrder: { include: { customer: true } }, stockBatch: true }, take: 50 },
            externalCodes: { include: { customer: true } },
          },
        })
      : params.masterType === "customers" && params.id
        ? await db.customer.findUnique({
            where: { id: params.id },
            include: {
              salesOrders: { include: { items: { include: { product: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
              outbounds: { include: { items: { include: { product: true, stockBatch: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
            },
          })
        : params.masterType === "suppliers" && params.id
          ? await db.supplier.findUnique({
              where: { id: params.id },
              include: {
                purchaseOrders: { include: { items: { include: { product: true } } }, orderBy: { createdAt: "desc" }, take: 50 },
              },
            })
          : null;

  const edit =
    params.masterType === "products" && params.edit
      ? await db.product.findUnique({ where: { id: params.edit }, include: { externalCodes: true } })
      : params.masterType === "customers" && params.edit
        ? await db.customer.findUnique({ where: { id: params.edit } })
        : params.masterType === "suppliers" && params.edit
          ? await db.supplier.findUnique({ where: { id: params.edit } })
          : null;

  const salesEdit = params.salesEditId
    ? await db.salesOrder.findUnique({
        where: { id: params.salesEditId },
        include: { items: true, outbounds: true },
      })
    : null;
  const outboundEdit = params.outboundEditId
    ? await db.outboundOrder.findUnique({
        where: { id: params.outboundEditId },
        include: { items: true },
      })
    : null;

  return {
    products,
    customers,
    suppliers,
    batches,
    salesOrders,
    purchaseOrders,
    outboundOrders,
    returnOrders,
    exchangeOrders,
    externalCodes,
    movements,
    counts: { products: productCount, customers: customerCount, suppliers: supplierCount },
    detail,
    edit,
    salesEdit,
    outboundEdit,
  };
}

type Data = Awaited<ReturnType<typeof loadData>>;
type MasterRow = Data["products"][number] | Data["customers"][number] | Data["suppliers"][number];

function Panel({
  title,
  description,
  icon,
  children,
  actions,
}: {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--paper)] shadow-sm">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#e7efe6] text-[var(--leaf)]">{icon}</span>
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {description ? <p className="mt-1 text-sm text-[var(--ink-soft)]">{description}</p> : null}
          </div>
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Modal({
  title,
  backHref,
  children,
}: {
  title: string;
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <section className="grid max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--paper)] shadow-xl">
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Link className="rounded-md border border-[var(--line)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--leaf)]" href={backHref}>
            关闭
          </Link>
        </div>
        <div className="overflow-auto p-5">{children}</div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "warning" | "danger" }) {
  const color = tone === "danger" ? "text-[var(--tomato)]" : tone === "warning" ? "text-[var(--amber)]" : "text-[var(--leaf)]";
  return (
    <div className="rounded-lg border border-[var(--line)] bg-white p-4">
      <div className="text-xs text-[var(--ink-soft)]">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-[var(--line)] bg-white p-6 text-center text-sm text-[var(--ink-soft)]">{text}</div>;
}

function activeTab(value: string | undefined, fallback: string, allowed: string[]) {
  return value && allowed.includes(value) ? value : fallback;
}

function DetailTabs({ tabs, active }: { tabs: Array<{ key: string; label: string; href: string }>; active: string }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-[var(--line)]">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`rounded-t-md border border-b-0 px-4 py-2 text-sm font-semibold ${
            active === tab.key ? "border-[var(--leaf)] bg-white text-[var(--leaf)]" : "border-[var(--line)] bg-[#f6f5ee] text-[var(--ink-soft)]"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const labelMap: Record<string, string> = {
    DRAFT: "草稿",
    CONFIRMED: "待出库",
    PARTIAL: "部分出库",
    COMPLETED: "已完成",
    CANCELLED: "已取消",
  };
  return <span className="rounded-full bg-[#e7efe6] px-2 py-1 text-xs font-semibold text-[var(--leaf)]">{labelMap[status] ?? status}</span>;
}

function ExpiryBadge({ expiryDate }: { expiryDate: Date }) {
  const days = daysUntil(expiryDate);
  const className =
    days < 0
      ? "bg-[#f7d9d3] text-[var(--tomato)]"
      : days <= 30
        ? "bg-[#f7ead1] text-[var(--amber)]"
        : "bg-[#e3efe9] text-[var(--leaf)]";
  const label = days < 0 ? `超允收 ${Math.abs(days)} 天` : days <= 30 ? `临近允收 ${days} 天` : `${days} 天`;
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${className}`}>{label}</span>;
}

function SearchBox({ q, masterType }: { q: string; masterType: MasterType }) {
  return (
    <form className="flex min-w-0 gap-2" action="/">
      <input type="hidden" name="section" value={sectionForMasterType(masterType)} />
      <label className="relative block min-w-0 flex-1">
        <Search className="absolute left-3 top-2.5 text-[var(--ink-soft)]" size={16} />
        <input className="focus-ring h-10 w-full rounded-md border border-[var(--line)] bg-white pl-9 pr-3 text-sm" name="q" placeholder="按编码、名称、联系人、条码搜索" defaultValue={q} />
      </label>
      <button className="focus-ring h-10 rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white">搜索</button>
    </form>
  );
}

function ListSearchBox({ section, q, pageSize, placeholder = "按单号、商品、客户、供应商、批号搜索" }: { section: SectionKey; q: string; pageSize: number; placeholder?: string }) {
  return (
    <form className="flex min-w-0 gap-2" action="/">
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="pageSize" value={pageSize} />
      <label className="relative block min-w-0 flex-1">
        <Search className="absolute left-3 top-2.5 text-[var(--ink-soft)]" size={16} />
        <input className="focus-ring h-10 w-full rounded-md border border-[var(--line)] bg-white pl-9 pr-3 text-sm" name="q" placeholder={placeholder} defaultValue={q} />
      </label>
      <button className="focus-ring h-10 rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white">搜索</button>
    </form>
  );
}

function PaginationControls({ section, q, page, pageSize, total, totalPages }: { section: SectionKey; q: string; page: number; pageSize: number; total: number; totalPages: number }) {
  const base = `/?section=${section}${q ? `&q=${encodeURIComponent(q)}` : ""}&pageSize=${pageSize}`;
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--line)] pt-4 text-sm text-[var(--ink-soft)] md:flex-row md:items-center md:justify-between">
      <span>共 {total} 条，第 {page} / {totalPages} 页</span>
      <div className="flex flex-wrap items-center gap-2">
        <Link className="rounded-md border border-[var(--line)] bg-white px-3 py-2 font-semibold text-[var(--leaf)] aria-disabled:pointer-events-none aria-disabled:opacity-40" aria-disabled={page <= 1} href={`${base}&page=${Math.max(1, page - 1)}`}>
          上一页
        </Link>
        <Link className="rounded-md border border-[var(--line)] bg-white px-3 py-2 font-semibold text-[var(--leaf)] aria-disabled:pointer-events-none aria-disabled:opacity-40" aria-disabled={page >= totalPages} href={`${base}&page=${Math.min(totalPages, page + 1)}`}>
          下一页
        </Link>
        <form action="/" className="flex items-center gap-2">
          <input type="hidden" name="section" value={section} />
          {q ? <input type="hidden" name="q" value={q} /> : null}
          <span>每页</span>
          <select className="focus-ring h-9 rounded-md border border-[var(--line)] bg-white px-2" name="pageSize" defaultValue={pageSize}>
            {[20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <button className="rounded-md border border-[var(--line)] bg-white px-3 py-2 font-semibold text-[var(--leaf)]">切换</button>
        </form>
      </div>
    </div>
  );
}

function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isActive ? "bg-[#e3efe9] text-[var(--leaf)]" : "bg-[#ece8df] text-[var(--ink-soft)]"}`}>
      {isActive ? "启用" : "停用"}
    </span>
  );
}

function PurchaseList({ purchaseOrders }: { purchaseOrders: Data["purchaseOrders"] }) {
  if (purchaseOrders.length === 0) return <EmptyState text="暂无入库记录。" />;
  return (
    <DataTable minWidth="900px" headers={["入库单号", "供应商", "商品", "批号", "数量", "单价", "日期"]}>
      {purchaseOrders.flatMap((order) =>
        order.items.map((item) => (
          <tr key={item.id}>
            <td className="py-3 font-mono text-xs">{order.orderNo}</td>
            <td className="py-3">{order.supplier.name}</td>
            <td className="py-3">{item.product.code} - {item.product.name}</td>
            <td className="py-3 font-mono text-xs">{item.batchNo}</td>
            <td className="py-3">{item.quantity}</td>
            <td className="py-3">{formatMoney(item.unitPrice)}</td>
            <td className="py-3">{formatDate(order.orderDate)}</td>
          </tr>
        )),
      )}
    </DataTable>
  );
}

function SalesOrderList({ salesOrders, selectedId }: { salesOrders: Data["salesOrders"]; selectedId?: string }) {
  if (salesOrders.length === 0) return <EmptyState text="暂无销售订单。" />;
  return (
    <DataTable minWidth="1080px" headers={["订单号", "客户", "商品明细", "总数量", "金额", "交货日", "有效送货日", "状态", "操作"]}>
      {salesOrders.map((order) => {
        const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
        const totalAmount = order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
        const deliveryDates = Array.from(new Set(order.items.map((item) => formatDate(item.validDeliveryDate)).filter((date) => date !== "-")));
        return (
          <tr key={order.id} className={selectedId === order.id ? "bg-[#f2f7ef]" : ""}>
            <td className="py-3 font-mono text-xs">{order.orderNo}</td>
            <td className="py-3">{order.customer.name}</td>
            <td className="py-3">
              <div className="grid gap-1">
                {order.items.map((item) => (
                  <span key={item.id}>{item.product.code} - {item.product.name} x {item.quantity}</span>
                ))}
              </div>
            </td>
            <td className="py-3">{totalQuantity}</td>
            <td className="py-3">{formatMoney(totalAmount)}</td>
            <td className="py-3">{formatDate(order.deliveryDate)}</td>
            <td className="py-3">{deliveryDates.length > 0 ? deliveryDates.join(" / ") : "-"}</td>
            <td className="py-3"><StatusBadge status={order.status} /></td>
            <td className="py-3">
              <Link className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--leaf)]" href={`/?section=sales&id=${order.id}`}>详情</Link>
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}

function OutboundList({ outboundOrders, salesOrderId }: { outboundOrders: Data["outboundOrders"]; salesOrderId?: string }) {
  if (outboundOrders.length === 0) return <EmptyState text="暂无出库记录。" />;
  return (
    <DataTable minWidth="1080px" headers={["出库单号", "关联订单", "客户", "商品明细", "数量", "日期", "状态", "操作"]}>
      {outboundOrders.map((order) => {
        const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
        return (
          <tr key={order.id}>
            <td className="py-3 font-mono text-xs">{order.outboundNo}</td>
            <td className="py-3 font-mono text-xs">{order.salesOrder?.orderNo ?? "-"}</td>
            <td className="py-3">{order.customer.name}</td>
            <td className="py-3">
              <div className="grid gap-1">
                {order.items.map((item) => (
                  <span key={item.id}>{item.product.code} - {item.product.name} / {item.stockBatch.batchNo} x {item.quantity}</span>
                ))}
              </div>
            </td>
            <td className="py-3">{totalQuantity}</td>
            <td className="py-3">{formatDate(order.outboundDate)}</td>
            <td className="py-3"><span className="rounded-full bg-[#e3efe9] px-2 py-1 text-xs font-semibold text-[var(--leaf)]">{order.status === "CONFIRMED" ? "已确认" : "草稿"}</span></td>
            <td className="py-3">
              {order.status === "DRAFT" ? (
                <div className="flex flex-wrap items-start gap-2">
                  <Link className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--leaf)]" href={salesOrderId ? `/?section=sales&id=${salesOrderId}&outboundEdit=${order.id}` : `/?section=outbound&edit=${order.id}`}>编辑</Link>
                  <ConfirmOutboundForm id={order.id} />
                </div>
              ) : (
                <span className="text-xs text-[var(--ink-soft)]">不可更改</span>
              )}
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}

function ReturnList({ returnOrders }: { returnOrders: Data["returnOrders"] }) {
  if (returnOrders.length === 0) return <EmptyState text="暂无退货记录。" />;
  return (
    <DataTable minWidth="1180px" headers={["退货单号", "原出库单", "客户", "原因", "商品明细", "数量", "日期", "状态", "操作"]}>
      {returnOrders.map((order) => {
        const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
        return (
          <tr key={order.id}>
            <td className="py-3 font-mono text-xs">{order.returnNo}</td>
            <td className="py-3 font-mono text-xs">{order.outboundOrder.outboundNo}</td>
            <td className="py-3">{order.customer.name}</td>
            <td className="py-3">{order.reason}</td>
            <td className="py-3">
              <div className="grid gap-1">
                {order.items.map((item) => (
                  <span key={item.id}>{item.product.code} - {item.product.name} / {item.stockBatch.batchNo} x {item.quantity}</span>
                ))}
              </div>
            </td>
            <td className="py-3">{totalQuantity}</td>
            <td className="py-3">{formatDate(order.returnDate)}</td>
            <td className="py-3">
              <span className="rounded-full bg-[#e3efe9] px-2 py-1 text-xs font-semibold text-[var(--leaf)]">{order.status === "RECEIVED" ? "已入库" : "待入库"}</span>
            </td>
            <td className="py-3">
              {order.status === "PENDING" ? <ConfirmReturnInboundForm id={order.id} /> : <span className="text-xs text-[var(--ink-soft)]">已完成</span>}
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}

function ExchangeList({ exchangeOrders }: { exchangeOrders: Data["exchangeOrders"] }) {
  if (exchangeOrders.length === 0) return <EmptyState text="暂无换货记录。" />;
  return (
    <DataTable minWidth="1280px" headers={["换货单号", "客户", "原因", "退入明细", "换出明细", "日期", "状态", "操作"]}>
      {exchangeOrders.map((order) => (
        <tr key={order.id}>
          <td className="py-3 font-mono text-xs">{order.exchangeNo}</td>
          <td className="py-3">{order.customer.name}</td>
          <td className="py-3">{order.reason}</td>
          <td className="py-3">
            <div className="grid gap-1">
              {order.returnItems.length > 0 ? order.returnItems.map((item) => (
                <span key={item.id} className="text-xs">{item.product.code} - {item.product.name} / {item.stockBatch.batchNo} x {item.quantity}</span>
              )) : <span className="text-xs text-[var(--ink-soft)]">-</span>}
            </div>
          </td>
          <td className="py-3">
            <div className="grid gap-1">
              {order.outItems.length > 0 ? order.outItems.map((item) => (
                <span key={item.id} className="text-xs">{item.product.code} - {item.product.name} / {item.stockBatch.batchNo} x {item.quantity}</span>
              )) : <span className="text-xs text-[var(--ink-soft)]">-</span>}
            </div>
          </td>
          <td className="py-3">{formatDate(order.exchangeDate)}</td>
          <td className="py-3">
            <div className="grid gap-1">
              <span className="rounded-full bg-[#e3efe9] px-2 py-1 text-xs font-semibold text-[var(--leaf)]">入库：{order.inboundStatus === "RECEIVED" ? "已确认" : "待确认"}</span>
              <span className="rounded-full bg-[#e3efe9] px-2 py-1 text-xs font-semibold text-[var(--leaf)]">出库：{order.outboundStatus === "SHIPPED" ? "已确认" : "待确认"}</span>
            </div>
          </td>
          <td className="py-3">
            <div className="flex flex-wrap items-start gap-2">
              {order.returnItems.length > 0 && order.inboundStatus === "PENDING" ? <ConfirmExchangeInboundForm id={order.id} /> : null}
              {order.outItems.length > 0 && order.outboundStatus === "PENDING" ? <ConfirmExchangeOutboundForm id={order.id} /> : null}
              {(order.returnItems.length === 0 || order.inboundStatus !== "PENDING") && (order.outItems.length === 0 || order.outboundStatus !== "PENDING") ? <span className="text-xs text-[var(--ink-soft)]">已完成</span> : null}
            </div>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

function SalesOrderDetail({
  order,
  outboundOrders,
  returnOrders,
  exchangeOrders,
  returnableOutboundIds,
  canShip,
  detailTab,
  baseHref,
}: {
  order: Data["salesOrders"][number];
  outboundOrders: Data["outboundOrders"];
  returnOrders: Data["returnOrders"];
  exchangeOrders: Data["exchangeOrders"];
  returnableOutboundIds: Set<string>;
  canShip: boolean;
  detailTab?: string;
  baseHref: string;
}) {
  const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  const confirmedOutbound = outboundOrders.find((outbound) => outbound.status === "CONFIRMED");
  const canReturn = confirmedOutbound ? returnableOutboundIds.has(confirmedOutbound.id) : false;
  const currentTab = activeTab(detailTab, "items", ["items", "outbound", "returns", "exchange"]);
  const tabs = [
    { key: "items", label: `订单明细 ${order.items.length}`, href: `${baseHref}&tab=items` },
    { key: "outbound", label: `出库记录 ${outboundOrders.length}`, href: `${baseHref}&tab=outbound` },
    { key: "returns", label: `退货记录 ${returnOrders.length}`, href: `${baseHref}&tab=returns` },
    { key: "exchange", label: `换货记录 ${exchangeOrders.length}`, href: `${baseHref}&tab=exchange` },
  ];

  return (
    <div className="grid gap-5">
      <Panel
        title={`订单详情 ${order.orderNo}`}
        description={`${order.customer.name} / 数量 ${totalQuantity} / 金额 ${formatMoney(totalAmount)}`}
        icon={<ShoppingCart size={18} />}
        actions={
          <div className="flex flex-wrap gap-2">
            {order.status === "CONFIRMED" && order.outbounds.length === 0 ? (
              <>
                <Link className="focus-ring grid h-10 place-items-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--leaf)]" href={`/?section=sales&id=${order.id}&edit=${order.id}`}>编辑订单</Link>
                <CancelSalesOrderForm id={order.id} />
              </>
            ) : null}
            {canShip ? <Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href={`/?section=sales&id=${order.id}&ship=${order.id}`}>订单出库</Link> : null}
            {confirmedOutbound && canReturn ? (
              <>
                <Link className="focus-ring grid h-10 place-items-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--leaf)]" href={`/?section=sales&id=${order.id}&return=${confirmedOutbound.id}`}>退货</Link>
                <Link className="focus-ring grid h-10 place-items-center rounded-md border border-[var(--line)] bg-white px-4 text-sm font-semibold text-[var(--leaf)]" href={`/?section=sales&id=${order.id}&exchange=${order.id}`}>换货</Link>
              </>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="订单数量" value={totalQuantity} />
            <Stat label="订单金额" value={formatMoney(totalAmount)} />
            <Stat label="出库记录" value={outboundOrders.length} />
          </div>
          <DetailTabs tabs={tabs} active={currentTab} />
          {currentTab === "items" ? (
            <DataTable minWidth="820px" headers={["商品", "数量", "单价", "金额", "有效送货日"]}>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-3">{item.product.code} - {item.product.name}</td>
                  <td className="py-3">{item.quantity}</td>
                  <td className="py-3">{formatMoney(item.unitPrice)}</td>
                  <td className="py-3">{formatMoney(Number(item.unitPrice) * item.quantity)}</td>
                  <td className="py-3">{formatDate(item.validDeliveryDate)}</td>
                </tr>
              ))}
            </DataTable>
          ) : null}
          {currentTab === "outbound" ? <OutboundList outboundOrders={outboundOrders} salesOrderId={order.id} /> : null}
          {currentTab === "returns" ? <ReturnList returnOrders={returnOrders} /> : null}
          {currentTab === "exchange" ? <ExchangeList exchangeOrders={exchangeOrders} /> : null}
        </div>
      </Panel>
    </div>
  );
}

type InventoryBalanceRow = {
  productId: string;
  productCode: string;
  productName: string;
  spec: string;
  unit: string;
  totalQuantity: number;
  batchCount: number;
  expiringCount: number;
  expiredCount: number;
  earliestExpiry?: Date;
};

function InventoryBalanceList({ rows, selectedId }: { rows: InventoryBalanceRow[]; selectedId?: string }) {
  if (rows.length === 0) return <EmptyState text="暂无库存结余。" />;
  return (
    <DataTable minWidth="980px" headers={["商品", "规格", "总结余", "批次数", "临近/超允收", "最早允收日", "操作"]}>
      {rows.map((row) => (
        <tr key={row.productId} className={selectedId === row.productId ? "bg-[#f2f7ef]" : ""}>
          <td className="py-3 font-medium">{row.productCode} - {row.productName}</td>
          <td className="py-3 text-[var(--ink-soft)]">{row.spec || "-"}</td>
          <td className="py-3 font-semibold">{row.totalQuantity} {row.unit}</td>
          <td className="py-3">{row.batchCount}</td>
          <td className="py-3">{row.expiringCount} / {row.expiredCount}</td>
          <td className="py-3">{formatDate(row.earliestExpiry)}</td>
          <td className="py-3">
            <Link className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--leaf)]" href={`/?section=movements&id=${row.productId}`}>
              查看流水和批次
            </Link>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}

function InventoryProductDetail({
  product,
  batches,
  movements,
  detailTab,
  baseHref,
}: {
  product?: Data["products"][number];
  batches: Data["batches"];
  movements: Data["movements"];
  detailTab?: string;
  baseHref: string;
}) {
  if (!product) return null;
  const currentTab = activeTab(detailTab, "batches", ["batches", "movements"]);
  const tabs = [
    { key: "batches", label: `批次结余 ${batches.length}`, href: `${baseHref}&tab=batches` },
    { key: "movements", label: `库存流水 ${movements.length}`, href: `${baseHref}&tab=movements` },
  ];

  return (
    <div className="grid gap-5">
      <Panel title={`${product.code} - ${product.name}`} description="该商品的批次结余和出入库流水。" icon={<Boxes size={18} />}>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="总结余" value={`${batches.reduce((sum, batch) => sum + batch.currentQuantity, 0)} ${normalizedProductUnit(product.unit)}`} />
            <Stat label="可用批次" value={batches.filter((batch) => batch.currentQuantity > 0).length} />
            <Stat label="临近/超允收批次" value={batches.filter((batch) => daysUntil(batch.expiryDate) <= 30 && batch.currentQuantity > 0).length} tone="warning" />
          </div>
          <DetailTabs tabs={tabs} active={currentTab} />
          {currentTab === "batches" ? (
            <DataTable minWidth="860px" headers={["批号", "来源", "初始", "当前", "允收日", "状态"]}>
              {batches.map((batch) => (
                <tr key={batch.id}>
                  <td className="py-3 font-mono text-xs">{batch.batchNo}</td>
                  <td className="py-3">{batch.sourceType === "INITIAL" ? "初始化" : "采购入库"}</td>
                  <td className="py-3">{batch.initialQuantity}</td>
                  <td className="py-3">{batch.currentQuantity}</td>
                  <td className="py-3">{formatDate(batch.expiryDate)}</td>
                  <td className="py-3"><ExpiryBadge expiryDate={batch.expiryDate} /></td>
                </tr>
              ))}
            </DataTable>
          ) : null}
          {currentTab === "movements" ? (
            <DataTable minWidth="860px" headers={["时间", "批号", "数量", "来源单号", "备注"]}>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td className="py-3">{formatDate(movement.createdAt)}</td>
                  <td className="py-3 font-mono text-xs">{movement.stockBatch.batchNo}</td>
                  <td className="py-3 font-mono">{movement.quantity > 0 ? "+" : ""}{movement.quantity}</td>
                  <td className="py-3">{movement.refNo ?? "-"}</td>
                  <td className="py-3 text-[var(--ink-soft)]">{movement.note ?? "-"}</td>
                </tr>
              ))}
            </DataTable>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}

function DataTable({ headers, children, minWidth }: { headers: string[]; children: React.ReactNode; minWidth: string }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-left text-sm" style={{ minWidth }}>
        <thead className="text-xs text-[var(--ink-soft)]">
          <tr>{headers.map((header) => <th className="py-2 pr-4" key={header}>{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">{children}</tbody>
      </table>
    </div>
  );
}

function MasterDirectory({
  data,
  masterType,
  q,
  page,
  pageSize,
  selectedId,
  editId,
  isCreating,
  isImporting,
  detailTab,
}: {
  data: Data;
  masterType: MasterType;
  q: string;
  page: number;
  pageSize: number;
  selectedId?: string;
  editId?: string;
  isCreating: boolean;
  isImporting: boolean;
  detailTab?: string;
}) {
  const activeItems: MasterRow[] = masterType === "products" ? data.products : masterType === "customers" ? data.customers : data.suppliers;
  const paged = paginate(activeItems, page, pageSize);
  const count = activeItems.length;
  const editTitle = editId ? `编辑${masterTabs.find((tab) => tab.key === masterType)?.label}` : `新增${masterTabs.find((tab) => tab.key === masterType)?.label}`;
  const section = sectionForMasterType(masterType);
  const label = masterTabs.find((tab) => tab.key === masterType)?.label ?? "档案";
  const productEdit = masterType === "products" ? (data.edit as ProductFormValue | null) : null;
  const customerEdit = masterType === "customers" ? (data.edit as CustomerFormValue | null) : null;
  const supplierEdit = masterType === "suppliers" ? (data.edit as SupplierFormValue | null) : null;
  const customerOptions = data.customers.filter((item) => item.isActive).map(({ id, name, code }) => ({ id, name, code }));

  return (
    <div className="grid gap-5">
      <Panel
        title={`${label}档案`}
        description="列表为主，先搜索再编辑；停用保留历史单据，不破坏库存账。"
        icon={<Store size={18} />}
        actions={
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <SearchBox q={q} masterType={masterType} />
            {masterType === "products" ? (
              <Link className="focus-ring grid h-10 place-items-center rounded-md border border-[var(--line)] px-4 text-sm font-semibold text-[var(--leaf)]" href={`/?section=products&batch=1`}>
                批量导入
              </Link>
            ) : null}
            <Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href={`/?section=${section}&new=1`}>
              新增
            </Link>
          </div>
        }
      >
        <div className="grid gap-5">
          <div className="rounded-md border border-[var(--line)] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">{label}列表</h3>
              <span className="text-xs text-[var(--ink-soft)]">共 {count} 条，本页 {paged.items.length} 条</span>
            </div>
            <MasterTable items={paged.items} masterType={masterType} selectedId={selectedId} editId={editId} />
            <PaginationControls section={section} q={q} page={paged.currentPage} pageSize={pageSize} total={paged.total} totalPages={paged.totalPages} />
          </div>
        </div>
      </Panel>

      {editId || isCreating ? (
        <Modal title={editTitle} backHref={`/?section=${section}`}>
          {masterType === "products" ? <ProductForm value={productEdit} customers={customerOptions} /> : masterType === "customers" ? <CustomerForm value={customerEdit} /> : <SupplierForm value={supplierEdit} />}
        </Modal>
      ) : null}

      {isImporting && masterType === "products" ? (
        <Modal title="批量导入商品" backHref="/?section=products">
          <BatchImportProductsForm />
        </Modal>
      ) : null}

      {selectedId && data.detail && !editId && !isCreating && !isImporting ? (
        <Modal title={`${label}详情`} backHref={`/?section=${section}`}>
          <MasterDetail data={data} masterType={masterType} detailTab={detailTab} baseHref={`/?section=${section}&id=${selectedId}`} />
        </Modal>
      ) : null}
    </div>
  );
}

function MasterTable({ items, masterType, selectedId, editId }: { items: MasterRow[]; masterType: MasterType; selectedId?: string; editId?: string }) {
  const section = sectionForMasterType(masterType);
  const isProducts = masterType === "products";
  const headers = isProducts ? ["状态", "编码", "名称", "规格/分类", "外部编码", "操作"] : ["状态", "编码", "名称", "资料", "操作"];
  return (
    <DataTable minWidth={isProducts ? "1040px" : "860px"} headers={headers}>
      {items.map((item) => {
        const note = "spec" in item ? [item.spec, item.category].filter(Boolean).join(" / ") : [item.contact, item.phone].filter(Boolean).join(" / ");
        const externalSources = isProducts && "externalCodes" in item ? Array.from(new Set(item.externalCodes.map((code) => code.customer.name))).join("、") : "";
        return (
          <tr key={item.id} className={selectedId === item.id || editId === item.id ? "bg-[#f2f7ef]" : ""}>
            <td className="py-3"><ActiveBadge isActive={item.isActive} /></td>
            <td className="py-3 font-mono text-xs">{item.code}</td>
            <td className="py-3 font-medium">{item.name}</td>
            <td className="py-3 text-[var(--ink-soft)]">{note || "-"}</td>
            {isProducts ? (
              <td className="py-3 text-[var(--ink-soft)]">{externalSources || <span className="text-xs">未映射</span>}</td>
            ) : null}
            <td className="py-3">
              <div className="flex flex-wrap items-start gap-2">
                <Link className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--leaf)]" href={`/?section=${section}&edit=${item.id}`}>编辑</Link>
                <Link className="rounded-md border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--leaf)]" href={`/?section=${section}&id=${item.id}`}>详情</Link>
                <ToggleActiveForm id={item.id} isActive={item.isActive} type={masterType === "products" ? "product" : masterType === "customers" ? "customer" : "supplier"} />
              </div>
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}

function MasterDetail({ data, masterType, detailTab, baseHref }: { data: Data; masterType: MasterType; detailTab?: string; baseHref: string }) {
  if (!data.detail) {
    return (
      <Panel title="关联进销存" description="从列表点“流水”，这里显示商品、客户或供应商的业务记录。" icon={<ClipboardList size={18} />}>
        <EmptyState text="尚未选择档案。" />
      </Panel>
    );
  }

  if (masterType === "products" && "stockBatches" in data.detail) {
    const detail = data.detail;
    const currentTab = activeTab(detailTab, "batches", ["codes", "batches", "movements", "purchase", "sales", "outbound"]);
    const tabs = [
      { key: "batches", label: `库存批次 ${detail.stockBatches.length}`, href: `${baseHref}&tab=batches` },
      { key: "movements", label: `库存流水 ${detail.stockMovements.length}`, href: `${baseHref}&tab=movements` },
      { key: "purchase", label: `采购记录 ${detail.purchaseItems.length}`, href: `${baseHref}&tab=purchase` },
      { key: "sales", label: `销售记录 ${detail.salesItems.length}`, href: `${baseHref}&tab=sales` },
      { key: "outbound", label: `出库记录 ${detail.outboundItems.length}`, href: `${baseHref}&tab=outbound` },
      { key: "codes", label: `外部编码 ${detail.externalCodes.length}`, href: `${baseHref}&tab=codes` },
    ];
    return (
      <Panel title={`${detail.code} - ${detail.name}`} description="商品关联的库存、采购、销售和出库记录。" icon={<Boxes size={18} />}>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="当前库存" value={detail.stockBatches.reduce((sum, batch) => sum + batch.currentQuantity, 0)} />
            <Stat label="采购记录" value={detail.purchaseItems.length} />
            <Stat label="销售记录" value={detail.salesItems.length} />
          </div>
          <DetailTabs tabs={tabs} active={currentTab} />
          {currentTab === "batches" ? <SimpleTable title="库存批次" headers={["批号", "库存", "允收日"]} rows={detail.stockBatches.map((batch) => [batch.batchNo, batch.currentQuantity, formatDate(batch.expiryDate)])} /> : null}
          {currentTab === "movements" ? <SimpleTable title="库存流水" headers={["时间", "数量", "来源"]} rows={detail.stockMovements.map((move) => [formatDate(move.createdAt), move.quantity, move.refNo ?? "-"])} /> : null}
          {currentTab === "purchase" ? <SimpleTable title="采购记录" headers={["入库单", "供应商", "数量", "批号"]} rows={detail.purchaseItems.map((item) => [item.purchaseOrder.orderNo, item.purchaseOrder.supplier.name, item.quantity, item.batchNo])} /> : null}
          {currentTab === "sales" ? <SimpleTable title="销售记录" headers={["销售单", "客户", "数量", "状态"]} rows={detail.salesItems.map((item) => [item.salesOrder.orderNo, item.salesOrder.customer.name, item.quantity, item.salesOrder.status])} /> : null}
          {currentTab === "outbound" ? <SimpleTable title="出库记录" headers={["出库单", "客户", "批号", "数量"]} rows={detail.outboundItems.map((item) => [item.outboundOrder.outboundNo, item.outboundOrder.customer.name, item.stockBatch.batchNo, item.quantity])} /> : null}
          {currentTab === "codes" ? <SimpleTable title="外部编码映射" headers={["订单来源", "外部编码", "外部名称"]} rows={detail.externalCodes.map((code) => [code.customer.name, code.externalCode, code.externalName ?? "-"])} /> : null}
        </div>
      </Panel>
    );
  }

  if (masterType === "customers" && "salesOrders" in data.detail) {
    const detail = data.detail;
    const currentTab = activeTab(detailTab, "sales", ["sales", "outbound"]);
    const tabs = [
      { key: "sales", label: `销售订单 ${detail.salesOrders.length}`, href: `${baseHref}&tab=sales` },
      { key: "outbound", label: `出库记录 ${detail.outbounds.length}`, href: `${baseHref}&tab=outbound` },
    ];
    return (
      <Panel title={`${detail.code} - ${detail.name}`} description="客户关联的订单和出库记录。" icon={<ShoppingCart size={18} />}>
        <div className="grid gap-4">
          <DetailTabs tabs={tabs} active={currentTab} />
          {currentTab === "sales" ? (
            <SimpleTable
              title="销售订单"
              headers={["订单", "状态", "商品"]}
              rows={detail.salesOrders.map((order) => [order.orderNo, order.status, order.items.map((item) => `${item.product.name} x ${item.quantity}`).join("，")])}
            />
          ) : null}
          {currentTab === "outbound" ? (
            <SimpleTable
              title="出库记录"
              headers={["出库单", "状态", "商品"]}
              rows={detail.outbounds.map((order) => [order.outboundNo, order.status, order.items.map((item) => `${item.product.name} / ${item.stockBatch.batchNo} x ${item.quantity}`).join("，")])}
            />
          ) : null}
        </div>
      </Panel>
    );
  }

  if (masterType === "suppliers" && "purchaseOrders" in data.detail) {
    const detail = data.detail;
    return (
      <Panel title={`${detail.code} - ${detail.name}`} description="供应商关联的采购入库记录。" icon={<Factory size={18} />}>
        <SimpleTable
          title="采购入库记录"
          headers={["入库单", "日期", "商品"]}
          rows={detail.purchaseOrders.map((order) => [order.orderNo, formatDate(order.orderDate), order.items.map((item) => `${item.product.name} x ${item.quantity}`).join("，")])}
        />
      </Panel>
    );
  }

  return null;
}

function SimpleTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-white p-4">
      <h4 className="mb-3 font-semibold">{title}</h4>
      {rows.length === 0 ? <EmptyState text="暂无记录。" /> : <DataTable minWidth="520px" headers={headers}>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td className="py-2 pr-4" key={cellIndex}>{cell}</td>)}</tr>)}</DataTable>}
    </div>
  );
}

export default async function Home({ searchParams }: { searchParams?: Promise<SearchParams> }) {
  const resolvedSearchParams = await searchParams;
  const activeSection = getSection(resolvedSearchParams?.section);
  const masterType = getMasterType(resolvedSearchParams?.type, activeSection);
  const q = firstParam(resolvedSearchParams?.q) ?? "";
  const selectedId = firstParam(resolvedSearchParams?.id);
  const editId = firstParam(resolvedSearchParams?.edit);
  const isCreating = firstParam(resolvedSearchParams?.new) === "1";
  const isImporting = firstParam(resolvedSearchParams?.batch) === "1";
  const shipSalesOrderId = firstParam(resolvedSearchParams?.ship);
  const outboundEditId = firstParam(resolvedSearchParams?.outboundEdit);
  const returnOutboundId = firstParam(resolvedSearchParams?.return);
  const exchangeSalesOrderId = firstParam(resolvedSearchParams?.exchange);
  const detailTab = firstParam(resolvedSearchParams?.tab);
  const page = positiveInt(resolvedSearchParams?.page, 1);
  const pageSize = pageSizeValue(resolvedSearchParams?.pageSize);

  let data: Data;
  try {
    data = await loadData({
      masterType,
      q,
      id: selectedId,
      edit: editId,
      salesEditId: activeSection === "sales" ? editId : undefined,
      outboundEditId: activeSection === "sales" ? outboundEditId : activeSection === "outbound" ? editId : undefined,
    });
  } catch (error) {
    return (
      <main className="mx-auto grid min-h-screen max-w-3xl place-items-center p-6">
        <section className="rounded-lg border border-[var(--line)] bg-[var(--paper)] p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-[var(--tomato)]">
            <AlertTriangle size={20} />
            <h1 className="text-xl font-semibold">数据库还没有连接</h1>
          </div>
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            请配置 PostgreSQL 的 <code className="font-mono">DATABASE_URL</code>，然后执行 <code className="font-mono">npx prisma db push</code>。
          </p>
          <pre className="mt-4 max-h-80 overflow-auto rounded-md bg-[#17201a] p-4 text-xs text-white">{String(error)}</pre>
        </section>
      </main>
    );
  }

  const stockByProduct = new Map<string, number>();
  for (const batch of data.batches) {
    stockByProduct.set(batch.productId, (stockByProduct.get(batch.productId) ?? 0) + batch.currentQuantity);
  }
  const productOptions = data.products
    .filter((item) => item.isActive)
    .map(({ id, name, code, unit, spec }) => ({
      id,
      name,
      code,
      unit: normalizedProductUnit(unit),
      stock: stockByProduct.get(id) ?? 0,
      note: spec,
    }));
  const customerOptions = data.customers.filter((item) => item.isActive).map(({ id, name, code }) => ({ id, name, code }));
  const supplierOptions = data.suppliers.filter((item) => item.isActive).map(({ id, name, code }) => ({ id, name, code }));
  const shippableOrders = data.salesOrders
    .filter((order) => order.status !== "COMPLETED" && order.status !== "CANCELLED")
    .map((order) => {
      const confirmedOutbound = order.outbounds.find((outbound) => outbound.status === "CONFIRMED");
      const draftOutbound = order.outbounds.find((outbound) => outbound.status === "DRAFT");
      if (confirmedOutbound) return null;
      return {
        id: order.id,
        name: `${order.orderNo} - ${order.customer.name}`,
        draftOutboundId: draftOutbound?.id,
        items: order.items
          .map((item) => ({
            productId: item.productId,
            productName: item.product.name,
            productCode: item.product.code,
            quantity: item.quantity,
            orderedQuantity: item.quantity,
            shippedQuantity: 0,
          }))
          .filter((item) => item.quantity > 0),
      };
    })
    .filter((order): order is NonNullable<typeof order> => Boolean(order && order.items.length > 0));
  const batchOptions = data.batches.map((batch) => ({
    id: batch.id,
    productId: batch.productId,
    batchNo: batch.batchNo,
    currentQuantity: batch.currentQuantity,
    expiryDate: formatDate(batch.expiryDate),
    sourceType: batch.sourceType,
  }));
  const totalStock = data.batches.reduce((sum, batch) => sum + batch.currentQuantity, 0);
  const expired = data.batches.filter((batch) => daysUntil(batch.expiryDate) < 0 && batch.currentQuantity > 0).length;
  const openOrders = data.salesOrders.filter((order) => order.status !== "COMPLETED" && order.status !== "CANCELLED").length;
  const inventoryRows: InventoryBalanceRow[] = data.products.map((product) => {
    const productBatches = data.batches.filter((batch) => batch.productId === product.id);
    const activeBatches = productBatches.filter((batch) => batch.currentQuantity > 0);
    const earliestExpiry = activeBatches[0]?.expiryDate;
    return {
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      spec: product.spec,
      unit: normalizedProductUnit(product.unit),
      totalQuantity: productBatches.reduce((sum, batch) => sum + batch.currentQuantity, 0),
      batchCount: activeBatches.length,
      expiringCount: activeBatches.filter((batch) => daysUntil(batch.expiryDate) <= 30 && daysUntil(batch.expiryDate) >= 0).length,
      expiredCount: activeBatches.filter((batch) => daysUntil(batch.expiryDate) < 0).length,
      earliestExpiry,
    };
  });
  const inventoryFiltered = q
    ? inventoryRows.filter((row) => textIncludes(row.productCode, q) || textIncludes(row.productName, q) || textIncludes(row.spec, q))
    : inventoryRows;
  const purchaseFiltered = q
    ? data.purchaseOrders.filter((order) =>
        textIncludes(order.orderNo, q) ||
        textIncludes(order.supplier.name, q) ||
        order.items.some((item) => textIncludes(item.product.code, q) || textIncludes(item.product.name, q) || textIncludes(item.batchNo, q)),
      )
    : data.purchaseOrders;
  const salesFiltered = q
    ? data.salesOrders.filter((order) =>
        textIncludes(order.orderNo, q) ||
        textIncludes(order.customer.name, q) ||
        textIncludes(order.status, q) ||
        order.items.some((item) => textIncludes(item.product.code, q) || textIncludes(item.product.name, q)),
      )
    : data.salesOrders;
  const outboundFiltered = q
    ? data.outboundOrders.filter((order) =>
        textIncludes(order.outboundNo, q) ||
        textIncludes(order.customer.name, q) ||
        order.items.some((item) => textIncludes(item.product.code, q) || textIncludes(item.product.name, q) || textIncludes(item.stockBatch.batchNo, q)),
      )
    : data.outboundOrders;
  const returnFiltered = q
    ? data.returnOrders.filter((order) =>
        textIncludes(order.returnNo, q) ||
        textIncludes(order.outboundOrder.outboundNo, q) ||
        textIncludes(order.customer.name, q) ||
        textIncludes(order.reason, q) ||
        order.items.some((item) => textIncludes(item.product.code, q) || textIncludes(item.product.name, q) || textIncludes(item.stockBatch.batchNo, q)),
      )
    : data.returnOrders;
  const exchangeFiltered = q
    ? data.exchangeOrders.filter((order) =>
        textIncludes(order.exchangeNo, q) ||
        textIncludes(order.customer.name, q) ||
        textIncludes(order.reason, q) ||
        order.returnItems.some((item) => textIncludes(item.product.code, q) || textIncludes(item.product.name, q)) ||
        order.outItems.some((item) => textIncludes(item.product.code, q) || textIncludes(item.product.name, q)),
      )
    : data.exchangeOrders;
  const purchasePage = paginate(purchaseFiltered, page, pageSize);
  const salesPage = paginate(salesFiltered, page, pageSize);
  const outboundPage = paginate(outboundFiltered, page, pageSize);
  const returnPage = paginate(returnFiltered, page, pageSize);
  const exchangePage = paginate(exchangeFiltered, page, pageSize);
  const inventoryPage = paginate(inventoryFiltered, page, pageSize);
  const selectedInventoryProduct = selectedId ? data.products.find((product) => product.id === selectedId) : undefined;
  const selectedInventoryBatches = selectedId ? data.batches.filter((batch) => batch.productId === selectedId) : [];
  const selectedInventoryMovements = selectedId ? data.movements.filter((movement) => movement.productId === selectedId) : [];
  const selectedSalesOrder = activeSection === "sales" && selectedId ? data.salesOrders.find((order) => order.id === selectedId) : undefined;
  const selectedSalesOutbounds = selectedSalesOrder ? data.outboundOrders.filter((order) => order.salesOrderId === selectedSalesOrder.id) : [];
  const selectedSalesReturns = selectedSalesOrder ? data.returnOrders.filter((order) => order.outboundOrder.salesOrderId === selectedSalesOrder.id) : [];
  const selectedSalesExchanges = selectedSalesOrder ? data.exchangeOrders.filter((order) => order.salesOrderId === selectedSalesOrder.id) : [];
  const salesActionModalOpen = Boolean(isCreating || editId || returnOutboundId || exchangeSalesOrderId || shipSalesOrderId || outboundEditId);
  const returnableOutbounds = data.outboundOrders
    .filter((order) => order.status === "CONFIRMED")
    .map((order) => ({
      id: order.id,
      name: `${order.outboundNo} - ${order.customer.name}`,
      items: order.items
        .map((item) => ({
          id: item.id,
          productId: item.productId,
          productCode: item.product.code,
          productName: item.product.name,
          batchNo: item.stockBatch.batchNo,
          quantity: item.quantity,
          returnedQuantity: item.returnItems.reduce((sum, returnItem) => sum + returnItem.quantity, 0),
        }))
        .filter((item) => item.quantity > item.returnedQuantity),
    }))
    .filter((order) => order.items.length > 0);
  const returnableOutboundIds = new Set(returnableOutbounds.map((outbound) => outbound.id));
  const selectedExchangeOrder = exchangeSalesOrderId ? data.salesOrders.find((order) => order.id === exchangeSalesOrderId) : undefined;
  const selectedExchangeOutbound = selectedExchangeOrder
    ? data.outboundOrders.find((outbound) => outbound.salesOrderId === selectedExchangeOrder.id && outbound.status === "CONFIRMED")
    : undefined;
  const selectedExchangeReturnRows =
    selectedExchangeOutbound?.items
      .filter((item) => item.quantity > item.returnItems.reduce((sum, returnItem) => sum + returnItem.quantity, 0))
      .map((item) => ({
        productId: item.productId,
        stockBatchId: item.stockBatchId,
        quantity: 0,
        maxQuantity: item.quantity - item.returnItems.reduce((sum, returnItem) => sum + returnItem.quantity, 0),
      })) ?? [];
  const selectedShippableOrder = shipSalesOrderId ? shippableOrders.find((order) => order.id === shipSalesOrderId) : undefined;

  return (
    <main className="grid min-h-screen bg-[var(--background)] lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden min-h-screen border-r border-[var(--line)] bg-[#17201a] text-white lg:block">
        <div className="sticky top-0 flex h-screen flex-col">
          <div className="border-b border-white/10 px-5 py-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-[var(--leaf)]"><Archive size={20} /></span>
              <div>
                <div className="text-base font-semibold">食品进销存</div>
                <div className="text-xs text-white/60">便利店供货管理</div>
              </div>
            </div>
          </div>
          <nav className="grid gap-1 px-3 py-4">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const active = item.key === activeSection;
              return (
                <Link className={`focus-ring flex h-10 items-center gap-3 rounded-md px-3 text-sm transition ${active ? "bg-white/12 text-white" : "text-white/78 hover:bg-white/10 hover:text-white"}`} href={`/?section=${item.key}`} key={item.key}>
                  <Icon size={17} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto border-t border-white/10 p-4 text-xs leading-5 text-white/58">
            PostgreSQL 已连接<br />批次追踪 · 允收日管理
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--paper)]/95 backdrop-blur">
          <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold text-[var(--leaf)]">jxc.aiboxpro.cn</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{sectionTitles[activeSection]}</h1>
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-[var(--ink-soft)]">
              <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5">喜市多</span>
              <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5">全家</span>
              <span className="rounded-full border border-[var(--line)] bg-white px-3 py-1.5">美宜家</span>
            </div>
          </div>
        </header>

        <div className="grid max-w-[1500px] gap-5 px-5 py-5">
          {activeSection === "overview" ? (
            <Panel title="业务概览" description="实时查看库存、订单和允收风险。" icon={<LayoutDashboard size={18} />}>
              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <Stat label="商品档案" value={data.counts.products} />
                  <Stat label="客户数量" value={data.counts.customers} />
                  <Stat label="供应商数量" value={data.counts.suppliers} />
                  <Stat label="待处理订单" value={openOrders} tone="warning" />
                  <Stat label="超允收批次" value={expired} tone="danger" />
                </div>
                <div className="rounded-md border border-[var(--line)] bg-white p-4 text-sm text-[var(--ink-soft)]">当前库存：{totalStock}，临近/超允收批次：{data.batches.filter((batch) => daysUntil(batch.expiryDate) <= 30 && batch.currentQuantity > 0).length}</div>
              </div>
            </Panel>
          ) : null}

          {activeSection === "purchase" ? (
            <div className="grid gap-5">
              <Panel
                title="入库单列表"
                description="先查列表，再新增；正式业务里单据和新增不能混成一个视图。"
                icon={<ClipboardList size={18} />}
                actions={<Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href="/?section=purchase&new=1">新增入库</Link>}
              >
                <div className="mb-4">
                  <ListSearchBox section="purchase" q={q} pageSize={pageSize} />
                </div>
                <PurchaseList purchaseOrders={purchasePage.items} />
                <PaginationControls section="purchase" q={q} page={purchasePage.currentPage} pageSize={pageSize} total={purchasePage.total} totalPages={purchasePage.totalPages} />
              </Panel>
              {isCreating ? (
                <Modal title="新增采购入库" backHref="/?section=purchase">
                  <PurchaseForm products={productOptions} suppliers={supplierOptions} />
                </Modal>
              ) : null}
            </div>
          ) : null}

          {activeSection === "sales" ? (
            <div className="grid gap-5">
              <Panel
                title="销售订单列表"
                description="待出库订单可以取消，已出库订单保留历史。"
                icon={<ClipboardList size={18} />}
                actions={<Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href="/?section=sales&new=1">新增订单</Link>}
              >
                <div className="mb-4">
                  <ListSearchBox section="sales" q={q} pageSize={pageSize} />
                </div>
                <SalesOrderList salesOrders={salesPage.items} selectedId={selectedId} />
                <PaginationControls section="sales" q={q} page={salesPage.currentPage} pageSize={pageSize} total={salesPage.total} totalPages={salesPage.totalPages} />
              </Panel>
              {selectedSalesOrder && !salesActionModalOpen ? (
                <Modal title={`订单详情 ${selectedSalesOrder.orderNo}`} backHref="/?section=sales">
                  <SalesOrderDetail
                    order={selectedSalesOrder}
                    outboundOrders={selectedSalesOutbounds}
                    returnOrders={selectedSalesReturns}
                  exchangeOrders={selectedSalesExchanges}
                  returnableOutboundIds={returnableOutboundIds}
                  canShip={Boolean(shippableOrders.find((order) => order.id === selectedSalesOrder.id))}
                  detailTab={detailTab}
                  baseHref={`/?section=sales&id=${selectedSalesOrder.id}`}
                />
              </Modal>
              ) : null}
              {isCreating ? (
                <Modal title="新增销售订单" backHref="/?section=sales">
                  <SalesOrderForm products={productOptions} customers={customerOptions} externalMappings={data.externalCodes} />
                </Modal>
              ) : null}
              {editId && data.salesEdit ? (
                <Modal title={`编辑销售订单 ${data.salesEdit.orderNo}`} backHref="/?section=sales">
                  <SalesOrderForm products={productOptions} customers={customerOptions} externalMappings={data.externalCodes} value={data.salesEdit as SalesOrderFormValue} />
                </Modal>
              ) : null}
              {returnOutboundId ? (
                <Modal title="订单退货处理" backHref={selectedId ? `/?section=sales&id=${selectedId}` : "/?section=sales"}>
                  {returnableOutbounds.length > 0 ? <ReturnOrderForm outbounds={returnableOutbounds} defaultOutboundId={returnOutboundId} /> : <EmptyState text="暂无可退货的已确认出库单。" />}
                </Modal>
              ) : null}
              {selectedExchangeOrder ? (
                <Modal title={`订单换货处理 ${selectedExchangeOrder.orderNo}`} backHref={`/?section=sales&id=${selectedExchangeOrder.id}`}>
                  {selectedExchangeReturnRows.length > 0 ? (
                    <ExchangeForm
                      customers={customerOptions}
                      products={productOptions}
                      batches={batchOptions}
                      defaultCustomerId={selectedExchangeOrder.customerId}
                      salesOrderId={selectedExchangeOrder.id}
                      initialReturnRows={selectedExchangeReturnRows}
                    />
                  ) : (
                    <EmptyState text="该订单已全退，不能再从订单发起换货。" />
                  )}
                </Modal>
              ) : null}
              {shipSalesOrderId ? (
                <Modal title="订单出库" backHref={selectedId ? `/?section=sales&id=${selectedId}` : "/?section=sales"}>
                  {selectedShippableOrder ? <ShipOrderForm orders={shippableOrders} batches={batchOptions} defaultOrderId={shipSalesOrderId} /> : <EmptyState text="该订单暂无可出库明细。" />}
                </Modal>
              ) : null}
              {outboundEditId && data.outboundEdit ? (
                <Modal title={`编辑出库单 ${data.outboundEdit.outboundNo}`} backHref={selectedId ? `/?section=sales&id=${selectedId}` : "/?section=sales"}>
                  <ShipOrderForm orders={shippableOrders} batches={batchOptions} draft={data.outboundEdit} />
                </Modal>
              ) : null}
            </div>
          ) : null}

          {activeSection === "outbound" ? (
            <div className="grid gap-5">
              <Panel
                title="出库记录列表"
                description="出库记录是库存账的一部分，不做随意删除。"
                icon={<Truck size={18} />}
                actions={<Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href="/?section=outbound&new=1">订单出库</Link>}
              >
                <div className="mb-4">
                  <ListSearchBox section="outbound" q={q} pageSize={pageSize} />
                </div>
                <OutboundList outboundOrders={outboundPage.items} />
                <PaginationControls section="outbound" q={q} page={outboundPage.currentPage} pageSize={pageSize} total={outboundPage.total} totalPages={outboundPage.totalPages} />
              </Panel>
              {isCreating ? (
                <Modal title="订单出库" backHref="/?section=outbound">
                  {shippableOrders.length > 0 ? <ShipOrderForm orders={shippableOrders} batches={batchOptions} /> : <EmptyState text="暂无待出库订单。" />}
                </Modal>
              ) : null}
              {editId && data.outboundEdit ? (
                <Modal title={`编辑出库单 ${data.outboundEdit.outboundNo}`} backHref="/?section=outbound">
                  <ShipOrderForm orders={shippableOrders} batches={batchOptions} draft={data.outboundEdit} />
                </Modal>
              ) : null}
            </div>
          ) : null}

          {activeSection === "returns" ? (
            <div className="grid gap-5">
              <Panel
                title="退货记录"
                description="货配错、客户退货、破损退回，都从已确认出库单发起，库存加回原批次并留下流水。"
                icon={<ClipboardList size={18} />}
                actions={<Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href="/?section=returns&new=1">新增退货</Link>}
              >
                <div className="mb-4">
                  <ListSearchBox section="returns" q={q} pageSize={pageSize} />
                </div>
                <ReturnList returnOrders={returnPage.items} />
                <PaginationControls section="returns" q={q} page={returnPage.currentPage} pageSize={pageSize} total={returnPage.total} totalPages={returnPage.totalPages} />
              </Panel>
              {isCreating ? (
                <Modal title="新增退货处理" backHref="/?section=returns">
                  {returnableOutbounds.length > 0 ? <ReturnOrderForm outbounds={returnableOutbounds} /> : <EmptyState text="暂无可退货的已确认出库单。" />}
                </Modal>
              ) : null}
            </div>
          ) : null}

          {activeSection === "exchange" ? (
            <div className="grid gap-5">
              <Panel
                title="换货记录"
                description="临期/过期/错发换货：客户退回的商品加回批次库存，换出的商品从批次扣减，一次完成双向库存。"
                icon={<ArrowLeftRight size={18} />}
                actions={<Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href="/?section=exchange&new=1">新增换货</Link>}
              >
                <div className="mb-4">
                  <ListSearchBox section="exchange" q={q} pageSize={pageSize} placeholder="按换货单号、客户、原因、商品搜索" />
                </div>
                <ExchangeList exchangeOrders={exchangePage.items} />
                <PaginationControls section="exchange" q={q} page={exchangePage.currentPage} pageSize={pageSize} total={exchangePage.total} totalPages={exchangePage.totalPages} />
              </Panel>
              {isCreating ? (
                <Modal title="新增换货处理" backHref="/?section=exchange">
                  <ExchangeForm customers={customerOptions} products={productOptions} batches={batchOptions} />
                </Modal>
              ) : null}
            </div>
          ) : null}

          {activeSection === "products" || activeSection === "customers" || activeSection === "suppliers" ? (
            <MasterDirectory data={data} masterType={masterType} q={q} page={page} pageSize={pageSize} selectedId={selectedId} editId={editId} isCreating={isCreating} isImporting={isImporting} detailTab={detailTab} />
          ) : null}

          {activeSection === "movements" ? (
            <div className="grid gap-5">
              <Panel
                title="库存结余"
                description="先看商品总结余，再进入商品查看批次和流水。"
                icon={<Boxes size={18} />}
                actions={<Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href="/?section=movements&new=1">库存初始化</Link>}
              >
                <div className="mb-4">
                  <ListSearchBox section="movements" q={q} pageSize={pageSize} placeholder="按商品编码、名称、规格搜索" />
                </div>
                <InventoryBalanceList rows={inventoryPage.items} selectedId={selectedId} />
                <PaginationControls section="movements" q={q} page={inventoryPage.currentPage} pageSize={pageSize} total={inventoryPage.total} totalPages={inventoryPage.totalPages} />
              </Panel>
              {selectedId && !isCreating ? (
                <Modal title="商品库存详情" backHref="/?section=movements">
                  <InventoryProductDetail product={selectedInventoryProduct} batches={selectedInventoryBatches} movements={selectedInventoryMovements} detailTab={detailTab} baseHref={`/?section=movements&id=${selectedId}`} />
                </Modal>
              ) : null}
              {isCreating ? (
                <Modal title="批量库存初始化" backHref="/?section=movements">
                  <StockInitForm products={productOptions} />
                </Modal>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
