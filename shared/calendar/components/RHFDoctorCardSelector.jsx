import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { Input } from "@calendar/components/ui/input";
import { cn } from "@calendar/lib/utils";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@calendar/components/ui/select";

export function RHFDoctorCardSelector({
    value,
    onChange,
    options = [],
    multiple = false,
    tagsDisplay = true,
}) {
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("ALL");

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
    const filteredDoctors = useMemo(() => {
        const searchLower = search.toLowerCase();

        return options.filter((doc) => {
            const matchesSearch =
                doc.label?.toLowerCase().includes(searchLower) ||
                doc.code?.toLowerCase().includes(searchLower);

            const matchesCategory =
                category === "ALL" ||
                doc.fsl_speciality__name === category;

            return matchesSearch && matchesCategory;
        });
    }, [options, search, category]);

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
         SEARCH + SPECIALITY FILTER
      ============================================ */}
            <div className="flex gap-3">
                <Input
                    placeholder="Search Doctor or Code"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <Select
                    value={category}
                    onValueChange={setCategory}
                >
                    <SelectTrigger className="w-[180px]">
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
