"""Runs elbrit_sm_review.py against a fake `frappe` with invented rows.

    uv run --no-project --with RestrictedPython python -I src/app/review-report/server/test_elbrit_sm_review.py

The SQL itself is not run (the fake answers each block by which table its
query reads); what this checks is the script's own logic: the scope, the
Dept+HQ → seat ownership (a shared pair goes to the common manager), month
indexing, unmapped pairs, draft filtering and the doctor index.
"""
import datetime
import os
import sys

from RestrictedPython import compile_restricted_exec

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "elbrit_sm_review.py"), encoding="utf-8").read()


class D(dict):
    def __getattr__(self, k):
        return self.get(k)


PROFILES = [
    D(name="Sales", parent_role_profile=None),
    D(name="SM1-TEST", parent_role_profile="Sales", custom_department="Dept A", custom_territory="HQ-One"),
    D(name="ABM1-TEST", parent_role_profile="SM1-TEST", custom_department="Dept A", custom_territory="HQ-One"),
    D(name="BE1-TEST-A", parent_role_profile="ABM1-TEST", custom_department="Dept A", custom_territory="HQ-One"),
    D(name="BE2-TEST-B", parent_role_profile="ABM1-TEST", custom_department="Dept A", custom_territory="HQ-Two"),
    D(name="BE3-TEST-C", parent_role_profile="ABM1-TEST", custom_department="Dept A", custom_territory="HQ-Two"),
    D(name="BE9-OTHER", parent_role_profile="Sales", custom_department="Dept B", custom_territory="HQ-Nine"),
]
EMPLOYEES = [
    D(name="E1", employee_name="Sam Manager", custom_role_profile="SM1-TEST", user_id="sm@example.test", role_id=None),
    D(name="E2", employee_name="Abe Area", custom_role_profile="ABM1-TEST", user_id="abm@example.test"),
    D(name="E3", employee_name="Bea One", custom_role_profile="BE1-TEST-A", user_id="be1@example.test"),
    D(name="E4", employee_name="Vacant_BE2", custom_role_profile="BE2-TEST-B", user_id=None),
    D(name="E5", employee_name="Cy Three", custom_role_profile="BE3-TEST-C", user_id="be3@example.test"),
]


class FakeMeta:
    def has_field(self, f):
        return f in ("custom_role_profile", "custom_status")


