"use server";

import { BatchSource, ExchangeInboundStatus, ExchangeOutboundStatus, MovementType, OrderStatus, OutboundStatus, ReturnStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";

export type ActionState = {
  ok: boolean;
  message: string;
  outboundOrderId?: string;
};

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function requiredText(formData: FormData, key: string, label: string) {
  const value = text(formData, key);
  if (!value) throw new Error(`${label}不能为空`);
  return value;
}

function intValue(formData: FormData, key: string, label: string) {
  const value = Number(text(formData, key));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}必须是大于 0 的整数`);
  }
  return value;
}

function numberValue(formData: FormData, key: string, label: string, fallback = 0) {
  const raw = text(formData, key);
  const value = raw ? Number(raw) : fallback;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}必须是有效数字`);
  }
  return value;
}

function dateValue(formData: FormData, key: string) {
  const value = text(formData, key);
  if (!value) return undefined;
  return new Date(`${value}T00:00:00`);
}

function orderNo(prefix: string) {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `${prefix}${stamp}${Math.floor(Math.random() * 90 + 10)}`;
}

function success(message: string, extra?: Omit<ActionState, "ok" | "message">): ActionState {
  revalidatePath("/");
  return { ok: true, message, ...extra };
}

function failure(error: unknown): ActionState {
  return {
    ok: false,
    message: error instanceof Error ? error.message : "操作失败，请检查输入后重试",
  };
}

