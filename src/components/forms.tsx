"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import {
  cancelSalesOrder,
  confirmExchangeInbound,
  confirmExchangeOutbound,
  confirmOutboundOrder,
  confirmReturnInbound,
  createExchangeOrder,
  createPurchase,
  createReturnOrder,
  createSalesOrder,
  initializeStock,
  batchImportProducts,
  saveCustomer,
  saveProduct,
  saveSupplier,
  setCustomerActive,
  setProductActive,
  setSupplierActive,
  shipSalesOrder,
  updateSalesOrder,
} from "@/lib/actions";
import type { ActionState } from "@/lib/actions";
import { downloadExcelTemplate, parseExcelToText } from "@/lib/excel";

type Option = {
  id: string;
  name: string;
  code?: string;
  stock?: number;
  unit?: string;
  note?: string;
};

type BatchOption = {
  id: string;
  productId: string;
  batchNo: string;
  currentQuantity: number;
  expiryDate: string;
  sourceType: string;
};

type ShippableOrder = {
  id: string;
  name: string;
  draftOutboundId?: string;
  items: Array<{
    productId: string;
    productName: string;
    productCode: string;
    quantity: number;
    orderedQuantity: number;
    shippedQuantity: number;
  }>;
};

type DraftOutbound = {
  id: string;
  salesOrderId: string | null;
  outboundDate?: Date | string | null;
  remark?: string | null;
  items: Array<{
    productId: string;
    stockBatchId: string;
    quantity: number;
  }>;
};

type ProductExternalMapping = {
  id: string;
  customerId: string;
  productId: string;
  externalCode: string;
  externalName?: string | null;
  remark?: string | null;
  product?: Option;
  customer?: Option;
};

type ReturnableOutbound = {
  id: string;
  name: string;
  items: Array<{
    id: string;
    productId: string;
    productCode: string;
    productName: string;
    batchNo: string;
    quantity: number;
    returnedQuantity: number;
  }>;
};

export type ProductFormValue = {
  id?: string;
  code?: string;
  name?: string;
  spec?: string;
  unit?: string;
  barcode?: string | null;
  category?: string | null;
  shelfLifeDays?: number;
  minStock?: number;
  isActive?: boolean;
  externalCodes?: Array<{
    id?: string;
    customerId: string;
    externalCode: string;
    externalName?: string | null;
  }>;
};

export type CustomerFormValue = {
  id?: string;
  code?: string;
  name?: string;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  paymentNote?: string | null;
  remark?: string | null;
  isActive?: boolean;
};

export type SupplierFormValue = {
  id?: string;
  code?: string;
  name?: string;
  contact?: string | null;
  phone?: string | null;
  address?: string | null;
  remark?: string | null;
  isActive?: boolean;
};

export type SalesOrderFormValue = {
  id: string;
  customerId: string;
  orderDate?: Date | string | null;
  deliveryDate?: Date | string | null;
  remark?: string | null;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: unknown;
    validDeliveryDate?: Date | string | null;
  }>;
};

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

const initialActionState: ActionState = {
  ok: false,
  message: "",
};

function toDateInputValue(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function Field({
  label,
  name,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number | null;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm text-[var(--ink-soft)]">
      <span>{label}</span>
      <input
        className="focus-ring h-10 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 text-[var(--foreground)]"
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? undefined}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <label className="grid gap-1.5 text-sm text-[var(--ink-soft)]">
      <span>{label}</span>
      <textarea
        className="focus-ring min-h-20 resize-y rounded-md border border-[var(--line)] bg-white px-3 py-2 text-[var(--foreground)]"
        name={name}
        defaultValue={defaultValue ?? undefined}
      />
    </label>
  );
}

function SearchSelect({
  label,
  name,
  options,
  defaultId,
  onSelectedChange,
}: {
  label: string;
  name: string;
  options: Option[];
  defaultId?: string;
  onSelectedChange?: (id: string) => void;
}) {
  const firstOption = options.find((option) => option.id === defaultId) ?? options[0];
  const [query, setQuery] = useState(firstOption ? formatOption(firstOption) : "");
  const [selectedId, setSelectedId] = useState(firstOption?.id ?? "");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return options.slice(0, 12);
    return options
      .filter((option) => `${option.code ?? ""} ${option.name} ${formatOption(option)}`.toLowerCase().includes(value))
      .slice(0, 12);
  }, [options, query]);
  const selectedOption = options.find((option) => option.id === selectedId);

  function choose(option: Option) {
    setSelectedId(option.id);
    setQuery(formatOption(option));
    onSelectedChange?.(option.id);
    setOpen(false);
  }

  return (
    <div className="relative grid gap-1.5 text-sm text-[var(--ink-soft)]">
      <label htmlFor={`${name}-search`}>{label}</label>
      <input name={name} type="hidden" value={selectedId} />
      <input
        className="focus-ring h-10 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 text-[var(--foreground)]"
        id={`${name}-search`}
        placeholder={`输入${label}编码或名称搜索`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedId("");
          onSelectedChange?.("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open ? (
        <div className="absolute left-0 right-0 top-[72px] z-30 max-h-72 overflow-auto rounded-md border border-[var(--line)] bg-white p-1 shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <button
                className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[#eef5f0]"
                key={option.id}
                onClick={() => choose(option)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate">{formatOption(option)}</span>
                  {option.note ? <span className="block text-xs text-[var(--ink-soft)]">{option.note}</span> : null}
                </span>
                <span className="ml-3 shrink-0 text-xs text-[var(--leaf)]">
                  {option.stock !== undefined ? `库存 ${option.stock} ${option.unit ?? ""}` : option.id === selectedId ? "已选" : null}
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-[var(--ink-soft)]">没有匹配结果</div>
          )}
        </div>
      ) : null}
      <span className="min-h-4 text-xs text-[var(--ink-soft)]">
        {selectedOption ? selectedSummary(selectedOption) : `请先搜索并选择${label}`}
      </span>
    </div>
  );
}