class FakeDB:
    def __init__(self, user_profile):
        self.user_profile = user_profile
        self.queries = []

    def get_value(self, doctype, name, field):
        return self.user_profile if doctype == "User" else None

    def sql(self, q, values=None, as_dict=False):
        self.queries.append((q, values))
        # Guard what MySQL would choke on: an empty IN list.
        for k, v in (values or {}).items():
            assert not (isinstance(v, list) and not v), "empty IN list for " + k
        if "sdt.item AS it" in q:
            return [D(m="2026-08", s="BE1-TEST-A", it="ITEM A", q=40, v=4000)]
        if "sii.item_code AS it" in q:
            return [D(d="Dept A", h="HQ-One", it="ITEM A", m="2026-08", q=50, v=5000),
                    D(d="Dept A", h="HQ-One", it="ITEM C", m="2026-07", q=3, v=300)]
        if "`tabItem`" in q:
            return [D(name="ITEM A", item_name="Item A Tab", brand="BRAND A")]
        if "`tabLeave Application`" in q:
            return [D(emp="E3", f="2026-08-01", t="2026-08-03", half=0)]   # Sat, Sun, Mon -> 2 days
        if "e.custom_doctor AS doc" in q and "MIN(DATE_FORMAT" not in q:
            assert "e.custom_doctor IN %(ids)s" in q
            return [D(doc="DR-1", who="E3", m="2026-08", n=2, d="2026-08-20"), D(doc="DR-1", who="E2", m="2026-08", n=1, d="2026-08-21"),
                    D(doc="DR-1", who="E2", m="2026-07", n=3, d="2026-07-01"), D(doc="DR-1", who="E1", m="2026-06", n=1, d="2026-06-02"),
                    D(doc="DR-1", who="E5", m="2026-08", n=4, d="2026-08-05")]
        if "COUNT(*) AS planned" in q:
            assert "u.user_id = p.reference_docname" in q and values["users"]
            return [D(emp="E3", m="2026-08", planned=10, visits=8, coverage=6, days=4, jd=2),
                    D(emp="E-OUTSIDER", m="2026-08", planned=99, visits=99, coverage=9, days=9, jd=9)]
        if "MIN(DATE_FORMAT" in q:
            return [D(emp="E3", m="2026-08", n=3), D(emp="E3", m="2026-03", n=9)]
        if "`tabEvent`" in q and "e.custom_hq AS h" in q:
            return [D(emp="E3", m="2026-08", h="HQ-One", d=3, jd=1), D(emp="E2", m="2026-08", h="HQ-Two", d=2, jd=0),
                    D(emp="E-OUTSIDER", m="2026-08", h="HQ-One", d=5, jd=5)]
        if "`tabDoctor Support`" in q and "MIN(date)" in q:
            return [D(d="DR-1", f="2025-06-30")]
        if "`tabHQ Monthly Distribution`" in q:
            return [D(d="Dept A", h="HQ-One", mn="August", y="2026", v=1000),
                    D(d="Dept A", h="HQ-Two", mn="August", y="2026", v=500),
                    D(d="Dept A", h="HQ-Ghost", mn="August", y="2026", v=70),
                    D(d="Dept A", h="HQ-One", mn="April", y="2025", v=800)]
        if "`tabSales Invoice`" in q:
            return [D(d="Dept A", h="HQ-One", m="2026-08", p=900),
                    D(d="Dept A", h="HQ-Two", m="2026-08", p=600),
                    D(d="Dept A", h="HQ-One", m="2025-08", p=700)]
        if "`tabSecondary Data Table`" in q:
            return [D(m="2026-08", s="BE1-TEST-A", c="Dist X", sv=100, cv=250, sq=10, cq=25, n=3, dn=0),
                    D(m="2026-08", s="BE2-TEST-B", c="Dist X", sv=50, cv=40, sq=5, cq=4, n=2, dn=0),
                    D(m="2026-09", s="BE1-TEST-A", c="Dist Y", sv=0, cv=0, sq=0, cq=0, n=0, dn=4)]
        if "`tabSupport Items`" in q:
            assert "it.custom_role_profile" in q
            return [D(m="2026-08", s="BE1-TEST-A", d="DR-1", a=5000, q=10, n=2, dn=0),
                    D(m="2026-07", s="BE1-TEST-A", d="DR-1", a=8000, q=16, n=2, dn=0),
                    D(m="2026-01", s="BE1-TEST-A", d="DR-OLD", a=1, q=1, n=1, dn=0)]
        if "`tabRole Profile Multiselect`" in q:
            return [D(s="BE1-TEST-A", n=12)]
        if "`tabDoctor Service`" in q:
            return [D(m="2026-08", s="BE1-TEST-A", d="DR-1", n="Cash", w="Approved", a=3000, c=1),
                    D(m="2026-08", s="BE1-TEST-A", d="DR-2", n="Cash", w="Draft", a=99, c=1),
                    D(m="2026-08", s="BE1-TEST-A", d="DR-3", n="Cash", w="Rejected", a=77, c=1)]
        if "`tabLead`" in q:
            return [D(name=x, lead_name="Dr " + x, custom_doctor_code=x[3:], custom_specialty="cp",
                      custom_category="A", territory="HQ-One") for x in values["ids"]]
        raise AssertionError("unexpected query: " + q[:80])


def get_all(doctype, filters=None, fields=None, limit_page_length=None, **kw):
    if doctype == "Role Profile":
        return [D(r) for r in PROFILES]
    if doctype == "Employee":
        out = EMPLOYEES
        if isinstance(filters, dict) and filters.get("user_id"):
            out = [e for e in out if e.user_id == filters["user_id"]]
        elif isinstance(filters, list):
            seats = [f for f in filters if f[0] == "custom_role_profile"][0][2]
            out = [e for e in out if e.custom_role_profile in seats]
        return [D(e) for e in out]
    raise AssertionError(doctype)


class Utils:
    @staticmethod
    def nowdate():
        return "2026-10-09"

    @staticmethod
    def now_datetime():
        return datetime.datetime(2026, 10, 9, 10, 0, 0)

    @staticmethod
    def getdate(d):
        return d if isinstance(d, datetime.date) else datetime.date.fromisoformat(str(d)[:10])

    @staticmethod
    def add_days(d, n):
        return Utils.getdate(d) + datetime.timedelta(days=n)

    @staticmethod
    def get_last_day(d):
        y, m = int(d[:4]), int(d[5:7])
        nxt = datetime.date(y + (m == 12), m % 12 + 1, 1)
        return nxt - datetime.timedelta(days=1)