export async function saveProduct(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = text(formData, "id");
    const code = requiredText(formData, "code", "商品编码");
    const data = {
      code,
      name: requiredText(formData, "name", "商品名称"),
      spec: requiredText(formData, "spec", "规格"),
      unit: ["包", "袋", "杯", "个"].includes(text(formData, "unit")) ? text(formData, "unit") : "包",
      barcode: text(formData, "barcode") || undefined,
      category: text(formData, "category") || undefined,
      shelfLifeDays: Number(text(formData, "shelfLifeDays") || 180),
      minStock: Number(text(formData, "minStock") || 0),
      isActive: text(formData, "isActive") !== "false",
    };

    // 外部编码子表：按订单来源(客户) + 外部编码 维护
    const sourceCustomerIds = formData.getAll("sourceCustomerId").map(String);
    const externalCodes = formData.getAll("externalCode").map(String);
    const externalNames = formData.getAll("externalName").map(String);
    const seen = new Set<string>();
    const externalLines = sourceCustomerIds
      .map((customerId, index) => ({
        customerId,
        externalCode: externalCodes[index]?.trim() ?? "",
        externalName: externalNames[index]?.trim() || undefined,
      }))
      .filter((line) => {
        if (!line.customerId || !line.externalCode) return false;
        const key = `${line.customerId}|${line.externalCode}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    await db.$transaction(async (tx) => {
      let productId = id;
      if (id) {
        await tx.product.update({ where: { id }, data });
      } else {
        const created = await tx.product.upsert({ where: { code }, update: data, create: data });
        productId = created.id;
      }

      // 以表单提交的子表为准，全量同步该商品的外部编码
      await tx.productExternalCode.deleteMany({ where: { productId } });
      for (const line of externalLines) {
        await tx.productExternalCode.upsert({
          where: { customerId_externalCode: { customerId: line.customerId, externalCode: line.externalCode } },
          update: { productId, externalName: line.externalName },
          create: { productId, customerId: line.customerId, externalCode: line.externalCode, externalName: line.externalName },
        });
      }
    });

    return success(`商品 ${code} 已保存`);
  } catch (error) {
    return failure(error);
  }
}

export async function batchImportProducts(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const raw = text(formData, "importText");
    if (!raw) throw new Error("请粘贴商品数据");

    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) throw new Error("没有可导入的数据");

    const rows = lines.map((line) => {
      if (line.includes("\t")) return line.split("\t").map((cell) => cell.trim());
      if (line.includes(",") || line.includes("，")) return line.split(/[,，]/).map((cell) => cell.trim());
      return line.split(/\s+/).map((cell) => cell.trim());
    });

    // 首行表头自动跳过
    const firstCell = rows[0]?.[0] ?? "";
    const hasHeader = firstCell.includes("编码") || firstCell.toLowerCase().includes("code");
    const dataRows = hasHeader ? rows.slice(1) : rows;

    let count = 0;
    let skipped = 0;
    await db.$transaction(async (tx) => {
      for (const parts of dataRows) {
        const [code, name, spec, unit, barcode, category, shelfLifeDays, minStock] = parts;
        if (!code || !name || !spec) {
          skipped++;
          continue;
        }
        const data = {
          code,
          name,
          spec,
          unit: ["包", "袋", "杯", "个"].includes(unit) ? unit : "包",
          barcode: barcode || undefined,
          category: category || undefined,
          shelfLifeDays: Number(shelfLifeDays) || 180,
          minStock: Number(minStock) || 0,
          isActive: true,
        };
        await tx.product.upsert({ where: { code }, update: data, create: data });
        count++;
      }
    });

    if (count === 0) throw new Error("没有有效的商品行，请检查编码/名称/规格是否填写");
    return success(`已导入 ${count} 个商品${skipped > 0 ? `，${skipped} 行因缺字段跳过` : ""}`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveCustomer(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = text(formData, "id");
    const code = requiredText(formData, "code", "客户编码");
    const data = {
      code,
      name: requiredText(formData, "name", "客户名称"),
      contact: text(formData, "contact") || undefined,
      phone: text(formData, "phone") || undefined,
      address: text(formData, "address") || undefined,
      paymentNote: text(formData, "paymentNote") || undefined,
      remark: text(formData, "remark") || undefined,
      isActive: text(formData, "isActive") !== "false",
    };

    if (id) {
      await db.customer.update({ where: { id }, data });
    } else {
      await db.customer.upsert({ where: { code }, update: data, create: data });
    }
    return success(`客户 ${code} 已保存`);
  } catch (error) {
    return failure(error);
  }
}

export async function saveSupplier(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = text(formData, "id");
    const code = requiredText(formData, "code", "供应商编码");
    const data = {
      code,
      name: requiredText(formData, "name", "供应商名称"),
      contact: text(formData, "contact") || undefined,
      phone: text(formData, "phone") || undefined,
      address: text(formData, "address") || undefined,
      remark: text(formData, "remark") || undefined,
      isActive: text(formData, "isActive") !== "false",
    };

    if (id) {
      await db.supplier.update({ where: { id }, data });
    } else {
      await db.supplier.upsert({ where: { code }, update: data, create: data });
    }
    return success(`供应商 ${code} 已保存`);
  } catch (error) {
    return failure(error);
  }
}

export async function setProductActive(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "商品");
    const isActive = text(formData, "isActive") === "true";
    await db.product.update({ where: { id }, data: { isActive } });
    return success(isActive ? "商品已恢复使用" : "商品已停用，历史单据仍保留");
  } catch (error) {
    return failure(error);
  }
}

export async function setCustomerActive(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "客户");
    const isActive = text(formData, "isActive") === "true";
    await db.customer.update({ where: { id }, data: { isActive } });
    return success(isActive ? "客户已恢复使用" : "客户已停用，历史单据仍保留");
  } catch (error) {
    return failure(error);
  }
}

export async function setSupplierActive(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "供应商");
    const isActive = text(formData, "isActive") === "true";
    await db.supplier.update({ where: { id }, data: { isActive } });
    return success(isActive ? "供应商已恢复使用" : "供应商已停用，历史单据仍保留");
  } catch (error) {
    return failure(error);
  }
}

export async function createPurchase(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const supplierId = requiredText(formData, "supplierId", "供应商");
    const productIds = formData.getAll("productId").map(String).filter(Boolean);
    const batchNos = formData.getAll("batchNo").map(String);
    const productionDates = formData.getAll("productionDate").map(String);
    const expiryDates = formData.getAll("expiryDate").map(String);
    const quantities = formData.getAll("quantity").map(String);
    const unitPrices = formData.getAll("unitPrice").map(String);

    if (productIds.length === 0) throw new Error("至少选择一个商品");

    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const lines = productIds.map((productId, index) => {
      const quantity = Number(quantities[index]);
      const unitPrice = Number(unitPrices[index] || 0);
      const expiryDate = expiryDates[index] ? new Date(`${expiryDates[index]}T00:00:00`) : undefined;
      const productionDate = productionDates[index] ? new Date(`${productionDates[index]}T00:00:00`) : undefined;
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("入库数量必须是大于 0 的整数");
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("采购价必须是有效数字");
      if (!expiryDate) throw new Error("每一行都必须填写允收日");
      return {
        productId,
        batchNo: batchNos[index]?.trim() || `B${today}-${index + 1}`,
        productionDate,
        expiryDate,
        quantity,
        unitPrice,
      };
    });

    const purchaseNo = await db.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier?.isActive) throw new Error("供应商不存在或已停用");

      const purchase = await tx.purchaseOrder.create({
        data: {
          orderNo: orderNo("RK"),
          supplierId,
          orderDate: dateValue(formData, "orderDate") ?? new Date(),
          remark: text(formData, "remark") || undefined,
        },
      });

      for (const line of lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product?.isActive) throw new Error("商品不存在或已停用");

        const item = await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: purchase.id,
            productId: line.productId,
            batchNo: line.batchNo,
            productionDate: line.productionDate,
            expiryDate: line.expiryDate,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
          },
        });

        const batch = await tx.stockBatch.create({
          data: {
            productId: line.productId,
            purchaseOrderItemId: item.id,
            sourceType: BatchSource.PURCHASE,
            batchNo: item.batchNo,
            productionDate: item.productionDate,
            expiryDate: item.expiryDate,
            initialQuantity: line.quantity,
            currentQuantity: line.quantity,
            unitCost: line.unitPrice,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            stockBatchId: batch.id,
            type: MovementType.PURCHASE_IN,
            quantity: line.quantity,
            refNo: purchase.orderNo,
            note: "采购入库",
          },
        });
      }

      return purchase.orderNo;
    });

    return success(`入库单 ${purchaseNo} 已保存，共 ${lines.length} 个商品明细`);
  } catch (error) {
    return failure(error);
  }
}

export async function initializeStock(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const productIds = formData.getAll("productId").map(String).filter(Boolean);
    const batchNos = formData.getAll("batchNo").map(String);
    const productionDates = formData.getAll("productionDate").map(String);
    const expiryDates = formData.getAll("expiryDate").map(String);
    const quantities = formData.getAll("quantity").map(String);
    const unitCosts = formData.getAll("unitCost").map(String);

    if (productIds.length === 0) throw new Error("至少选择一个商品");

    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const lines = productIds.map((productId, index) => {
      const quantity = Number(quantities[index]);
      const unitCost = Number(unitCosts[index] || 0);
      const expiryDate = expiryDates[index] ? new Date(`${expiryDates[index]}T00:00:00`) : undefined;
      const productionDate = productionDates[index] ? new Date(`${productionDates[index]}T00:00:00`) : undefined;
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("初始化数量必须是大于 0 的整数");
      if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("成本价必须是有效数字");
      if (!expiryDate) throw new Error("每一行都必须填写允收日");
      return {
        productId,
        batchNo: batchNos[index]?.trim() || `INIT-${today}-${index + 1}`,
        productionDate,
        expiryDate,
        quantity,
        unitCost,
      };
    });

    await db.$transaction(async (tx) => {
      for (const line of lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product?.isActive) throw new Error("商品不存在或已停用");

        const batch = await tx.stockBatch.create({
          data: {
            productId: line.productId,
            sourceType: BatchSource.INITIAL,
            batchNo: line.batchNo,
            productionDate: line.productionDate,
            expiryDate: line.expiryDate,
            initialQuantity: line.quantity,
            currentQuantity: line.quantity,
            unitCost: line.unitCost,
          },
        });

        await tx.stockMovement.create({
          data: {
            productId: line.productId,
            stockBatchId: batch.id,
            type: MovementType.INITIAL_STOCK,
            quantity: line.quantity,
            refNo: line.batchNo,
            note: "库存初始化",
          },
        });
      }
    });

    return success(`已初始化 ${lines.length} 个商品批次`);
  } catch (error) {
    return failure(error);
  }
}

export async function createSalesOrder(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const customerId = requiredText(formData, "customerId", "客户");
    const productIds = formData.getAll("productId").map(String).filter(Boolean);
    const quantities = formData.getAll("quantity").map(String);
    const unitPrices = formData.getAll("unitPrice").map(String);
    const validDeliveryDates = formData.getAll("validDeliveryDate").map(String);

    if (productIds.length === 0) throw new Error("至少选择一个商品");

    const lines = productIds.map((productId, index) => {
      const quantity = Number(quantities[index]);
      const unitPrice = Number(unitPrices[index] || 0);
      const validDeliveryDate = validDeliveryDates[index] ? new Date(`${validDeliveryDates[index]}T00:00:00`) : undefined;
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("商品数量必须是大于 0 的整数");
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("销售价必须是有效数字");
      return { productId, quantity, unitPrice, validDeliveryDate };
    });

    const orderNoValue = await db.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer?.isActive) throw new Error("客户不存在或已停用");

      for (const line of lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product?.isActive) throw new Error("商品不存在或已停用");
      }

      const order = await tx.salesOrder.create({
        data: {
          orderNo: orderNo("XS"),
          customerId,
          orderDate: dateValue(formData, "orderDate") ?? new Date(),
          deliveryDate: dateValue(formData, "deliveryDate"),
          status: OrderStatus.CONFIRMED,
          remark: text(formData, "remark") || undefined,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              validDeliveryDate: line.validDeliveryDate,
            })),
          },
        },
      });
      return order.orderNo;
    });

    return success(`销售订单 ${orderNoValue} 已创建`);
  } catch (error) {
    return failure(error);
  }
}

export async function updateSalesOrder(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "销售订单");
    const customerId = requiredText(formData, "customerId", "客户");
    const productIds = formData.getAll("productId").map(String).filter(Boolean);
    const quantities = formData.getAll("quantity").map(String);
    const unitPrices = formData.getAll("unitPrice").map(String);
    const validDeliveryDates = formData.getAll("validDeliveryDate").map(String);

    if (productIds.length === 0) throw new Error("至少选择一个商品");

    const lines = productIds.map((productId, index) => {
      const quantity = Number(quantities[index]);
      const unitPrice = Number(unitPrices[index] || 0);
      const validDeliveryDate = validDeliveryDates[index] ? new Date(`${validDeliveryDates[index]}T00:00:00`) : undefined;
      if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("商品数量必须是大于 0 的整数");
      if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error("销售价必须是有效数字");
      return { productId, quantity, unitPrice, validDeliveryDate };
    });

    const orderNoValue = await db.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id }, include: { outbounds: true } });
      if (!order) throw new Error("销售订单不存在");
      if (order.outbounds.length > 0 || order.status === OrderStatus.PARTIAL || order.status === OrderStatus.COMPLETED) {
        throw new Error("订单已有出库记录，不能直接修改明细");
      }
      if (order.status === OrderStatus.CANCELLED) throw new Error("已取消订单不能修改");

      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer?.isActive) throw new Error("客户不存在或已停用");

      for (const line of lines) {
        const product = await tx.product.findUnique({ where: { id: line.productId } });
        if (!product?.isActive) throw new Error("商品不存在或已停用");
      }

      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: id } });
      await tx.salesOrder.update({
        where: { id },
        data: {
          customerId,
          orderDate: dateValue(formData, "orderDate") ?? order.orderDate,
          deliveryDate: dateValue(formData, "deliveryDate"),
          remark: text(formData, "remark") || undefined,
          status: OrderStatus.CONFIRMED,
          items: {
            create: lines.map((line) => ({
              productId: line.productId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              validDeliveryDate: line.validDeliveryDate,
            })),
          },
        },
      });
      return order.orderNo;
    });

    return success(`销售订单 ${orderNoValue} 已修改`);
  } catch (error) {
    return failure(error);
  }
}

export async function cancelSalesOrder(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "销售订单");
    const order = await db.salesOrder.findUnique({ where: { id }, include: { outbounds: true } });
    if (!order) throw new Error("销售订单不存在");
    if (order.outbounds.length > 0) throw new Error("订单已有出库记录，不能直接取消");
    await db.salesOrder.update({ where: { id }, data: { status: OrderStatus.CANCELLED } });
    return success(`销售订单 ${order.orderNo} 已取消`);
  } catch (error) {
    return failure(error);
  }
}

export async function shipSalesOrder(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const outboundOrderId = text(formData, "outboundOrderId");
    const salesOrderId = requiredText(formData, "salesOrderId", "销售订单");
    const productIds = formData.getAll("productId").map(String);
    const stockBatchIds = formData.getAll("stockBatchId").map(String);
    const quantities = formData.getAll("quantity").map(String);

    const allocations = stockBatchIds.map((stockBatchId, index) => ({
      productId: productIds[index],
      stockBatchId,
      quantity: Number(quantities[index]),
    })).filter((allocation) => allocation.productId && allocation.stockBatchId && allocation.quantity > 0);

    if (allocations.length === 0) throw new Error("请至少选择一个出库批次");

    const savedOutbound = await db.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({
        where: { id: salesOrderId },
        include: { items: true, outbounds: true },
      });

      if (!order) throw new Error("销售订单不存在");
      if (order.status === OrderStatus.COMPLETED) throw new Error("销售订单已完成");
      if (order.status === OrderStatus.CANCELLED) throw new Error("销售订单已取消");
      const confirmedOutbound = order.outbounds.find((outbound) => outbound.status === OutboundStatus.CONFIRMED);
      if (confirmedOutbound) throw new Error("该订单已确认出库，不能再次出库");

      const draftOutbound = outboundOrderId
        ? await tx.outboundOrder.findUnique({ where: { id: outboundOrderId }, include: { items: true } })
        : order.outbounds.find((outbound) => outbound.status === OutboundStatus.DRAFT) ?? null;
      if (draftOutbound && draftOutbound.status === OutboundStatus.CONFIRMED) throw new Error("出库单已确认，不能修改");

      const outbound = draftOutbound
        ? await tx.outboundOrder.update({
            where: { id: draftOutbound.id },
            data: {
              outboundDate: dateValue(formData, "outboundDate") ?? new Date(),
              remark: text(formData, "remark") || undefined,
            },
          })
        : await tx.outboundOrder.create({
            data: {
              outboundNo: orderNo("CK"),
              customerId: order.customerId,
              salesOrderId: order.id,
              outboundDate: dateValue(formData, "outboundDate") ?? new Date(),
              status: OutboundStatus.DRAFT,
              remark: text(formData, "remark") || undefined,
            },
          });

      await tx.outboundOrderItem.deleteMany({ where: { outboundOrderId: outbound.id } });

      for (const allocation of allocations) {
        if (!Number.isInteger(allocation.quantity) || allocation.quantity <= 0) throw new Error("出库数量必须是大于 0 的整数");
        const item = order.items.find((orderItem) => orderItem.productId === allocation.productId);
        if (!item) throw new Error("分配商品不属于该销售订单");

        const batch = await tx.stockBatch.findUnique({ where: { id: allocation.stockBatchId } });
        if (!batch || batch.productId !== allocation.productId) throw new Error("出库批次和商品不匹配");
        if (batch.currentQuantity < allocation.quantity) throw new Error(`批次 ${batch.batchNo} 库存不足`);
        await tx.outboundOrderItem.create({
          data: {
            outboundOrderId: outbound.id,
            productId: allocation.productId,
            stockBatchId: batch.id,
            quantity: allocation.quantity,
            unitPrice: item.unitPrice,
          },
        });
      }

      return { id: outbound.id, outboundNo: outbound.outboundNo };
    });

    return success(`出库单 ${savedOutbound.outboundNo} 已保存，确认后才会扣库存`, { outboundOrderId: savedOutbound.id });
  } catch (error) {
    return failure(error);
  }
}

export async function confirmOutboundOrder(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "出库单");

    const outboundNo = await db.$transaction(async (tx) => {
      const outbound = await tx.outboundOrder.findUnique({
        where: { id },
        include: { items: true, salesOrder: true },
      });
      if (!outbound) throw new Error("出库单不存在");
      if (outbound.status === OutboundStatus.CONFIRMED) throw new Error("出库单已确认，不能重复确认");
      if (outbound.items.length === 0) throw new Error("出库单没有明细");

      for (const item of outbound.items) {
        const batch = await tx.stockBatch.findUnique({ where: { id: item.stockBatchId } });
        if (!batch) throw new Error("出库批次不存在");
        if (batch.currentQuantity < item.quantity) throw new Error(`批次 ${batch.batchNo} 库存不足`);
      }

      for (const item of outbound.items) {
        await tx.stockBatch.update({
          where: { id: item.stockBatchId },
          data: { currentQuantity: { decrement: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            stockBatchId: item.stockBatchId,
            type: MovementType.SALES_OUT,
            quantity: -item.quantity,
            refNo: outbound.outboundNo,
            note: `销售出库 ${outbound.salesOrder?.orderNo ?? ""}`.trim(),
          },
        });
      }

      await tx.outboundOrder.update({
        where: { id: outbound.id },
        data: { status: OutboundStatus.CONFIRMED },
      });
      if (outbound.salesOrderId) {
        await tx.salesOrder.update({
          where: { id: outbound.salesOrderId },
          data: { status: OrderStatus.COMPLETED },
        });
      }

      return outbound.outboundNo;
    });

    return success(`出库单 ${outboundNo} 已确认，库存已扣减`);
  } catch (error) {
    return failure(error);
  }
}

export async function createReturnOrder(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const outboundOrderId = requiredText(formData, "outboundOrderId", "出库单");
    const itemIds = formData.getAll("outboundOrderItemId").map(String);
    const quantities = formData.getAll("quantity").map(String);
    const reason = requiredText(formData, "reason", "退货原因");

    const lines = itemIds
      .map((outboundOrderItemId, index) => ({
        outboundOrderItemId,
        quantity: Number(quantities[index]),
      }))
      .filter((line) => line.outboundOrderItemId && line.quantity > 0);

    if (lines.length === 0) throw new Error("请至少填写一行退货数量");

    const returnNoValue = await db.$transaction(async (tx) => {
      const outbound = await tx.outboundOrder.findUnique({
        where: { id: outboundOrderId },
        include: {
          items: {
            include: {
              returnItems: true,
              stockBatch: true,
            },
          },
        },
      });
      if (!outbound) throw new Error("出库单不存在");
      if (outbound.status !== OutboundStatus.CONFIRMED) throw new Error("只有已确认出库单才能退货");

      const returnOrder = await tx.returnOrder.create({
        data: {
          returnNo: orderNo("TH"),
          outboundOrderId: outbound.id,
          customerId: outbound.customerId,
          returnDate: dateValue(formData, "returnDate") ?? new Date(),
          reason,
          remark: text(formData, "remark") || undefined,
        },
      });

      for (const line of lines) {
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("退货数量必须是大于 0 的整数");
        const outboundItem = outbound.items.find((item) => item.id === line.outboundOrderItemId);
        if (!outboundItem) throw new Error("退货明细不属于该出库单");
        const returnedQuantity = outboundItem.returnItems.reduce((sum, item) => sum + item.quantity, 0);
        const returnableQuantity = outboundItem.quantity - returnedQuantity;
        if (line.quantity > returnableQuantity) {
          throw new Error(`${outboundItem.stockBatch.batchNo} 可退数量不足，最多可退 ${returnableQuantity}`);
        }

        await tx.returnOrderItem.create({
          data: {
            returnOrderId: returnOrder.id,
            outboundOrderItemId: outboundItem.id,
            productId: outboundItem.productId,
            stockBatchId: outboundItem.stockBatchId,
            quantity: line.quantity,
          },
        });
      }

      return returnOrder.returnNo;
    });

    return success(`退货单 ${returnNoValue} 已保存，等待退货入库确认`);
  } catch (error) {
    return failure(error);
  }
}

export async function confirmReturnInbound(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "退货单");

    const returnNoValue = await db.$transaction(async (tx) => {
      const order = await tx.returnOrder.findUnique({
        where: { id },
        include: { outboundOrder: true, items: true },
      });
      if (!order) throw new Error("退货单不存在");
      if (order.status !== ReturnStatus.PENDING) throw new Error("退货单已入库，不能重复确认");

      for (const item of order.items) {
        await tx.stockBatch.update({
          where: { id: item.stockBatchId },
          data: { currentQuantity: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            stockBatchId: item.stockBatchId,
            type: MovementType.SALES_RETURN,
            quantity: item.quantity,
            refNo: order.returnNo,
            note: `退货入库 ${order.reason} / ${order.outboundOrder.outboundNo}`,
          },
        });
      }

      await tx.returnOrder.update({
        where: { id: order.id },
        data: { status: ReturnStatus.RECEIVED },
      });

      return order.returnNo;
    });

    return success(`退货单 ${returnNoValue} 已确认入库，库存已加回`);
  } catch (error) {
    return failure(error);
  }
}

export async function createExchangeOrder(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const customerId = requiredText(formData, "customerId", "客户");
    const reason = requiredText(formData, "reason", "换货原因");
    const exchangeMode = text(formData, "exchangeMode");
    const salesOrderId = text(formData, "salesOrderId");

    // 退入明细：客户退回的商品，加回指定批次库存
    const returnProductIds = formData.getAll("returnProductId").map(String);
    const returnBatchIds = formData.getAll("returnStockBatchId").map(String);
    const returnQuantities = formData.getAll("returnQuantity").map(String);

    // 换出明细：发给客户的商品，从指定批次扣减库存
    const outProductIds = formData.getAll("outProductId").map(String);
    const outBatchIds = formData.getAll("outStockBatchId").map(String);
    const outQuantities = formData.getAll("outQuantity").map(String);
    const outPrices = formData.getAll("outUnitPrice").map(String);

    const returnLines = returnProductIds
      .map((productId, index) => ({ productId, stockBatchId: returnBatchIds[index], quantity: Number(returnQuantities[index]) }))
      .filter((line) => line.productId && line.stockBatchId && line.quantity > 0);
    const outLines = outProductIds
      .map((productId, index) => ({ productId, stockBatchId: outBatchIds[index], quantity: Number(outQuantities[index]), unitPrice: Number(outPrices[index]) || 0 }))
      .filter((line) => line.productId && line.stockBatchId && line.quantity > 0);

    if (returnLines.length === 0 && outLines.length === 0) throw new Error("请至少填写一行退入或换出明细");
    if (exchangeMode === "ORDER_REPLACE") {
      if (returnLines.length === 0 || outLines.length === 0) throw new Error("订单换货必须同时填写退回数量和换出商品");
      if (returnLines.length !== outLines.length) throw new Error("每一行退回商品都要填写对应的换出商品和数量");
    }
    const returnedProductIds = new Set(returnLines.map((line) => line.productId));
    if (outLines.some((line) => returnedProductIds.has(line.productId))) {
      throw new Error("换出商品不能与退回商品相同");
    }

    const exchangeNoValue = await db.$transaction(async (tx) => {
      const exchange = await tx.exchangeOrder.create({
        data: {
          exchangeNo: orderNo("HH"),
          salesOrderId: salesOrderId || undefined,
          customerId,
          exchangeDate: dateValue(formData, "exchangeDate") ?? new Date(),
          reason,
          remark: text(formData, "remark") || undefined,
        },
      });

      // 退入：库存加回
      for (const line of returnLines) {
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("退入数量必须是大于 0 的整数");
        const batch = await tx.stockBatch.findUnique({ where: { id: line.stockBatchId } });
        if (!batch) throw new Error("退入批次不存在");
        if (batch.productId !== line.productId) throw new Error("退入批次与商品不匹配");
        await tx.exchangeReturnItem.create({
          data: { exchangeOrderId: exchange.id, productId: line.productId, stockBatchId: line.stockBatchId, quantity: line.quantity },
        });
      }

      // 换出：库存扣减
      for (const line of outLines) {
        if (!Number.isInteger(line.quantity) || line.quantity <= 0) throw new Error("换出数量必须是大于 0 的整数");
        const batch = await tx.stockBatch.findUnique({ where: { id: line.stockBatchId } });
        if (!batch) throw new Error("换出批次不存在");
        if (batch.productId !== line.productId) throw new Error("换出批次与商品不匹配");
        if (batch.currentQuantity < line.quantity) throw new Error(`批次 ${batch.batchNo} 库存不足，当前 ${batch.currentQuantity}，需 ${line.quantity}`);
        await tx.exchangeOutItem.create({
          data: { exchangeOrderId: exchange.id, productId: line.productId, stockBatchId: line.stockBatchId, quantity: line.quantity, unitPrice: line.unitPrice },
        });
      }

      return exchange.exchangeNo;
    });

    return success(`换货单 ${exchangeNoValue} 已保存，等待换货入库/出库确认`);
  } catch (error) {
    return failure(error);
  }
}

export async function confirmExchangeInbound(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "换货单");

    const exchangeNoValue = await db.$transaction(async (tx) => {
      const order = await tx.exchangeOrder.findUnique({
        where: { id },
        include: { returnItems: true },
      });
      if (!order) throw new Error("换货单不存在");
      if (order.inboundStatus !== ExchangeInboundStatus.PENDING) throw new Error("换货入库已确认，不能重复操作");
      if (order.returnItems.length === 0) throw new Error("没有换货退入明细");

      for (const item of order.returnItems) {
        await tx.stockBatch.update({ where: { id: item.stockBatchId }, data: { currentQuantity: { increment: item.quantity } } });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            stockBatchId: item.stockBatchId,
            type: MovementType.EXCHANGE_IN,
            quantity: item.quantity,
            refNo: order.exchangeNo,
            note: `换货入库 ${order.reason}`,
          },
        });
      }

      await tx.exchangeOrder.update({
        where: { id: order.id },
        data: { inboundStatus: ExchangeInboundStatus.RECEIVED },
      });

      return order.exchangeNo;
    });

    return success(`换货单 ${exchangeNoValue} 已确认入库，库存已加回`);
  } catch (error) {
    return failure(error);
  }
}

export async function confirmExchangeOutbound(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const db = getDb();
    const id = requiredText(formData, "id", "换货单");

    const exchangeNoValue = await db.$transaction(async (tx) => {
      const order = await tx.exchangeOrder.findUnique({
        where: { id },
        include: { outItems: true, returnItems: true },
      });
      if (!order) throw new Error("换货单不存在");
      if (order.outboundStatus !== ExchangeOutboundStatus.PENDING) throw new Error("换货出库已确认，不能重复操作");
      if (order.outItems.length === 0) throw new Error("没有换货出库明细");
      if (order.returnItems.length > 0 && order.inboundStatus !== ExchangeInboundStatus.RECEIVED) {
        throw new Error("请先确认换货入库，再确认换货出库");
      }

      for (const item of order.outItems) {
        const batch = await tx.stockBatch.findUnique({ where: { id: item.stockBatchId } });
        if (!batch) throw new Error("换出批次不存在");
        if (batch.currentQuantity < item.quantity) throw new Error(`批次 ${batch.batchNo} 库存不足，当前 ${batch.currentQuantity}，需 ${item.quantity}`);
        await tx.stockBatch.update({ where: { id: item.stockBatchId }, data: { currentQuantity: { decrement: item.quantity } } });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            stockBatchId: item.stockBatchId,
            type: MovementType.EXCHANGE_OUT,
            quantity: -item.quantity,
            refNo: order.exchangeNo,
            note: `换货出库 ${order.reason}`,
          },
        });
      }

      await tx.exchangeOrder.update({
        where: { id: order.id },
        data: { outboundStatus: ExchangeOutboundStatus.SHIPPED },
      });

      return order.exchangeNo;
    });

    return success(`换货单 ${exchangeNoValue} 已确认出库，库存已扣减`);
  } catch (error) {
    return failure(error);
  }
}
