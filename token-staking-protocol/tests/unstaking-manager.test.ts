import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

/*
  Unstaking Manager Contract Tests
  Comprehensive test suite for the unstaking-manager.clar contract
*/

describe("Unstaking Manager Contract", () => {

  describe("Read-Only Getters", () => {
    
    it("should return cooldown period", () => {
      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-cooldown-period",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(1440)); // 10 days
    });

    it("should return early penalty rate", () => {
      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-early-penalty-rate",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(20)); // 20%
    });

    it("should return emergency penalty rate", () => {
      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-emergency-penalty-rate",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(30)); // 30%
    });

    it("should return emergency mode status", () => {
      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "is-emergency-mode",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(false));
    });

    it("should return total penalties collected", () => {
      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-total-penalties-collected",
        [],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(0));
    });
  });

  describe("Initiate Unstake", () => {
    
    it("should initiate unstake after lock period (no penalty)", () => {
      const amount = 1000000;
      const stakeStart = 1000;
      const lockPeriod = 4320;

      // Set block height past lock period
      simnet.mineEmptyBlocks(stakeStart + lockPeriod);

      const response = simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      expect(response.result).toBeOk(
        Cl.tuple({
          amount: Cl.uint(amount),
          penalty: Cl.uint(0),
          "net-amount": Cl.uint(amount),
          "cooldown-blocks": Cl.uint(1440)
        })
      );
    });

    it("should initiate early unstake with 20% penalty", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      const response = simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      const expectedPenalty = 200000; // 20% of 1000000

      expect(response.result).toBeOk(
        Cl.tuple({
          amount: Cl.uint(amount),
          penalty: Cl.uint(expectedPenalty),
          "net-amount": Cl.uint(amount - expectedPenalty),
          "cooldown-blocks": Cl.uint(1440)
        })
      );
    });

    it("should reject unstake with zero amount", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(0), Cl.uint(100), Cl.uint(4320)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(302)); // err-invalid-amount
    });

    it("should reject duplicate unstake request", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      // First unstake request
      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      // Second unstake request (should fail)
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(303)); // err-already-exists
    });

    it("should store unstaking request correctly", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      const request = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-unstaking-request",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(request.result).toBeOk(
        Cl.some(
          Cl.tuple({
            amount: Cl.uint(amount),
            "initiation-block": Cl.uint(simnet.blockHeight),
            "is-early": Cl.bool(true),
            "penalty-amount": Cl.uint(200000),
            "original-stake-start": Cl.uint(stakeStart),
            "lock-period": Cl.uint(lockPeriod)
          })
        )
      );
    });
  });

  describe("Cooldown Management", () => {
    
    it("should check if cooldown is complete", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      const incompleteCooldown = simnet.callReadOnlyFn(
        "unstaking-manager",
        "is-cooldown-complete",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(incompleteCooldown.result).toBeOk(Cl.bool(false));

      // Advance past cooldown period
      simnet.mineEmptyBlocks(1441);

      const completeCooldown = simnet.callReadOnlyFn(
        "unstaking-manager",
        "is-cooldown-complete",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(completeCooldown.result).toBeOk(Cl.bool(true));
    });

    it("should return cooldown remaining blocks correctly", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      const remaining = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-cooldown-remaining",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(remaining.result).toBeOk(Cl.uint(1440));

      // Advance some blocks
      simnet.mineEmptyBlocks(500);

      const remainingAfter = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-cooldown-remaining",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(remainingAfter.result).toBeOk(Cl.uint(940));
    });

    it("should return zero remaining when cooldown complete", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      simnet.mineEmptyBlocks(1441);

      const remaining = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-cooldown-remaining",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(remaining.result).toBeOk(Cl.uint(0));
    });
  });

  describe("Complete Unstake", () => {
    
    it("should complete unstake after cooldown period", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      // Advance past cooldown
      simnet.mineEmptyBlocks(1441);

      const response = simnet.callPublicFn(
        "unstaking-manager",
        "complete-unstake",
        [],
        wallet1
      );

      const expectedNet = 800000; // 1000000 - 200000 (20% penalty)
      expect(response.result).toBeOk(Cl.uint(expectedNet));
    });

    it("should reject completing unstake before cooldown", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      const response = simnet.callPublicFn(
        "unstaking-manager",
        "complete-unstake",
        [],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(305)); // err-cooldown-not-complete
    });

    it("should reject completing without unstake request", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "complete-unstake",
        [],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(301)); // err-not-found
    });

    it("should delete unstake request after completion", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

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

      const request = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-unstaking-request",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(request.result).toBeOk(Cl.none());
    });

    it("should track penalties collected", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

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

      const penalties = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-total-penalties-collected",
        [],
        deployer
      );

      expect(penalties.result).toBeOk(Cl.uint(200000));
    });

    it("should not track penalties when unstake is not early", () => {
      const amount = 1000000;
      const stakeStart = 1000;
      const lockPeriod = 4320;

      // Set block past lock period
      simnet.mineEmptyBlocks(stakeStart + lockPeriod + 10);

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

      const penalties = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-total-penalties-collected",
        [],
        deployer
      );

      expect(penalties.result).toBeOk(Cl.uint(0));
    });
  });

  describe("Cancel Unstake Request", () => {
    
    it("should allow canceling unstake request", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      const response = simnet.callPublicFn(
        "unstaking-manager",
        "cancel-unstake-request",
        [],
        wallet1
      );

      expect(response.result).toBeOk(Cl.bool(true));
    });

    it("should delete request after cancellation", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      simnet.callPublicFn(
        "unstaking-manager",
        "cancel-unstake-request",
        [],
        wallet1
      );

      const request = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-unstaking-request",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(request.result).toBeOk(Cl.none());
    });

    it("should reject canceling non-existent request", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "cancel-unstake-request",
        [],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(301)); // err-not-found
    });
  });

  describe("Emergency Withdrawal", () => {
    
    it("should reject emergency withdrawal when not in emergency mode", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "emergency-withdraw",
        [Cl.uint(1000000)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(307)); // err-emergency-only
    });

    it("should allow emergency withdrawal in emergency mode", () => {
      const amount = 1000000;

      // Enable emergency mode
      simnet.callPublicFn(
        "unstaking-manager",
        "set-emergency-mode",
        [Cl.bool(true)],
        deployer
      );

      const response = simnet.callPublicFn(
        "unstaking-manager",
        "emergency-withdraw",
        [Cl.uint(amount)],
        wallet1
      );

      const expectedPenalty = 300000; // 30%
      const expectedNet = 700000;

      expect(response.result).toBeOk(Cl.uint(expectedNet));
    });

    it("should apply 30% penalty for emergency withdrawal", () => {
      const amount = 1000000;

      simnet.callPublicFn(
        "unstaking-manager",
        "set-emergency-mode",
        [Cl.bool(true)],
        deployer
      );

      simnet.callPublicFn(
        "unstaking-manager",
        "emergency-withdraw",
        [Cl.uint(amount)],
        wallet1
      );

      const penalties = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-total-penalties-collected",
        [],
        deployer
      );

      expect(penalties.result).toBeOk(Cl.uint(300000));
    });

    it("should reject emergency withdrawal with zero amount", () => {
      simnet.callPublicFn(
        "unstaking-manager",
        "set-emergency-mode",
        [Cl.bool(true)],
        deployer
      );

      const response = simnet.callPublicFn(
        "unstaking-manager",
        "emergency-withdraw",
        [Cl.uint(0)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(302)); // err-invalid-amount
    });
  });

  describe("Penalty Calculations", () => {
    
    it("should calculate 20% penalty for early unstake", () => {
      const amount = 1000000;

      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "calculate-penalty",
        [Cl.uint(amount), Cl.bool(true)],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(200000));
    });

    it("should calculate zero penalty for non-early unstake", () => {
      const amount = 1000000;

      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "calculate-penalty",
        [Cl.uint(amount), Cl.bool(false)],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(0));
    });

    it("should calculate 30% emergency penalty", () => {
      const amount = 1000000;

      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "calculate-emergency-penalty",
        [Cl.uint(amount)],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(300000));
    });

    it("should provide unstake estimate", () => {
      const amount = 1000000;

      const response = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-unstake-estimate",
        [Cl.uint(amount), Cl.bool(true)],
        deployer
      );

      expect(response.result).toBeOk(
        Cl.tuple({
          "gross-amount": Cl.uint(1000000),
          penalty: Cl.uint(200000),
          "net-amount": Cl.uint(800000),
          "penalty-rate": Cl.uint(20)
        })
      );
    });
  });

  describe("Admin Functions", () => {
    
    it("should allow owner to set emergency mode", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "set-emergency-mode",
        [Cl.bool(true)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const mode = simnet.callReadOnlyFn(
        "unstaking-manager",
        "is-emergency-mode",
        [],
        deployer
      );

      expect(mode.result).toBeOk(Cl.bool(true));
    });

    it("should reject non-owner setting emergency mode", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "set-emergency-mode",
        [Cl.bool(true)],
        wallet1
      );

      expect(response.result).toBeErr(Cl.uint(300)); // err-owner-only
    });

    it("should allow owner to set penalty recipient", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "set-penalty-recipient",
        [Cl.principal(wallet2)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const recipient = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-penalty-recipient",
        [],
        deployer
      );

      expect(recipient.result).toBeOk(Cl.principal(wallet2));
    });

    it("should allow owner to withdraw penalties", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      // Generate some penalties
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

      // Withdraw penalties
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "withdraw-penalties",
        [Cl.uint(100000)],
        deployer
      );

      expect(response.result).toBeOk(Cl.bool(true));

      const remaining = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-total-penalties-collected",
        [],
        deployer
      );

      expect(remaining.result).toBeOk(Cl.uint(100000));
    });

    it("should reject withdrawing more than collected penalties", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "withdraw-penalties",
        [Cl.uint(999999999)],
        deployer
      );

      expect(response.result).toBeErr(Cl.uint(302)); // err-invalid-amount
    });

    it("should allow owner to force complete unstake", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

      simnet.callPublicFn(
        "unstaking-manager",
        "initiate-unstake",
        [Cl.uint(amount), Cl.uint(stakeStart), Cl.uint(lockPeriod)],
        wallet1
      );

      const response = simnet.callPublicFn(
        "unstaking-manager",
        "force-complete-unstake",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(response.result).toBeOk(Cl.uint(800000)); // After 20% penalty
    });

    it("should reject non-owner force completing unstake", () => {
      const response = simnet.callPublicFn(
        "unstaking-manager",
        "force-complete-unstake",
        [Cl.principal(wallet1)],
        wallet2
      );

      expect(response.result).toBeErr(Cl.uint(300)); // err-owner-only
    });
  });

  describe("History Tracking", () => {
    
    it("should track unstake history", () => {
      const amount = 1000000;
      const stakeStart = simnet.blockHeight;
      const lockPeriod = 4320;

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

      const history = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-unstake-history",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      expect(history.result).toBeOk(
        Cl.some(
          Cl.tuple({
            amount: Cl.uint(1000000),
            penalty: Cl.uint(200000),
            "completed-block": Cl.some(Cl.uint()),
            "was-early": Cl.bool(true)
          })
        )
      );
    });

    it("should track emergency withdrawal", () => {
      const amount = 1000000;

      simnet.callPublicFn(
        "unstaking-manager",
        "set-emergency-mode",
        [Cl.bool(true)],
        deployer
      );

      simnet.callPublicFn(
        "unstaking-manager",
        "emergency-withdraw",
        [Cl.uint(amount)],
        wallet1
      );

      const withdrawal = simnet.callReadOnlyFn(
        "unstaking-manager",
        "get-emergency-withdrawal",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(withdrawal.result).toBeOk(
        Cl.some(
          Cl.tuple({
            amount: Cl.uint(1000000),
            penalty: Cl.uint(300000),
            block: Cl.some(Cl.uint())
          })
        )
      );
    });
  });
});
