import math
from typing import Dict, List, Any

class ArbitrageEngine:
    @staticmethod
    def american_to_decimal(american_odds: int) -> float:
        """Converts American odds to Decimal odds for arbitrage calculation."""
        if american_odds > 0:
            return 1.0 + (american_odds / 100.0)
        else:
            return 1.0 + (100.0 / abs(american_odds))

    @staticmethod
    def calculate_arbitrage(odds_list: List[int], total_bankroll: float = 500.0) -> Dict[str, Any]:
        """
        Calculates if a set of odds across bookmakers creates a guaranteed arbitrage profit.
        odds_list: e.g., [-110, +120] or [-105, +115]
        """
        decimal_odds = [ArbitrageEngine.american_to_decimal(o) for o in odds_list]
        
        # Arbitrage Condition: Sum of (1 / Decimal Odds) < 1.0
        implied_probabilities = [1.0 / d for d in decimal_odds]
        total_implied_prob = sum(implied_probabilities)
        
        is_arbitrage = total_implied_prob < 1.0
        profit_margin_pct = (1.0 - total_implied_prob) * 100 if is_arbitrage else 0.0
        
        stakes = []
        if is_arbitrage:
            # Calculate optimal stake per bet to lock in guaranteed profit
            for p, d in zip(implied_probabilities, decimal_odds):
                stake = total_bankroll * (p / total_implied_prob)
                payout = stake * d
                stakes.append({
                    "decimal_odds": round(d, 2),
                    "recommended_stake": round(stake, 2),
                    "guaranteed_payout": round(payout, 2)
                })

        return {
            "is_arbitrage": is_arbitrage,
            "arbitrage_margin_pct": round(profit_margin_pct, 2),
            "total_implied_probability": round(total_implied_prob * 100, 2),
            "stake_breakdown": stakes
        }

# Example Test Run
if __name__ == "__main__":
    engine = ArbitrageEngine()
    # Testing a 2-way market with mispriced odds across books (e.g., DK -105 vs FanDuel +115)
    arb_result = engine.calculate_arbitrage(odds_list=[-105, 115], total_bankroll=1000.0)
    print("Arbitrage Test Analysis:", arb_result)
