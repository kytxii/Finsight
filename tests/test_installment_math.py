import pytest
from decimal import Decimal
from app.services.installment_service import (
    compute_monthly_payment,
    compute_gauge_status,
)


def test_flat_division_even():
    assert compute_monthly_payment(Decimal("600"), 6) == Decimal("100.00")


def test_flat_division_non_evenly_divisible():
    # $100 / 3 rounds to $33.33/mo - a known, accepted 1-cent shortfall vs total_amount.
    assert compute_monthly_payment(Decimal("100"), 3) == Decimal("33.33")


def test_gauge_status_no_headroom_is_red_regardless_of_payment():
    status, ratio = compute_gauge_status(Decimal("1.00"), Decimal("0"))
    assert status == "red"
    assert ratio is None

    status, ratio = compute_gauge_status(Decimal("1.00"), Decimal("-50"))
    assert status == "red"
    assert ratio is None


def test_gauge_status_dark_green_band():
    # ratio exactly at the dark_green/green boundary (0.10) still counts as dark_green
    status, ratio = compute_gauge_status(Decimal("100"), Decimal("1000"))
    assert status == "dark_green"
    assert ratio == Decimal("0.1")


def test_gauge_status_green_band():
    # ratio exactly at the green/yellow boundary (0.15) still counts as green
    status, ratio = compute_gauge_status(Decimal("150"), Decimal("1000"))
    assert status == "green"
    assert ratio == Decimal("0.15")


def test_gauge_status_yellow_band():
    status, ratio = compute_gauge_status(Decimal("180"), Decimal("1000"))
    assert status == "yellow"
    assert ratio == Decimal("0.18")


def test_gauge_status_orange_band():
    status, ratio = compute_gauge_status(Decimal("220"), Decimal("1000"))
    assert status == "orange"
    assert ratio == Decimal("0.22")


def test_gauge_status_red_band_over_affordability_cutoff():
    status, ratio = compute_gauge_status(Decimal("300"), Decimal("1000"))
    assert status == "red"
    assert ratio == Decimal("0.3")


def test_gauge_status_red_band_crazy_high():
    # Well past 25% - still just "red", no extra tier for how far past.
    status, ratio = compute_gauge_status(Decimal("1500"), Decimal("1000"))
    assert status == "red"
    assert ratio == Decimal("1.5")


# Every tier cutoff, probed a cent either side of the boundary plus exactly on
# it. The cent-below/cent-above pairs are the ones that matter: they round to
# the *same* displayed percentage but must land in different tiers, which is
# what proves the banding reads the real ratio rather than the rounded figure
# the UI shows. Denominator is 1000 so the payment doubles as the percentage.
@pytest.mark.parametrize("payment,expected", [
    # 10% - dark_green | green
    ("99.99", "dark_green"), ("100.00", "dark_green"), ("100.01", "green"),
    # 15% - green | yellow
    ("149.99", "green"), ("150.00", "green"), ("150.01", "yellow"),
    # 20% - yellow | orange
    ("199.99", "yellow"), ("200.00", "yellow"), ("200.01", "orange"),
    # 25% - orange | red
    ("249.99", "orange"), ("250.00", "orange"), ("250.01", "red"),
])
def test_gauge_status_tier_boundaries_are_exact(payment, expected):
    status, _ = compute_gauge_status(Decimal(payment), Decimal("1000"))
    assert status == expected, f"{payment}/1000 should be {expected}, got {status}"


def test_gauge_status_boundary_pairs_share_a_rounded_percentage():
    """The cent-apart pairs above are only a meaningful test if they really do
    display identically - otherwise the UI would disambiguate them for free."""
    for below, above in [("99.99", "100.01"), ("149.99", "150.01"),
                         ("199.99", "200.01"), ("249.99", "250.01")]:
        _, ratio_below = compute_gauge_status(Decimal(below), Decimal("1000"))
        _, ratio_above = compute_gauge_status(Decimal(above), Decimal("1000"))
        assert round(ratio_below * 100) == round(ratio_above * 100)
