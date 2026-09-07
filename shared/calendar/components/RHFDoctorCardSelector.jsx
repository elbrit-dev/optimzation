import { useEffect, useMemo, useState } from "react";
import { Check, MapPin, X } from "lucide-react";
import { Input } from "@calendar/components/ui/input";
import { Button } from "@calendar/components/ui/button";
import { Checkbox } from "@calendar/components/ui/checkbox";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@calendar/components/ui/popover";
import { cn } from "@calendar/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@calendar/components/ui/select";
import { searchDoctors } from "@calendar/components/calendar/module/event/services/master-data.service";

export function RHFDoctorCardSelector({
    value,
    onChange,hqTerritory,
    options = [],
    multiple = false,
    tagsDisplay = true,
}) {
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("ALL");
    // Empty = every city, so the filter starts out of the way.
    const [selectedCities, setSelectedCities] = useState([]);
    const [cityFilterOpen, setCityFilterOpen] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(false);
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
       Filtering (optimized slightly)
    ===================================================== */
    /* =====================================================
       City filter options

       Built from the doctors that came back for this HQ (before the city
       filter is applied, so choosing a city never removes the other cities
       from the list you are choosing from).
    ===================================================== */
    const cityOptions = useMemo(() => {
        // ERP casing is inconsistent ("Vellore" next to "walajapet"), so cities
        // are grouped case-insensitively and shown with the first spelling seen
        // — otherwise the same town appears twice in the filter.
        const byKey = new Map();

        searchResults.forEach((doc) => {
            const city = typeof doc.city === "string" ? doc.city.trim() : "";
            if (!city) return;

            const key = city.toLowerCase();
            if (!byKey.has(key)) byKey.set(key, city);
        });

        return Array.from(byKey.values()).sort((left, right) =>
            left.localeCompare(right)
        );
    }, [searchResults]);

    // A city that disappears from the list (new HQ, new search) must not keep
    // filtering invisibly.
    useEffect(() => {
        setSelectedCities((current) => {
            const next = current.filter((city) => cityOptions.includes(city));
            return next.length === current.length ? current : next;
        });
    }, [cityOptions]);

    const toggleCity = (city) => {
        setSelectedCities((current) =>
            current.includes(city)
                ? current.filter((value) => value !== city)
                : [...current, city]
        );
    };

    const filteredDoctors = useMemo(() => {
        return searchResults.filter((doc) => {
            const matchesSpeciality =
                category === "ALL" ||
                doc.fsl_speciality__name === category;

            const docCity = String(doc.city ?? "").trim().toLowerCase();
            const matchesCity =
                !selectedCities.length ||
                selectedCities.some(
                    (city) => city.toLowerCase() === docCity
                );

            return matchesSpeciality && matchesCity;
        });
    }, [searchResults, category, selectedCities]);
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

    /* =====================================================
       Speciality filter options
    ===================================================== */
    const specialityOptions = useMemo(() => {
        const unique = new Set(
            options
                .map((d) => d.fsl_speciality__name)
                .filter(Boolean)
        );
        return ["ALL", ...Array.from(unique)];
    }, [options]);

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
         SEARCH + SPECIALITY + CITY FILTER
      ============================================ */}
            <div className="flex flex-wrap gap-2 sm:gap-3">
                <Input
                    placeholder="Search Doctor or Code"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="min-w-[10rem] flex-1"
                />

                <Select
                    value={category}
                    onValueChange={setCategory}
                >
                    <SelectTrigger className="w-[7.5rem] shrink-0 sm:w-[180px]">
                        <SelectValue placeholder="Speciality" />
                    </SelectTrigger>

                    <SelectContent className="max-h-[200px] overflow-y-auto">
                        {specialityOptions.map((spec) => (
                            <SelectItem key={spec} value={spec}>
                                {spec}
                            </SelectItem>
                        ))}
                    </SelectContent>

                </Select>

                {/* City: several cities can be relevant on one HQ round, so this
                    one is multi-select. A Radix Select can't do that, hence a
                    popover of checkboxes. */}
                <Popover open={cityFilterOpen} onOpenChange={setCityFilterOpen}>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="outline"
                            className="w-[7.5rem] shrink-0 justify-between font-normal sm:w-[180px]"
                            disabled={!cityOptions.length}
                            title={
                                cityOptions.length
                                    ? "Filter by city"
                                    : "No city on these doctors"
                            }
                        >
                            <span className="flex min-w-0 items-center gap-1.5">
                                <MapPin className="size-4 shrink-0 opacity-60" />
                                <span className="truncate">
                                    {selectedCities.length === 0
                                        ? "All cities"
                                        : selectedCities.length === 1
                                        ? selectedCities[0]
                                        : `${selectedCities.length} cities`}
                                </span>
                            </span>
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
                        <div className="flex items-center justify-between border-b px-3 py-2">
                            <p className="text-sm font-medium">City</p>
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                disabled={!selectedCities.length}
                                onClick={() => setSelectedCities([])}
                            >
                                Clear
                            </Button>
                        </div>

                        <div className="max-h-60 overflow-y-auto overscroll-contain p-1">
                            {cityOptions.map((city) => {
                                const checked = selectedCities.includes(city);

                                return (
                                    <label
                                        key={city}
                                        className="flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                                    >
                                        <Checkbox
                                            checked={checked}
                                            onCheckedChange={() => toggleCity(city)}
                                        />
                                        <span className="truncate">{city}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </PopoverContent>
                </Popover>
            </div>

            {/* ============================================
         DOCTOR CARDS
      ============================================ */}
            <div className="space-y-3 max-h-[340px] overflow-y-auto">
                {filteredDoctors.map((doc) => {
                    const isSelected = selectedIds.includes(doc.value);

                    return (
                        <div
                            key={doc.value}
                            onClick={() => toggleSelect(doc)}
                            className={cn(
                                "cursor-pointer rounded-xl border p-4 transition-all",
                                isSelected
                                    ? "border-primary bg-primary/5"
                                    : "hover:border-primary/40"
                            )}
                        >
                            <div className="flex justify-between">

                                {/* ================= LEFT SECTION ================= */}
                                <div className="space-y-1">

                                    {/* Name */}
                                    <p className="font-medium">
                                        {doc.label}
                                    </p>

                                    {/* Speciality */}
                                    {doc.fsl_speciality__name && (
                                        <p className="text-sm text-muted-foreground">
                                            {doc.fsl_speciality__name}
                                        </p>
                                    )}

                                    {/* Categories */}
                                    {(doc.fsl_category1__name ||
                                        doc.fsl_category2__name ||
                                        doc.fsl_category3__name) && (
                                            <p className="text-xs text-muted-foreground">
                                                {doc.fsl_category1__name && (
                                                    <>C1 - {doc.fsl_category1__name}</>
                                                )}
                                                {doc.fsl_category2__name && (
                                                    <> | C2 - {doc.fsl_category2__name}</>
                                                )}
                                                {doc.fsl_category3__name && (
                                                    <> | C3 - {doc.fsl_category3__name}</>
                                                )}
                                            </p>
                                        )}

                                </div>

                                {/* ================= RIGHT SECTION ================= */}
                                <div className="text-right space-y-1">

                                    {/* Code */}
                                    {doc.code && (
                                        <p className="text-blue-600 text-sm font-medium">
                                            {doc.code}
                                        </p>
                                    )}

                                    {/* Territory */}
                                    {doc.territory__name && (
                                        <p className="text-xs text-muted-foreground">
                                            {doc.territory__name}
                                        </p>
                                    )}

                                    {/* Checkmark */}
                                    {isSelected && (
                                        <Check className="h-4 w-4 text-green-600 ml-auto" />
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
