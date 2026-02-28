import { useEffect, useState, useRef } from 'react';
import { isEmpty } from 'lodash';
import { transformToReportData } from './reportUtils';

/**
 * Custom hook for computing report data
 * Handles async computation with worker fallback, state management, and stale update prevention
 * 
 * @param {boolean} enableBreakdown - Whether report mode is enabled
 * @param {Array} data - Data array to compute report from
 * @param {Array} effectiveGroupFields - Array of fields for multi-level nesting (required for grouping)
 * @param {string} dateColumn - Column containing date values
 * @param {string} breakdownType - Type of breakdown: 'day', 'week', 'month', 'quarter', 'annual'
 * @param {Object} columnTypes - Object mapping column names to their types
 * @param {Object} sortConfig - Optional sort configuration with field and direction
 * @param {Object} sortFieldType - Optional sort field type info with fieldType, topLevelKey, nestedPath
 * @param {Object} reportWorkerRef - Ref to the report worker instance (optional)
 * @param {Array} columnsExemptFromBreakdown - Column names exempt from time-period breakdown in report mode
 * @returns {Object} { reportData, isComputingReport }
 */
export function useReportData(
  enableBreakdown,
  data,
  effectiveGroupFields,
  dateColumn,
  breakdownType,
  columnTypes,
  sortConfig,
  sortFieldType,
  reportWorkerRef = null,
  columnsExemptFromBreakdown = []
) {
  const [reportData, setReportData] = useState(null);
  const [isComputingReport, setIsComputingReport] = useState(false);
  const computationIdRef = useRef(0);
  const prevInputSignatureRef = useRef('');

  useEffect(() => {
    // If toggle is off, reset everything immediately
    if (!enableBreakdown) {
      prevInputSignatureRef.current = '';
      setReportData(null);
      setIsComputingReport(false);
      return;
    }

    // Ensure effectiveGroupFields is an array
    const groupFields = Array.isArray(effectiveGroupFields) ? effectiveGroupFields : [];

    // If conditions not met, don't compute and don't show computing state
    if (!dateColumn || isEmpty(data) || groupFields.length === 0) {
      prevInputSignatureRef.current = '';
      setReportData(null);
      setIsComputingReport(false);
      return;
    }

    // Stabilize: only run computation when input signature actually changed (avoids rapid re-runs from unstable refs)
    const sortKey = sortConfig ? `${sortConfig.field ?? ''}-${sortConfig.direction ?? ''}` : '';
    const exemptKey = Array.isArray(columnsExemptFromBreakdown) ? columnsExemptFromBreakdown.join(',') : '';
    const inputSignature = `${data?.length ?? 0}-${groupFields.join(',')}-${dateColumn}-${breakdownType}-${sortKey}-${exemptKey}`;
    if (prevInputSignatureRef.current === inputSignature) {
      return;
    }
    prevInputSignatureRef.current = inputSignature;

    const computationId = ++computationIdRef.current;
    setIsComputingReport(true);

    const computeReport = async () => {
      // If worker is not available, fallback to synchronous computation
      if (!reportWorkerRef?.current) {
        try {
          const computed = transformToReportData(
            data,
            groupFields,
            dateColumn,
            breakdownType,
            columnTypes,
            sortConfig,
            sortFieldType,
            columnsExemptFromBreakdown
          );
          if (computationId === computationIdRef.current) {
            const inputHadData = Array.isArray(data) && data.length > 0;
            const outputEmpty = !computed?.tableData?.length;
            if (inputHadData && outputEmpty) {
              setIsComputingReport(false);
              return;
            }
            setReportData(computed);
            setIsComputingReport(false);
          }
        } catch (error) {
          console.error('Report computation error:', error);
          if (computationId === computationIdRef.current) {
            setReportData(null);
            setIsComputingReport(false);
          }
        }
        return;
      }

      // Use worker for async computation
      try {
        const computed = await reportWorkerRef.current.computeReportData(
          data,
          groupFields,
          dateColumn,
          breakdownType,
          columnTypes,
          sortConfig,
          sortFieldType,
          columnsExemptFromBreakdown
        );

        // Only update if this is still the latest computation
        if (computationId === computationIdRef.current) {
          // Reject empty output when input had data - prevents loop (wrong-format input produces empty, which triggers re-run)
          const inputHadData = Array.isArray(data) && data.length > 0;
          const outputEmpty = !computed?.tableData?.length;
          if (inputHadData && outputEmpty) {
            // Keep previous reportData, just stop computing
            setIsComputingReport(false);
            return;
          }
          setReportData(computed);
          setIsComputingReport(false);
        }
      } catch (error) {
        console.error('Report worker computation error:', error);
        // Fallback to synchronous computation on error
        try {
          const computed = transformToReportData(
            data,
            groupFields,
            dateColumn,
            breakdownType,
            columnTypes,
            sortConfig,
            sortFieldType,
            columnsExemptFromBreakdown
          );
          if (computationId === computationIdRef.current) {
            const inputHadData = Array.isArray(data) && data.length > 0;
            const outputEmpty = !computed?.tableData?.length;
            if (inputHadData && outputEmpty) {
              setIsComputingReport(false);
              return;
            }
            setReportData(computed);
            setIsComputingReport(false);
          }
        } catch (fallbackError) {
          console.error('Fallback report computation error:', fallbackError);
          if (computationId === computationIdRef.current) {
            setReportData(null);
            setIsComputingReport(false);
          }
        }
      }
    };

    computeReport();
  }, [enableBreakdown, dateColumn, breakdownType, data, effectiveGroupFields, columnTypes, sortConfig, sortFieldType, reportWorkerRef, columnsExemptFromBreakdown]);

  return { reportData, isComputingReport };
}
