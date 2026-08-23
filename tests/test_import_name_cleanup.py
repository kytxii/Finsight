from app.services.import_service import (
    clean_display_name,
    clean_display_name_and_note,
    is_atm_deposit,
    is_balance_marker_row,
    is_bill_hint,
    is_credit_card_payment,
    is_person_to_person_transfer,
    is_reimbursement_hint,
    is_savings_related,
    is_savings_transfer_hint,
)


def test_strips_ach_des_batch_metadata():
    raw = "DESERT MOUNTAIN DES:PAYROLL ID:0SK64 A4610PNC3 INDN:TILLEY, KYLE CO ID:1273966137 PPD"
    assert clean_display_name(raw) == "DESERT MOUNTAIN"


def test_strips_des_metadata_for_bill_pay():
    raw = "APS electric pmt DES:PAYMENTS ID:9309041263 INDN:TILLEY,KYLE CO ID:1860011170 WEB"
    assert clean_display_name(raw) == "APS electric pmt"


def test_strips_checkcard_prefix_trailing_reference_and_city_state():
    raw = "CHECKCARD 0610 ACE PARKING 3492 PHOENIX AZ 24493986162225960105220"
    assert clean_display_name(raw) == "ACE PARKING 3492"


def test_strips_purchase_prefix_and_city_state():
    raw = "PURCHASE 0614 SOME-STORE ANYTOWN AZ"
    assert clean_display_name(raw) == "SOME-STORE"


def test_zelle_collapses_to_zelle_with_quoted_memo_dropping_sender():
    # Memo used to be baked into the name ("Zelle (Rent)"); it's now a
    # separate note so the display name is always just "Zelle" (#105).
    raw = "Zelle payment to Maya OGrady for \"Rent\"; Conf# ls6z39zze"
    assert clean_display_name(raw) == "Zelle"
    assert clean_display_name_and_note(raw) == ("Zelle", "Rent")


def test_zelle_memo_preserves_intentional_mixed_case_brand_names():
    raw = "Zelle payment from JULIE TILLEY for \"LinkedIn\"; Conf# glgihhctp"
    assert clean_display_name(raw) == "Zelle"
    assert clean_display_name_and_note(raw) == ("Zelle", "LinkedIn")


def test_zelle_memo_title_cases_sentence_case_text():
    raw = "Zelle payment from JULIE TILLEY for \"Din din at din\"; Conf# g0w5rfv8p"
    assert clean_display_name(raw) == "Zelle"
    assert clean_display_name_and_note(raw) == ("Zelle", "Din Din At Din")


def test_zelle_without_memo_collapses_to_bare_zelle():
    raw = "Zelle payment from JULIE TILLEY Conf# i6ffq988s"
    assert clean_display_name(raw) == "Zelle"
    assert clean_display_name_and_note(raw) == ("Zelle", None)


def test_zelle_memo_extracted_even_when_not_quoted():
    raw = "Zelle payment to Maya OGrady for Rent; Conf# ls6z39zze"
    assert clean_display_name(raw) == "Zelle"
    assert clean_display_name_and_note(raw) == ("Zelle", "Rent")


def test_collapses_duplicated_merchant_around_middle_purchase_marker():
    raw = "TARGET T-0936 07/07 #000153350 PURCHASE TARGET T-0936 154 Scottsdale AZ"
    assert clean_display_name(raw) == "TARGET T-0936 154"


def test_collapses_duplicated_merchant_with_hash_suffix():
    raw = "TRADER JOE S # 07/07 #000487373 PURCHASE TRADER JOE S #08 SCOTTSDALE AZ"
    assert clean_display_name(raw) == "TRADER JOE S #08"


def test_keeps_leading_merchant_when_middle_purchase_is_followed_by_address_only():
    raw = "WM SUPERCENTER 06/20 #000822914 PURCHASE 15355 N NORTHSIGH SCOTTSDALE AZ"
    assert clean_display_name(raw) == "WM SUPERCENTER"


def test_strips_trailing_date_and_purchase_keyword():
    raw = "GENERIC MERCHANT 07/03 PURCHASE CAVE CREEK AZ"
    assert clean_display_name(raw) == "GENERIC MERCHANT"


def test_strips_trailing_date_and_mobile_purchase_keyword():
    raw = "GENERIC MERCHANT SCT 10246 07/05 MOBILE PURCHASE PHOENIX AZ"
    assert clean_display_name(raw) == "GENERIC MERCHANT SCT 10246"


def test_strips_trailing_date_and_refund_keyword():
    raw = "S & C DENTAL 07/29 REFUND SCOTTSDALE AZ"
    assert clean_display_name(raw) == "S & C DENTAL"


def test_strips_trailing_date_purchase_when_location_is_not_city_state():
    raw = "GENERIC MERCHANT #01584 07/16 PURCHASE 480-419-6039 AZ"
    assert clean_display_name(raw) == "GENERIC MERCHANT #01584"


def test_strips_trailing_reference_number_before_recurring_suffix():
    raw = "CHECKCARD 0624 COBBLESTONE AUTO SPA - 602-788-9274 AZ 24801976176799712990198 RECURRING"
    assert clean_display_name(raw) == "COBBLESTONE AUTO SPA - 602-788-9274 AZ"


def test_detects_atm_cash_deposit():
    assert is_atm_deposit("BKOFAMERICA ATM 06/26 #000008739 DEPOSIT CROSSROADS EAST SCOTTSDALE AZ")
    assert not is_atm_deposit("CHECKCARD 0610 ACE PARKING 3492 PHOENIX AZ")
    assert not is_atm_deposit("Online Banking transfer from SAV 5835 Confirmation# 5126879279")


