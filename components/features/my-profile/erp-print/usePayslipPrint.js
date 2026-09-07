import { useCallback, useEffect, useRef, useState } from "react";

import { downloadErpPayslip, slipKey } from "./printClient";

/**
 * Tracks which payslip is being fetched from the ERP and surfaces any failure.
 *
 * The download goes over the network now rather than being rendered in the
 * browser, so it can be slow or fail outright - both of which have to be
 * visible, or a click looks like it did nothing.
 */
export function usePayslipPrint({ employee, endpointKey }) {
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const erpEmployee = String(employee || "").trim();

  const download = useCallback(
    async (slip, { latest = false } = {}) => {
      const key = latest ? "latest" : slipKey(slip);
      setPending(key);
      setError("");

      try {
        await downloadErpPayslip({ slip, employee: erpEmployee, endpointKey, latest });
      } catch (downloadError) {
        if (!mounted.current) return;
        setError(downloadError?.message || "The payslip could not be downloaded.");
      } finally {
        if (mounted.current) setPending("");
      }
    },
    [erpEmployee, endpointKey]
  );

  const isPending = useCallback((slip) => pending !== "" && pending === slipKey(slip), [pending]);

  return {
    // Any download in flight - every button disables while one is running, so
    // a second click cannot start a competing fetch.
    busy: pending !== "",
    isPending,
    error,
    available: Boolean(erpEmployee),
    download,
  };
}
