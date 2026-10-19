import math
from typing import Dict, List, Any

class MultiProviderOddsEngine:
    def __init__(self):
        self.providers = ["DraftKings", "Pinnacle", "OddsJam", "TheOddsAPI", "SportsDataIO"]

    @staticmethod
    def american_to_decimal(american_odds: int) -> float:
        """Converts American odds (-110, +150) to Decimal odds (1.91, 2.50)."""
        if american_odds > 0:
            return 1.0 + (american_odds / 100.0)
        else:
            return 1.0 + (100.0 / abs(american_odds))

    @staticmethod
    def devig_pinnacle_sharp_line(sharp_over: int, sharp_under: int) -> Dict[str, float]:
        """
        Devigs Pinnacle's sharp line using the multiplicative method
        to determine True Implied Win Probabilities.
        """
        dec_over = MultiProviderOddsEngine.american_to_decimal(sharp_over)
        dec_under = MultiProviderOddsEngine.american_to_decimal(sharp_under)

        implied_over = 1.0 / dec_over
        implied_under = 1.0 / dec_under
        total_vow = implied_over + implied_under

        # Remove house vig
        true_prob_over = implied_over / total_vow
        true_prob_under = implied_under / total_vow

        return {
            "true_over_prob": round(true_prob_over, 4),
            "true_under_prob": round(true_prob_under, 4),
            "pinnacle_margin_pct": round((total_vow - 1.0) * 100, 2)
        }

    def evaluate_multi_book_ev(
        self, 
        soft_book_odds: int, 
        sharp_over: int, 
        sharp_under: int
    ) -> Dict[str, Any]:
        """
        Calculates +EV for a line offered on a soft book (e.g., DraftKings +110)
        against Pinnacle's devigged sharp probability baseline.
        """
        sharp_metrics = self.devig_pinnacle_sharp_line(sharp_over, sharp_under)
        true_prob = sharp_metrics["true_over_prob"]

        b = self.american_to_decimal(soft_book_odds) - 1.0
        p = true_prob
        q = 1.0 - p

        ev_pct = (p * b) - q
        kelly_fraction = max(0.0, (b * p - q) / b) if b > 0 else 0.0

        return {
            "soft_book_odds": soft_book_odds,
            "sharp_true_probability_pct": round(true_prob * 100, 2),
            "ev_percent": round(ev_pct * 100, 2),
            "kelly_recommended_stake_pct": round(kelly_fraction * 100, 2),
            "is_sharp_value": ev_pct > 0.02  # Filters for >2% EV
        }

if __name__ == "__main__":
    engine = MultiProviderOddsEngine()
    print("--- [Multi-Provider Ingestion Engine Active] ---")

    # Example: DraftKings offers Over 24.5 Points at +110 (+EV opportunity)
    # Pinnacle sharp baseline line is -125 / +105
    ev_analysis = engine.evaluate_multi_book_ev(
        soft_book_odds=110, 
        sharp_over=-125, 
        sharp_under=105
    )
    
    print("\n[+] Integrated Multi-Book Odds EV Analysis:")
    for k, v in ev_analysis.items():
        print(f"  - {k}: {v}")
