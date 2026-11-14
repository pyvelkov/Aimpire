import { unitEconomicsService } from "./unit-economics.service.js";

export type ProfitabilityCalculatorInput = {
  currency: "USD" | "CAD";
  market: "US" | "CA";
  selling_price: number;
  product_cost: number;
  shipping_cost: number;
  packaging_cost: number;
  other_variable_cost: number;
  payment_fee_percent: number;
  payment_fee_fixed: number;
  return_allowance_percent: number;
  estimated_acquisition_cost: number;
};

// Reuse the existing deterministic unit economics calculator.
export function calculateExistingUnitEconomics(
  input: ProfitabilityCalculatorInput
): Record<string, unknown> {
  return unitEconomicsService.calculate(input);
}
