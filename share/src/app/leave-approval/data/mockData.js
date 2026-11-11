/* Seeded Leave Applications for the harness's Mock mode, in the ERP's own
 * GraphQL row shape (links as `x__name`). "Today" is pinned so the urgency
 * groups always read the same. Two viewers: an ABM with BEs under them, and
 * the RBM above, who is the escalation approver on the ABM's team. */

export const MOCK_TODAY = '2026-11-11';
export const MOCK_ABM = 'arun.abm@example.org';
export const MOCK_RBM = 'meena.rbm@example.org';

const leave = (name, o) => ({
  name,
  status: 'Open',
  half_day: 0,
  half_day_date: null,
  department__name: 'CND Coimbatore - ELPL',
  leave_approver__name: MOCK_ABM,
  leave_approver_name: 'Arun Prakash',
  custom_escalation_approver__name: MOCK_RBM,
  custom_attachement: null,
  modified: `${o.posting_date} 10:00:00`,
  modified_by__name: o.employee_email,
  ...o,
});

export function buildMockRows() {
  return [
    leave('HR-LAP-2026-00501', {
      employee__name: 'E01101', employee_name: 'Karthik S', employee_email: 'karthik.be@example.org',
      leave_type__name: 'Sick Leave', from_date: '2026-11-10', to_date: '2026-11-11', total_leave_days: 2,
      description: '<p>Fever, doctor advised rest for two days.</p>', posting_date: '2026-11-10',
      custom_attachement: '/private/files/medical-note-karthik.pdf',
    }),
    leave('HR-LAP-2026-00502', {
      employee__name: 'E01102', employee_name: 'Divya R', employee_email: 'divya.be@example.org',
      leave_type__name: 'Casual Leave', from_date: '2026-11-11', to_date: '2026-11-11', total_leave_days: 1,
      description: '<p>Family function</p>', posting_date: '2026-11-09',
    }),
    leave('HR-LAP-2026-00503', {
      employee__name: 'E01103', employee_name: 'Manoj K', employee_email: 'manoj.be@example.org',
      leave_type__name: 'Casual Leave', from_date: '2026-11-13', to_date: '2026-11-14', total_leave_days: 2,
      description: '<p>Travelling to native for a wedding</p>', posting_date: '2026-11-06',
    }),
    leave('HR-LAP-2026-00504', {
      employee__name: 'E01104', employee_name: 'Priya V', employee_email: 'priya.be@example.org',
      leave_type__name: 'Casual Leave', from_date: '2026-11-13', to_date: '2026-11-13', total_leave_days: 0.5,
      half_day: 1, half_day_date: '2026-11-13', description: '<p>Bank work in the afternoon</p>',
      posting_date: '2026-11-11',
    }),
    leave('HR-LAP-2026-00505', {
      employee__name: 'E01105', employee_name: 'Suresh B', employee_email: 'suresh.be@example.org',
      leave_type__name: 'Privilege Leave', from_date: '2026-11-24', to_date: '2026-11-28', total_leave_days: 5,
      description: '<p>Annual trip with family, planned in advance.</p>', posting_date: '2026-11-05',
    }),
    /* Another ABM's BE: waiting on that ABM for six days, so the RBM above
       (the escalation approver) sees it too. */
    leave('HR-LAP-2026-00506', {
      employee__name: 'E01201', employee_name: 'Ganesh T', employee_email: 'ganesh.be@example.org',
      department__name: 'CND Erode - ELPL', leave_type__name: 'Leave Without Pay',
      from_date: '2026-11-12', to_date: '2026-11-12', total_leave_days: 1, description: '',
      posting_date: '2026-11-05',
      leave_approver__name: 'ravi.abm@example.org', leave_approver_name: 'Ravi Shankar',
    }),
    /* Already decided — the Decided tab. */
    leave('HR-LAP-2026-00490', {
      employee__name: 'E01106', employee_name: 'Lakshmi N', employee_email: 'lakshmi.be@example.org',
      leave_type__name: 'Casual Leave', from_date: '2026-11-13', to_date: '2026-11-13', total_leave_days: 1,
      description: '<p>Personal</p>', posting_date: '2026-11-04', status: 'Approved',
      modified: '2026-11-05 09:12:00', modified_by__name: MOCK_ABM,
    }),
    leave('HR-LAP-2026-00488', {
      employee__name: 'E01102', employee_name: 'Divya R', employee_email: 'divya.be@example.org',
      leave_type__name: 'Sick Leave', from_date: '2026-11-03', to_date: '2026-11-03', total_leave_days: 1,
      description: '', posting_date: '2026-11-03', status: 'Approved',
      modified: '2026-11-03 18:40:00', modified_by__name: MOCK_ABM,
    }),
    leave('HR-LAP-2026-00481', {
      employee__name: 'E01103', employee_name: 'Manoj K', employee_email: 'manoj.be@example.org',
      leave_type__name: 'Casual Leave', from_date: '2026-11-02', to_date: '2026-11-02', total_leave_days: 1,
      description: '<p>Personal</p>', posting_date: '2026-10-30', status: 'Rejected',
      modified: '2026-10-31 11:05:00', modified_by__name: MOCK_ABM,
    }),
  ];
}
