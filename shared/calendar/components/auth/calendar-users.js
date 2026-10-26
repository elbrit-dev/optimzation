
export const LOGGED_IN_USER = {
  id: null,
  name: null,
  email: null,
  role: null,
  status: null,
  roleId:null,
  leave_approver:null,
  escalation_approver:null,
  // The ERP User (Employee.user_id). `email` is the company email the page
  // passes in, and for some people it differs from the login ERP writes into
  // leave_approver (Sainudheen K V: sainudheen.kv@ vs sainudheen.abm@).
  // Filled in by the calendar bootstrap from the employee list.
  login_email:null
};
/**
 * Global ERP auth configuration
 * Mutated once by AuthProvider
 */
export const AUTH_CONFIG = {
  erpUrl: null,
  authToken: null,
};

