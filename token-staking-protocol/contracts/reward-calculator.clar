;; Reward Calculator Contract
;; Handles reward calculation logic and APY computations

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u200))
(define-constant err-invalid-amount (err u201))
(define-constant err-invalid-period (err u202))
(define-constant err-division-by-zero (err u203))
(define-constant err-overflow (err u204))

;; Precision constants
(define-constant precision u10000)
(define-constant blocks-per-year u52560) ;; Approximate blocks in a year (~10 min per block)

;; Data Variables
(define-data-var base-apy uint u1000) ;; 10% base APY (scaled by 10000)
(define-data-var reward-rate uint u100) ;; Rate per block (scaled by 10000)
(define-data-var total-staked uint u0)
(define-data-var reward-pool-balance uint u1000000000000) ;; Initial reward pool
(define-data-var performance-fee uint u500) ;; 5% performance fee (scaled by 10000)

;; Lock period multipliers (scaled by 100)
(define-constant multiplier-30-days u100)  ;; 1x
(define-constant multiplier-90-days u150)  ;; 1.5x
(define-constant multiplier-180-days u200) ;; 2x
(define-constant multiplier-365-days u300) ;; 3x

;; Read-only functions

(define-read-only (get-base-apy)
  (ok (var-get base-apy))
)

(define-read-only (get-reward-rate)
  (ok (var-get reward-rate))
)

(define-read-only (get-total-staked)
  (ok (var-get total-staked))
)

(define-read-only (get-reward-pool-balance)
  (ok (var-get reward-pool-balance))
)

(define-read-only (get-performance-fee)
  (ok (var-get performance-fee))
)

;; Calculate APY for a specific lock period
(define-read-only (get-apy (lock-period uint))
  (let
    (
      (multiplier (get-period-multiplier lock-period))
      (apy (/ (* (var-get base-apy) multiplier) u100))
    )
    (ok apy)
  )
)

;; Get multiplier for lock period
(define-read-only (get-period-multiplier (lock-period uint))
  (if (is-eq lock-period u4320)   ;; 30 days
    multiplier-30-days
    (if (is-eq lock-period u12960)  ;; 90 days
      multiplier-90-days
      (if (is-eq lock-period u25920) ;; 180 days
        multiplier-180-days
        (if (is-eq lock-period u52560) ;; 365 days
          multiplier-365-days
          u100 ;; Default to 1x
        )
      )
    )
  )
)

;; Calculate rewards for a stake
;; Formula: (amount * blocks * rate * multiplier) / precision
(define-read-only (calculate-rewards (amount uint) (blocks-staked uint) (lock-period uint))
  (let
    (
      (multiplier (get-period-multiplier lock-period))
      (base-rewards (/ (* (* amount blocks-staked) (var-get reward-rate)) precision))
      (multiplied-rewards (/ (* base-rewards multiplier) u100))
    )
    (ok multiplied-rewards)
  )
)

;; Calculate rewards with auto-compound
(define-read-only (calculate-compound-rewards 
  (principal-amount uint) 
  (blocks-staked uint) 
  (lock-period uint)
  (compound-frequency uint))
  (let
    (
      (multiplier (get-period-multiplier lock-period))
      (rate-per-period (/ (var-get reward-rate) compound-frequency))
      (periods (/ blocks-staked compound-frequency))
    )
    ;; Simplified compound calculation
    (ok (calculate-compound-iterative principal-amount rate-per-period periods multiplier))
  )
)

;; Helper function for compound calculation
(define-private (calculate-compound-iterative (principal uint) (rate uint) (periods uint) (multiplier uint))
  (if (is-eq periods u0)
    principal
    (let
      (
        (period-return (/ (* principal rate) precision))
        (multiplied-return (/ (* period-return multiplier) u100))
        (new-principal (+ principal multiplied-return))
      )
      (calculate-compound-iterative new-principal rate (- periods u1) multiplier)
    )
  )
)

;; Project earnings over time
(define-read-only (project-earnings 
  (amount uint) 
  (lock-period uint))
  (let
    (
      (multiplier (get-period-multiplier lock-period))
      (apy (unwrap! (get-apy lock-period) (err err-invalid-period)))
      (projected-rewards (/ (* (* amount apy) lock-period) (* precision blocks-per-year)))
    )
    (ok {
      principal: amount,
      projected-rewards: projected-rewards,
      total-return: (+ amount projected-rewards),
      apy: apy,
      multiplier: multiplier
    })
  )
)

