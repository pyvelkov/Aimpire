import { z } from "zod";

export const unitEconomicsSchema = z.object({
  currency: z.enum(["CAD", "USD"]),
  market: z.enum(["CA", "US"]),
  selling_price: z.number().positive(),
  product_cost: z.number().min(0),
  shipping_cost: z.number().min(0),
  packaging_cost: z.number().min(0),
  other_variable_cost: z.number().min(0),
  payment_fee_percent: z.number().min(0).max(100),
  payment_fee_fixed: z.number().min(0),
  return_allowance_percent: z.number().min(0).max(100),
  estimated_acquisition_cost: z.number().min(0).optional(),
});

export type UnitEconomicsInput = z.infer<
  typeof unitEconomicsSchema
>;

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export class UnitEconomicsService {
  calculate(input: UnitEconomicsInput) {
    const values = unitEconomicsSchema.parse(input);

    const paymentFees =
      values.selling_price *
        (values.payment_fee_percent / 100) +
      values.payment_fee_fixed;

    const returnsAllowance =
      values.selling_price *
      (values.return_allowance_percent / 100);

    const variableCosts =
      values.product_cost +
      values.shipping_cost +
      values.packaging_cost +
      values.other_variable_cost +
      paymentFees +
      returnsAllowance;

    const contributionProfit =
      values.selling_price - variableCosts;

    const contributionMargin =
      (contributionProfit / values.selling_price) * 100;

    const acquisitionCost =
      values.estimated_acquisition_cost;

    return {
      currency: values.currency,
      market: values.market,
      selling_price: values.selling_price,
      variable_costs: round(variableCosts),
      payment_fees: round(paymentFees),
      returns_allowance: round(returnsAllowance),
      contribution_profit_before_ads: round(
        contributionProfit
      ),
      contribution_margin_percent: round(
        contributionMargin
      ),
      break_even_acquisition_cost: round(
        Math.max(0, contributionProfit)
      ),
      estimated_acquisition_cost:
        acquisitionCost ?? null,
      contribution_profit_after_ads:
        acquisitionCost === undefined
          ? null
          : round(contributionProfit - acquisitionCost),
      profitable_before_ads: contributionProfit > 0,
    };
  }
}

export const unitEconomicsService =
  new UnitEconomicsService();
