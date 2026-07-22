import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { Button } from "@calendar/components/ui/button";
import { Checkbox } from "@calendar/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@calendar/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@calendar/components/ui/popover";

/* =====================================================
   RHF COMBOBOX (ID-BASED, LEGACY SAFE)
===================================================== */
export function RHFCombobox({
  value,
  onChange,
  options = [],
  placeholder = "Select option",
  searchPlaceholder,
  disabled = false,
  selectionLabel = "item",
  multiple = false,
  tagsDisplay = true,
  onSearch,
  loading = false,
  filters,
}) {
  const [open, setOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState("");
  const lastSearchRef = useRef("");
  const [activeFilters, setActiveFilters] = useState({});

  useEffect(() => {
    if (!onSearch || !open) return;

    const timeoutId = setTimeout(() => {
      const normalizedSearch = search.trim();
      if (!normalizedSearch) {
        lastSearchRef.current = "";
      }
      if (normalizedSearch === lastSearchRef.current) return;
      lastSearchRef.current = normalizedSearch;
      onSearch(normalizedSearch);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [onSearch, open, search]);

  useEffect(() => {
    if (open) return;
    lastSearchRef.current = "";
  }, [open]);

  /* ---------------------------------------
     Normalize incoming value → IDs (DISPLAY ONLY)
     Supports:
       - "ID"
       - { value, label }
       - ["ID"]
       - [{ value, label }]
  --------------------------------------- */
  const selectedIds = useMemo(() => {
    if (!value) return [];

    const arr = multiple ? (Array.isArray(value) ? value : []) : [value];

    return arr
      .map((v) => {
        if (typeof v === "string") return v;
        if (typeof v === "object" && v?.value) return v.value;
        return null;
      })
      .filter(Boolean);
  }, [value, multiple]);

  /* ---------------------------------------
     Resolve options from IDs
  --------------------------------------- */
  const selectedOptions = useMemo(() => {
    if (!selectedIds.length) return [];
    return selectedIds
      .map((id) => options.find((o) => o.value === id))
      .filter(Boolean);
  }, [selectedIds, options]);

  const filterFacets = useMemo(() => filters?.facets ?? [], [filters]);
  const activeFilterCount = Object.values(activeFilters).reduce(
    (count, selectedValues) =>
      count + (Array.isArray(selectedValues) ? selectedValues.length : 0),
    0
  );

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return options.filter((opt) => {
      const matchesQuery =
        !query ||
        [
          opt.label,
          opt.value,
          opt.email,
          opt.role,
          opt.designation,
          opt.department,
        ]
          .filter(Boolean)
          .some((fieldValue) =>
            String(fieldValue).toLowerCase().includes(query)
          );

      if (!matchesQuery) {
        return false;
      }

      return filterFacets.every((facet) => {
        const selectedValues = activeFilters[facet.id] ?? [];

        if (!selectedValues.length) {
          return true;
        }

        const facetValue = facet.getValue(opt);
        return facetValue
          ? selectedValues.includes(String(facetValue))
          : false;
      });
    });
  }, [activeFilters, filterFacets, options, search]);

  const hasSelection = selectedOptions.length > 0;

  /* ---------------------------------------
     Selection helpers (ID-ONLY OUTPUT)
  --------------------------------------- */
  const isSelected = (opt) => selectedIds.includes(opt.value);

  const handleSelect = (opt) => {
    if (!multiple) {
      onChange(opt.value);
      setOpen(false);
      return;
    }
  
    if (selectedIds.includes(opt.value)) {
      onChange(selectedIds.filter((v) => v !== opt.value));
    } else {
      onChange([...selectedIds, opt.value]);
      setOpen(false);
    }
  };

  const handleRemove = (optValue) => {
    if (!multiple) {
      onChange(undefined);
    } else {
      onChange(selectedIds.filter((v) => v !== optValue));
    }
  };

  const toggleFilterValue = (facetId, value) => {
    setActiveFilters((current) => {
      const currentValues = current[facetId] ?? [];
      const nextValues = currentValues.includes(value)
        ? currentValues.filter((item) => item !== value)
        : [...currentValues, value];

      return {
        ...current,
        [facetId]: nextValues,
      };
    });
  };

  const clearFilters = () => {
    setActiveFilters({});
  };

  const stopWheelPropagation = (event) => {
    event.stopPropagation();
  };

  /* ---------------------------------------
     UI
  --------------------------------------- */
  return (
    <>

      {/* ---------------------------------------
         Selected tags (BOTTOM)
      --------------------------------------- */}
      {hasSelection && tagsDisplay && (
        <div className="mb-2 flex flex-wrap gap-2">
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
      <Popover open={open} onOpenChange={setOpen} >
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-between"
          >
            <span className="truncate">
              {!hasSelection
                ? placeholder
                : multiple
                ? `${selectedOptions.length} ${selectionLabel}${
                    selectedOptions.length > 1 ? "s" : ""
                  } selected`
                : selectedOptions[0]?.label}
            </span>

            <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-h-[320px] overflow-hidden p-0"
          align="start"
          onWheelCapture={stopWheelPropagation}
        >
          <Command className="max-h-[320px] overflow-hidden">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <CommandInput
                className="flex-1"
                placeholder={searchPlaceholder}
                value={search}
                onValueChange={setSearch}
              />
              {filterFacets.length > 0 && (
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 gap-1.5 px-2 text-xs"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Filters
                      {activeFilterCount > 0 ? (
                        <span className="rounded-full bg-primary px-1.5 py-0 text-[10px] text-primary-foreground">
                          {activeFilterCount}
                        </span>
                      ) : null}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    className="w-72 p-0"
                    sideOffset={8}
                    onWheelCapture={stopWheelPropagation}
                  >
                    <div className="flex items-center justify-between border-b px-3 py-2">
                      <p className="text-sm font-medium">Filters</p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={clearFilters}
                      >
                        Clear
                      </Button>
                    </div>
                    <div
                      className="max-h-72 overflow-y-auto overscroll-contain px-3 py-2"
                      onWheelCapture={stopWheelPropagation}
                    >
                      {filterFacets.map((facet) => (
                        <div key={facet.id} className="mb-4 last:mb-0">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {facet.label}
                          </p>
                          <div className="space-y-2">
                            {facet.options.map((optionValue) => {
                              const normalizedValue = String(optionValue);
                              const checked = (activeFilters[facet.id] ?? []).includes(
                                normalizedValue
                              );

                              return (
                                <label
                                  key={normalizedValue}
                                  className="flex cursor-pointer items-center gap-2 text-sm"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={() =>
                                      toggleFilterValue(facet.id, normalizedValue)
                                    }
                                  />
                                  <span className="truncate">{normalizedValue}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <CommandList
              className="max-h-[260px] overflow-y-auto overscroll-contain"
              onWheelCapture={stopWheelPropagation}
            >
              {loading && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading...
                </div>
              )}
              <CommandEmpty>No results found.</CommandEmpty>

              <CommandGroup>
                {filteredOptions.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => handleSelect(opt)}
                    keywords={[
                      opt.label,
                      opt.value,
                      opt.email,
                      opt.role,
                      opt.designation,
                    ].filter(Boolean)}
                    className="flex items-center"
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isSelected(opt) ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {opt.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

    </>
  );
}
