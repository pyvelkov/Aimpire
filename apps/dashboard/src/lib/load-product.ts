import "server-only";
import { redirect } from "next/navigation";
import { loadDashboardResource } from "./agent-api";
import { DashboardAccessError, DashboardNotFoundError } from "./errors";
import {
  parseProductDetail,
  parseProductList,
  type ManagedProduct,
  type ProductDetail,
} from "./product-schema";

export type ProductListResult =
  | { ok: true; products: ManagedProduct[] }
  | { ok: false; message: string };

export type ProductDetailResult =
  | { ok: true; product: ProductDetail }
  | { ok: false; notFound: true }
  | { ok: false; notFound: false; message: string };

function redirectForAccess(error: DashboardAccessError): never {
  if (error.status === 403) {
    redirect("/login?error=owner");
  }
  if (error.status === 503) {
    redirect("/login?error=config");
  }
  redirect("/login");
}

export async function loadProductList(): Promise<ProductListResult> {
  try {
    const payload = await loadDashboardResource("products");
    return { ok: true, products: parseProductList(payload) };
  } catch (error) {
    if (error instanceof DashboardAccessError) {
      redirectForAccess(error);
    }
    return {
      ok: false,
      message: "Product records are unavailable. No records were changed.",
    };
  }
}

export async function loadProductDetail(id: string): Promise<ProductDetailResult> {
  try {
    const payload = await loadDashboardResource(`products/${id}`);
    return { ok: true, product: parseProductDetail(payload) };
  } catch (error) {
    if (error instanceof DashboardNotFoundError) {
      return { ok: false, notFound: true };
    }
    if (error instanceof DashboardAccessError) {
      redirectForAccess(error);
    }
    return {
      ok: false,
      notFound: false,
      message: "This product record is unavailable. No records were changed.",
    };
  }
}
