;; Token Staking Pool Contract
;; Manages user stakes with multiple lock periods and reward multipliers

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-invalid-amount (err u102))
(define-constant err-invalid-period (err u103))
(define-constant err-stake-locked (err u104))
(define-constant err-insufficient-balance (err u105))
(define-constant err-already-staked (err u106))
(define-constant err-transfer-failed (err u107))

;; Lock period constants (in blocks - assuming ~10 min per block)
(define-constant period-30-days u4320)   ;; ~30 days
(define-constant period-90-days u12960)  ;; ~90 days
(define-constant period-180-days u25920) ;; ~180 days
(define-constant period-365-days u52560) ;; ~365 days

;; Reward multipliers (scaled by 100 for precision)
(define-constant multiplier-30-days u100)  ;; 1x
(define-constant multiplier-90-days u150)  ;; 1.5x
(define-constant multiplier-180-days u200) ;; 2x
(define-constant multiplier-365-days u300) ;; 3x

;; Data Variables
(define-data-var total-staked uint u0)
(define-data-var total-stakers uint u0)
(define-data-var reward-pool-balance uint u0)
(define-data-var base-reward-rate uint u100) ;; Base rate per block (scaled by 10000)

;; Data Maps
(define-map stakes
  principal
  {
    amount: uint,
    start-block: uint,
    lock-period: uint,
    rewards-claimed: uint,
    last-claim-block: uint,
    multiplier: uint,
    auto-compound: bool
  }
)

(define-map user-stake-history
  { user: principal, stake-id: uint }
  {
    amount: uint,
    start-block: uint,
    end-block: uint,
    rewards-earned: uint
  }
)

(define-data-var stake-counter uint u0)

;; Read-only functions

(define-read-only (get-stake-info (user principal))
  (ok (map-get? stakes user))
)

(define-read-only (get-total-staked)
  (ok (var-get total-staked))
)

(define-read-only (get-total-stakers)
  (ok (var-get total-stakers))
)

(define-read-only (get-reward-pool-balance)
  (ok (var-get reward-pool-balance))
)

(define-read-only (get-base-reward-rate)
  (ok (var-get base-reward-rate))
)

(define-read-only (get-multiplier-for-period (lock-period uint))
  (ok 
    (if (is-eq lock-period period-30-days)
      multiplier-30-days
      (if (is-eq lock-period period-90-days)
        multiplier-90-days
        (if (is-eq lock-period period-180-days)
          multiplier-180-days
          (if (is-eq lock-period period-365-days)
            multiplier-365-days
            u0
          )
        )
      )
    )
  )
)

(define-read-only (is-stake-unlocked (user principal))
  (match (map-get? stakes user)
    stake-data 
      (ok (>= stacks-block-height (+ (get start-block stake-data) (get lock-period stake-data))))
    (ok false)
  )
)

(define-read-only (get-time-until-unlock (user principal))
  (match (map-get? stakes user)
    stake-data
      (let
        (
          (unlock-block (+ (get start-block stake-data) (get lock-period stake-data)))
        )
        (ok (if (>= stacks-block-height unlock-block)
          u0
          (- unlock-block stacks-block-height)
        ))
      )
    err-not-found
  )
)

(define-read-only (calculate-pending-rewards (user principal))
  (match (map-get? stakes user)
    stake-data
      (let
        (
          (blocks-staked (- stacks-block-height (get last-claim-block stake-data)))
          (base-rewards (/ (* (* (get amount stake-data) blocks-staked) (var-get base-reward-rate)) u10000))
          (multiplied-rewards (/ (* base-rewards (get multiplier stake-data)) u100))
        )
        (ok multiplied-rewards)
      )
    (ok u0)
  )
)

;; Public functions

