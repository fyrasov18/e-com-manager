import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import {
  getDeliverySettingsForTeam,
  saveDeliverySettingForTeam,
  SUPPORTED_PROVIDERS,
} from "../src/app/api/delivery-settings/route";
import {
  getFinanceSettings,
  calculateFinanceFromData,
  type RawOrder,
} from "../src/lib/finance";

async function runTests() {
  console.log("▶ Running Delivery Company Settings Isolation Test Suite (8 Mandatory Tests)...");

  // ── Setup: Create two isolated test teams ──────────────────────────────────
  let teamX = await prisma.team.findFirst({ where: { name: "Test Workspace X" } });
  if (!teamX) {
    teamX = await prisma.team.create({
      data: { name: "Test Workspace X", slug: "test-workspace-x" },
    });
  }

  let teamY = await prisma.team.findFirst({ where: { name: "Test Workspace Y" } });
  if (!teamY) {
    teamY = await prisma.team.create({
      data: { name: "Test Workspace Y", slug: "test-workspace-y" },
    });
  }

  // Clean existing settings for test teams
  await prisma.deliveryCompanySetting.deleteMany({
    where: { teamId: { in: [teamX.id, teamY.id] } },
  });

  try {
    // ── TEST 1: Account X saves Intigo delivery fee = 8 DT ───────────────────
    console.log("Running TEST 1: Account X saves Intigo delivery fee = 8 DT...");
    const settingX1 = await saveDeliverySettingForTeam(teamX.id, {
      provider: "INTIGO",
      deliveryCost: 8,
      returnCost: 3,
      withholdingTaxPercent: 0,
    });

    assert.equal(settingX1.teamId, teamX.id, "Setting must belong to Team X");
    assert.equal(settingX1.provider, "INTIGO");
    assert.equal(settingX1.deliveryCost, 8, "Team X Intigo fee should be 8 DT");
    console.log("✓ TEST 1 passed");

    // ── TEST 2: Account Y saves Intigo delivery fee = 6 DT ───────────────────
    console.log("Running TEST 2: Account Y saves Intigo delivery fee = 6 DT...");
    const settingY1 = await saveDeliverySettingForTeam(teamY.id, {
      provider: "INTIGO",
      deliveryCost: 6,
      returnCost: 4,
      withholdingTaxPercent: 0,
    });

    assert.equal(settingY1.teamId, teamY.id, "Setting must belong to Team Y");
    assert.equal(settingY1.provider, "INTIGO");
    assert.equal(settingY1.deliveryCost, 6, "Team Y Intigo fee should be 6 DT");
    console.log("✓ TEST 2 passed");

    // ── TEST 3: GET from Account X returns 8 DT ──────────────────────────────
    console.log("Running TEST 3: GET from Account X returns 8 DT...");
    const settingsX = await getDeliverySettingsForTeam(teamX.id);
    const intigoSettingX = settingsX.find((s) => s.provider === "INTIGO");
    assert.ok(intigoSettingX, "Team X should have INTIGO setting");
    assert.equal(intigoSettingX.deliveryCost, 8, "GET Team X must return 8 DT");

    const financeSettingsX = await getFinanceSettings(teamX.id, "INTIGO");
    assert.equal(financeSettingsX.deliveryCost, 8, "Finance engine for Team X must return 8 DT");
    console.log("✓ TEST 3 passed");

    // ── TEST 4: GET from Account Y returns 6 DT ──────────────────────────────
    console.log("Running TEST 4: GET from Account Y returns 6 DT...");
    const settingsY = await getDeliverySettingsForTeam(teamY.id);
    const intigoSettingY = settingsY.find((s) => s.provider === "INTIGO");
    assert.ok(intigoSettingY, "Team Y should have INTIGO setting");
    assert.equal(intigoSettingY.deliveryCost, 6, "GET Team Y must return 6 DT");

    const financeSettingsY = await getFinanceSettings(teamY.id, "INTIGO");
    assert.equal(financeSettingsY.deliveryCost, 6, "Finance engine for Team Y must return 6 DT");
    console.log("✓ TEST 4 passed");

    // ── TEST 5: Account X changes its fee to 9 DT ────────────────────────────
    console.log("Running TEST 5: Account X changes its fee to 9 DT...");
    await saveDeliverySettingForTeam(teamX.id, {
      provider: "INTIGO",
      deliveryCost: 9,
      returnCost: 3,
      withholdingTaxPercent: 0,
    });

    const refreshedSettingsX = await getDeliverySettingsForTeam(teamX.id);
    const refreshedIntigoX = refreshedSettingsX.find((s) => s.provider === "INTIGO");
    assert.equal(refreshedIntigoX?.deliveryCost, 9, "Account X must now be 9 DT");

    const refreshedSettingsY = await getDeliverySettingsForTeam(teamY.id);
    const refreshedIntigoY = refreshedSettingsY.find((s) => s.provider === "INTIGO");
    assert.equal(refreshedIntigoY?.deliveryCost, 6, "Account Y must REMAIN 6 DT");
    console.log("✓ TEST 5 passed (Account X = 9 DT, Account Y = 6 DT)");

    // ── TEST 6: Account X cannot update Account Y settings by sending another teamId ──
    console.log("Running TEST 6: Account X cannot update Account Y settings...");
    // Simulate an authenticated session for Account X where the client payload attempts
    // to override teamId to Account Y
    const maliciousPayload = {
      teamId: teamY.id, // Attacker tries to inject Account Y's teamId
      provider: "INTIGO",
      deliveryCost: 99,
      returnCost: 50,
      withholdingTaxPercent: 10,
    };

    // The server handler strictly uses the authenticated teamId (teamX.id) and ignores payload.teamId
    await saveDeliverySettingForTeam(teamX.id, maliciousPayload);

    // Verify Account Y was NOT modified
    const verifiedSettingsY = await getDeliverySettingsForTeam(teamY.id);
    const verifiedIntigoY = verifiedSettingsY.find((s) => s.provider === "INTIGO");
    assert.equal(verifiedIntigoY?.deliveryCost, 6, "Account Y must still be 6 DT after spoof attempt");

    // Verify Account X was the one updated
    const verifiedSettingsX = await getDeliverySettingsForTeam(teamX.id);
    const verifiedIntigoX = verifiedSettingsX.find((s) => s.provider === "INTIGO");
    assert.equal(verifiedIntigoX?.deliveryCost, 99, "Account X was updated under its own scope");

    // Restore Account X back to 9 DT for consistency
    await saveDeliverySettingForTeam(teamX.id, {
      provider: "INTIGO",
      deliveryCost: 9,
      returnCost: 3,
      withholdingTaxPercent: 0,
    });
    console.log("✓ TEST 6 passed (Multi-tenant isolation verified, Account Y untouched)");

    // ── TEST 7: Default providers are created independently for each workspace ─
    console.log("Running TEST 7: Default providers created independently for each workspace...");
    let teamZ = await prisma.team.findFirst({ where: { name: "Test Workspace Z" } });
    if (!teamZ) {
      teamZ = await prisma.team.create({
        data: {
          name: "Test Workspace Z",
          slug: "test-workspace-z",
        },
      });
    }

    // Ensure team Z starts completely empty
    await prisma.deliveryCompanySetting.deleteMany({
      where: { teamId: teamZ.id },
    });

    const settingsZ = await getDeliverySettingsForTeam(teamZ.id);
    assert.equal(
      settingsZ.length,
      SUPPORTED_PROVIDERS.length,
      "Team Z must have all supported default providers initialized"
    );

    for (const provider of SUPPORTED_PROVIDERS) {
      const match = settingsZ.find((s) => s.provider === provider);
      assert.ok(match, `Provider ${provider} must exist for Team Z`);
      assert.equal(match.teamId, teamZ.id, `Provider ${provider} must belong to Team Z`);
      assert.equal(match.deliveryCost, 8, `Default deliveryCost must be 8 for ${provider}`);
      assert.equal(match.returnCost, 3, `Default returnCost must be 3 for ${provider}`);
      assert.equal(match.withholdingTaxPercent, 0, `Default withholdingTaxPercent must be 0 for ${provider}`);
    }

    // Clean up team Z
    await prisma.deliveryCompanySetting.deleteMany({ where: { teamId: teamZ.id } });
    await prisma.team.delete({ where: { id: teamZ.id } });
    console.log("✓ TEST 7 passed (Default providers created independently per workspace)");

    // ── TEST 8: Existing historical order financial values remain unchanged ─
    console.log("Running TEST 8: Existing historical order financial values remain unchanged...");
    // A historical order with deliveryCostApplied and withholdingTaxApplied already recorded
    const historicalOrder: RawOrder = {
      id: "historical-order-001",
      revenue: 120,
      status: "DELIVERED",
      shippingProvider: "INTIGO",
      deliveryCostApplied: 8, // Applied when order was delivered in the past
      returnCostApplied: 0,
      withholdingTaxApplied: 1.2, // Applied historically
    };

    // Calculate metrics before fee modification
    const metricsBefore = calculateFinanceFromData({
      orders: [historicalOrder],
      expenses: [],
      transactions: [],
      settingsList: [
        { provider: "INTIGO", deliveryCost: 9, returnCost: 3, withholdingTaxPercent: 1 },
      ],
    });

    // Now Account X updates its current default fee from 9 DT to 15 DT (and tax from 1% to 3%)
    await saveDeliverySettingForTeam(teamX.id, {
      provider: "INTIGO",
      deliveryCost: 15,
      returnCost: 5,
      withholdingTaxPercent: 3,
    });

    // Calculate metrics after default fee modification
    const metricsAfter = calculateFinanceFromData({
      orders: [historicalOrder],
      expenses: [],
      transactions: [],
      settingsList: [
        { provider: "INTIGO", deliveryCost: 15, returnCost: 5, withholdingTaxPercent: 3 },
      ],
    });

    // The historical order's deliveryCostApplied was 8 DT, so totalDeliveryFees must remain 8 DT!
    assert.equal(
      metricsBefore.totalDeliveryFees,
      8,
      "Historical delivery fee before change must be 8 DT"
    );
    assert.equal(
      metricsAfter.totalDeliveryFees,
      8,
      "Historical delivery fee after change must REMAIN 8 DT (not 15 DT)"
    );
    assert.equal(
      metricsBefore.totalWithholdingTax,
      1.2,
      "Historical withholding tax must remain 1.2 DT"
    );
    assert.equal(
      metricsAfter.totalWithholdingTax,
      1.2,
      "Historical withholding tax after change must REMAIN 1.2 DT (not 3.6 DT)"
    );
    assert.equal(
      metricsBefore.netProfit,
      metricsAfter.netProfit,
      "Historical order net profit must not change when default settings change"
    );
    console.log("✓ TEST 8 passed (Historical order financial values remain unchanged)");

  } finally {
    // ── Teardown ─────────────────────────────────────────────────────────────
    await prisma.deliveryCompanySetting.deleteMany({
      where: { teamId: { in: [teamX.id, teamY.id] } },
    });
    await prisma.team.deleteMany({
      where: { id: { in: [teamX.id, teamY.id] } },
    });
  }

  console.log("\n=======================================================");
  console.log("🎉 ALL 8 DELIVERY SETTINGS ISOLATION TESTS PASSED!");
  console.log("=======================================================\n");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Test failed:", err);
    process.exit(1);
  });
