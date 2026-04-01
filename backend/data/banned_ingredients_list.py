"""
FSSAI Banned / Restricted Ingredients List
===========================================
MAINTAINABLE — update this list when FSSAI regulations change.

Each entry has:
  - name:       canonical name used for display
  - keywords:   list of strings to match against raw ingredient text (lowercase)
  - reason:     short reason shown to the user (max 8 words)
  - ins_codes:  INS/E codes associated with this ingredient (optional)

Matching is case-insensitive substring match on raw_text.
Food preservatives are NOT included here — they are handled separately.
"""

FSSAI_BANNED_INGREDIENTS: list[dict] = [
    # ── ADD ENTRIES BELOW ─────────────────────────────────────────────────────
    # Format:
    # {
    #   "name": "Display Name",
    #   "keywords": ["keyword1", "keyword2"],
    #   "reason": "Banned under FSSAI regulations",
    #   "ins_codes": ["INS 924"],   # optional
    # },
    # ─────────────────────────────────────────────────────────────────────────
    # Example (uncomment when confirmed):
    # {
    #   "name": "Potassium Bromate",
    #   "keywords": ["potassium bromate"],
    #   "reason": "Banned in India - potential carcinogen",
    #   "ins_codes": ["INS 924"],
    # },
]
