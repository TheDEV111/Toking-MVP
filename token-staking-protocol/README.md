# Token Staking Protocol

A comprehensive staking platform built on Stacks blockchain where users can lock tokens to earn rewards with flexible staking periods and compound interest options.

## Features

### Core Functionality
- **Multiple Lock Periods**: Stake for 30, 90, 180, or 365 days
- **Reward Multipliers**: Earn higher rewards for longer lock periods (1x to 3x)
- **Auto-Compound**: Optional automatic reinvestment of rewards
- **Early Unstaking**: Withdraw early with a 20% penalty
- **Emergency Withdrawal**: Special withdrawal mode with 30% penalty
- **Pool Analytics**: Real-time statistics on total staked, APY, and pool sustainability

### Reward Structure
| Lock Period | Blocks | Multiplier | APY Boost |
|------------|---------|------------|-----------|
| 30 days    | 4,320   | 1x         | 10%       |
| 90 days    | 12,960  | 1.5x       | 15%       |
| 180 days   | 25,920  | 2x         | 20%       |
| 365 days   | 52,560  | 3x         | 30%       |

## Smart Contracts

### 1. staking-pool.clar
Main staking contract handling:
- User stake management
- Reward claiming (with auto-compound support)
- Unstaking after lock period
- Pool statistics tracking

**Key Functions:**
- `stake(amount, lock-period, auto-compound)` - Create a new stake
- `claim-rewards()` - Claim or compound accumulated rewards
- `unstake()` - Withdraw stake after lock period
- `calculate-pending-rewards(user)` - View pending rewards
- `get-stake-info(user)` - Get user's stake details

### 2. reward-calculator.clar
Handles all reward calculations:
- APY calculations per lock period
- Daily and yearly reward estimates
- Performance fee calculations
- Early penalty calculations
- Pool sustainability metrics

**Key Functions:**
- `calculate-rewards(amount, blocks, period)` - Calculate base rewards
- `get-apy(lock-period)` - Get APY for specific period
- `project-earnings(amount, period)` - Project total earnings
- `estimate-daily-rewards(amount, period)` - Daily reward estimate
- `calculate-early-penalty(amount, blocks, period)` - Penalty calculation

### 3. unstaking-manager.clar
Manages the unstaking process:
- Cooldown period enforcement (1,440 blocks ≈ 10 days)
- Early unstaking with penalties
- Emergency withdrawals
- Penalty collection and distribution

**Key Functions:**
- `initiate-unstake(amount, start-block, period)` - Start unstake process
- `complete-unstake()` - Finalize unstake after cooldown
- `cancel-unstake-request()` - Cancel pending unstake
- `emergency-withdraw(amount)` - Emergency withdrawal (if enabled)
- `get-cooldown-remaining(user)` - Check cooldown status

## Installation

