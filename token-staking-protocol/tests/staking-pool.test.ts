import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

/*
  Staking Pool Contract Tests
  Comprehensive test suite for the staking-pool.clar contract
*/

describe("Staking Pool Contract", () => {
  
  beforeEach(() => {
    // Setup reward pool for tests
    simnet.callPublicFn(
      "staking-pool",
      "add-to-reward-pool",
      [Cl.uint(1000000000)],
      deployer
    );
  });

  describe("Stake Function", () => {
    
    it("should allow users to stake tokens for 30 days", () => {
      const amount = 1000000;
      const lockPeriod = 4320; // 30 days
      const autoCompound = false;

      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(autoCompound)],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));
      
      // Verify stake info
      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );
      
      expect(stakeInfo.result).toBeSome(
        Cl.tuple({
          amount: Cl.uint(amount),
          "start-block": Cl.uint(simnet.blockHeight),
          "lock-period": Cl.uint(lockPeriod),
          "rewards-claimed": Cl.uint(0),
          "last-claim-block": Cl.uint(simnet.blockHeight),
          multiplier: Cl.uint(100),
          "auto-compound": Cl.bool(false)
        })
      );
    });

    it("should allow users to stake tokens for 90 days with 1.5x multiplier", () => {
      const amount = 2000000;
      const lockPeriod = 12960; // 90 days

      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));
      
      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );
      
      const stakeData = stakeInfo.result.expectSome();
      expect(stakeData.multiplier).toBe(Cl.uint(150));
    });

    it("should allow users to stake tokens for 180 days with 2x multiplier", () => {
      const amount = 3000000;
      const lockPeriod = 25920; // 180 days

      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));
      
      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );
      
      const stakeData = stakeInfo.result.expectSome();
      expect(stakeData.multiplier).toBe(Cl.uint(200));
    });

    it("should allow users to stake tokens for 365 days with 3x multiplier", () => {
      const amount = 5000000;
      const lockPeriod = 52560; // 365 days

      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));
      
      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );
      
      const stakeData = stakeInfo.result.expectSome();
      expect(stakeData.multiplier).toBe(Cl.uint(300));
    });

    it("should enable auto-compound when specified", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(true)],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));
      
      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );
      
      const stakeData = stakeInfo.result.expectSome();
      expect(stakeData["auto-compound"]).toBe(Cl.bool(true));
    });

    it("should reject stake with zero amount", () => {
      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(0), Cl.uint(4320), Cl.bool(false)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(102)); // err-invalid-amount
    });

    it("should reject stake with invalid lock period", () => {
      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(1000000), Cl.uint(1000), Cl.bool(false)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(103)); // err-invalid-period
    });

    it("should reject duplicate stake from same user", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      // First stake
      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      // Second stake attempt
      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(106)); // err-already-staked
    });

    it("should update total staked amount", () => {
      const amount1 = 1000000;
      const amount2 = 2000000;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount1), Cl.uint(4320), Cl.bool(false)],
        wallet1
      );

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount2), Cl.uint(12960), Cl.bool(false)],
        wallet2
      );

      const totalStaked = simnet.callReadOnlyFn(
        "staking-pool",
        "get-total-staked",
        [],
        deployer
      );

      expect(totalStaked.result).toBeOk(Cl.uint(amount1 + amount2));
    });

    it("should update total stakers count", () => {
      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(1000000), Cl.uint(4320), Cl.bool(false)],
        wallet1
      );

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(2000000), Cl.uint(12960), Cl.bool(false)],
        wallet2
      );

      const totalStakers = simnet.callReadOnlyFn(
        "staking-pool",
        "get-total-stakers",
        [],
        deployer
      );

      expect(totalStakers.result).toBeOk(Cl.uint(2));
    });
  });

  describe("Claim Rewards Function", () => {
    
    it("should calculate and claim rewards correctly", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      // Advance blocks to accumulate rewards
      simnet.mineEmptyBlocks(100);

      const pendingRewards = simnet.callReadOnlyFn(
        "staking-pool",
        "calculate-pending-rewards",
        [Cl.principal(wallet1)],
        wallet1
      );

      expect(pendingRewards.result).toBeOk(Cl.uint(10000)); // Expected based on formula

      const claimResponse = simnet.callPublicFn(
        "staking-pool",
        "claim-rewards",
        [],
        wallet1
      );

      expect(claimResponse.result).toBeOk(Cl.uint(10000));
    });

    it("should auto-compound rewards when enabled", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(true)],
        wallet1
      );

      simnet.mineEmptyBlocks(100);

      simnet.callPublicFn(
        "staking-pool",
        "claim-rewards",
        [],
        wallet1
      );

      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );

      const stakeData = stakeInfo.result.expectSome();
      expect(stakeData.amount > Cl.uint(amount)).toBe(true);
    });

    it("should reject claim with no stake", () => {
      const response = simnet.callPublicFn(
        "staking-pool",
        "claim-rewards",
        [],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(101)); // err-not-found
    });

    it("should update last-claim-block after claiming", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      const initialBlock = simnet.blockHeight;
      simnet.mineEmptyBlocks(100);

      simnet.callPublicFn(
        "staking-pool",
        "claim-rewards",
        [],
        wallet1
      );

      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );

      const stakeData = stakeInfo.result.expectSome();
      expect(stakeData["last-claim-block"] > Cl.uint(initialBlock)).toBe(true);
    });
  });

  describe("Unstake Function", () => {
    
    it("should allow unstaking after lock period", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      // Advance past lock period
      simnet.mineEmptyBlocks(lockPeriod + 1);

      const response = simnet.callPublicFn(
        "staking-pool",
        "unstake",
        [],
        wallet1
      );

      expect(response.result).toBeOk(Cl.uint(amount));
    });

    it("should reject unstaking before lock period", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      // Try to unstake before lock period
      const response = simnet.callPublicFn(
        "staking-pool",
        "unstake",
        [],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(104)); // err-stake-locked
    });

    it("should claim pending rewards before unstaking", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      simnet.mineEmptyBlocks(lockPeriod + 100);

      const response = simnet.callPublicFn(
        "staking-pool",
        "unstake",
        [],
        wallet1
      );

      expect(response.result).toBeOk(Cl.uint(amount));
    });

    it("should update total staked after unstaking", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      simnet.mineEmptyBlocks(lockPeriod + 1);

      simnet.callPublicFn(
        "staking-pool",
        "unstake",
        [],
        wallet1
      );

      const totalStaked = simnet.callReadOnlyFn(
        "staking-pool",
        "get-total-staked",
        [],
        deployer
      );

      expect(totalStaked.result).toBeOk(Cl.uint(0));
    });

    it("should delete stake after unstaking", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      simnet.mineEmptyBlocks(lockPeriod + 1);

      simnet.callPublicFn(
        "staking-pool",
        "unstake",
        [],
        wallet1
      );

      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );

      expect(stakeInfo.result).toBeNone();
    });
  });

  describe("Read-Only Functions", () => {
    
    it("should return correct multiplier for each lock period", () => {
      const multiplier30 = simnet.callReadOnlyFn(
        "staking-pool",
        "get-multiplier-for-period",
        [Cl.uint(4320)],
        deployer
      );
      expect(multiplier30.result).toBeOk(Cl.uint(100));

      const multiplier90 = simnet.callReadOnlyFn(
        "staking-pool",
        "get-multiplier-for-period",
        [Cl.uint(12960)],
        deployer
      );
      expect(multiplier90.result).toBeOk(Cl.uint(150));

      const multiplier180 = simnet.callReadOnlyFn(
        "staking-pool",
        "get-multiplier-for-period",
        [Cl.uint(25920)],
        deployer
      );
      expect(multiplier180.result).toBeOk(Cl.uint(200));

      const multiplier365 = simnet.callReadOnlyFn(
        "staking-pool",
        "get-multiplier-for-period",
        [Cl.uint(52560)],
        deployer
      );
      expect(multiplier365.result).toBeOk(Cl.uint(300));
    });

    it("should check if stake is unlocked correctly", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      const unlockedBefore = simnet.callReadOnlyFn(
        "staking-pool",
        "is-stake-unlocked",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(unlockedBefore.result).toBeOk(Cl.bool(false));

      simnet.mineEmptyBlocks(lockPeriod + 1);

      const unlockedAfter = simnet.callReadOnlyFn(
        "staking-pool",
        "is-stake-unlocked",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(unlockedAfter.result).toBeOk(Cl.bool(true));
    });

    it("should return time until unlock correctly", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      const timeUntilUnlock = simnet.callReadOnlyFn(
        "staking-pool",
        "get-time-until-unlock",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(timeUntilUnlock.result).toBeOk(Cl.uint(lockPeriod));
    });
  });

  describe("Admin Functions", () => {
    
    it("should allow owner to set base reward rate", () => {
      const newRate = 200;

      const response = simnet.callPublicFn(
        "staking-pool",
        "set-base-reward-rate",
        [Cl.uint(newRate)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const rate = simnet.callReadOnlyFn(
        "staking-pool",
        "get-base-reward-rate",
        [],
        deployer
      );

      expect(rate.result).toBeOk(Cl.uint(newRate));
    });

    it("should reject non-owner setting reward rate", () => {
      const response = simnet.callPublicFn(
        "staking-pool",
        "set-base-reward-rate",
        [Cl.uint(200)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(100)); // err-owner-only
    });

    it("should allow owner to add to reward pool", () => {
      const amount = 1000000;

      const response = simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(amount)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));
    });

    it("should allow users to update auto-compound setting", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      const response = simnet.callPublicFn(
        "staking-pool",
        "update-auto-compound",
        [Cl.bool(true)],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const stakeInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );

      const stakeData = stakeInfo.result.expectSome();
      expect(stakeData["auto-compound"]).toBe(Cl.bool(true));
    });
  });
});