function SearchableDropdown<T extends { id: string }>({
  value,
  options,
  getLabel,
  onChange,
  placeholder = "搜索选择",
}: {
  value: string;
  options: T[];
  getLabel: (option: T) => string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const selected = options.find((option) => option.id === value);
  const [query, setQuery] = useState(selected ? getLabel(selected) : "");
  const [open, setOpen] = useState(false);

  function choose(option: T) {
    onChange(option.id);
    setQuery(getLabel(option));
    setOpen(false);
  }

  useEffect(() => {
    const nextSelected = options.find((option) => option.id === value);
    setQuery(nextSelected ? getLabel(nextSelected) : "");
  }, [getLabel, options, value]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword || (selected && query === getLabel(selected))) return options.slice(0, 80);
    return options.filter((option) => getLabel(option).toLowerCase().includes(keyword)).slice(0, 80);
  }, [getLabel, options, query, selected]);

  return (
    <div className="relative">
      <input
        className="focus-ring h-9 w-full min-w-[180px] rounded-md border border-[var(--line)] bg-white px-2 text-[var(--foreground)]"
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
      />
      {open ? (
        <div className="absolute left-0 right-0 top-10 z-40 max-h-64 overflow-auto rounded-md border border-[var(--line)] bg-white p-1 shadow-lg">
          {filtered.length > 0 ? (
            filtered.map((option) => (
              <button
                className="w-full rounded px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[#eef5f0]"
                key={option.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
              >
                {getLabel(option)}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-[var(--ink-soft)]">没有匹配结果</div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatOption(option: Option) {
  return option.code ? `${option.code} - ${option.name}` : option.name;
}

function selectedSummary(option: Option) {
  const stock = option.stock !== undefined ? `，可用库存 ${option.stock} ${option.unit ?? ""}` : "";
  return `当前选择：${formatOption(option)}${stock}`;
}

function Submit({ children, danger = false }: { children: React.ReactNode; danger?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      className={`focus-ring h-10 rounded-md px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
        danger
          ? "border border-[var(--tomato)] bg-white text-[var(--tomato)] hover:bg-[#fff3f0]"
          : "bg-[var(--leaf)] text-white hover:bg-[var(--leaf-deep)]"
      }`}
      disabled={pending}
    >
      {pending ? "处理中..." : children}
    </button>
  );
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
    <p
      className={`rounded-md px-3 py-2 text-sm ${
        state.ok ? "bg-[#e3efe9] text-[var(--leaf)]" : "bg-[#f7d9d3] text-[var(--tomato)]"
      }`}
    >
      {state.message}
    </p>
  );
}

function ManagedForm({
  action,
  children,
  submitLabel,
  successHref,
  successLabel = "返回列表",
}: {
  action: FormAction;
  children: React.ReactNode;
  submitLabel: string;
  successHref?: string;
  successLabel?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <form action={formAction} className="grid gap-3">
      {children}
      {state.ok && successHref ? (
        <Link className="focus-ring grid h-10 place-items-center rounded-md bg-[var(--leaf)] px-4 text-sm font-semibold text-white" href={successHref}>
          {successLabel}
        </Link>
      ) : (
        <Submit>{submitLabel}</Submit>
      )}
      <ActionMessage state={state} />
    </form>
  );
}

/**
 * Excel 导入按钮组：下载模板 + 选择 Excel 文件解析为 Tab 文本。
 * onImport 回调把解析结果填入粘贴框，复用现有粘贴导入逻辑。
 */
export function ExcelImportButtons({
  filename,
  headers,
  exampleRows,
  onImport,
}: {
  filename: string;
  headers: string[];
  exampleRows?: string[][];
  onImport: (text: string) => void;
}) {
  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await parseExcelToText(file);
      onImport(text);
    } catch {
      onImport("");
    }
    event.target.value = "";
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        className="focus-ring grid h-9 place-items-center rounded-md border border-[var(--line)] px-3 text-sm font-semibold text-[var(--leaf)]"
        type="button"
        onClick={() => downloadExcelTemplate(filename, headers, exampleRows)}
      >
        下载导入模板
      </button>
      <label className="focus-ring grid h-9 cursor-pointer place-items-center rounded-md border border-[var(--line)] px-3 text-sm font-semibold text-[var(--leaf)]">
        选择 Excel 文件
        <input className="hidden" type="file" accept=".xlsx,.xls" onChange={handleFile} />
      </label>
    </div>
  );
}

export function ToggleActiveForm({
  id,
  isActive,
  type,
}: {
  id: string;
  isActive: boolean;
  type: "product" | "customer" | "supplier";
}) {
  const action = type === "product" ? setProductActive : type === "customer" ? setCustomerActive : setSupplierActive;
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <form action={formAction} className="grid gap-2">
      <input name="id" type="hidden" value={id} />
      <input name="isActive" type="hidden" value={String(!isActive)} />
      <Submit danger={isActive}>{isActive ? "停用" : "恢复"}</Submit>
      <ActionMessage state={state} />
    </form>
  );
}

export function CancelSalesOrderForm({ id }: { id: string }) {
  const [state, formAction] = useActionState(cancelSalesOrder, initialActionState);
  return (
    <form action={formAction} className="grid gap-2">
      <input name="id" type="hidden" value={id} />
      <Submit danger>取消订单</Submit>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConfirmOutboundForm({ id }: { id: string }) {
  const [state, formAction] = useActionState(confirmOutboundOrder, initialActionState);
  return (
    <form action={formAction} className="grid gap-2">
      <input name="id" type="hidden" value={id} />
      <Submit>确认出库</Submit>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConfirmReturnInboundForm({ id }: { id: string }) {
  const [state, formAction] = useActionState(confirmReturnInbound, initialActionState);
  return (
    <form action={formAction} className="grid gap-2">
      <input name="id" type="hidden" value={id} />
      <Submit>确认退货入库</Submit>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConfirmExchangeInboundForm({ id }: { id: string }) {
  const [state, formAction] = useActionState(confirmExchangeInbound, initialActionState);
  return (
    <form action={formAction} className="grid gap-2">
      <input name="id" type="hidden" value={id} />
      <Submit>确认换货入库</Submit>
      <ActionMessage state={state} />
    </form>
  );
}

export function ConfirmExchangeOutboundForm({ id }: { id: string }) {
  const [state, formAction] = useActionState(confirmExchangeOutbound, initialActionState);
  return (
    <form action={formAction} className="grid gap-2">
      <input name="id" type="hidden" value={id} />
      <Submit>确认换货出库</Submit>
      <ActionMessage state={state} />
    </form>
  );
}

export function ProductForm({
  value,
  customers,
}: {
  value?: ProductFormValue | null;
  customers: Option[];
}) {
  const [externalRows, setExternalRows] = useState<Array<{ customerId: string; externalCode: string; externalName: string }>>(
    () =>
      (value?.externalCodes ?? []).map((item) => ({
        customerId: item.customerId,
        externalCode: item.externalCode,
        externalName: item.externalName ?? "",
      })),
  );

  function addExternalRow() {
    setExternalRows((current) => [...current, { customerId: customers[0]?.id ?? "", externalCode: "", externalName: "" }]);
  }

  function updateExternalRow(index: number, patch: Partial<{ customerId: string; externalCode: string; externalName: string }>) {
    setExternalRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeExternalRow(index: number) {
    setExternalRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <ManagedForm action={saveProduct} submitLabel={value?.id ? "保存商品修改" : "新增商品"} successHref="/?section=products" successLabel="返回商品列表">
      <input name="id" type="hidden" value={value?.id ?? ""} />
      <input name="isActive" type="hidden" value={String(value?.isActive ?? true)} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="商品编码" name="code" defaultValue={value?.code} placeholder="如 SP-004" />
        <Field label="商品名称" name="name" defaultValue={value?.name} placeholder="如 即食饭团" />
        <Field label="条码" name="barcode" required={false} defaultValue={value?.barcode} placeholder="可扫码录入" />
        <Field label="规格" name="spec" defaultValue={value?.spec} placeholder="如 120g*24" />
        <label className="grid gap-1.5 text-sm text-[var(--ink-soft)]">
          <span>单位</span>
          <select className="focus-ring h-10 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 text-[var(--foreground)]" name="unit" defaultValue={["包", "袋", "杯", "个"].includes(value?.unit ?? "") ? value?.unit : "包"}>
            {["包", "袋", "杯", "个"].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
          </select>
        </label>
        <Field label="分类" name="category" required={false} defaultValue={value?.category} placeholder="如 冷藏鲜食" />
        <Field label="保质期天数" name="shelfLifeDays" type="number" defaultValue={value?.shelfLifeDays ?? 30} />
        <Field label="最低库存" name="minStock" type="number" defaultValue={value?.minStock ?? 0} />
      </div>
      <div className="rounded-md border border-[var(--line)] bg-white p-3">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">外部编码</h3>
            <p className="text-xs text-[var(--ink-soft)]">维护喜市多、全家等订单来源的商品编码，销售订单粘贴导入时按来源+编码自动匹配本商品。</p>
          </div>
          <button className="focus-ring h-9 rounded-md bg-[var(--leaf)] px-3 text-sm font-semibold text-white" type="button" onClick={addExternalRow}>
            添加外部编码
          </button>
        </div>
        {externalRows.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-[var(--ink-soft)]">
                <tr>
                  <th className="py-2">订单来源</th>
                  <th className="py-2">外部编码</th>
                  <th className="py-2">外部名称</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {externalRows.map((row, index) => (
                  <tr key={index}>
                    <td className="py-2">
                      <input name="sourceCustomerId" type="hidden" value={row.customerId} />
                      <select
                        className="focus-ring h-9 min-w-[160px] rounded-md border border-[var(--line)] bg-white px-2"
                        value={row.customerId}
                        onChange={(event) => updateExternalRow(index, { customerId: event.target.value })}
                      >
                        <option value="">选择来源</option>
                        {customers.map((customer) => (
                          <option key={customer.id} value={customer.id}>{formatOption(customer)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <input
                        className="focus-ring h-9 w-44 rounded-md border border-[var(--line)] px-2 font-mono text-xs"
                        name="externalCode"
                        placeholder="如 XSC-001"
                        value={row.externalCode}
                        onChange={(event) => updateExternalRow(index, { externalCode: event.target.value })}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        className="focus-ring h-9 w-44 rounded-md border border-[var(--line)] px-2"
                        name="externalName"
                        placeholder="可选"
                        value={row.externalName}
                        onChange={(event) => updateExternalRow(index, { externalName: event.target.value })}
                      />
                    </td>
                    <td className="py-2">
                      <button className="text-sm font-semibold text-[var(--tomato)]" type="button" onClick={() => removeExternalRow(index)}>
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-soft)]">
            还没有外部编码，点“添加外部编码”按订单来源维护。
          </div>
        )}
      </div>
    </ManagedForm>
  );
}

export function BatchImportProductsForm() {
  const [importText, setImportText] = useState("");
  return (
    <ManagedForm action={batchImportProducts} submitLabel="导入商品" successHref="/?section=products" successLabel="返回商品列表">
      <div className="grid gap-3">
        <p className="text-sm leading-6 text-[var(--ink-soft)]">
          每行一个商品，支持从 Excel 复制粘贴（Tab 分隔）或上传 Excel 文件。格式：编码 名称 规格 单位 条码 分类 保质期天数 最低库存。
          编码/名称/规格必填；单位默认"包"（可选 包/袋/杯/个），保质期默认 180 天，最低库存默认 0。
          按编码 upsert，已存在则更新。首行若为表头（含"编码"）会自动跳过。
        </p>
        <ExcelImportButtons
          filename="商品导入模板.xlsx"
          headers={["编码", "名称", "规格", "单位", "条码", "分类", "保质期天数", "最低库存"]}
          exampleRows={[["SP-001", "即食饭团", "120g", "包", "6901234567890", "冷藏鲜食", "180", "0"]]}
          onImport={setImportText}
        />
        <textarea
          className="focus-ring min-h-64 rounded-md border border-[var(--line)] bg-white p-3 font-mono text-sm"
          name="importText"
          value={importText}
          onChange={(event) => setImportText(event.target.value)}
          placeholder={"编码\t名称\t规格\t单位\t条码\t分类\t保质期天数\t最低库存\nSP-001\t即食饭团\t120g\t包\t6901234567890\t冷藏鲜食\t180\t0\nSP-002\t三明治\t150g\t包\t\t冷藏鲜食\t180\t10"}
        />
      </div>
    </ManagedForm>
  );
}

export function CustomerForm({ value }: { value?: CustomerFormValue | null }) {
  return (
    <ManagedForm action={saveCustomer} submitLabel={value?.id ? "保存客户修改" : "新增客户"} successHref="/?section=customers" successLabel="返回客户列表">
      <input name="id" type="hidden" value={value?.id ?? ""} />
      <input name="isActive" type="hidden" value={String(value?.isActive ?? true)} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="客户编码" name="code" defaultValue={value?.code} placeholder="如 KH-004" />
        <Field label="客户名称" name="name" defaultValue={value?.name} placeholder="如 喜市多" />
        <Field label="联系人" name="contact" required={false} defaultValue={value?.contact} />
        <Field label="电话" name="phone" required={false} defaultValue={value?.phone} />
        <Field label="地址" name="address" required={false} defaultValue={value?.address} />
        <Field label="账期备注" name="paymentNote" required={false} defaultValue={value?.paymentNote} placeholder="如 月结 30 天" />
      </div>
      <TextArea label="备注" name="remark" defaultValue={value?.remark} />
    </ManagedForm>
  );
}

export function SupplierForm({ value }: { value?: SupplierFormValue | null }) {
  return (
    <ManagedForm action={saveSupplier} submitLabel={value?.id ? "保存供应商修改" : "新增供应商"} successHref="/?section=suppliers" successLabel="返回供应商列表">
      <input name="id" type="hidden" value={value?.id ?? ""} />
      <input name="isActive" type="hidden" value={String(value?.isActive ?? true)} />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="供应商编码" name="code" defaultValue={value?.code} placeholder="如 GYS-002" />
        <Field label="供应商名称" name="name" defaultValue={value?.name} placeholder="如 默认食品供应商" />
        <Field label="联系人" name="contact" required={false} defaultValue={value?.contact} />
        <Field label="电话" name="phone" required={false} defaultValue={value?.phone} />
        <Field label="地址" name="address" required={false} defaultValue={value?.address} />
      </div>
      <TextArea label="备注" name="remark" defaultValue={value?.remark} />
    </ManagedForm>
  );
}

export function PurchaseForm({
  products,
  suppliers,
}: {
  products: Option[];
  suppliers: Option[];
}) {
  const [rows, setRows] = useState<Array<{ product: Option; batchNo: string; productionDate: string; expiryDate: string; quantity: number; unitPrice: number }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [importText, setImportText] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const filteredProducts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products.slice(0, 80);
    return products
      .filter((product) => `${product.code ?? ""} ${product.name} ${product.note ?? ""}`.toLowerCase().includes(value))
      .slice(0, 80);
  }, [products, query]);
  const totalAmount = rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);

  function addProduct(product: Option) {
    setRows((current) => [
      ...current,
      {
        product,
        batchNo: `B${today}-${current.length + 1}`,
        productionDate: "",
        expiryDate: "",
        quantity: 10,
        unitPrice: 0,
      },
    ]);
  }

  function updateRow(index: number, patch: Partial<{ batchNo: string; productionDate: string; expiryDate: string; quantity: number; unitPrice: number }>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function importRows() {
    const imported: typeof rows = [];
    const lines = importText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const [code, quantityValue = "10", priceValue = "0", batchNo = "", expiryDate = "", productionDate = ""] = line.split(/[\t,，\s]+/);
      const product = products.find((item) => item.code?.toLowerCase() === code.toLowerCase());
      if (!product) continue;
      imported.push({
        product,
        batchNo: batchNo || `B${today}-${rows.length + imported.length + 1}`,
        productionDate,
        expiryDate,
        quantity: Math.max(1, Math.floor(Number(quantityValue) || 10)),
        unitPrice: Math.max(0, Number(priceValue) || 0),
      });
    }
    if (imported.length > 0) {
      setRows((current) => [...current, ...imported]);
      setImportText("");
      setImportOpen(false);
      setImportNotice(`已导入 ${imported.length} 行${lines.length > imported.length ? `，跳过 ${lines.length - imported.length} 行未匹配商品` : ""}`);
    } else {
      setImportNotice(lines.length > 0 ? "没有导入成功，请检查商品编码是否存在" : "请先粘贴要导入的明细");
    }
  }

  return (
    <ManagedForm action={createPurchase} submitLabel="采购入库" successHref="/?section=purchase" successLabel="返回入库列表">
      <div className="grid gap-3 md:grid-cols-2">
        <SearchSelect label="供应商" name="supplierId" options={suppliers} />
        <Field label="入库日期" name="orderDate" type="date" required={false} />
      </div>
      <div className="rounded-md border border-[var(--line)] bg-white p-3">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">入库明细</h3>
            <p className="text-xs text-[var(--ink-soft)]">一张采购入库单支持多个商品，每行生成对应批次和库存流水。</p>
          </div>
          <div className="flex gap-2">
            <button className="focus-ring h-9 rounded-md border border-[var(--line)] px-3 text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setImportOpen(true)}>
              Excel/粘贴导入
            </button>
            <button className="focus-ring h-9 rounded-md bg-[var(--leaf)] px-3 text-sm font-semibold text-white" type="button" onClick={() => setPickerOpen(true)}>
              批量选商品
            </button>
          </div>
        </div>
        {importNotice ? <p className="mb-3 rounded-md bg-[#e3efe9] px-3 py-2 text-sm text-[var(--leaf)]">{importNotice}</p> : null}
        {rows.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[1040px] text-left text-sm">
              <thead className="text-xs text-[var(--ink-soft)]">
                <tr>
                  <th className="py-2">商品</th>
                  <th className="py-2">批号</th>
                  <th className="py-2">生产日期</th>
                  <th className="py-2">允收日</th>
                  <th className="py-2">数量</th>
                  <th className="py-2">采购价</th>
                  <th className="py-2">小计</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((row, index) => (
                  <tr key={`${row.product.id}-${index}`}>
                    <td className="py-2">
                      <input name="productId" type="hidden" value={row.product.id} />
                      <div className="font-medium text-[var(--foreground)]">{formatOption(row.product)}</div>
                      {row.product.note ? <div className="text-xs text-[var(--ink-soft)]">{row.product.note}</div> : null}
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 w-40 rounded-md border border-[var(--line)] px-2" name="batchNo" value={row.batchNo} onChange={(event) => updateRow(index, { batchNo: event.target.value })} />
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 rounded-md border border-[var(--line)] px-2" name="productionDate" type="date" value={row.productionDate} onChange={(event) => updateRow(index, { productionDate: event.target.value })} />
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 rounded-md border border-[var(--line)] px-2" name="expiryDate" required type="date" value={row.expiryDate} onChange={(event) => updateRow(index, { expiryDate: event.target.value })} />
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 w-24 rounded-md border border-[var(--line)] px-2" min={1} name="quantity" type="number" value={row.quantity} onChange={(event) => updateRow(index, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} />
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 w-24 rounded-md border border-[var(--line)] px-2" min={0} name="unitPrice" step="0.01" type="number" value={row.unitPrice} onChange={(event) => updateRow(index, { unitPrice: Math.max(0, Number(event.target.value) || 0) })} />
                    </td>
                    <td className="py-2 font-semibold">{(row.quantity * row.unitPrice).toFixed(2)}</td>
                    <td className="py-2">
                      <button className="text-sm font-semibold text-[var(--tomato)]" type="button" onClick={() => removeRow(index)}>
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-3 text-right font-semibold" colSpan={6}>合计</td>
                  <td className="py-3 font-semibold">{totalAmount.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-soft)]">
            还没有入库明细，点“批量选商品”添加。
          </div>
        )}
      </div>
      <TextArea label="备注" name="remark" />
      {pickerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="grid max-h-[82vh] w-full max-w-5xl gap-4 overflow-hidden rounded-lg bg-[var(--paper)] p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">批量选择商品</h3>
                <p className="text-sm text-[var(--ink-soft)]">搜索编码、名称或规格，点加入后统一录批号、数量和允收日。</p>
              </div>
              <button className="text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setPickerOpen(false)}>完成</button>
            </div>
            <input className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3" placeholder="输入商品编码、名称或规格" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="overflow-auto rounded-md border border-[var(--line)] bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#f6f7f2] text-xs text-[var(--ink-soft)]">
                  <tr>
                    <th className="p-3">商品</th>
                    <th className="p-3">规格</th>
                    <th className="p-3">当前库存</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td className="p-3 font-medium">{formatOption(product)}</td>
                      <td className="p-3 text-[var(--ink-soft)]">{product.note ?? "-"}</td>
                      <td className="p-3">{product.stock ?? 0} {product.unit ?? ""}</td>
                      <td className="p-3">
                        <button className="rounded-md bg-[var(--leaf)] px-3 py-1.5 text-sm font-semibold text-white" type="button" onClick={() => addProduct(product)}>加入</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {importOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="grid w-full max-w-2xl gap-4 rounded-lg bg-[var(--paper)] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Excel/粘贴导入入库明细</h3>
              <button className="text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setImportOpen(false)}>关闭</button>
            </div>
            <p className="text-sm text-[var(--ink-soft)]">每行一个商品，格式：商品编码 数量 采购价 批号 允收日 生产日期。支持上传 Excel 文件或从 Excel 复制六列。</p>
            <ExcelImportButtons
              filename="采购入库导入模板.xlsx"
              headers={["商品编码", "数量", "采购价", "批号", "允收日", "生产日期"]}
              exampleRows={[["SP-001", "10", "5.8", "B20260623", "2027-01-01", "2026-06-23"], ["SP-002", "6", "9.9", "B20260623-2", "2027-01-01", ""]]}
              onImport={setImportText}
            />
            <textarea className="focus-ring min-h-56 rounded-md border border-[var(--line)] bg-white p-3 font-mono text-sm" placeholder={"SP-001\t10\t5.8\tB20260623\t2027-01-01\t2026-06-23\nSP-002\t6\t9.9\tB20260623-2\t2027-01-01"} value={importText} onChange={(event) => setImportText(event.target.value)} />
            <button className="h-10 rounded-md bg-[var(--leaf)] font-semibold text-white" type="button" onClick={importRows}>导入到入库单</button>
          </div>
        </div>
      ) : null}
    </ManagedForm>
  );
}

export function StockInitForm({ products }: { products: Option[] }) {
  const [rows, setRows] = useState<Array<{ product: Option; batchNo: string; productionDate: string; expiryDate: string; quantity: number; unitCost: number }>>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [importText, setImportText] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const filteredProducts = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return products.slice(0, 80);
    return products
      .filter((product) => `${product.code ?? ""} ${product.name} ${product.note ?? ""}`.toLowerCase().includes(value))
      .slice(0, 80);
  }, [products, query]);

  function addProduct(product: Option) {
    setRows((current) => [
      ...current,
      {
        product,
        batchNo: `INIT-${today}-${current.length + 1}`,
        productionDate: "",
        expiryDate: "",
        quantity: 100,
        unitCost: 0,
      },
    ]);
  }

  function updateRow(index: number, patch: Partial<{ batchNo: string; productionDate: string; expiryDate: string; quantity: number; unitCost: number }>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function importRows() {
    const imported: typeof rows = [];
    const lines = importText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const [code, quantityValue = "100", unitCostValue = "0", batchNo = "", expiryDate = "", productionDate = ""] = line.split(/[\t,，\s]+/);
      const product = products.find((item) => item.code?.toLowerCase() === code.toLowerCase());
      if (!product) continue;
      imported.push({
        product,
        batchNo: batchNo || `INIT-${today}-${rows.length + imported.length + 1}`,
        productionDate,
        expiryDate,
        quantity: Math.max(1, Math.floor(Number(quantityValue) || 100)),
        unitCost: Math.max(0, Number(unitCostValue) || 0),
      });
    }
    if (imported.length > 0) {
      setRows((current) => [...current, ...imported]);
      setImportText("");
      setImportOpen(false);
      setImportNotice(`已导入 ${imported.length} 行${lines.length > imported.length ? `，跳过 ${lines.length - imported.length} 行未匹配商品` : ""}`);
    } else {
      setImportNotice(lines.length > 0 ? "没有导入成功，请检查商品编码是否存在" : "请先粘贴或上传要导入的明细");
    }
  }

  return (
    <ManagedForm action={initializeStock} submitLabel="初始化入库" successHref="/?section=movements" successLabel="返回库存台账">
      <div className="rounded-md border border-[var(--line)] bg-white p-3">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">初始化明细</h3>
            <p className="text-xs text-[var(--ink-soft)]">选择多个商品后批量录入期初库存，每行都会生成初始化批次。</p>
          </div>
          <div className="flex gap-2">
            <button className="focus-ring h-9 rounded-md border border-[var(--line)] px-3 text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setImportOpen(true)}>
              Excel/粘贴导入
            </button>
            <button className="focus-ring h-9 rounded-md bg-[var(--leaf)] px-3 text-sm font-semibold text-white" type="button" onClick={() => setPickerOpen(true)}>
              批量选商品
            </button>
          </div>
        </div>
        {importNotice ? <p className="mb-3 rounded-md bg-[#e3efe9] px-3 py-2 text-sm text-[var(--leaf)]">{importNotice}</p> : null}
        {rows.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-xs text-[var(--ink-soft)]">
                <tr>
                  <th className="py-2">商品</th>
                  <th className="py-2">批号</th>
                  <th className="py-2">生产日期</th>
                  <th className="py-2">允收日</th>
                  <th className="py-2">数量</th>
                  <th className="py-2">成本价</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((row, index) => (
                  <tr key={`${row.product.id}-${index}`}>
                    <td className="py-2">
                      <input name="productId" type="hidden" value={row.product.id} />
                      <div className="font-medium text-[var(--foreground)]">{formatOption(row.product)}</div>
                      {row.product.note ? <div className="text-xs text-[var(--ink-soft)]">{row.product.note}</div> : null}
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 w-40 rounded-md border border-[var(--line)] px-2" name="batchNo" value={row.batchNo} onChange={(event) => updateRow(index, { batchNo: event.target.value })} />
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 rounded-md border border-[var(--line)] px-2" name="productionDate" type="date" value={row.productionDate} onChange={(event) => updateRow(index, { productionDate: event.target.value })} />
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 rounded-md border border-[var(--line)] px-2" name="expiryDate" required type="date" value={row.expiryDate} onChange={(event) => updateRow(index, { expiryDate: event.target.value })} />
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 w-24 rounded-md border border-[var(--line)] px-2" min={1} name="quantity" type="number" value={row.quantity} onChange={(event) => updateRow(index, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })} />
                    </td>
                    <td className="py-2">
                      <input className="focus-ring h-9 w-24 rounded-md border border-[var(--line)] px-2" min={0} name="unitCost" step="0.01" type="number" value={row.unitCost} onChange={(event) => updateRow(index, { unitCost: Math.max(0, Number(event.target.value) || 0) })} />
                    </td>
                    <td className="py-2">
                      <button className="text-sm font-semibold text-[var(--tomato)]" type="button" onClick={() => removeRow(index)}>移除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-soft)]">
            还没有初始化明细，点“批量选商品”添加。
          </div>
        )}
      </div>
      {pickerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="grid max-h-[82vh] w-full max-w-5xl gap-4 overflow-hidden rounded-lg bg-[var(--paper)] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">批量选择初始化商品</h3>
                <p className="text-sm text-[var(--ink-soft)]">点击加入后，在明细表里统一填批号、数量和允收日。</p>
              </div>
              <button className="text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setPickerOpen(false)}>完成</button>
            </div>
            <input className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3" placeholder="输入商品编码、名称或规格" value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="overflow-auto rounded-md border border-[var(--line)] bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#f6f7f2] text-xs text-[var(--ink-soft)]">
                  <tr>
                    <th className="p-3">商品</th>
                    <th className="p-3">规格</th>
                    <th className="p-3">当前库存</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td className="p-3 font-medium">{formatOption(product)}</td>
                      <td className="p-3 text-[var(--ink-soft)]">{product.note ?? "-"}</td>
                      <td className="p-3">{product.stock ?? 0} {product.unit ?? ""}</td>
                      <td className="p-3">
                        <button className="rounded-md bg-[var(--leaf)] px-3 py-1.5 text-sm font-semibold text-white" type="button" onClick={() => addProduct(product)}>加入</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {importOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="grid w-full max-w-2xl gap-4 rounded-lg bg-[var(--paper)] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Excel/粘贴导入初始化明细</h3>
              <button className="text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setImportOpen(false)}>关闭</button>
            </div>
            <p className="text-sm text-[var(--ink-soft)]">每行一个商品，格式：商品编码 数量 成本价 批号 允收日 生产日期。支持上传 Excel 文件或从 Excel 复制六列。</p>
            <ExcelImportButtons
              filename="库存初始化导入模板.xlsx"
              headers={["商品编码", "数量", "成本价", "批号", "允收日", "生产日期"]}
              exampleRows={[["SP-001", "100", "0", "INIT-001", "2027-01-01", "2026-06-23"], ["SP-002", "80", "0", "INIT-002", "2027-01-01", ""]]}
              onImport={setImportText}
            />
            <textarea className="focus-ring min-h-56 rounded-md border border-[var(--line)] bg-white p-3 font-mono text-sm" placeholder={"SP-001\t100\t0\tINIT-001\t2027-01-01\t2026-06-23\nSP-002\t80\t0\tINIT-002\t2027-01-01"} value={importText} onChange={(event) => setImportText(event.target.value)} />
            <button className="h-10 rounded-md bg-[var(--leaf)] font-semibold text-white" type="button" onClick={importRows}>导入到明细</button>
          </div>
        </div>
      ) : null}
    </ManagedForm>
  );
}

export function SalesOrderForm({
  products,
  customers,
  externalMappings = [],
  value,
}: {
  products: Option[];
  customers: Option[];
  externalMappings?: ProductExternalMapping[];
  value?: SalesOrderFormValue | null;
}) {
  const initialRows = useMemo(
    () =>
      value?.items
        .map((item) => {
          const product = products.find((option) => option.id === item.productId);
          if (!product) return null;
          return {
            product,
            quantity: item.quantity,
            unitPrice: Number(item.unitPrice ?? 0),
            validDeliveryDate: toDateInputValue(item.validDeliveryDate),
          };
        })
        .filter((item): item is { product: Option; quantity: number; unitPrice: number; validDeliveryDate: string } => Boolean(item)) ?? [],
    [products, value?.items],
  );
  const [rows, setRows] = useState<Array<{ product: Option; quantity: number; unitPrice: number; validDeliveryDate: string }>>(initialRows);
  const [customerId, setCustomerId] = useState(value?.customerId ?? customers[0]?.id ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [importText, setImportText] = useState("");
  const filteredProducts = useMemo(() => {
    const value = productQuery.trim().toLowerCase();
    if (!value) return products.slice(0, 80);
    return products
      .filter((product) => `${product.code ?? ""} ${product.name} ${product.note ?? ""}`.toLowerCase().includes(value))
      .slice(0, 80);
  }, [productQuery, products]);
  const totalAmount = rows.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);

  function addProduct(product: Option) {
    setRows((current) => {
      const existing = current.find((row) => row.product.id === product.id);
      if (existing) {
        return current.map((row) => (row.product.id === product.id ? { ...row, quantity: row.quantity + 1 } : row));
      }
      return [...current, { product, quantity: 1, unitPrice: 0, validDeliveryDate: "" }];
    });
  }

  function updateRow(index: number, patch: Partial<{ quantity: number; unitPrice: number; validDeliveryDate: string }>) {
    setRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function importRows() {
    const imported: Array<{ product: Option; quantity: number; unitPrice: number; validDeliveryDate: string }> = [];
    const lines = importText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const [code, quantityValue = "1", priceValue = "0", validDeliveryDate = ""] = line.split(/[\t,，\s]+/);
      const mapping = externalMappings.find((item) => item.customerId === customerId && item.externalCode.toLowerCase() === code.toLowerCase());
      const product = products.find((item) => item.code?.toLowerCase() === code.toLowerCase()) ?? products.find((item) => item.id === mapping?.productId);
      if (!product) continue;
      const quantity = Math.max(1, Math.floor(Number(quantityValue) || 1));
      const unitPrice = Math.max(0, Number(priceValue) || 0);
      imported.push({ product, quantity, unitPrice, validDeliveryDate });
    }
    if (imported.length > 0) {
      setRows((current) => [...current, ...imported]);
      setImportText("");
      setImportOpen(false);
    }
  }

  return (
    <ManagedForm action={value?.id ? updateSalesOrder : createSalesOrder} submitLabel={value?.id ? "保存订单修改" : "创建销售订单"} successHref="/?section=sales" successLabel="返回销售订单">
      <input name="id" type="hidden" value={value?.id ?? ""} />
      <div className="grid gap-3 md:grid-cols-2">
        <SearchSelect label="客户" name="customerId" options={customers} defaultId={customerId} onSelectedChange={setCustomerId} />
        <Field label="订单日期" name="orderDate" type="date" required={false} defaultValue={toDateInputValue(value?.orderDate)} />
        <Field label="交货日期" name="deliveryDate" type="date" required={false} defaultValue={toDateInputValue(value?.deliveryDate)} />
      </div>
      <div className="rounded-md border border-[var(--line)] bg-white p-3">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">商品明细</h3>
            <p className="text-xs text-[var(--ink-soft)]">弹窗批量选品，支持从表格复制商品编码、数量、单价和有效送货日。</p>
          </div>
          <div className="flex gap-2">
            <button className="focus-ring h-9 rounded-md border border-[var(--line)] px-3 text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setImportOpen(true)}>
              粘贴导入
            </button>
            <button className="focus-ring h-9 rounded-md bg-[var(--leaf)] px-3 text-sm font-semibold text-white" type="button" onClick={() => setPickerOpen(true)}>
              批量选商品
            </button>
          </div>
        </div>
        {rows.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs text-[var(--ink-soft)]">
                <tr>
                  <th className="py-2">商品</th>
                  <th className="py-2">可用库存</th>
                  <th className="py-2">数量</th>
                  <th className="py-2">销售价</th>
                  <th className="py-2">有效送货日</th>
                  <th className="py-2">小计</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((row, index) => (
                  <tr key={`${row.product.id}-${index}`}>
                    <td className="py-2">
                      <input name="productId" type="hidden" value={row.product.id} />
                      <div className="font-medium text-[var(--foreground)]">{formatOption(row.product)}</div>
                      {row.product.note ? <div className="text-xs text-[var(--ink-soft)]">{row.product.note}</div> : null}
                    </td>
                    <td className="py-2 text-[var(--ink-soft)]">{row.product.stock ?? 0} {row.product.unit ?? ""}</td>
                    <td className="py-2">
                      <input
                        className="focus-ring h-9 w-24 rounded-md border border-[var(--line)] px-2"
                        min={1}
                        name="quantity"
                        type="number"
                        value={row.quantity}
                        onChange={(event) => updateRow(index, { quantity: Math.max(1, Math.floor(Number(event.target.value) || 1)) })}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        className="focus-ring h-9 w-28 rounded-md border border-[var(--line)] px-2"
                        min={0}
                        name="unitPrice"
                        step="0.01"
                        type="number"
                        value={row.unitPrice}
                        onChange={(event) => updateRow(index, { unitPrice: Math.max(0, Number(event.target.value) || 0) })}
                      />
                    </td>
                    <td className="py-2">
                      <input
                        className="focus-ring h-9 rounded-md border border-[var(--line)] px-2"
                        name="validDeliveryDate"
                        type="date"
                        value={row.validDeliveryDate}
                        onChange={(event) => updateRow(index, { validDeliveryDate: event.target.value })}
                      />
                    </td>
                    <td className="py-2 font-semibold">{(row.quantity * row.unitPrice).toFixed(2)}</td>
                    <td className="py-2">
                      <button className="text-sm font-semibold text-[var(--tomato)]" type="button" onClick={() => removeRow(index)}>
                        移除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="py-3 text-right font-semibold" colSpan={5}>合计</td>
                  <td className="py-3 font-semibold">{totalAmount.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--line)] p-6 text-center text-sm text-[var(--ink-soft)]">
            还没有商品明细，点“批量选商品”添加。
          </div>
        )}
      </div>
      <TextArea label="备注" name="remark" defaultValue={value?.remark} />
      {pickerOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="grid max-h-[82vh] w-full max-w-5xl gap-4 overflow-hidden rounded-lg bg-[var(--paper)] p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">批量选择商品</h3>
                <p className="text-sm text-[var(--ink-soft)]">搜索编码或名称，点击加入订单。</p>
              </div>
              <button className="text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setPickerOpen(false)}>完成</button>
            </div>
            <input
              className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3"
              placeholder="输入商品编码、名称或规格"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
            />
            <div className="overflow-auto rounded-md border border-[var(--line)] bg-white">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#f6f7f2] text-xs text-[var(--ink-soft)]">
                  <tr>
                    <th className="p-3">商品</th>
                    <th className="p-3">规格</th>
                    <th className="p-3">库存</th>
                    <th className="p-3">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td className="p-3 font-medium">{formatOption(product)}</td>
                      <td className="p-3 text-[var(--ink-soft)]">{product.note ?? "-"}</td>
                      <td className="p-3">{product.stock ?? 0} {product.unit ?? ""}</td>
                      <td className="p-3">
                        <button className="rounded-md bg-[var(--leaf)] px-3 py-1.5 text-sm font-semibold text-white" type="button" onClick={() => addProduct(product)}>
                          加入
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {importOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="grid w-full max-w-2xl gap-4 rounded-lg bg-[var(--paper)] p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">粘贴导入订单明细</h3>
              <button className="text-sm font-semibold text-[var(--leaf)]" type="button" onClick={() => setImportOpen(false)}>关闭</button>
            </div>
            <p className="text-sm text-[var(--ink-soft)]">每行一个商品，格式：商品编码或外部编码 数量 单价 有效送货日。系统会按当前客户的外部编码映射匹配商品。</p>
            <ExcelImportButtons
              filename="销售订单导入模板.xlsx"
              headers={["商品编码或外部编码", "数量", "单价", "有效送货日"]}
              exampleRows={[["SP-001", "10", "5.8", "2026-06-25"], ["XSC-001", "6", "9.9", "2026-06-26"]]}
              onImport={setImportText}
            />
            <textarea
              className="focus-ring min-h-56 rounded-md border border-[var(--line)] bg-white p-3 font-mono text-sm"
              placeholder={"SP-001\t10\t5.8\t2026-06-25\nSP-002\t6\t9.9\t2026-06-26"}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
            />
            <button className="h-10 rounded-md bg-[var(--leaf)] font-semibold text-white" type="button" onClick={importRows}>
              导入到订单
            </button>
          </div>
        </div>
      ) : null}
    </ManagedForm>
  );
}

export function ShipOrderForm({ orders, batches, draft, defaultOrderId }: { orders: ShippableOrder[]; batches: BatchOption[]; draft?: DraftOutbound | null; defaultOrderId?: string }) {
  const defaultSelectedOrderId = orders.some((order) => order.id === defaultOrderId) ? defaultOrderId : orders[0]?.id;
  const [selectedOrderId, setSelectedOrderId] = useState(draft?.salesOrderId ?? defaultSelectedOrderId ?? "");
  const selectedOrder = orders.find((order) => order.id === selectedOrderId);
  const lockedToOrder = Boolean(defaultOrderId || draft);
  const [allocations, setAllocations] = useState<Record<string, number>>({});
  const [expandedProducts, setExpandedProducts] = useState<Record<string, boolean>>({});

  function allocationKey(productId: string, batchId: string) {
    return `${productId}:${batchId}`;
  }

  function setAllocation(productId: string, batchId: string, value: number) {
    const key = allocationKey(productId, batchId);
    setAllocations((current) => ({ ...current, [key]: Math.max(0, Math.floor(value || 0)) }));
  }

  function allocatedQuantity(productId: string) {
    return Object.entries(allocations).reduce((sum, [key, quantity]) => (key.startsWith(`${productId}:`) ? sum + quantity : sum), 0);
  }

  function suggestedAllocations(order: ShippableOrder | undefined) {
    const next: Record<string, number> = {};
    if (!order) return next;
    for (const item of order.items) {
      let remaining = item.quantity;
      const itemBatches = batches.filter((batch) => batch.productId === item.productId && batch.currentQuantity > 0);
      for (const batch of itemBatches) {
        if (remaining <= 0) break;
        const quantity = Math.min(batch.currentQuantity, remaining);
        next[allocationKey(item.productId, batch.id)] = quantity;
        remaining -= quantity;
      }
    }
    return next;
  }

  useEffect(() => {
    if (draft && draft.salesOrderId === selectedOrderId) {
      const next: Record<string, number> = {};
      for (const item of draft.items) {
        next[allocationKey(item.productId, item.stockBatchId)] = item.quantity;
      }
      setAllocations(next);
      return;
    }
    setAllocations(suggestedAllocations(selectedOrder));
    setExpandedProducts({});
  }, [selectedOrderId, draft?.id]);

  return (
    <ManagedForm action={shipSalesOrder} submitLabel="保存出库单" successHref="/?section=sales" successLabel="返回销售订单">
      <input name="outboundOrderId" type="hidden" value={draft?.id ?? selectedOrder?.draftOutboundId ?? ""} />
      {lockedToOrder ? (
        <div className="rounded-md border border-[var(--line)] bg-white p-3">
          <input name="salesOrderId" type="hidden" value={selectedOrderId} />
          <div className="text-xs text-[var(--ink-soft)]">当前订单</div>
          <div className="mt-1 font-semibold text-[var(--foreground)]">{selectedOrder?.name ?? "订单不存在或不可出库"}</div>
        </div>
      ) : (
        <label className="grid gap-1.5 text-sm text-[var(--ink-soft)]">
          <span>待出库订单</span>
          <select
            className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3 text-[var(--foreground)]"
            name="salesOrderId"
            value={selectedOrderId}
            onChange={(event) => {
              setSelectedOrderId(event.target.value);
            }}
          >
            {orders.map((order) => (
              <option key={order.id} value={order.id}>{order.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="出库日期" name="outboundDate" type="date" required={false} defaultValue={toDateInputValue(draft?.outboundDate)} />
      </div>
      {selectedOrder ? (
        <div className="grid gap-4">
          {selectedOrder.items.map((item) => {
            const itemBatches = batches.filter((batch) => batch.productId === item.productId && batch.currentQuantity > 0);
            const allocated = allocatedQuantity(item.productId);
            const shortage = Math.max(0, item.quantity - allocated);
            const expanded = Boolean(expandedProducts[item.productId]);
            const visibleBatches = expanded ? itemBatches : itemBatches.filter((batch) => (allocations[allocationKey(item.productId, batch.id)] ?? 0) > 0);
            return (
              <div className="rounded-md border border-[var(--line)] bg-white p-3" key={item.productId}>
                <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h3 className="font-semibold text-[var(--foreground)]">{item.productCode} - {item.productName}</h3>
                    <p className="text-xs text-[var(--ink-soft)]">已默认选中一批出库批次；可直接修改数量，也可以展开选择其它批次。</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-[#e3efe9] px-2 py-1 font-semibold text-[var(--leaf)]">应出 {item.quantity}</span>
                      <span className="rounded-full bg-[#e3efe9] px-2 py-1 font-semibold text-[var(--leaf)]">已分配 {allocated}</span>
                      {shortage > 0 ? <span className="rounded-full bg-[#fff2dd] px-2 py-1 font-semibold text-[var(--amber)]">还差 {shortage}</span> : null}
                    </div>
                  </div>
                  {itemBatches.length > visibleBatches.length ? (
                    <button
                      className="focus-ring h-9 rounded-md border border-[var(--line)] px-3 text-sm font-semibold text-[var(--leaf)]"
                      type="button"
                      onClick={() => setExpandedProducts((current) => ({ ...current, [item.productId]: !expanded }))}
                    >
                      {expanded ? "收起其它批次" : `选择其它批次 ${itemBatches.length - visibleBatches.length}`}
                    </button>
                  ) : null}
                </div>
                {itemBatches.length > 0 ? (
                  <div className="overflow-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="text-xs text-[var(--ink-soft)]">
                        <tr>
                          <th className="py-2">出库批次</th>
                          <th className="py-2">批次来源</th>
                          <th className="py-2">允收日</th>
                          <th className="py-2">可用库存</th>
                          <th className="py-2">本次出库</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--line)]">
                        {visibleBatches.map((batch) => {
                          const key = allocationKey(item.productId, batch.id);
                          const quantity = allocations[key] ?? 0;
                          return (
                            <tr key={batch.id}>
                              <td className="py-2 font-mono text-xs">{batch.batchNo}</td>
                              <td className="py-2">{batch.sourceType === "INITIAL" ? "初始化" : "采购入库"}</td>
                              <td className="py-2">{batch.expiryDate}</td>
                              <td className="py-2">{batch.currentQuantity}</td>
                              <td className="py-2">
                                <input name="productId" type="hidden" value={quantity > 0 ? item.productId : ""} />
                                <input name="stockBatchId" type="hidden" value={quantity > 0 ? batch.id : ""} />
                                <input
                                  className="focus-ring h-9 w-28 rounded-md border border-[var(--line)] px-2"
                                  max={batch.currentQuantity}
                                  min={0}
                                  name="quantity"
                                  type="number"
                                  value={quantity}
                                  onChange={(event) => setAllocation(item.productId, batch.id, Number(event.target.value))}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">该商品没有可用批次库存。</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">暂无待出库订单。</div>
      )}
      <TextArea label="备注" name="remark" defaultValue={draft?.remark} />
    </ManagedForm>
  );
}

export function ReturnOrderForm({ outbounds, defaultOutboundId }: { outbounds: ReturnableOutbound[]; defaultOutboundId?: string }) {
  const defaultSelectedOutboundId = outbounds.some((outbound) => outbound.id === defaultOutboundId) ? defaultOutboundId : outbounds[0]?.id;
  const [selectedOutboundId, setSelectedOutboundId] = useState(defaultSelectedOutboundId ?? "");
  const selectedOutbound = outbounds.find((outbound) => outbound.id === selectedOutboundId);

  return (
    <ManagedForm action={createReturnOrder} submitLabel="保存退货单" successHref="/?section=sales" successLabel="返回销售订单">
      <label className="grid gap-1.5 text-sm text-[var(--ink-soft)]">
        <span>原出库单</span>
        <select
          className="focus-ring h-10 rounded-md border border-[var(--line)] bg-white px-3 text-[var(--foreground)]"
          name="outboundOrderId"
          value={selectedOutboundId}
          onChange={(event) => setSelectedOutboundId(event.target.value)}
        >
          {outbounds.map((outbound) => (
            <option key={outbound.id} value={outbound.id}>{outbound.name}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="退货日期" name="returnDate" type="date" required={false} />
        <label className="grid gap-1.5 text-sm text-[var(--ink-soft)]">
          <span>退货原因</span>
          <select className="focus-ring h-10 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 text-[var(--foreground)]" name="reason" defaultValue="配错">
            {["配错", "客户退货", "质量问题", "破损", "其它"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
        </label>
      </div>
      {selectedOutbound ? (
        <div className="overflow-auto rounded-md border border-[var(--line)] bg-white p-3">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-xs text-[var(--ink-soft)]">
              <tr>
                <th className="py-2">商品</th>
                <th className="py-2">批号</th>
                <th className="py-2">已出库</th>
                <th className="py-2">已退</th>
                <th className="py-2">本次退回</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--line)]">
              {selectedOutbound.items.map((item) => {
                const returnable = Math.max(0, item.quantity - item.returnedQuantity);
                return (
                  <tr key={item.id}>
                    <td className="py-2">{item.productCode} - {item.productName}</td>
                    <td className="py-2 font-mono text-xs">{item.batchNo}</td>
                    <td className="py-2">{item.quantity}</td>
                    <td className="py-2">{item.returnedQuantity}</td>
                    <td className="py-2">
                      <input name="outboundOrderItemId" type="hidden" value={item.id} />
                      <input className="focus-ring h-9 w-28 rounded-md border border-[var(--line)] px-2" max={returnable} min={0} name="quantity" type="number" defaultValue={0} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">暂无可退货出库单。</div>
      )}
      <TextArea label="备注" name="remark" />
    </ManagedForm>
  );
}

export function ExchangeForm({
  customers,
  products,
  batches,
  defaultCustomerId,
  salesOrderId,
  initialReturnRows,
}: {
  customers: Option[];
  products: Option[];
  batches: BatchOption[];
  defaultCustomerId?: string;
  salesOrderId?: string;
  initialReturnRows?: Array<{ productId: string; stockBatchId: string; quantity?: number; maxQuantity?: number }>;
}) {
  const lockedReturnRows = Boolean(initialReturnRows?.length);
  const initialReturnedProductIds = new Set(initialReturnRows?.map((row) => row.productId) ?? []);
  const firstOutProduct = products.find((product) => !initialReturnedProductIds.has(product.id));
  function firstBatchForProduct(productId: string, availableOnly = false) {
    return batches.find((batch) => batch.productId === productId && (!availableOnly || batch.currentQuantity > 0))?.id ?? "";
  }
  const [returnRows, setReturnRows] = useState<Array<{ productId: string; stockBatchId: string; quantity: number }>>(
    initialReturnRows?.map((row) => ({ productId: row.productId, stockBatchId: row.stockBatchId || firstBatchForProduct(row.productId), quantity: row.quantity ?? 0 })) ?? [],
  );
  const [outRows, setOutRows] = useState<Array<{ productId: string; stockBatchId: string; quantity: number; unitPrice: number }>>(
    initialReturnRows?.map(() => ({ productId: firstOutProduct?.id ?? "", stockBatchId: firstBatchForProduct(firstOutProduct?.id ?? "", true), quantity: 0, unitPrice: 0 })) ?? [],
  );
  const returnedProductIds = useMemo(() => new Set(returnRows.map((row) => row.productId).filter(Boolean)), [returnRows]);
  const outProductOptions = products.filter((product) => !returnedProductIds.has(product.id));

  function addReturnRow() {
    const productId = products[0]?.id ?? "";
    setReturnRows((current) => [...current, { productId, stockBatchId: firstBatchForProduct(productId), quantity: 0 }]);
  }
  function addOutRow() {
    const productId = outProductOptions[0]?.id ?? "";
    setOutRows((current) => [...current, { productId, stockBatchId: firstBatchForProduct(productId, true), quantity: 0, unitPrice: 0 }]);
  }
  function updateReturnRow(index: number, patch: Partial<{ productId: string; stockBatchId: string; quantity: number }>) {
    setReturnRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch, stockBatchId: patch.productId !== undefined ? firstBatchForProduct(patch.productId) : row.stockBatchId } : row)));
  }
  function updateOutRow(index: number, patch: Partial<{ productId: string; stockBatchId: string; quantity: number; unitPrice: number }>) {
    setOutRows((current) => {
      const next = [...current];
      const fallbackProductId = outProductOptions[0]?.id ?? "";
      while (next.length <= index) next.push({ productId: fallbackProductId, stockBatchId: firstBatchForProduct(fallbackProductId, true), quantity: 0, unitPrice: 0 });
      return next.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch, stockBatchId: patch.productId !== undefined ? firstBatchForProduct(patch.productId, true) : row.stockBatchId } : row));
    });
  }
  function removeReturnRow(index: number) {
    setReturnRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }
  function removeOutRow(index: number) {
    setOutRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  return (
    <ManagedForm action={createExchangeOrder} submitLabel="保存换货单" successHref="/?section=sales" successLabel="返回销售订单">
      <input name="exchangeMode" type="hidden" value={lockedReturnRows ? "ORDER_REPLACE" : "FREE"} />
      <input name="salesOrderId" type="hidden" value={salesOrderId ?? ""} />
      <div className="grid gap-3 md:grid-cols-2">
        <SearchSelect label="客户" name="customerId" options={customers} defaultId={defaultCustomerId} />
        <Field label="换货日期" name="exchangeDate" type="date" required={false} />
        <label className="grid gap-1.5 text-sm text-[var(--ink-soft)]">
          <span>换货原因</span>
          <select className="focus-ring h-10 min-w-0 rounded-md border border-[var(--line)] bg-white px-3 text-[var(--foreground)]" name="reason" defaultValue="临期换货">
            {["临期换货", "过期换货", "错发换货", "质量问题", "其它"].map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
        </label>
      </div>

      {lockedReturnRows ? (
        <div className="rounded-md border border-[var(--line)] bg-white p-3">
          <div className="mb-3">
            <h3 className="font-semibold text-[var(--foreground)]">原订单行换其它商品</h3>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">在原订单行上填写退回数量，并选择换出的其它商品、批次和数量。</p>
          </div>
          <div className="overflow-auto">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="text-xs text-[var(--ink-soft)]">
                <tr>
                  <th className="py-2">原商品</th>
                  <th className="py-2">原批次</th>
                  <th className="py-2">退回数量</th>
                  <th className="py-2">换出商品</th>
                  <th className="py-2">换出批次</th>
                  <th className="py-2">换出数量</th>
                  <th className="py-2">单价</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {returnRows.map((returnRow, index) => {
                  const product = products.find((item) => item.id === returnRow.productId);
                  const returnBatch = batches.find((item) => item.id === returnRow.stockBatchId);
                  const outRow = outRows[index] ?? { productId: outProductOptions[0]?.id ?? "", stockBatchId: "", quantity: 0, unitPrice: 0 };
                  const outBatches = batches.filter((batch) => batch.productId === outRow.productId && batch.currentQuantity > 0);
                  const maxQuantity = initialReturnRows?.[index]?.maxQuantity;
                  return (
                    <tr key={`${returnRow.productId}-${returnRow.stockBatchId}-${index}`}>
                      <td className="py-2">
                        <input name="returnProductId" type="hidden" value={returnRow.quantity > 0 ? returnRow.productId : ""} />
                        <div className="font-medium text-[var(--foreground)]">{product ? formatOption(product) : "商品已不存在"}</div>
                        {maxQuantity ? <div className="text-xs text-[var(--ink-soft)]">最多可退 {maxQuantity}</div> : null}
                      </td>
                      <td className="py-2">
                        <input name="returnStockBatchId" type="hidden" value={returnRow.quantity > 0 ? returnRow.stockBatchId : ""} />
                        <span className="font-mono text-xs">{returnBatch ? `${returnBatch.batchNo} / ${returnBatch.expiryDate}` : "-"}</span>
                      </td>
                      <td className="py-2">
                        <input className="focus-ring h-9 w-24 rounded-md border border-[var(--line)] px-2" max={maxQuantity} min={0} name="returnQuantity" type="number" value={returnRow.quantity} onChange={(event) => updateReturnRow(index, { quantity: Number(event.target.value) })} />
                      </td>
                      <td className="py-2">
                        <input name="outProductId" type="hidden" value={returnRow.quantity > 0 && outRow.quantity > 0 ? outRow.productId : ""} />
                        <SearchableDropdown
                          value={outRow.productId}
                          options={outProductOptions}
                          getLabel={formatOption}
                          onChange={(value) => updateOutRow(index, { productId: value })}
                          placeholder="搜索商品编码或名称"
                        />
                      </td>
                      <td className="py-2">
                        <input name="outStockBatchId" type="hidden" value={returnRow.quantity > 0 && outRow.quantity > 0 ? outRow.stockBatchId : ""} />
                        <SearchableDropdown
                          value={outRow.stockBatchId}
                          options={outBatches}
                          getLabel={(batch) => `${batch.batchNo} / 可用 ${batch.currentQuantity} / ${batch.expiryDate}`}
                          onChange={(value) => updateOutRow(index, { stockBatchId: value })}
                          placeholder="搜索批号"
                        />
                      </td>
                      <td className="py-2">
                        <input className="focus-ring h-9 w-24 rounded-md border border-[var(--line)] px-2" min={0} name="outQuantity" type="number" value={outRow.quantity} onChange={(event) => updateOutRow(index, { quantity: Number(event.target.value) })} />
                      </td>
                      <td className="py-2">
                        <input className="focus-ring h-9 w-24 rounded-md border border-[var(--line)] px-2" min={0} name="outUnitPrice" step="0.01" type="number" value={outRow.unitPrice} onChange={(event) => updateOutRow(index, { unitPrice: Number(event.target.value) })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <>
      <div className="rounded-md border border-[var(--line)] bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">{lockedReturnRows ? "原订单退回数量" : "退入明细（客户退回，库存加回）"}</h3>
            {lockedReturnRows ? <p className="mt-1 text-xs text-[var(--ink-soft)]">只填写本次客户退回数量，商品和批次已按原订单带出。</p> : null}
          </div>
          {!lockedReturnRows ? <button className="focus-ring h-9 rounded-md bg-[var(--leaf)] px-3 text-sm font-semibold text-white" type="button" onClick={addReturnRow}>添加退入行</button> : null}
        </div>
        {returnRows.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs text-[var(--ink-soft)]">
                <tr>
                  <th className="py-2">商品</th>
                  <th className="py-2">退入批次</th>
                  <th className="py-2">数量</th>
                  {!lockedReturnRows ? <th className="py-2">操作</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {returnRows.map((row, index) => {
                  const productBatches = batches.filter((batch) => batch.productId === row.productId);
                  const product = products.find((item) => item.id === row.productId);
                  const batch = batches.find((item) => item.id === row.stockBatchId);
                  const maxQuantity = initialReturnRows?.[index]?.maxQuantity;
                  return (
                    <tr key={index}>
                      <td className="py-2">
                        <input name="returnProductId" type="hidden" value={row.quantity > 0 ? row.productId : ""} />
                        {lockedReturnRows ? (
                          <div>
                            <div className="font-medium text-[var(--foreground)]">{product ? formatOption(product) : "商品已不存在"}</div>
                            {maxQuantity ? <div className="text-xs text-[var(--ink-soft)]">最多可退 {maxQuantity}</div> : null}
                          </div>
                        ) : (
                          <SearchableDropdown
                            value={row.productId}
                            options={products}
                            getLabel={formatOption}
                            onChange={(value) => updateReturnRow(index, { productId: value })}
                            placeholder="搜索商品编码或名称"
                          />
                        )}
                      </td>
                      <td className="py-2">
                        <input name="returnStockBatchId" type="hidden" value={row.quantity > 0 ? row.stockBatchId : ""} />
                        {lockedReturnRows ? (
                          <span className="font-mono text-xs">{batch ? `${batch.batchNo} / ${batch.expiryDate}` : "-"}</span>
                        ) : (
                          <SearchableDropdown
                            value={row.stockBatchId}
                            options={productBatches}
                            getLabel={(batch) => `${batch.batchNo} / 库存 ${batch.currentQuantity} / ${batch.expiryDate}`}
                            onChange={(value) => updateReturnRow(index, { stockBatchId: value })}
                            placeholder="搜索批号"
                          />
                        )}
                      </td>
                      <td className="py-2">
                        <input className="focus-ring h-9 w-28 rounded-md border border-[var(--line)] px-2" max={maxQuantity} min={0} name="returnQuantity" type="number" value={row.quantity} onChange={(event) => updateReturnRow(index, { quantity: Number(event.target.value) })} />
                      </td>
                      {!lockedReturnRows ? (
                        <td className="py-2">
                          <button className="text-sm font-semibold text-[var(--tomato)]" type="button" onClick={() => removeReturnRow(index)}>移除</button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">没有退入明细，如纯换出可跳过。</div>
        )}
      </div>

      <div className="rounded-md border border-[var(--line)] bg-white p-3">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-[var(--foreground)]">换出其它商品（发给客户，库存扣减）</h3>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">换出商品不能与本次退回商品相同。</p>
          </div>
          <button className="focus-ring h-9 rounded-md bg-[var(--leaf)] px-3 text-sm font-semibold text-white" type="button" onClick={addOutRow}>添加换出行</button>
        </div>
        {outRows.length > 0 ? (
          <div className="overflow-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs text-[var(--ink-soft)]">
                <tr>
                  <th className="py-2">商品</th>
                  <th className="py-2">换出批次</th>
                  <th className="py-2">数量</th>
                  <th className="py-2">单价</th>
                  <th className="py-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {outRows.map((row, index) => {
                  const productBatches = batches.filter((batch) => batch.productId === row.productId && batch.currentQuantity > 0);
                  return (
                    <tr key={index}>
                      <td className="py-2">
                        <input name="outProductId" type="hidden" value={row.quantity > 0 ? row.productId : ""} />
                        <SearchableDropdown
                          value={row.productId}
                          options={outProductOptions}
                          getLabel={formatOption}
                          onChange={(value) => updateOutRow(index, { productId: value })}
                          placeholder="搜索商品编码或名称"
                        />
                      </td>
                      <td className="py-2">
                        <input name="outStockBatchId" type="hidden" value={row.quantity > 0 ? row.stockBatchId : ""} />
                        <SearchableDropdown
                          value={row.stockBatchId}
                          options={productBatches}
                          getLabel={(batch) => `${batch.batchNo} / 可用 ${batch.currentQuantity} / ${batch.expiryDate}`}
                          onChange={(value) => updateOutRow(index, { stockBatchId: value })}
                          placeholder="搜索批号"
                        />
                      </td>
                      <td className="py-2">
                        <input className="focus-ring h-9 w-28 rounded-md border border-[var(--line)] px-2" min={0} name="outQuantity" type="number" value={row.quantity} onChange={(event) => updateOutRow(index, { quantity: Number(event.target.value) })} />
                      </td>
                      <td className="py-2">
                        <input className="focus-ring h-9 w-28 rounded-md border border-[var(--line)] px-2" min={0} name="outUnitPrice" step="0.01" type="number" value={row.unitPrice} onChange={(event) => updateOutRow(index, { unitPrice: Number(event.target.value) })} />
                      </td>
                      <td className="py-2">
                        <button className="text-sm font-semibold text-[var(--tomato)]" type="button" onClick={() => removeOutRow(index)}>移除</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-[var(--line)] p-4 text-sm text-[var(--ink-soft)]">没有换出明细，如纯退入可跳过。</div>
        )}
      </div>
        </>
      )}
      <TextArea label="备注" name="remark" />
    </ManagedForm>
  );
}
