# Server Script: Elbrit All HQs
#   Script Type: API    API Method: elbrit_all_hqs    Allow Guest: off
#
# WHAT IT DOES
#   Every HQ territory, for every logged-in user. The calendar's Other Work
#   form lets anyone pick the HQ they did that work at, whichever HQ it is.
#   The normal Territory list can't serve that: a user's Territory User
#   Permissions narrow it to their own HQ(s) (a BE sees one). frappe.get_all
#   skips permission checks, so this returns the full list to everyone.
#   Only names go out -- nothing else about the territory.
#
#   HQs are the leaf territories named "HQ-..." (the same rule the app uses
#   for every other HQ picker); group territories (zones, states) are left out.
#
# REPLY: {"hqs": ["HQ-Chennai", "HQ-Coimbatore", ...]}   sorted by name

rows = frappe.get_all(
    "Territory",
    filters={"name": ["like", "HQ-%"], "is_group": 0},
    pluck="name",
    order_by="name asc",
    limit_page_length=0,
)

frappe.response["message"] = {"hqs": rows}
