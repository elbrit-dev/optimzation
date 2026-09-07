import { useEffect, useMemo, useState } from "react";
import {
    ArrowUpDown,
    Check,
    Clock3,
    Loader2,
    Search,
    SlidersHorizontal,
    X,
} from "lucide-react";
import { differenceInCalendarDays, format } from "date-fns";
import { Input } from "@calendar/components/ui/input";
import { Button } from "@calendar/components/ui/button";
import { Checkbox } from "@calendar/components/ui/checkbox";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@calendar/components/ui/popover";
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@calendar/components/ui/tabs";
import { cn } from "@calendar/lib/utils";
import { useCalendar } from "@calendar/components/calendar/contexts/calendar-context";
import { buildLastVisitByDoctor } from "@calendar/lib/calendar/doctorVisitHistory";
import { searchDoctors } from "@calendar/components/calendar/module/event/services/master-data.service";

/* =====================================================
   FACETS

   One definition per filter so the search bar stays the only always-visible
   control: everything else lives behind the filter button as a tab. Adding a
   filter later means adding an entry here, not another control in the row.

   `valuesOf` returns a list because a doctor can carry several categories; a
   doctor matches a facet when any of its values is selected.
===================================================== */
const FACETS = [
    {
        key: "speciality",
        label: "Speciality",
        valuesOf: (doctor) => [doctor.fsl_speciality__name],
    },
    {
        key: "category",
        label: "Category",
        valuesOf: (doctor) => [
            doctor.fsl_category__name,
            doctor.fsl_category1__name,
            doctor.fsl_category2__name,
            doctor.fsl_category3__name,
        ],
    },
    {
        key: "city",
        label: "City",
        valuesOf: (doctor) => [doctor.city],
    },
];

const EMPTY_SELECTION = { speciality: [], category: [], city: [] };

// Every doctor in ERP is named "Dr <name>", so comparing the raw label would
// sort every row on the same honorific. Dropping it puts the actual name first
// — and keeps the order right for any row that happens to be stored without it.
// The word boundary matters: it must not bite into a name like "Drake".
function doctorSortName(doctor) {
    return String(doctor?.label ?? "")
        .replace(/^\s*dr\.?\s+/i, "")
        .trim();
}

function compareByName(left, right) {
    return doctorSortName(left.doctor).localeCompare(
        doctorSortName(right.doctor),
        undefined,
        // Case and accents must not split the alphabet into separate runs, and
        // a trailing "Dr Kumar 2" should follow "Dr Kumar 1", not precede it.
        { sensitivity: "base", numeric: true }
    );
}

/* =====================================================
   SORT ORDERS

   Same shape as FACETS: adding an order is one entry here, not another control
   in the row. `compare` runs over { doctor, lastVisit } pairs — lastVisit is the
   timestamp of the last recorded visit, or null when there is none.
===================================================== */
const SORT_OPTIONS = [
    {
        key: "default",
        label: "Default order",
        description: "As returned for this HQ",
        compare: null,
    },
    {
        key: "visit-latest",
        label: "Recently visited",
        description: "Most recent visit first; never visited last",
        compare: (left, right) => {
            if (left.lastVisit == null && right.lastVisit == null) return 0;
            if (left.lastVisit == null) return 1;
            if (right.lastVisit == null) return -1;
            return right.lastVisit - left.lastVisit;
        },
    },
    {
        key: "visit-oldest",
        label: "Longest since visit",
        // A doctor with no visit on record is the most overdue of all, so they
        // lead rather than trailing off the end of the list.
        description: "Never visited first, then the oldest visit",
        compare: (left, right) => {
            if (left.lastVisit == null && right.lastVisit == null) return 0;
            if (left.lastVisit == null) return -1;
            if (right.lastVisit == null) return 1;
            return left.lastVisit - right.lastVisit;
        },
    },
    {
        key: "name-asc",
        label: "Name A–Z",
        description: "Alphabetical by doctor name",
        compare: compareByName,
    },
    {
        key: "name-desc",
        label: "Name Z–A",
        description: "Reverse alphabetical by doctor name",
        compare: (left, right) => compareByName(right, left),
    },
];

const DEFAULT_SORT_KEY = SORT_OPTIONS[0].key;

