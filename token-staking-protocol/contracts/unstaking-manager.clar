;; Unstaking Manager Contract
;; Handles unstaking requests, cooldown periods, and emergency withdrawals

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u300))
(define-constant err-not-found (err u301))
(define-constant err-invalid-amount (err u302))
(define-constant err-already-exists (err u303))
(define-constant err-cooldown-active (err u304))
(define-constant err-cooldown-not-complete (err u305))
(define-constant err-no-stake (err u306))
(define-constant err-emergency-only (err u307))

;; Penalty and cooldown constants
(define-constant early-unstake-penalty u20) ;; 20% penalty
(define-constant cooldown-period u1440) ;; ~10 days in blocks
(define-constant emergency-penalty u30) ;; 30% penalty for emergency withdrawal

;; Data Variables
(define-data-var emergency-mode bool false)
(define-data-var total-penalties-collected uint u0)
(define-data-var penalty-recipient principal contract-owner)

;; Unstaking request structure
(define-map unstaking-requests
  principal
  {
    amount: uint,
    initiation-block: uint,
    is-early: bool,
    penalty-amount: uint,
    original-stake-start: uint,
    lock-period: uint
  }
)

;; Track completed unstakes for history
(define-map unstake-history
  { user: principal, unstake-id: uint }
  {
    amount: uint,
    penalty: uint,
    completed-block: uint,
    was-early: bool
  }
)

(define-data-var unstake-counter uint u0)

;; Emergency withdrawal tracking
(define-map emergency-withdrawals
  principal
  {
    amount: uint,
    penalty: uint,
    block: uint
  }
)

;; Read-only functions

(define-read-only (get-unstaking-request (user principal))
  (ok (map-get? unstaking-requests user))
)

(define-read-only (get-cooldown-period)
  (ok cooldown-period)
)

(define-read-only (get-early-penalty-rate)
  (ok early-unstake-penalty)
)

(define-read-only (get-emergency-penalty-rate)
  (ok emergency-penalty)
)

(define-read-only (is-emergency-mode)
  (ok (var-get emergency-mode))
)

(define-read-only (get-total-penalties-collected)
  (ok (var-get total-penalties-collected))
)

(define-read-only (get-penalty-recipient)
  (ok (var-get penalty-recipient))
)

(define-read-only (is-cooldown-complete (user principal))
  (match (map-get? unstaking-requests user)
    request
      (let
        (
          (completion-block (+ (get initiation-block request) cooldown-period))
        )
        (ok (>= stacks-block-height completion-block))
      )
    (ok false)
  )
)

(define-read-only (get-cooldown-remaining (user principal))
  (match (map-get? unstaking-requests user)
    request
      (let
        (
          (completion-block (+ (get initiation-block request) cooldown-period))
        )
        (ok (if (>= stacks-block-height completion-block)
          u0
          (- completion-block stacks-block-height)
        ))
      )
    err-not-found
  )
)

(define-read-only (calculate-penalty (amount uint) (is-early bool))
  (if is-early
    (ok (/ (* amount early-unstake-penalty) u100))
    (ok u0)
  )
)

(define-read-only (calculate-emergency-penalty (amount uint))
  (ok (/ (* amount emergency-penalty) u100))
)

(define-read-only (get-unstake-estimate (amount uint) (is-early bool))
  (let
    (
      (penalty (if is-early (/ (* amount early-unstake-penalty) u100) u0))
      (net-amount (- amount penalty))
    )
    (ok {
      gross-amount: amount,
      penalty: penalty,
      net-amount: net-amount,
      penalty-rate: (if is-early early-unstake-penalty u0)
    })
  )
)

;; Public functions

(define-public (initiate-unstake 
  (amount uint) 
  (stake-start-block uint) 
  (lock-period uint))
  (let
    (
      (existing-request (map-get? unstaking-requests tx-sender))
      (unlock-block (+ stake-start-block lock-period))
      (is-early (< stacks-block-height unlock-block))
      (penalty (if is-early (/ (* amount early-unstake-penalty) u100) u0))
    )
    (asserts! (is-none existing-request) err-already-exists)
    (asserts! (> amount u0) err-invalid-amount)
    
    (map-set unstaking-requests tx-sender {
      amount: amount,
      initiation-block: stacks-block-height,
      is-early: is-early,
      penalty-amount: penalty,
      original-stake-start: stake-start-block,
      lock-period: lock-period
    })
    
    (print {
      event: "unstake-initiated",
      user: tx-sender,
      amount: amount,
      is-early: is-early,
      penalty: penalty,
      cooldown-complete-at: (+ stacks-block-height cooldown-period),
      block: stacks-block-height
    })
    
    (ok {
      amount: amount,
      penalty: penalty,
      net-amount: (- amount penalty),
      cooldown-blocks: cooldown-period
    })
  )
)

