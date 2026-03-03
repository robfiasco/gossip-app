# MONOLITH Hackathon — Need-to-Know Brief for Gossip
> Solana Mobile x RadiantsDAO | Deadline: March 9, 2026

---

## The Basics

| | |
|---|---|
| **Hackathon** | MONOLITH — 2nd Solana Mobile Hackathon by RadiantsDAO |
| **Deadline** | March 9, 2026 (submissions close) |
| **Prize pool** | $125,000+ total |
| **Top prizes** | 10 winners × $10K each |
| **Honorable mentions** | 5 × $5K each |
| **Bonus prize** | $10,000 in SKR for best SKR integration |
| **Beyond cash** | Marketing support, featured dApp Store placement, Seeker devices, call with Toly |

---

## What Qualifies

- **Mobile-first app** built for the **Solana dApp Store**
- Must use **Solana**
- Categories: DeFi, payments, gaming, social, tools/utilities — anything mobile + Solana
- Open to solo builders, teams, agent orchestrators
- Emphasis on: **usability, performance, thoughtful mobile design that feels natural on a phone**

---

## Critical Technical Requirements

### Must-Haves for dApp Store Submission
- App must target the **Seeker device** (Solana Mobile's Android phone)
- Must integrate **Mobile Wallet Adapter (MWA) SDK** for wallet signing
  - Repo: `github.com/solana-mobile/mobile-wallet-adapter`
- Must be publishable to the **Solana dApp Store**
  - Publishing portal: `publish.solanamobile.com`
- Mobile-first UI — not a web app wrapped in a shell

### Strongly Recommended (Bonus Prize Eligible)
- **SKR integration** → best SKR integration wins extra $10K
  - SKR = Solana Mobile's token/ecosystem key
  - Worth adding if it fits Gossip's feature set naturally

---

## Submission Checklist

- [ ] Registered at `solanamobile.radiant.nexus` or `align.nexus`
- [ ] App builds and runs on Android / Seeker
- [ ] MWA SDK integrated for wallet connection
- [ ] Published or publishable to Solana dApp Store
- [ ] Submitted before March 9, 2026
- [ ] Consider SKR integration for bonus prize

---

## Key Resources

| Resource | URL |
|---|---|
| Hackathon hub | solanamobile.radiant.nexus |
| Solana Mobile docs | docs.solanamobile.com |
| Mobile Wallet Adapter SDK | github.com/solana-mobile/mobile-wallet-adapter |
| dApp Store publishing portal | publish.solanamobile.com |
| Hackathon toolbox | solanamobile.radiant.nexus/?panel=toolbox |
| FAQ | solanamobile.radiant.nexus/?panel=faq |
| Radiants Discord (support) | discord.com/invite/radiants |

---

## Judging Signals (Inferred)

Based on official language, judges appear to weight:
1. **Mobile-first design** — feels native, not ported
2. **Real utility** — solves an actual problem
3. **Solana integration depth** — not just a token mention
4. **Execution quality** — shipped, working, polished
5. **Novelty** — "build something they can't move"

Gossip's angle (crypto signal aggregation, noise reduction, scam detection) is a strong fit for the **social/tools** category and addresses a real pain point in the ecosystem.

---

## Notes for Claude Code

- This is an **Android app** targeting Seeker — confirm build target is Android
- MWA SDK handles wallet signing — do not roll your own auth
- dApp Store has its own publishing flow — factor in time for store submission before deadline
- SKR bonus is worth a look if integration is lightweight
- Deadline is **March 9** — prioritize ship over perfect
