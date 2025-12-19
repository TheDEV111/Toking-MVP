import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

/*
  Integration Tests
  Tests the interaction between all three contracts
*/

describe("Token Staking Protocol - Integration Tests", () => {

  describe("Full Staking Workflow", () => {
    
    it("should complete full stake-claim-unstake workflow", () => {
      const amount = 5000000;
      const lockPeriod = 4320; // 30 days

      // Setup reward pool
      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000)],
        deployer
      );

      // 1. Stake tokens
      const stakeResponse = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );
      expect(stakeResponse.result).toBeOk(Cl.bool(true));

      // 2. Mine blocks to accumulate rewards
      simnet.mineEmptyBlocks(1000);

      // 3. Claim rewards
      const claimResponse = simnet.callPublicFn(
        "staking-pool",
        "claim-rewards",
        [],
        wallet1
      );
      expect(claimResponse.result).toBeOk(Cl.some(Cl.uint()));

      // 4. Mine past lock period
      simnet.mineEmptyBlocks(lockPeriod);

      // 5. Unstake
      const unstakeResponse = simnet.callPublicFn(
        "staking-pool",
        "unstake",
        [],
        wallet1
      );
      expect(unstakeResponse.result).toBeOk(Cl.uint(amount));
    });

    it("should handle multiple stakers simultaneously", () => {
      const amount1 = 3000000;
      const amount2 = 5000000;

      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000)],
        deployer
      );

      // Wallet1 stakes for 30 days
      const stake1 = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount1), Cl.uint(4320), Cl.bool(false)],
        wallet1
      );
      expect(stake1.result).toBeOk(Cl.bool(true));

      // Wallet2 stakes for 365 days
      const stake2 = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount2), Cl.uint(52560), Cl.bool(false)],
        wallet2
      );
      expect(stake2.result).toBeOk(Cl.bool(true));

      // Check total staked
      const totalStaked = simnet.callReadOnlyFn(
        "staking-pool",
        "get-total-staked",
        [],
        deployer
      );
      expect(totalStaked.result).toBeOk(Cl.uint(amount1 + amount2));

      // Check total stakers
      const totalStakers = simnet.callReadOnlyFn(
        "staking-pool",
        "get-total-stakers",
        [],
        deployer
      );
      expect(totalStakers.result).toBeOk(Cl.uint(2));
    });
  });

  describe("Early Unstaking Workflow", () => {
    
    it("should handle early unstaking with penalties", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000)],
        deployer
      );

      // Stake
      const stakeStart = simnet.blockHeight;
      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      // Mine some blocks but not full period
      simnet.mineEmptyBlocks(1000);

      // Verify stake is still locked
      const isUnlocked = simnet.callReadOnlyFn(
        "staking-pool",
        "is-stake-unlocked",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isUnlocked.result).toBeOk(Cl.bool(false));

      // Calculate penalty using unstaking-manager
      const penaltyEstimate = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-unstake-estimate",
        [Cl.uint(amount), Cl.bool(true)],
        deployer
      );
      
      expect(penaltyEstimate.result).toBeOk(
        Cl.tuple({
          "gross-amount": Cl.uint(amount),
          penalty: Cl.uint(200000), // 20%
          "net-amount": Cl.uint(800000),
          "penalty-rate": Cl.uint(20)
        })
      );

      // Initiate early unstake
      const initiateResponse = simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );
      expect(initiateResponse.result).toBeOk(Cl.some(Cl.tuple()));

      // Wait for cooldown
      simnet.mineEmptyBlocks(1441);

      // Complete unstake
      const completeResponse = simnet.callPublicFn(
        "unstaking-manager",
        "complete-unstake",
        [],
        wallet1
      );
      expect(completeResponse.result).toBeOk(Cl.uint(800000));
    });

    it("should allow canceling early unstake request", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      const stakeStart = simnet.blockHeight;

      // Initiate unstake
      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      // Cancel the request
      const cancelResponse = simnet.callPublicFn(
        "unstaking-manager",
        "cancel-unstake-request",
        [],
        wallet1
      );
      expect(cancelResponse.result).toBeOk(Cl.bool(true));

      // Verify request is deleted
      const request = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-unstaking-request",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(request.result).toBeOk(Cl.none());
    });
  });

  describe("Auto-Compound Workflow", () => {
    
    it("should auto-compound rewards correctly", () => {
      const amount = 1000000;
      const lockPeriod = 12960; // 90 days

      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000)],
        deployer
      );

      // Stake with auto-compound
      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(true)],
        wallet1
      );

      // Get initial stake info
      const initialInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );
      const initialData = initialInfo.result.expectSome();
      const initialAmount = initialData.amount;

      // Mine blocks and claim (should auto-compound)
      simnet.mineEmptyBlocks(500);

      simnet.callPublicFn(
        "staking-pool",
        "claim-rewards",
        [],
        wallet1
      );

      // Verify amount increased
      const updatedInfo = simnet.callReadOnlyFn(
        "staking-pool",
        "get-stake-info",
        [Cl.principal(wallet1)],
        wallet1
      );
      const updatedData = updatedInfo.result.expectSome();
      
      expect(updatedData.amount > initialAmount).toBe(true);
    });

    it("should allow toggling auto-compound", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      // Enable auto-compound
      const enableResponse = simnet.callPublicFn(
        "staking-pool",
        "update-auto-compound",
        [Cl.bool(true)],
        wallet1
      );
      expect(enableResponse.result).toBeOk(Cl.bool(true));

      // Verify it's enabled
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

  describe("Reward Calculations Cross-Contract", () => {
    
    it("should calculate consistent rewards between contracts", () => {
      const amount = 2000000;
      const blocks = 500;
      const lockPeriod = 25920; // 180 days

      // Calculate using reward-calculator
      const calcRewards = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-rewards",
        [Cl.uint(amount), Cl.uint(blocks), Cl.uint(lockPeriod)],
        deployer
      );

      // Stake and accumulate rewards in staking-pool
      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000)],
        deployer
      );

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      simnet.mineEmptyBlocks(blocks);

      const pendingRewards = simnet.callReadOnlyFn(
        "staking-pool",
        "calculate-pending-rewards",
        [Cl.principal(wallet1)],
        wallet1
      );

      // Both should give same result
      expect(calcRewards.result).toBe(pendingRewards.result);
    });

    it("should calculate correct APY for all lock periods", () => {
      const periods = [
        { blocks: 4320, expectedMultiplier: 100 },
        { blocks: 12960, expectedMultiplier: 150 },
        { blocks: 25920, expectedMultiplier: 200 },
        { blocks: 52560, expectedMultiplier: 300 }
      ];

      periods.forEach(({ blocks, expectedMultiplier }) => {
        const apy = simnet.callReadOnlyFn(
          "reward-calculator",
          "get-apy",
          [Cl.uint(blocks)],
          deployer
        );

        const baseAPY = 1000; // 10%
        const expectedAPY = (baseAPY * expectedMultiplier) / 100;

        expect(apy.result).toBeOk(Cl.uint(expectedAPY));
      });
    });
  });

  describe("Emergency Scenarios", () => {
    
    it("should handle emergency withdrawal correctly", () => {
      const amount = 2000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      // Enable emergency mode
      simnet.callPublicFn(
        "unstaking-manager",
        "set-emergency-mode",
        [Cl.bool(true)],
        deployer
      );

      // Perform emergency withdrawal
      const withdrawResponse = simnet.callPublicFn(
        "unstaking-manager",
        "emergency-withdraw",
        [Cl.uint(amount)],
        wallet1
      );

      const expectedPenalty = 600000; // 30%
      const expectedNet = 1400000;

      expect(withdrawResponse.result).toBeOk(Cl.uint(expectedNet));

      // Verify penalties collected
      const penalties = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-total-penalties-collected",
        [],
        deployer
      );
      expect(penalties.result).toBeOk(Cl.uint(expectedPenalty));
    });
  });

  describe("Pool Analytics", () => {
    
    it("should track pool statistics accurately", () => {
      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000)],
        deployer
      );

      const stakes = [
        { wallet: wallet1, amount: 1000000, period: 4320 },
        { wallet: wallet2, amount: 3000000, period: 52560 }
      ];

      stakes.forEach(({ wallet, amount, period }) => {
        simnet.callPublicFn(
          "staking-pool",
          "stake",
          [Cl.uint(amount), Cl.uint(period), Cl.bool(false)],
          wallet
        );
      });

      // Check total staked
      const totalStaked = simnet.callReadOnlyFn(
        "staking-pool",
        "get-total-staked",
        [],
        deployer
      );
      expect(totalStaked.result).toBeOk(Cl.uint(4000000));

      // Check pool sustainability
      const sustainability = simnet.callReadOnlyFn(
        "reward-calculator",
        "calculate-pool-sustainability",
        [],
        deployer
      );
      expect(sustainability.result).toBeOk(Cl.some(Cl.uint()));
    });

    it("should project earnings accurately for different periods", () => {
      const amount = 5000000;

      const projections = [4320, 12960, 25920, 52560].map(period => {
        return simnet.callReadOnlyFn(
          "reward-calculator",
          "project-earnings",
          [Cl.uint(amount), Cl.uint(period)],
          deployer
        );
      });

      // Each successive period should have higher returns
      projections.forEach((projection, idx) => {
        expect(projection.result).toBeOk(Cl.some(Cl.tuple()));
        
        if (idx > 0) {
          const current = projection.result.expectOk();
          const previous = projections[idx - 1].result.expectOk();
          expect(current["projected-rewards"] >= previous["projected-rewards"]).toBe(true);
        }
      });
    });
  });

  describe("Admin Operations", () => {
    
    it("should allow coordinated admin updates across contracts", () => {
      // Update reward rate in staking pool
      simnet.callPublicFn(
        "staking-pool",
        "set-base-reward-rate",
        [Cl.uint(200)],
        deployer
      );

      // Update reward rate in reward calculator
      simnet.callPublicFn(
        "reward-calculator",
        "update-reward-rate",
        [Cl.uint(200)],
        deployer
      );

      // Update base APY
      simnet.callPublicFn(
        "reward-calculator",
        "update-base-apy",
        [Cl.uint(2000)],
        deployer
      );

      // Verify all updates
      const poolRate = simnet.callReadOnlyFn(
        "staking-pool",
        "get-base-reward-rate",
        [],
        deployer
      );
      expect(poolRate.result).toBeOk(Cl.uint(200));

      const calcRate = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-reward-rate",
        [],
        deployer
      );
      expect(calcRate.result).toBeOk(Cl.uint(200));

      const apy = simnet.callReadOnlyFn(
        "reward-calculator",
        "get-base-apy",
        [],
        deployer
      );
      expect(apy.result).toBeOk(Cl.uint(2000));
    });

    it("should manage penalty recipient and withdrawals", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      // Generate penalties through early unstake
      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      const stakeStart = simnet.blockHeight;
      
      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      simnet.mineEmptyBlocks(1441);

      simnet.callPublicFn(
        "unstaking-manager",
        "complete-unstake",
        [],
        wallet1
      );

      // Set new penalty recipient
      simnet.callPublicFn(
        "unstaking-manager",
        "set-penalty-recipient",
        [Cl.principal(wallet2)],
        deployer
      );

      // Withdraw penalties
      const withdrawResponse = simnet.callPublicFn(
        "unstaking-manager",
        "withdraw-penalties",
        [Cl.uint(100000)],
        deployer
      );

      expect(withdrawResponse.result).toBeOk(Cl.bool(true));
    });
  });

  describe("Edge Cases", () => {
    
    it("should handle very small stake amounts", () => {
      const smallAmount = 100;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000)],
        deployer
      );

      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(smallAmount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));
    });

    it("should handle very large stake amounts", () => {
      const largeAmount = 1000000000000;
      const lockPeriod = 52560;

      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000000)],
        deployer
      );

      const response = simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(largeAmount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));
    });

    it("should handle claiming with zero pending rewards", () => {
      const amount = 1000000;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "staking-pool",
        "add-to-reward-pool",
        [Cl.uint(10000000000)],
        deployer
      );

      simnet.callPublicFn(
        "staking-pool",
        "stake",
        [Cl.uint(amount), Cl.uint(lockPeriod), Cl.bool(false)],
        wallet1
      );

      // Try to claim immediately (no blocks mined)
      const response = simnet.callPublicFn(
        "staking-pool",
        "claim-rewards",
        [],
        wallet1
      );

      // Should fail with invalid amount error
      expect(response.result).toBeErr(Cl.uint(102));
    });
  });
});