def test_collapses_amazon_marketplace_order_code():
    assert clean_display_name("PURCHASE 0614 AMAZON MKTPL*FX54S4PN3 Amzn.com/billWA") == "Amazon"


def test_collapses_amazon_retail_order_code():
    assert clean_display_name("PURCHASE 0617 AMAZON RETA* GB7ZT57M3 WWW.AMAZON.COWA") == "Amazon"


def test_reimbursement_hint_matches_amazon_venmo_and_zelle():
    assert is_reimbursement_hint("Amazon")
    assert is_reimbursement_hint("VENMO")
    assert is_reimbursement_hint("Zelle payment from JULIE TILLEY for \"Rent\"")
    assert not is_reimbursement_hint("ACE PARKING 3492")


def test_reimbursement_hint_matches_transfer_from_savings_but_not_to_savings():
    assert is_reimbursement_hint("Online Banking transfer from SAV 5835 Confirmation#")
    assert not is_reimbursement_hint("Online Banking transfer to SAV 5835 Confirmation#")


def test_savings_transfer_hint_matches_transfer_to_savings_but_not_from_savings():
    assert is_savings_transfer_hint("Online Banking transfer to SAV 5835 Confirmation#")
    assert not is_savings_transfer_hint("Online Banking transfer from SAV 5835 Confirmation#")
    assert not is_savings_transfer_hint("ACE PARKING 3492")


def test_bill_hint_matches_known_bill_keywords():
    assert is_bill_hint("Rent")
    assert is_bill_hint("APS electric pmt")
    assert is_bill_hint("Cox Communications")
    assert not is_bill_hint("ACE PARKING 3492")


def test_balance_marker_row_matches_beginning_and_ending_balance():
    assert is_balance_marker_row("Beginning balance as of 07/01/2026")
    assert is_balance_marker_row("Ending balance as of 07/31/2026")
    assert not is_balance_marker_row("ACE PARKING 3492")
    assert not is_balance_marker_row("Online Banking transfer from SAV 5835 Confirmation# 5126879279")


def test_savings_related_matches_either_transfer_direction():
    assert is_savings_related("Online Banking transfer from SAV 5835 Confirmation# 5126879279")
    assert is_savings_related("Online Banking transfer to SAV 5835 Confirmation# 5649234082")
    assert not is_savings_related("ACE PARKING 3492")


def test_person_to_person_transfer_matches_venmo_and_zelle_but_not_amazon():
    assert is_person_to_person_transfer("Zelle (Rent)")
    assert is_person_to_person_transfer("VENMO")
    assert not is_person_to_person_transfer("Amazon")
    assert not is_person_to_person_transfer("ACE PARKING 3492")


def test_merchant_alias_normalizes_known_store_number_brands():
    assert clean_display_name("WAL-MART #5835 07/03 PURCHASE CAVE CREEK AZ") == "Walmart"
    assert clean_display_name("BESTBUYCOM807206861809 07/05 PURCHASE 888BESTBUY MN") == "Best Buy"
    assert clean_display_name("WHOLEFDS SCT 10246 07/05 MOBILE PURCHASE PHOENIX AZ") == "Whole Foods"
    assert clean_display_name("TARGET T-0936 07/07 PURCHASE Scottsdale AZ") == "Target"
    assert clean_display_name("TRADER JOE S # 07/07 PURCHASE SCOTTSDALE AZ") == "Trader Joe's"
    assert clean_display_name("CHICK-FIL-A #01584 07/16 PURCHASE 480-419-6039 AZ") == "Chick-fil-A"
    assert clean_display_name("CIRCLEK #2705915 07/19 MOBILE PURCHASE SCOTTSDALE AZ") == "Circle K"
    assert clean_display_name("RAISING CANES 0438 07/02 PURCHASE SCOTTSDALE AZ") == "Raising Canes"
    assert clean_display_name("STEAMGAMES.COM 07/28 PURCHASE BELLEVUE WA") == "Steam"
    assert clean_display_name("Patreon* Membership 07/09 PURCHASE 833-9728766 CA") == "Patreon"
    assert clean_display_name("THE ESTANCIA CLUB, INC 07/08 PURCHASE SCOTTSDALE AZ") == "The Estancia Club"


def test_merchant_alias_does_not_apply_to_middle_purchase_duplicated_format():
    # The store-number suffix here differentiates two Target locations printed
    # back-to-back in the same raw string — the alias table only applies to
    # the simpler trailing-date-action format, not this sandwich format.
    raw = "TARGET T-0936 07/07 #000153350 PURCHASE TARGET T-0936 154 Scottsdale AZ"
    assert clean_display_name(raw) == "TARGET T-0936 154"


def test_unaliased_merchant_left_for_manual_rename():
    assert clean_display_name("GDP*Scottsdale 07/10 PURCHASE Scottsdale AZ") == "GDP*Scottsdale"


def test_strips_dangling_trailing_dash():
    raw = "COBBLESTONE AUTO SPA - 07/24 PURCHASE 602-788-9274 AZ"
    assert clean_display_name(raw) == "COBBLESTONE AUTO SPA"


def test_detects_credit_card_payment():
    assert is_credit_card_payment("Mobile Banking payment to CRD 7240 Confirmation# x688fli7z")
    assert is_credit_card_payment("Online Banking payment to CRD 7240 Confirmation# x68xh6wvh")
    assert not is_credit_card_payment("Online Banking transfer to SAV 5835 Confirmation# 5649234082")
    assert not is_credit_card_payment("ACE PARKING 3492")