function normalizeValue(value) {
    return typeof value === "string" ? value.trim() : "";
}

/* =====================================================
   Option lists per facet

   ERP casing is inconsistent ("Vellore" next to "walajapet"), so values are
   grouped case-insensitively and shown with the first spelling seen — otherwise
   the same town appears twice in the filter.
===================================================== */
function buildFacetOptions(doctors) {
    return FACETS.reduce((options, facet) => {
        const byKey = new Map();

        doctors.forEach((doctor) => {
            facet.valuesOf(doctor).forEach((raw) => {
                const value = normalizeValue(raw);
                if (!value) return;

                const key = value.toLowerCase();
                if (!byKey.has(key)) byKey.set(key, value);
            });
        });

        options[facet.key] = Array.from(byKey.values()).sort((left, right) =>
            left.localeCompare(right)
        );

        return options;
    }, {});
}

function matchesFacet(facet, doctor, selectedValues) {
    if (!selectedValues.length) return true;

    const doctorValues = facet
        .valuesOf(doctor)
        .map((value) => normalizeValue(value).toLowerCase())
        .filter(Boolean);

    return selectedValues.some((value) =>
        doctorValues.includes(value.toLowerCase())
    );
}

/**
 * Last visit for the card corner: `short` has to survive next to the doctor
 * name on a phone, so the full sentence goes in the tooltip instead.
 */
function describeLastVisit(timestamp) {
    if (!timestamp) {
        return { short: "No visit", full: "No visit recorded", isRecent: false };
    }

    const visitedOn = new Date(timestamp);
    const daysAgo = differenceInCalendarDays(new Date(), visitedOn);
    // A visit in the last week is the one worth flagging: it is the case where
    // picking this doctor again is probably a mistake.
    const isRecent = daysAgo <= 7;
    const fullDate = format(visitedOn, "d MMM yyyy");

    if (daysAgo <= 0) {
        return { short: "Today", full: `Visited today (${fullDate})`, isRecent };
    }

    if (daysAgo === 1) {
        return {
            short: "Yesterday",
            full: `Visited yesterday (${fullDate})`,
            isRecent,
        };
    }

    return {
        // The year is only worth the space once the visit is old enough that
        // "12 Aug" alone would be ambiguous.
        short: `${format(visitedOn, daysAgo > 300 ? "d MMM yy" : "d MMM")} · ${daysAgo}d`,
        full: `Last visit ${fullDate} · ${daysAgo} days ago`,
        isRecent,
    };
}