### Prerequisites
- [Clarinet](https://github.com/hirosystems/clarinet) installed
- Node.js v16+ and npm

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd token-staking-protocol
```

2. Install dependencies:
```bash
npm install
```

3. Run clarinet check to verify contracts:
```bash
clarinet check
```

4. Run tests:
```bash
npm test
```

## Testing

The protocol includes comprehensive test suites:

- **staking-pool.test.ts** - 50+ tests for staking functionality
- **reward-calculator.test.ts** - 40+ tests for reward calculations
- **unstaking-manager.test.ts** - 50+ tests for unstaking process
- **integration.test.ts** - End-to-end workflow tests

Run all tests:
```bash
npm test
```

Run specific test file:
```bash
npm test -- staking-pool.test.ts
```

## Contract Deployment

### Devnet Deployment

1. Start Clarinet console:
```bash
clarinet console
```

2. Deploy contracts:
```clarity
::deploy_contracts
```

### Testnet/Mainnet Deployment

Update the network configuration in `settings/Testnet.toml` or `settings/Mainnet.toml`, then:

```bash
clarinet deployments apply -p testnet
```

## Usage Examples

### Staking Tokens

```clarity
;; Stake 1,000,000 tokens for 90 days with auto-compound
(contract-call? .staking-pool stake u1000000 u12960 true)
```

### Claiming Rewards

```clarity
;; Claim accumulated rewards
(contract-call? .staking-pool claim-rewards)
```

### Checking Pending Rewards

```clarity
;; View pending rewards for a user
(contract-call? .staking-pool calculate-pending-rewards tx-sender)
```

### Unstaking

```clarity
;; Unstake after lock period expires
(contract-call? .staking-pool unstake)
```

### Early Unstaking

```clarity
;; Initiate early unstake (with penalty)
(contract-call? .unstaking-manager initiate-unstake 
  u1000000      ;; amount
  u1000         ;; original stake start block
  u12960        ;; lock period
)

;; After cooldown period (1,440 blocks)
(contract-call? .unstaking-manager complete-unstake)
```

## Frontend Integration

### Recommended UI Components

1. **Staking Dashboard**
   - Total staked amount
   - Current APY
   - User's available balance
   - Active stakes list

2. **Duration Selection Cards**
   - Visual cards for each lock period
   - APY multiplier display
   - Projected earnings calculator

3. **Active Stakes Table**
   - Stake amount
   - Lock duration
   - Rewards earned
   - Time remaining
   - Action buttons

4. **Rewards Display**
   - Real-time pending rewards counter
   - Claim/Compound buttons
   - Historical rewards chart

5. **Pool Statistics**
   - Total Value Locked (TVL)
   - Number of stakers
   - Reward pool balance
   - Pool sustainability indicator

### Chainhooks Integration

Monitor contract events:

```json
{
  "events": [
    "staked",
    "unstaked", 
    "rewards-claimed",
    "compound-executed",
    "unstake-initiated",
    "unstake-completed"
  ]
}
```

## Security Considerations

- ✅ No reentrancy vulnerabilities (Clarity prevents this by design)
- ✅ All arithmetic operations checked for overflow
- ✅ Access control on admin functions
- ✅ Cooldown period prevents immediate withdrawals
- ✅ Penalties discourage gaming the system
- ⚠️ Token transfers commented out (implement for production)
- ⚠️ Add authentication checks for production deployment

## Production Checklist

Before deploying to mainnet:

- [ ] Implement actual token transfers (currently commented out)
- [ ] Set appropriate reward rates and pool funding
- [ ] Configure admin addresses
- [ ] Set up monitoring and alerting
- [ ] Audit by security firm
- [ ] Test on testnet with real users
- [ ] Prepare emergency procedures
- [ ] Set up frontend with proper error handling
- [ ] Configure Chainhooks for event monitoring

## Contract Architecture

```
┌─────────────────────┐
│   staking-pool      │
│  (Main Contract)    │
│  - stake()          │
│  - unstake()        │
│  - claim-rewards()  │
└──────────┬──────────┘
           │
           │ uses
           ├─────────────┐
           │             │
┌──────────▼──────────┐ │
│ reward-calculator   │ │
│   (Calculations)    │ │
│  - calculate-rewards│ │
│  - get-apy()        │ │
│  - project-earnings │ │
└─────────────────────┘ │
                        │
           ┌────────────▼────────────┐
           │  unstaking-manager      │
           │  (Unstake Process)      │
           │  - initiate-unstake()   │
           │  - complete-unstake()   │
           │  - emergency-withdraw() │
           └─────────────────────────┘
```

## Design System

### Color Palette
- **Primary**: Deep Purple (#7C3AED)
- **Accent**: Gold (#FFD700) for rewards
- **Gradient**: Purple to Blue
- **Success**: Green (#10B981)
- **Warning**: Orange (#F59E0B)
- **Error**: Red (#EF4444)

### Typography
- **Font**: Montserrat
- **Headings**: Bold, 24-32px
- **Body**: Regular, 14-16px
- **Numbers**: Mono, for consistency

## API Reference

### Read-Only Functions

All read-only functions can be called without transaction fees:

```clarity
;; Get user's stake information
(get-stake-info (user principal))

;; Calculate pending rewards
(calculate-pending-rewards (user principal))

;; Check if stake is unlocked
(is-stake-unlocked (user principal))

;; Get time until unlock
(get-time-until-unlock (user principal))

;; Get APY for period
(get-apy (lock-period uint))

;; Project earnings
(project-earnings (amount uint) (lock-period uint))
```

## Performance Metrics

- **Gas Cost per Stake**: ~5,000-10,000 µSTX
- **Gas Cost per Claim**: ~3,000-7,000 µSTX
- **Block Time**: ~10 minutes
- **Reward Calculation**: O(1) complexity
- **Max Stakes per User**: 1 (current design)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For questions or issues:
- Open a GitHub issue
- Join our Discord community
- Email: support@example.com

## Roadmap

### Phase 1 (Current)
- ✅ Core staking functionality
- ✅ Reward calculations
- ✅ Unstaking with penalties
- ✅ Comprehensive tests

### Phase 2 (Planned)
- [ ] Multiple concurrent stakes per user
- [ ] NFT staking support
- [ ] Governance token integration
- [ ] Advanced analytics dashboard

### Phase 3 (Future)
- [ ] Cross-chain staking
- [ ] Liquid staking derivatives
- [ ] DAO governance
- [ ] Mobile app

## Acknowledgments

Built with:
- [Clarity](https://clarity-lang.org/) - Smart contract language
- [Clarinet](https://github.com/hirosystems/clarinet) - Development tool
- [Stacks](https://www.stacks.co/) - Blockchain platform

---

**Disclaimer**: This software is provided as-is. Users should conduct their own audits before using in production.