;; Calculate effective APY with compound
(define-read-only (calculate-effective-apy (lock-period uint) (compound-frequency uint))
  (let
    (
      (base-apy (unwrap! (get-apy lock-period) (err err-invalid-period)))
      (periods-per-year (/ blocks-per-year compound-frequency))
      (rate-per-period (/ base-apy periods-per-year))
    )
    ;; Effective APY = ((1 + r/n)^n - 1) * 100
    ;; Simplified for Clarity constraints
    (ok (+ base-apy (/ base-apy u10))) ;; Approximate bonus for compounding
  )
)

;; Calculate early unstake penalty
(define-read-only (calculate-early-penalty (amount uint) (blocks-staked uint) (lock-period uint))
  (let
    (
      (progress (if (> lock-period u0) (/ (* blocks-staked u100) lock-period) u0))
    )
    (if (>= progress u100)
      (ok u0) ;; No penalty if fully vested
      (ok (/ (* amount u20) u100)) ;; 20% penalty for early unstake
    )
  )
)

;; Calculate performance fee on rewards
(define-read-only (calculate-performance-fee-amount (rewards uint))
  (ok (/ (* rewards (var-get performance-fee)) precision))
)

;; Calculate net rewards after fees
(define-read-only (calculate-net-rewards (gross-rewards uint))
  (let
    (
      (fee (/ (* gross-rewards (var-get performance-fee)) precision))
      (net (- gross-rewards fee))
    )
    (ok {
      gross-rewards: gross-rewards,
      fee: fee,
      net-rewards: net
    })
  )
)

;; Estimate daily rewards
(define-read-only (estimate-daily-rewards (amount uint) (lock-period uint))
  (let
    (
      (blocks-per-day u144) ;; ~144 blocks per day
      (daily-rewards (unwrap! (calculate-rewards amount blocks-per-day lock-period) (err err-invalid-amount)))
    )
    (ok daily-rewards)
  )
)

;; Estimate yearly rewards
(define-read-only (estimate-yearly-rewards (amount uint) (lock-period uint))
  (let
    (
      (yearly-rewards (unwrap! (calculate-rewards amount blocks-per-year lock-period) (err err-invalid-amount)))
    )
    (ok yearly-rewards)
  )
)

;; Calculate reward pool sustainability (blocks until depletion)
(define-read-only (calculate-pool-sustainability)
  (let
    (
      (total-staked-amount (var-get total-staked))
      (pool-balance (var-get reward-pool-balance))
      (rate (var-get reward-rate))
    )
    (if (is-eq total-staked-amount u0)
      (ok u999999999) ;; Infinite if no stakes
      (if (is-eq rate u0)
        (ok u999999999) ;; Infinite if no rewards
        (let
          (
            (rewards-per-block (/ (* total-staked-amount rate) precision))
          )
          (if (is-eq rewards-per-block u0)
            (ok u999999999)
            (ok (/ pool-balance rewards-per-block))
          )
        )
      )
    )
  )
)

;; Public functions

(define-public (update-reward-rate (new-rate uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (> new-rate u0) err-invalid-amount)
    (var-set reward-rate new-rate)
    (ok true)
  )
)

(define-public (update-base-apy (new-apy uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (> new-apy u0) err-invalid-amount)
    (var-set base-apy new-apy)
    (ok true)
  )
)

(define-public (update-performance-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (<= new-fee u2000) err-invalid-amount) ;; Max 20% fee
    (var-set performance-fee new-fee)
    (ok true)
  )
)

(define-public (add-to-reward-pool (amount uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (> amount u0) err-invalid-amount)
    (var-set reward-pool-balance (+ (var-get reward-pool-balance) amount))
    (ok true)
  )
)

(define-public (update-total-staked (new-total uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set total-staked new-total)
    (ok true)
  )
)

(define-public (deduct-from-reward-pool (amount uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (>= (var-get reward-pool-balance) amount) err-invalid-amount)
    (var-set reward-pool-balance (- (var-get reward-pool-balance) amount))
    (ok true)
  )
)