export function RHFDoctorCardSelector({
    value,
    onChange,
    hqTerritory,
    options = [],
    multiple = false,
    tagsDisplay = true,
}) {
    const [search, setSearch] = useState("");
    // Empty = no filter on that facet, so filters start out of the way.
    const [selectedFacets, setSelectedFacets] = useState(EMPTY_SELECTION);
    const [sortKey, setSortKey] = useState(DEFAULT_SORT_KEY);
    const [sortOpen, setSortOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(FACETS[0].key);
    // Narrows the option list of whichever tab is open — a territory can carry
    // a few hundred cities, which is far too many to scroll through.
    const [optionSearch, setOptionSearch] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);

    // The dialog lives inside the calendar, so the events it already holds are
    // the visit history — no extra ERP round trip to show a last-visit date.
    const { allEvents } = useCalendar();
    const lastVisitByDoctor = useMemo(
        () => buildLastVisitByDoctor(allEvents ?? []),
        [allEvents]
    );

    useEffect(() => {
        setSearchResults(options);
    }, [options]);

    useEffect(() => {
        const timeout = setTimeout(async () => {
            const term = search.trim();

            // Show territory doctors initially
            if (!term) {
                setSearchResults(options);
                return;
            }

            setLoading(true);

            try {
                const doctors = await searchDoctors({
                    search: term,
                    territory: hqTerritory,
                });

                setSearchResults(doctors);
            } finally {
                setLoading(false);
            }
        }, 400);

        return () => clearTimeout(timeout);
    }, [search, hqTerritory, options]);

    /* =====================================================
       Normalize value → selected ID array (unchanged logic)
    ===================================================== */
    const selectedIds = useMemo(() => {
        if (!value) return [];
        const arr = multiple ? (Array.isArray(value) ? value : []) : [value];

        return arr
            .map((v) => (typeof v === "string" ? v : v?.value))
            .filter(Boolean);
    }, [value, multiple]);

    const selectedOptions = useMemo(() => {
        if (!selectedIds.length) return [];
        return selectedIds
            .map((id) => options.find((o) => o.value === id))
            .filter(Boolean);
    }, [selectedIds, options]);

    const hasSelection = selectedOptions.length > 0;

    /* =====================================================
       Remove selection (unchanged logic)
    ===================================================== */
    const handleRemove = (id) => {
        if (!multiple) {
            onChange(undefined);
        } else {
            onChange(selectedIds.filter((v) => v !== id));
        }
    };

    /* =====================================================
       Filter options, built from the doctors that came back for this HQ
       (before the facets are applied, so choosing a city never removes the
       other cities from the list you are choosing from).
    ===================================================== */
    const facetOptions = useMemo(
        () => buildFacetOptions(searchResults),
        [searchResults]
    );

    const availableFacets = useMemo(
        () => FACETS.filter((facet) => facetOptions[facet.key]?.length),
        [facetOptions]
    );

    // A value that disappears from the list (new HQ, new search) must not keep
    // filtering invisibly.
    useEffect(() => {
        setSelectedFacets((current) => {
            let changed = false;

            const next = FACETS.reduce((accumulator, facet) => {
                const allowed = facetOptions[facet.key] ?? [];
                const kept = (current[facet.key] ?? []).filter((value) =>
                    allowed.includes(value)
                );

                if (kept.length !== (current[facet.key] ?? []).length) {
                    changed = true;
                }

                accumulator[facet.key] = kept;
                return accumulator;
            }, {});

            return changed ? next : current;
        });
    }, [facetOptions]);

    // Keep the open tab on something that still has options to choose from.
    useEffect(() => {
        if (!availableFacets.length) return;
        if (availableFacets.some((facet) => facet.key === activeTab)) return;

        setActiveTab(availableFacets[0].key);
    }, [availableFacets, activeTab]);

    // The option search belongs to the tab it was typed in, so switching tabs
    // (or reopening the panel) starts from the full list again.
    const handleTabChange = (nextTab) => {
        setActiveTab(nextTab);
        setOptionSearch("");
    };

    const handleFilterOpenChange = (nextOpen) => {
        setFilterOpen(nextOpen);
        if (!nextOpen) setOptionSearch("");
    };

    const visibleFacetOptions = useMemo(() => {
        const query = optionSearch.trim().toLowerCase();
        const allOptions = facetOptions[activeTab] ?? [];

        if (!query) return allOptions;

        return allOptions.filter((option) =>
            option.toLowerCase().includes(query)
        );
    }, [facetOptions, activeTab, optionSearch]);

    const toggleFacetValue = (facetKey, facetValue) => {
        setSelectedFacets((current) => {
            const selected = current[facetKey] ?? [];

            return {
                ...current,
                [facetKey]: selected.includes(facetValue)
                    ? selected.filter((entry) => entry !== facetValue)
                    : [...selected, facetValue],
            };
        });
    };

    const clearFacet = (facetKey) => {
        setSelectedFacets((current) => ({ ...current, [facetKey]: [] }));
    };

    const clearAllFacets = () => setSelectedFacets(EMPTY_SELECTION);

    const activeFilters = useMemo(
        () =>
            FACETS.flatMap((facet) =>
                (selectedFacets[facet.key] ?? []).map((value) => ({
                    facetKey: facet.key,
                    facetLabel: facet.label,
                    value,
                }))
            ),
        [selectedFacets]
    );

    const filteredDoctors = useMemo(() => {
        return searchResults.filter((doctor) =>
            FACETS.every((facet) =>
                matchesFacet(facet, doctor, selectedFacets[facet.key] ?? [])
            )
        );
    }, [searchResults, selectedFacets]);

    const activeSort = useMemo(
        () =>
            SORT_OPTIONS.find((option) => option.key === sortKey) ??
            SORT_OPTIONS[0],
        [sortKey]
    );

    /* =====================================================
       Sorting

       Applied after filtering so the order always describes what is on screen.
       Sort keeps its own state rather than living in the filter panel: it does
       not narrow the list, and a count badge on the filter button that included
       it would be misleading.
    ===================================================== */
    const visibleDoctors = useMemo(() => {
        if (!activeSort.compare) return filteredDoctors;

        return filteredDoctors
            .map((doctor) => ({
                doctor,
                lastVisit: lastVisitByDoctor.get(String(doctor.value)) ?? null,
            }))
            // Array#sort is stable, so doctors that compare equal keep the order
            // ERP returned them in.
            .sort(activeSort.compare)
            .map((entry) => entry.doctor);
    }, [activeSort, filteredDoctors, lastVisitByDoctor]);

    /* =====================================================
       Toggle select (unchanged logic)
    ===================================================== */
    const toggleSelect = (doctor) => {
        if (!multiple) {
            onChange(doctor.value);
            return;
        }

        if (selectedIds.includes(doctor.value)) {
            onChange(selectedIds.filter((id) => id !== doctor.value));
        } else {
            onChange([...selectedIds, doctor.value]);
        }
    };

    return (
        <div className="space-y-3">

            {/* ============================================
         SELECTED TAGS (TOP)
      ============================================ */}
            {hasSelection && tagsDisplay && (
                <div className="flex flex-wrap gap-2">
                    {selectedOptions.map((opt) => (
                        <span
                            key={opt.value}
                            className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm"
                        >
                            {opt.label}
                            <button
                                type="button"
                                onClick={() => handleRemove(opt.value)}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <X size={14} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            {/* ============================================
         SEARCH + FILTER BUTTON

         One search field and one filter button, so the row never has to
         reflow on a phone. Speciality, category and city moved into the
         panel behind the button.
      ============================================ */}
            <div className="flex items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search doctor or code"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 pr-9"
                    />
                    {loading ? (
                        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    ) : search ? (
                        <button
                            type="button"
                            onClick={() => setSearch("")}
                            aria-label="Clear search"
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                            <X className="size-3.5" />
                        </button>
                    ) : null}
                </div>

                <Popover open={filterOpen} onOpenChange={handleFilterOpenChange}>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={
                                activeFilters.length
                                    ? `Filters (${activeFilters.length} active)`
                                    : "Filters"
                            }
                            title="Filters"
                            disabled={!availableFacets.length}
                            className={cn(
                                "relative size-9 shrink-0",
                                activeFilters.length &&
                                    "border-primary text-primary"
                            )}
                        >
                            <SlidersHorizontal className="size-4" />
                            {activeFilters.length ? (
                                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                                    {activeFilters.length}
                                </span>
                            ) : null}
                        </Button>
                    </PopoverTrigger>

                    <PopoverContent
                        align="end"
                        className="w-[min(20rem,calc(100vw-2rem))] p-0"
                        // Portalled out of the dialog, so the dialog's scroll
                        // lock cancels touch scrolling here unless the event is
                        // stopped before it reaches the document listener.
                        onWheelCapture={(event) => event.stopPropagation()}
                        onTouchMoveCapture={(event) => event.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b px-3 py-2">
                            <p className="text-sm font-medium">Filters</p>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={!activeFilters.length}
                                onClick={clearAllFacets}
                            >
                                Clear all
                            </Button>
                        </div>

                        <Tabs
                            value={activeTab}
                            onValueChange={handleTabChange}
                            className="w-full"
                        >
                            <div className="px-3 pt-3">
                                <TabsList
                                    className="grid w-full"
                                    style={{
                                        gridTemplateColumns: `repeat(${availableFacets.length}, minmax(0, 1fr))`,
                                    }}
                                >
                                    {availableFacets.map((facet) => {
                                        const count =
                                            selectedFacets[facet.key]?.length ?? 0;

                                        return (
                                            <TabsTrigger
                                                key={facet.key}
                                                value={facet.key}
                                                className="min-w-0 px-2 text-xs"
                                            >
                                                <span className="truncate">
                                                    {facet.label}
                                                </span>
                                                {count ? (
                                                    <span className="ml-1 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                                                        {count}
                                                    </span>
                                                ) : null}
                                            </TabsTrigger>
                                        );
                                    })}
                                </TabsList>
                            </div>

                            {availableFacets.map((facet) => {
                                const selected = selectedFacets[facet.key] ?? [];

                                return (
                                    <TabsContent
                                        key={facet.key}
                                        value={facet.key}
                                        className="mt-0"
                                    >
                                        <div className="px-3 pt-2">
                                            <div className="relative">
                                                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                                                <Input
                                                    value={optionSearch}
                                                    onChange={(event) =>
                                                        setOptionSearch(
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder={`Search ${facet.label.toLowerCase()}`}
                                                    className="h-8 pl-8 pr-8 text-sm"
                                                />
                                                {optionSearch ? (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setOptionSearch("")
                                                        }
                                                        aria-label="Clear option search"
                                                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                    >
                                                        <X className="size-3" />
                                                    </button>
                                                ) : null}
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
                                            <span className="truncate">
                                                {selected.length
                                                    ? `${selected.length} selected`
                                                    : `All ${facet.label.toLowerCase()}`}
                                                {optionSearch
                                                    ? ` · ${visibleFacetOptions.length} shown`
                                                    : ""}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="h-6 shrink-0 px-2 text-xs"
                                                disabled={!selected.length}
                                                onClick={() => clearFacet(facet.key)}
                                            >
                                                Clear
                                            </Button>
                                        </div>

                                        <div className="max-h-60 overflow-y-auto overscroll-contain border-t p-1">
                                            {visibleFacetOptions.length ? (
                                                visibleFacetOptions.map(
                                                    (facetValue) => (
                                                        <label
                                                            key={facetValue}
                                                            className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                                                        >
                                                            <Checkbox
                                                                checked={selected.includes(
                                                                    facetValue
                                                                )}
                                                                onCheckedChange={() =>
                                                                    toggleFacetValue(
                                                                        facet.key,
                                                                        facetValue
                                                                    )
                                                                }
                                                            />
                                                            <span className="truncate">
                                                                {facetValue}
                                                            </span>
                                                        </label>
                                                    )
                                                )
                                            ) : (
                                                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                                                    No {facet.label.toLowerCase()}{" "}
                                                    matches “{optionSearch}”
                                                </p>
                                            )}
                                        </div>
                                    </TabsContent>
                                );
                            })}
                        </Tabs>

                        <div className="border-t p-2">
                            <Button
                                type="button"
                                className="w-full"
                                size="sm"
                                onClick={() => setFilterOpen(false)}
                            >
                                Show {filteredDoctors.length}{" "}
                                {filteredDoctors.length === 1
                                    ? "doctor"
                                    : "doctors"}
                            </Button>
                        </div>
                    </PopoverContent>
                </Popover>

                {/* ---------- SORT ---------- */}
                <Popover open={sortOpen} onOpenChange={setSortOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label={`Sort: ${activeSort.label}`}
                            title={`Sort: ${activeSort.label}`}
                            className={cn(
                                "size-9 shrink-0",
                                activeSort.compare && "border-primary text-primary"
                            )}
                        >
                            <ArrowUpDown className="size-4" />
                        </Button>
                    </PopoverTrigger>

                    <PopoverContent
                        align="end"
                        className="w-[min(16rem,calc(100vw-2rem))] p-0"
                        // Portalled out of the dialog, so the dialog's scroll
                        // lock cancels touch scrolling here unless the event is
                        // stopped before it reaches the document listener.
                        onWheelCapture={(event) => event.stopPropagation()}
                        onTouchMoveCapture={(event) => event.stopPropagation()}
                    >
                        <p className="border-b px-3 py-2 text-sm font-medium">
                            Sort by
                        </p>

                        <div className="max-h-60 overflow-y-auto overscroll-contain p-1">
                            {SORT_OPTIONS.map((option) => {
                                const isActive = option.key === sortKey;

                                return (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => {
                                            setSortKey(option.key);
                                            setSortOpen(false);
                                        }}
                                        className={cn(
                                            "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                                            isActive && "bg-muted"
                                        )}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">
                                                {option.label}
                                            </span>
                                            <span className="block text-xs text-muted-foreground">
                                                {option.description}
                                            </span>
                                        </span>

                                        {isActive ? (
                                            <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                                        ) : null}
                                    </button>
                                );
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* ============================================
         ACTIVE FILTER CHIPS

         What is filtering the list stays visible after the panel closes,
         and each chip removes exactly one value.
      ============================================ */}
            {activeFilters.length ? (
                <div className="flex flex-wrap items-center gap-1.5">
                    {activeFilters.map(({ facetKey, facetLabel, value: facetValue }) => (
                        <button
                            key={`${facetKey}-${facetValue}`}
                            type="button"
                            onClick={() => toggleFacetValue(facetKey, facetValue)}
                            title={`Remove ${facetLabel} filter`}
                            className="flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/5 py-1 pl-2.5 pr-1.5 text-xs text-primary"
                        >
                            <span className="truncate">{facetValue}</span>
                            <X className="size-3 shrink-0" />
                        </button>
                    ))}

                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={clearAllFacets}
                    >
                        Clear all
                    </Button>
                </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
                {filteredDoctors.length}{" "}
                {filteredDoctors.length === 1 ? "doctor" : "doctors"}
                {searchResults.length !== filteredDoctors.length
                    ? ` of ${searchResults.length}`
                    : ""}
                {selectedIds.length ? ` · ${selectedIds.length} selected` : ""}
                {activeSort.compare ? ` · ${activeSort.label}` : ""}
            </p>

            {/* ============================================
         DOCTOR CARDS
      ============================================ */}
            <div className="max-h-[340px] space-y-3 overflow-y-auto overscroll-contain">
                {!filteredDoctors.length ? (
                    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                        {loading
                            ? "Searching doctors…"
                            : searchResults.length
                            ? "No doctor matches these filters."
                            : "No doctors found for this HQ."}
                    </div>
                ) : null}

                {visibleDoctors.map((doc) => {
                    const isSelected = selectedIds.includes(doc.value);
                    const lastVisit = describeLastVisit(
                        lastVisitByDoctor.get(String(doc.value))
                    );
                    // Code, speciality, city and HQ share one line so the card
                    // stays three rows tall.
                    const metaDetails = [
                        doc.fsl_speciality__name,
                        doc.city,
                        doc.territory__name,
                    ]
                        .filter(Boolean)
                        .join(" · ");
                    const categories = [
                        doc.fsl_category__name,
                        doc.fsl_category1__name &&
                            `C1 ${doc.fsl_category1__name}`,
                        doc.fsl_category2__name &&
                            `C2 ${doc.fsl_category2__name}`,
                        doc.fsl_category3__name &&
                            `C3 ${doc.fsl_category3__name}`,
                    ].filter(Boolean);

                    return (
                        <div
                            key={doc.value}
                            role="checkbox"
                            aria-checked={isSelected}
                            onClick={() => toggleSelect(doc)}
                            className={cn(
                                "cursor-pointer rounded-xl border p-3 transition-all sm:p-4",
                                isSelected
                                    ? "border-primary bg-primary/5"
                                    : "hover:border-primary/40"
                            )}
                        >
                            {/* ---------- NAME + LAST VISIT ---------- */}
                            <div className="flex items-start gap-2">
                                <p className="min-w-0 flex-1 font-medium leading-tight">
                                    {doc.label}
                                </p>

                                <div className="flex shrink-0 items-center gap-1.5">
                                    <span
                                        title={lastVisit.full}
                                        className={cn(
                                            "flex items-center gap-1 whitespace-nowrap text-[11px]",
                                            lastVisit.isRecent
                                                ? "font-medium text-emerald-600"
                                                : "text-muted-foreground"
                                        )}
                                    >
                                        <Clock3 className="size-3 shrink-0" />
                                        {lastVisit.short}
                                    </span>
                                    {isSelected && (
                                        <Check className="size-4 text-green-600" />
                                    )}
                                </div>
                            </div>

                            {/* ---------- CODE · SPECIALITY · CITY · HQ ---------- */}
                            <p className="mt-1 truncate text-xs text-muted-foreground">
                                {doc.code ? (
                                    <span className="font-medium text-blue-600">
                                        {doc.code}
                                    </span>
                                ) : null}
                                {doc.code && metaDetails ? " · " : ""}
                                {metaDetails}
                            </p>

                            {/* ---------- CATEGORIES ---------- */}
                            {categories.length ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {categories.map((category) => (
                                        <span
                                            key={category}
                                            className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
                                        >
                                            {category}
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
