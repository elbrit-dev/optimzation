import { useMemo, useState } from "react";
import {
  FormField,
  FormItem,
  FormLabel,
  FormControl,
} from "@calendar/components/ui/form";
import { Checkbox } from "@calendar/components/ui/checkbox";
import { Button } from "@calendar/components/ui/button";
import {
  ModalFooter,
  ModalClose,
} from "@calendar/components/ui/responsive-modal";
import { RHFCombobox } from "@calendar/components/ui/RHFCombobox";
import { DateTimePicker } from "@calendar/components/ui/date-time-picker";
/* =====================================================
   BASE WRAPPER (Label + Error)
===================================================== */
export function RHFFieldWrapper({ label, error, children }) {
  return (
    <FormItem className="flex flex-col">
      {label && <FormLabel>{label}</FormLabel>}
      {children}
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </FormItem>
  );
}

/* =====================================================
   COMBOBOX FIELD
===================================================== */
export function RHFComboboxField({
  control,
  name,
  label,
  options,
  multiple = false,
  placeholder,
  searchPlaceholder,
  selectionLabel,
  tagsDisplay
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <RHFFieldWrapper
          label={label}
          error={fieldState.error?.message}
        >
          <FormControl>
            <RHFCombobox
              value={field.value}
              onChange={field.onChange}
              options={options}
              multiple={multiple}
              placeholder={placeholder}
              searchPlaceholder={searchPlaceholder}
              selectionLabel={selectionLabel}
              tagsDisplay={tagsDisplay}
            />
          </FormControl>
        </RHFFieldWrapper>
      )}
    />
  );
}

/* =====================================================
   DATE / DATETIME PICKER FIELD
===================================================== */
export function RHFDateTimeField({
  control,
  form,
  name,
  label,
  hideTime = false,
  minDate,
  maxDate,
  allowAllDates,
  onChange,
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <DateTimePicker
          form={form}
          label={label}
          hideTime={hideTime}
          minDate={minDate}
          maxDate={maxDate}
          allowAllDates={allowAllDates}
          field={{
            ...field,
            onChange: onChange ?? field.onChange,
          }}
        />
      )}
    />
  );
}

/* =====================================================
   INLINE CHECKBOX FIELD
===================================================== */
export function InlineCheckboxField({
  checked,
  onChange,
  label,
}) {
  return (
    <FormItem className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        onCheckedChange={onChange}
      />
      <FormLabel style={{ marginTop: 0 }}>
        {label}
      </FormLabel>
    </FormItem>
  );
}

/* =====================================================
   MODAL FORM FOOTER
===================================================== */
export function FormFooter({
  isEditing,
  disabled,
  showCaptureLocation,
  onCaptureLocation,
  isResolvingLocation,
}) {
  return (
    <ModalFooter className="gap-2 flex flex-row">
      <ModalClose asChild>
        <Button variant="outline">
          Cancel
        </Button>
      </ModalClose>

      {showCaptureLocation && (
        <Button
          type="button"
          variant="secondary"
          onClick={onCaptureLocation}
          disabled={isResolvingLocation}
        >
          {isResolvingLocation ? "Capturing..." : "Request Location"}
        </Button>
      )}

      <Button
        type="submit"
        form="event-form"
        disabled={disabled || isResolvingLocation}
      >
        {isEditing ? "Update" : "Submit"}
      </Button>
    </ModalFooter>
  );
}