def run(user, form, profile=None):
    db = FakeDB(profile)
    frappe = D(session=D(user=user), form_dict=D(form), db=db, utils=Utils, response={},
               get_all=get_all, get_meta=lambda dt: FakeMeta())
    code = compile_restricted_exec(SRC).code
    # Plain builtins: the logic, not Frappe's guard functions, is under test
    # (RestrictedPython compiled it — that is what safe_exec rejects on).
    from RestrictedPython import safe_globals, utility_builtins
    from RestrictedPython.Eval import default_guarded_getitem, default_guarded_getiter
    from RestrictedPython.Guards import guarded_iter_unpack_sequence, full_write_guard
    g = dict(safe_globals)
    g["__builtins__"] = dict(safe_globals["__builtins__"], **utility_builtins,
                             **{"sorted": sorted, "min": min, "max": max, "sum": sum,
                                "enumerate": enumerate, "any": any, "all": all})
    g.update(frappe=frappe, _getitem_=default_guarded_getitem, _getiter_=default_guarded_getiter,
             _getattr_=getattr, _write_=lambda o: o, _iter_unpack_sequence_=guarded_iter_unpack_sequence,
             __name__="sm_review")
    exec(code, g)
    return frappe.response["message"], db


def check(cond, what):
    print(("ok   " if cond else "FAIL ") + what)
    if not cond:
        check.failed = True


check.failed = False

a, db = run("sm@example.test", {"upto": "2026-09"})
seat = {t["id"]: i for i, t in enumerate(a["tree"])}
check(a["root"] == "SM1-TEST" and a["fy"] == "2026", "scope = the caller's seat, FY 2026")
check(a["months"][0] == "2025-04" and a["months"][-1] == "2026-09", "months LY April .. upto")
check("BE9-OTHER" not in seat, "a seat outside the subtree is not read")
check(a["tree"][seat["BE2-TEST-B"]]["vacant"] == 1, "a Vacant_ holder makes the seat vacant")
check(a["tree"][seat["ABM1-TEST"]]["reportsTo"] == "SM1-TEST" and a["tree"][0]["reportsTo"] is None,
      "reportsTo inside the scope, root has none")

pairs = a["sales"]["pairs"]
one = [p for p in pairs if p["hq"] == "HQ-One"][0]
two = [p for p in pairs if p["hq"] == "HQ-Two"][0]
check(one["owner"] == seat["BE1-TEST-A"], "a pair one BE has is that BE's")
check(two["owner"] == seat["ABM1-TEST"] and len(two["seats"]) == 2,
      "a pair two BEs share goes to their common manager")
aug = a["months"].index("2026-08")
rows = {(r[0], r[1]): r for r in a["sales"]["rows"]}
check(rows[(pairs.index(one), aug)][2:] == [1000, 900], "Aug target 1000 / primary 900 on HQ-One")
check(rows[(pairs.index(one), a["months"].index("2025-08"))][3] == 700, "LY primary kept for growth")
check(rows[(pairs.index(one), a["months"].index("2025-04"))][2] == 800, "LY target month from child fiscal_year")
check([u["hq"] for u in a["sales"]["unmapped"]] == ["HQ-Ghost"], "a target pair no seat has is unmapped")

sec = a["secondary"]
check(len(sec["rows"]) == 2 and sec["distributors"] == ["Dist X"], "secondary rows per seat; a draft-only row is not a row")
check(a["meta"]["draftLines"]["secondary"] == {"2026-09": 4}, "draft lines counted per month")
sq = [q for q, v in db.queries if "`tabSecondary Data Table`" in q and "SUM(" in q][0]
sv = [v for q, v in db.queries if "`tabSecondary Data Table`" in q and "SUM(" in q][0]
check("NOT IN ('', 'Draft')" in sq and "sde.date < %(open)s" in sq, "drafts left out by default, open months only")
check(a["meta"]["open"] == "2026-09" and sv["open"] == "2026-09-01", "on the 9th last month is still open")