(define-public (stake (amount uint) (lock-period uint) (auto-compound bool))
  (let
    (
      (multiplier (unwrap! (get-multiplier-for-period lock-period) err-invalid-period))
      (existing-stake (map-get? stakes tx-sender))
    )
    (asserts! (> amount u0) err-invalid-amount)
    (asserts! (> multiplier u0) err-invalid-period)
    (asserts! (is-none existing-stake) err-already-staked)
    
    ;; Note: In production, you would transfer tokens here
    ;; (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    
    (map-set stakes tx-sender {
      amount: amount,
      start-block: stacks-block-height,
      lock-period: lock-period,
      rewards-claimed: u0,
      last-claim-block: stacks-block-height,
      multiplier: multiplier,
      auto-compound: auto-compound
    })
    
    (var-set total-staked (+ (var-get total-staked) amount))
    (var-set total-stakers (+ (var-get total-stakers) u1))
    
    (print {
      event: "staked",
      user: tx-sender,
      amount: amount,
      lock-period: lock-period,
      multiplier: multiplier,
      block: stacks-block-height
    })
    
    (ok true)
  )
)

(define-public (claim-rewards)
  (let
    (
      (stake-data (unwrap! (map-get? stakes tx-sender) err-not-found))
      (pending-rewards (unwrap! (calculate-pending-rewards tx-sender) err-not-found))
    )
    (asserts! (> pending-rewards u0) err-invalid-amount)
    (asserts! (>= (var-get reward-pool-balance) pending-rewards) err-insufficient-balance)
    
    ;; Update stake data
    (if (get auto-compound stake-data)
      ;; Auto-compound: add rewards to stake amount
      (map-set stakes tx-sender 
        (merge stake-data {
          amount: (+ (get amount stake-data) pending-rewards),
          rewards-claimed: (+ (get rewards-claimed stake-data) pending-rewards),
          last-claim-block: stacks-block-height
        })
      )
      ;; Regular claim: transfer rewards to user
      (begin
        ;; Note: In production, you would transfer tokens here
        ;; (try! (as-contract (stx-transfer? pending-rewards tx-sender tx-sender)))
        (map-set stakes tx-sender 
          (merge stake-data {
            rewards-claimed: (+ (get rewards-claimed stake-data) pending-rewards),
            last-claim-block: stacks-block-height
          })
        )
      )
    )
    
    (var-set reward-pool-balance (- (var-get reward-pool-balance) pending-rewards))
    
    (print {
      event: "rewards-claimed",
      user: tx-sender,
      amount: pending-rewards,
      auto-compounded: (get auto-compound stake-data),
      block: stacks-block-height
    })
    
    (ok pending-rewards)
  )
)

(define-public (unstake)
  (let
    (
      (stake-data (unwrap! (map-get? stakes tx-sender) err-not-found))
      (unlock-block (+ (get start-block stake-data) (get lock-period stake-data)))
    )
    (asserts! (>= block-height unlock-block) err-stake-locked)
    
    ;; Claim any pending rewards first
    (try! (claim-rewards))
    
    (let
      (
        (final-stake (unwrap! (map-get? stakes tx-sender) err-not-found))
        (amount (get amount final-stake))
      )
      ;; Note: In production, you would transfer tokens here
      ;; (try! (as-contract (stx-transfer? amount tx-sender tx-sender)))
      
      ;; Save to history
      (map-set user-stake-history 
        { user: tx-sender, stake-id: (var-get stake-counter) }
        {
          amount: amount,
          start-block: (get start-block final-stake),
          end-block: stacks-block-height,
          rewards-earned: (get rewards-claimed final-stake)
        }
      )
      
      (var-set stake-counter (+ (var-get stake-counter) u1))
      (map-delete stakes tx-sender)
      (var-set total-staked (- (var-get total-staked) amount))
      (var-set total-stakers (- (var-get total-stakers) u1))
      
      (print {
        event: "unstaked",
        user: tx-sender,
        amount: amount,
        total-rewards: (get rewards-claimed final-stake),
        block: stacks-block-height
      })
      
      (ok amount)
    )
  )
)

;; Admin functions

(define-public (set-base-reward-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set base-reward-rate new-rate)
    (ok true)
  )
)

(define-public (add-to-reward-pool (amount uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    ;; Note: In production, you would transfer tokens here
    ;; (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (var-set reward-pool-balance (+ (var-get reward-pool-balance) amount))
    (ok true)
  )
)

(define-public (update-auto-compound (enabled bool))
  (let
    (
      (stake-data (unwrap! (map-get? stakes tx-sender) err-not-found))
    )
    (map-set stakes tx-sender 
      (merge stake-data { auto-compound: enabled })
    )
    (ok true)
  )
)
