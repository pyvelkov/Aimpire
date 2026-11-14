import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateExistingUnitEconomics } from "./profitability-calculator.adapter.js";

describe("calculateExistingUnitEconomics", () => {
  it("reuses the unit economics calculator for the sample inputs", () => {
    const result = calculateExistingUnitEconomics({
      currency: "USD",
      market: "US",
      selling_price: 25,
      product_cost: 2,
      shipping_cost: 10.26,
      packaging_cost: 0,
      other_variable_cost: 0,
      payment_fee_percent: 2.9,
      payment_fee_fixed: 0.3,
      return_allowance_percent: 3,
      estimated_acquisition_cost: 6,
    });

    assert.equal(result.selling_price, 25);
    assert.equal(result.payment_fees, 1.03);
    assert.equal(result.returns_allowance, 0.75);
    assert.equal(result.variable_costs, 14.04);
    assert.equal(result.contribution_profit_before_ads, 10.97);
    assert.equal(result.estimated_acquisition_cost, 6);
    assert.equal(result.contribution_profit_after_ads, 4.97);
    assert.equal(result.break_even_acquisition_cost, 10.97);
    assert.equal(result.contribution_margin_percent, 43.86);
  });
});
