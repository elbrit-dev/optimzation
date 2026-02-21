import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@calendar/lib/utils";
import { Button } from "@calendar/components/ui/button";
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
}) {
  const [open, setOpen] = useState(false);

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

  const hasSelection = selectedOptions.length > 0;

  /* ---------------------------------------
     Selection helpers (ID-ONLY OUTPUT)
  --------------------------------------- */
  const isSelected = (opt) => selectedIds.includes(opt.value);

  const handleSelect = (opt) => {
    if (!multiple) {
      onChange(opt.value); // ✅ always ID
      setOpen(false);
      return;
    }

    if (selectedIds.includes(opt.value)) {
      onChange(selectedIds.filter((v) => v !== opt.value));
    } else {
      onChange([...selectedIds, opt.value]);
    }
  };

  const handleRemove = (optValue) => {
    if (!multiple) {
      onChange(undefined);
    } else {
      onChange(selectedIds.filter((v) => v !== optValue));
    }
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
      <Popover open={open} onOpenChange={setOpen} modal>
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
          className="w-[--radix-popover-trigger-width] p-0 "
          align="start"
        >
          <Command className="h-[180px] overflow-hidden">
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList className=" overflow-y-auto">
              <CommandEmpty>No results found.</CommandEmpty>

              <CommandGroup>
                {options.map((opt) => (
                  <CommandItem
                    key={opt.value}
                    onSelect={() => handleSelect(opt)}
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