d = a["doctors"]
check(d["from"] == "2026-01" and len(d["rows"]) == 3, "support read from 3 months before April")
check(d["assigned"] == {str(seat["BE1-TEST-A"]): 12}, "assigned doctors per seat")
svc = a["service"]["rows"]
check(len(svc) == 2 and svc[1][4] == "draft", "service: drafts kept (all of prod FY 26-27 is Draft), rejected left out")
check(a["doctorIds"][:2] == ["DR-1", "DR-OLD"] and a["doctorInfo"][0][2] == "CP", "doctor info, specialty upper-cased")

b, _ = run("sm@example.test", {"root": "BE9-OTHER", "upto": "2026-09"})
check(b["root"] == "SM1-TEST", "a root outside the caller's subtree falls back to their seat")
c, _ = run("it@example.test", {"root": "BE9-OTHER", "parts": "sales"}, profile="IT")
check(c["root"] == "BE9-OTHER" and "secondary" not in c and c["upto"] == "2026-10", "IT may pick any seat; parts")
e, _ = run("nobody@example.test", {})
check(e["tree"] == [] and "sales" not in e, "no seat, no numbers")
w, dbw = run("sm@example.test", {"drafts": "1", "upto": "2026-09"})
sq = [q for q, v in dbw.queries if "`tabSecondary Data Table`" in q and "SUM(" in q][0]
check("Draft" not in sq, "drafts=1 keeps draft lines")

p, _ = run("sm@example.test", {"upto": "2026-09", "items": "ITEM A,ITEM B"})
seat = {t["id"]: i for i, t in enumerate(p["tree"])}
aug = p["months"].index("2026-08")
ef = p["effort"]
emp = {e[0]: i for i, e in enumerate([x for x in ef["employees"]])}
r3 = [r for r in ef["rows"] if r[1] == emp["E3"] and r[0] == aug][0]
check(r3[2:] == [10, 8, 6, 4, 2, 3, 2], "effort row: planned, visits, coverage, days, joint, new, leave (Sat counts, Sun not)")
check(not [r for r in ef["rows"] if p["months"][r[0]] == "2026-03"], "new doctors before April are not a month of the FY")
check(ef["employees"][emp["E3"]][1] == seat["BE1-TEST-A"] and "E4" not in emp, "employees map to their seat; Vacant_ holders are not people")
check(not [r for r in ef["rows"] if r[2] == 99], "a person outside the scope is dropped")
check(sorted([[ef["hqs"][h], d] for (m, e, h, d) in ef["hqDays"]]) == [["HQ-One", 3], ["HQ-Two", 2]], "days per HQ, outsiders dropped")
check([[ef["hqs"][h], d] for (m, e, h, d) in ef["jwDays"]] == [["HQ-One", 1]], "JW days = joint-visit days by HQ")
d1 = p["doctorIds"].index("DR-1")
check(p["doctorFirst"][d1] == "2025-06", "first support month for OLD / NEW")
check(p["doctorLastVisit"][d1] == ["2026-08-20", "2026-08-21", None, "2026-06-02"], "last visit per level: BE, ABM, RBM, SM")
vm = {(r[1], r[2]): r[3] for r in p["doctorVisits"] if r[0] == d1}
check(vm == {(aug, 0): 6, (aug, 1): 1, (aug - 1, 1): 3, (aug - 2, 3): 1}, "done visits per doctor, month and level (two BEs in one month add up)")
pr = p["products"]
check(pr["items"] == [["ITEM A", "Item A Tab", "BRAND A"], ["ITEM C", "ITEM C", None]], "every product, named and branded from Item")
check(pr["rows"] == [[aug, seat["BE1-TEST-A"], 0, 40, 4000]], "product secondary per seat and item")
check([r[2:] for r in pr["primary"]] == [[0, 50, 5000], [1, 3, 300]], "product primary qty and value by pair, item by code")
n, _ = run("sm@example.test", {"upto": "2026-09", "parts": "tree,doctors"})
check("effort" not in n and "products" not in n and n["doctorLastVisit"][0] is None, "parts leave effort, products and visits out")

o, _ = run("sm@example.test", {"upto": "2026-09", "parts": "tree,effort", "effort": "own"})
check([e[0] for e in o["effort"]["employees"]] == ["E1"], "effort=own counts only the root seat's own holder")
sys.exit(1 if check.failed else 0)
