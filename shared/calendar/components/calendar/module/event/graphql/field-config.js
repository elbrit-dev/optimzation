export const ERP_EVENT_FIELDS = {
  roleProfileRead: "custom_role_profile__name",
  roleProfileWrite: "custom_role_profile",
  doctorRead: "custom_doctor__name",
  doctorWrite: "custom_doctor",
  doctorLatitudeRead: "custom_latitude__name",
  doctorLatitudeWrite: "custom_latitude",
  doctorLongitudeRead: "custom_longitude__name",
  doctorLongitudeWrite: "custom_longitude",
  ownerEmployeeRead: "custom_employee_id",
  ownerEmployeeWrite: "custom_employee_id",
  hqRead: "custom_hq__name",
  hqWrite: "custom_hq",
  participantRoleProfileRead: "custom_role_profile",
  participantRoleProfileWrite: "custom_role_profile",
  participantForceVisitRead: "custom_is_force_visit",
  participantForceVisitWrite: "custom_is_force_visit",
  participantForceVisitReasonRead: "custom_force_visit_reason",
  participantForceVisitReasonWrite: "custom_force_visit_reason",
  participantDistanceRead: "custom_distance",
  participantDistanceWrite: "custom_distance",
};

export const ERP_EMPLOYEE_FIELDS = {
  roleId: "custom_role_profile__name",
};

export const ERP_ROLE_PROFILE_FIELDS = {
  roleId: "role_profile",
  parentRole: "parent_role_profile",
};

export const ERP_DOCTOR_FIELDS = {
  territory: "territory__name",
  searchName: "lead_name",
};

export const ERP_DOC_SHARE_FIELDS = {
  user: "user",
  shareDoctype: "share_doctype",
  shareName: "share_name",
};
