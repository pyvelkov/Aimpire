import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ProductNotFoundError,
  type ManagedProduct,
  type ProductDetail,
} from "../services/product-management.service.js";

export type ProductManagementApi = {
  products(): Promise<ManagedProduct[]>;
  productDetail(id: string): Promise<ProductDetail>;
};

const idSchema = z.object({
  id: z.string().uuid(),
});

export function registerProductManagementRoutes(
  app: FastifyInstance,
  service: ProductManagementApi,
): void {
  app.get("/dashboard/products", async (request, reply) => {
    try {
      const products = await service.products();
      return {
        success: true,
        count: products.length,
        products,
      };
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });

  app.get("/dashboard/products/:id", async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) {
      return reply.status(400).send({
        success: false,
        error: "Invalid product ID",
      });
    }

    try {
      return {
        success: true,
        product: await service.productDetail(params.data.id),
      };
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        return reply.status(404).send({
          success: false,
          error: "Product not found",
        });
      }

      request.log.error(error);
      return reply.status(500).send({
        success: false,
        error: "Failed to load dashboard data",
      });
    }
  });
}
