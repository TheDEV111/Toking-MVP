import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

/*
  Reward Calculator Contract Tests
  Comprehensive test suite for the reward-calculator.clar contract
*/

describe("Reward Calculator Contract", () => {

  describe("Read-Only Getters", () => {
    
    it("should return base APY", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-base-apy",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(1000)); // 10% base APY
    });

    it("should return reward rate", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-reward-rate",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(100));
    });

    it("should return performance fee", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-performance-fee",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(500)); // 5%
    });
  });

  describe("APY Calculations", () => {
    
    it("should calculate correct APY for 30-day lock period", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-apy",
        [Cl.uint(4320)], // 30 days
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(1000)); // 10% (1x multiplier)
    });

    it("should calculate correct APY for 90-day lock period", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-apy",
        [Cl.uint(12960)], // 90 days
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(1500)); // 15% (1.5x multiplier)
    });

    it("should calculate correct APY for 180-day lock period", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-apy",
        [Cl.uint(25920)], // 180 days
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(2000)); // 20% (2x multiplier)
    });

    it("should calculate correct APY for 365-day lock period", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-apy",
        [Cl.uint(52560)], // 365 days
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(3000)); // 30% (3x multiplier)
    });

    it("should return base APY for invalid lock period", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-apy",
        [Cl.uint(1000)], // Invalid period
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(1000)); // Default 1x
    });
  });

  describe("Reward Calculations", () => {
    
    it("should calculate rewards for 30-day stake", () => {
      const amount = 1000000;
      const blocks = 100;
      const lockPeriod = 4320;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-rewards",
        [Cl.uint(amount), Cl.uint(blocks), Cl.uint(lockPeriod)],
        deployer
      );

      // Expected: (1000000 * 100 * 100 / 10000) * 100 / 100 = 10000
      expect(response.result).toBeOk(Cl.uint(10000));
    });

    it("should calculate higher rewards for 365-day stake due to multiplier", () => {
      const amount = 1000000;
      const blocks = 100;
      const lockPeriod = 52560;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-rewards",
        [Cl.uint(amount), Cl.uint(blocks), Cl.uint(lockPeriod)],
        deployer
      );

      // Expected: (1000000 * 100 * 100 / 10000) * 300 / 100 = 30000
      expect(response.result).toBeOk(Cl.uint(30000));
    });

    it("should calculate zero rewards for zero amount", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-rewards",
        [Cl.uint(0), Cl.uint(100), Cl.uint(4320)],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(0));
    });

    it("should calculate zero rewards for zero blocks", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-rewards",
        [Cl.uint(1000000), Cl.uint(0), Cl.uint(4320)],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(0));
    });
  });

  describe("Earnings Projections", () => {
    
    it("should project earnings correctly for 30-day stake", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "project-earnings",
        [Cl.uint(amount), Cl.uint(lockPeriod)],
        deployer
      );

      expect(response.result).toBeOk(
        Cl.tuple({
          principal: Cl.uint(amount),
          "projected-rewards": Cl.some(Cl.uint()),
          "total-return": Cl.some(Cl.uint()),
          apy: Cl.uint(1000),
          multiplier: Cl.uint(100)
        })
      );
    });

    it("should project higher earnings for longer lock periods", () => {
      const amount = 1000000;
      
      const projection30 = simnet.callReadOnlyFn(
        "reward-calculator",
        "project-earnings",
        [Cl.uint(amount), Cl.uint(4320)],
        deployer
      );

      const projection365 = simnet.callReadOnlyFn(
        "reward-calculator",
        "project-earnings",
        [Cl.uint(amount), Cl.uint(52560)],
        deployer
      );

      const data30 = projection30.result.expectOk();
      const data365 = projection365.result.expectOk();

      expect(data365["projected-rewards"] > data30["projected-rewards"]).toBe(true);
    });
  });

  describe("Daily and Yearly Estimates", () => {
    
    it("should estimate daily rewards correctly", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "estimate-daily-rewards",
        [Cl.uint(amount), Cl.uint(lockPeriod)],
        deployer
      );

      // Expected: (1000000 * 144 * 100 / 10000) * 100 / 100 = 144000
      expect(response.result).toBeOk(Cl.uint(144000));
    });

    it("should estimate yearly rewards correctly", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "estimate-yearly-rewards",
        [Cl.uint(amount), Cl.uint(lockPeriod)],
        deployer
      );

      expect(response.result).toBeOk(Cl.some(Cl.uint()));
    });

    it("should show higher yearly rewards with longer lock periods", () => {
      const amount = 1000000;

      const yearly30 = simnet.callReadOnlyFn(
        "reward-calculator",
        "estimate-yearly-rewards",
        [Cl.uint(amount), Cl.uint(4320)],
        deployer
      );

      const yearly365 = simnet.callReadOnlyFn(
        "reward-calculator",
        "estimate-yearly-rewards",
        [Cl.uint(amount), Cl.uint(52560)],
        deployer
      );

      expect(yearly365.result > yearly30.result).toBe(true);
    });
  });

  describe("Performance Fee Calculations", () => {
    
    it("should calculate performance fee correctly", () => {
      const rewards = 100000;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-performance-fee-amount",
        [Cl.uint(rewards)],
        deployer
      );

      // Expected: 100000 * 500 / 10000 = 5000 (5%)
      expect(response.result).toBeOk(Cl.uint(5000));
    });

    it("should calculate net rewards after fees", () => {
      const rewards = 100000;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-net-rewards",
        [Cl.uint(rewards)],
        deployer
      );

      expect(response.result).toBeOk(
        Cl.tuple({
          "gross-rewards": Cl.uint(100000),
          fee: Cl.uint(5000),
          "net-rewards": Cl.uint(95000)
        })
      );
    });

    it("should handle zero rewards", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-net-rewards",
        [Cl.uint(0)],
        deployer
      );

      expect(response.result).toBeOk(
        Cl.tuple({
          "gross-rewards": Cl.uint(0),
          fee: Cl.uint(0),
          "net-rewards": Cl.uint(0)
        })
      );
    });
  });

  describe("Early Penalty Calculations", () => {
    
    it("should calculate 20% penalty for early unstake", () => {
      const amount = 1000000;
      const blocksStaked = 1000;
      const lockPeriod = 4320;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-early-penalty",
        [Cl.uint(amount), Cl.uint(blocksStaked), Cl.uint(lockPeriod)],
        deployer
      );

      // Expected: 1000000 * 20 / 100 = 200000
      expect(response.result).toBeOk(Cl.uint(200000));
    });

    it("should calculate zero penalty when fully vested", () => {
      const amount = 1000000;
      const blocksStaked = 4320;
      const lockPeriod = 4320;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-early-penalty",
        [Cl.uint(amount), Cl.uint(blocksStaked), Cl.uint(lockPeriod)],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(0));
    });

    it("should calculate zero penalty when overstaked", () => {
      const amount = 1000000;
      const blocksStaked = 5000;
      const lockPeriod = 4320;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-early-penalty",
        [Cl.uint(amount), Cl.uint(blocksStaked), Cl.uint(lockPeriod)],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(0));
    });
  });

  describe("Pool Sustainability", () => {
    
    it("should calculate pool sustainability correctly", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-pool-sustainability",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.some(Cl.uint()));
    });

    it("should return infinite sustainability with no stakes", () => {
      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-pool-sustainability",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(999999999));
    });
  });

  describe("Admin Functions", () => {
    
    it("should allow owner to update reward rate", () => {
      const newRate = 200;

      const response = simnet.callPublicFn(
        "reward-calculator",
        "update-reward-rate",
        [Cl.uint(newRate)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const rate = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-reward-rate",
        [],
        deployer
      );

      expect(rate.result).toBeOk(Cl.uint(newRate));
    });

    it("should reject non-owner updating reward rate", () => {
      const response = simnet.callPublicFn(
        "reward-calculator",
        "update-reward-rate",
        [Cl.uint(200)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(200)); // err-owner-only
    });

    it("should reject zero reward rate", () => {
      const response = simnet.callPublicFn(
        "reward-calculator",
        "update-reward-rate",
        [Cl.uint(0)],
        deployer
      );

      expect(response.result).toBeErr(Cl.uint(201)); // err-invalid-amount
    });

    it("should allow owner to update base APY", () => {
      const newAPY = 2000;

      const response = simnet.callPublicFn(
        "reward-calculator",
        "update-base-apy",
        [Cl.uint(newAPY)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const apy = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-base-apy",
        [],
        deployer
      );

      expect(apy.result).toBeOk(Cl.uint(newAPY));
    });

    it("should allow owner to update performance fee", () => {
      const newFee = 1000; // 10%

      const response = simnet.callPublicFn(
        "reward-calculator",
        "update-performance-fee",
        [Cl.uint(newFee)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const fee = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-performance-fee",
        [],
        deployer
      );

      expect(fee.result).toBeOk(Cl.uint(newFee));
    });

    it("should reject performance fee above 20%", () => {
      const response = simnet.callPublicFn(
        "reward-calculator",
        "update-performance-fee",
        [Cl.uint(2500)], // 25%
        deployer
      );

      expect(response.result).toBeErr(Cl.uint(201)); // err-invalid-amount
    });

    it("should allow owner to add to reward pool", () => {
      const amount = 1000000;

      const response = simnet.callPublicFn(
        "reward-calculator",
        "add-to-reward-pool",
        [Cl.uint(amount)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));
    });

    it("should allow owner to update total staked", () => {
      const newTotal = 5000000;

      const response = simnet.callPublicFn(
        "reward-calculator",
        "update-total-staked",
        [Cl.uint(newTotal)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const total = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-total-staked",
        [],
        deployer
      );

      expect(total.result).toBeOk(Cl.uint(newTotal));
    });

    it("should allow owner to deduct from reward pool", () => {
      const deductAmount = 100000;

      const response = simnet.callPublicFn(
        "reward-calculator",
        "deduct-from-reward-pool",
        [Cl.uint(deductAmount)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));
    });

    it("should reject deducting more than pool balance", () => {
      const response = simnet.callPublicFn(
        "reward-calculator",
        "deduct-from-reward-pool",
        [Cl.uint(99999999999999)],
        deployer
      );

      expect(response.result).toBeErr(Cl.uint(201)); // err-invalid-amount
    });
  });

  describe("Compound Interest Calculations", () => {
    
    it("should calculate compound rewards correctly", () => {
      const amount = 1000000;
      const blocks = 1000;
      const lockPeriod = 4320;
      const frequency = 100;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-compound-rewards",
        [Cl.uint(amount), Cl.uint(blocks), Cl.uint(lockPeriod), Cl.uint(frequency)],
        deployer
      );

      expect(response.result).toBeOk(Cl.some(Cl.uint()));
    });

    it("should show higher returns with compounding", () => {
      const amount = 1000000;
      const blocks = 1000;
      const lockPeriod = 4320;

      const simpleRewards = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-rewards",
        [Cl.uint(amount), Cl.uint(blocks), Cl.uint(lockPeriod)],
        deployer
      );

      const compoundRewards = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-compound-rewards",
        [Cl.uint(amount), Cl.uint(blocks), Cl.uint(lockPeriod), Cl.uint(100)],
        deployer
      );

      expect(compoundRewards.result >= simpleRewards.result).toBe(true);
    });

    it("should calculate effective APY with compounding", () => {
      const lockPeriod = 4320;
      const frequency = 144;

      const response = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-effective-apy",
        [Cl.uint(lockPeriod), Cl.uint(frequency)],
        deployer
      );

      expect(response.result).toBeOk(Cl.some(Cl.uint()));
    });
  });
});