(define-public (complete-unstake)
  (let
    (
      (request (unwrap! (map-get? unstaking-requests tx-sender) err-not-found))
      (completion-block (+ (get initiation-block request) cooldown-period))
      (amount (get amount request))
      (penalty (get penalty-amount request))
      (net-amount (- amount penalty))
    )
    (asserts! (>= stacks-block-height completion-block) err-cooldown-not-complete)
    
    ;; Record penalty if any
    (if (> penalty u0)
      (var-set total-penalties-collected (+ (var-get total-penalties-collected) penalty))
      true
    )
    
    ;; Note: In production, transfer tokens here
    ;; (try! (as-contract (stx-transfer? net-amount tx-sender tx-sender)))
    
    ;; Save to history
    (map-set unstake-history
      { user: tx-sender, unstake-id: (var-get unstake-counter) }
      {
        amount: amount,
        penalty: penalty,
        completed-block: stacks-block-height,
        was-early: (get is-early request)
      }
    )
    
    (var-set unstake-counter (+ (var-get unstake-counter) u1))
    (map-delete unstaking-requests tx-sender)
    
    (print {
      event: "unstake-completed",
      user: tx-sender,
      amount: amount,
      penalty: penalty,
      net-amount: net-amount,
      block: stacks-block-height
    })
    
    (ok net-amount)
  )
)

(define-public (cancel-unstake-request)
  (let
    (
      (request (unwrap! (map-get? unstaking-requests tx-sender) err-not-found))
    )
    (map-delete unstaking-requests tx-sender)
    
    (print {
      event: "unstake-cancelled",
      user: tx-sender,
      amount: (get amount request),
      block: stacks-block-height
    })
    
    (ok true)
  )
)

(define-public (emergency-withdraw (amount uint))
  (let
    (
      (penalty (/ (* amount emergency-penalty) u100))
      (net-amount (- amount penalty))
    )
    (asserts! (var-get emergency-mode) err-emergency-only)
    (asserts! (> amount u0) err-invalid-amount)
    
    ;; Record penalty
    (var-set total-penalties-collected (+ (var-get total-penalties-collected) penalty))
    
    ;; Note: In production, transfer tokens here
    ;; (try! (as-contract (stx-transfer? net-amount tx-sender tx-sender)))
    
    (map-set emergency-withdrawals tx-sender {
      amount: amount,
      penalty: penalty,
      block: stacks-block-height
    })
    
    (print {
      event: "emergency-withdrawal",
      user: tx-sender,
      amount: amount,
      penalty: penalty,
      net-amount: net-amount,
      block: stacks-block-height
    })
    
    (ok net-amount)
  )
)

;; Admin functions

(define-public (set-emergency-mode (enabled bool))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set emergency-mode enabled)
    (print {
      event: "emergency-mode-updated",
      enabled: enabled,
      block: stacks-block-height
    })
    (ok true)
  )
)

(define-public (set-penalty-recipient (new-recipient principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set penalty-recipient new-recipient)
    (ok true)
  )
)

(define-public (withdraw-penalties (amount uint))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (>= (var-get total-penalties-collected) amount) err-invalid-amount)
    
    ;; Note: In production, transfer penalties to recipient
    ;; (try! (as-contract (stx-transfer? amount tx-sender (var-get penalty-recipient))))
    
    (var-set total-penalties-collected (- (var-get total-penalties-collected) amount))
    (ok true)
  )
)

;; Force complete an unstake (admin only, for emergencies)
(define-public (force-complete-unstake (user principal))
  (let
    (
      (request (unwrap! (map-get? unstaking-requests user) err-not-found))
      (amount (get amount request))
      (penalty (get penalty-amount request))
      (net-amount (- amount penalty))
    )
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    
    (if (> penalty u0)
      (var-set total-penalties-collected (+ (var-get total-penalties-collected) penalty))
      true
    )
    
    (map-set unstake-history
      { user: user, unstake-id: (var-get unstake-counter) }
      {
        amount: amount,
        penalty: penalty,
        completed-block: stacks-block-height,
        was-early: (get is-early request)
      }
    )
    
    (var-set unstake-counter (+ (var-get unstake-counter) u1))
    (map-delete unstaking-requests user)
    
    (print {
      event: "unstake-force-completed",
      user: user,
      admin: tx-sender,
      amount: amount,
      penalty: penalty,
      block: stacks-block-height
    })
    
    (ok net-amount)
  )
)

;; Get user's unstake history
(define-read-only (get-unstake-history (user principal) (unstake-id uint))
  (ok (map-get? unstake-history { user: user, unstake-id: unstake-id }))
)

;; Get user's emergency withdrawal info
(define-read-only (get-emergency-withdrawal (user principal))
  (ok (map-get? emergency-withdrawals user))
)
