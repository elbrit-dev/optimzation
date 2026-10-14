// =====================================================================
// CLIENT SCRIPT — the source of truth for the ERP's copy. Keep in step.
//
//   Name     : Doctor Service Details View
//   DocType  : Doctor Service
//   Apply To : Form
//
// 1. Shows what the service type captured (EB number, mobile number, loan
//    number...) from custom_service_details, a JSON list of
//    [{key, label, values}], in the "Service details" HTML field
//    (custom_service_details_html). Which details a service asks for is set
//    on its Doctor Service Master (custom_capture_fields); the app writes them.
// 2. "Correct details" button (FIX_ROLES only): edits just those details,
//    even after the service is in approval or approved, through the
//    elbrit_doctor_service_fix_details API script (which re-checks the role
//    and the rules, and leaves an audit comment). Nothing else on the
//    service changes.
// =====================================================================
var FIX_ROLES = ['System Manager', 'MIS Admin'];

frappe.ui.form.on('Doctor Service', {
  refresh(frm) {
    render_service_details(frm);
    add_fix_button(frm);
  },
  custom_service_details(frm) { render_service_details(frm); },
});

function service_details(frm) {
  try {
    const raw = frm.doc.custom_service_details;
    const rows = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
    return Array.isArray(rows) ? rows : [];
  } catch (e) { return []; }
}

function render_service_details(frm) {
  const field = frm.get_field('custom_service_details_html');
  if (!field) return;
  const rows = service_details(frm).filter((r) => r && (r.values || []).some((v) => String(v || '').trim()));
  if (!rows.length) { field.$wrapper.html(''); return; }
  const esc = frappe.utils.escape_html;
  const body = rows.map((r) => {
    const vals = (r.values || []).map((v) => String(v || '').trim()).filter(Boolean)
      .map((v) => `<span style="display:inline-block;padding:2px 10px;margin:2px 6px 2px 0;border-radius:12px;background:var(--bg-blue,#EAF1FF);color:var(--text-color);font-family:var(--font-stack-monospace,monospace);font-size:12px">${esc(v)}</span>`).join('');
    return `<tr><td style="padding:6px 12px 6px 0;color:var(--text-muted);white-space:nowrap;vertical-align:top">${esc(r.label || r.key || '')}</td><td style="padding:4px 0">${vals}</td></tr>`;
  }).join('');
  field.$wrapper.html(`<div style="margin:4px 0 12px"><div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:4px">${esc(__('Service details'))}</div><table style="border-collapse:collapse">${body}</table></div>`);
}

async function add_fix_button(frm) {
  if (frm.is_new() || !frm.doc.service_name) return;
  if (!FIX_ROLES.some((r) => frappe.user.has_role(r))) return;
  let capture = [];
  try {
    const r = await frappe.db.get_value('Doctor Service Master', frm.doc.service_name, 'custom_capture_fields');
    const raw = r && r.message && r.message.custom_capture_fields;
    capture = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
  } catch (e) { capture = []; }
  capture = (Array.isArray(capture) ? capture : []).filter((c) => c && c.key);
  if (!capture.length) return;

  frm.add_custom_button(__('Correct details'), () => {
    const now = {};
    service_details(frm).forEach((d) => { if (d && d.key) now[d.key] = d.values || []; });
    const d = new frappe.ui.Dialog({
      title: __('Correct service details'),
      fields: [
        { fieldtype: 'HTML', options: `<p class="text-muted small">${__('Only these details change. The amount, service, doctor and the approval stay as they are. The change is recorded on the service.')}</p>` },
        ...capture.map((c) => ({
          fieldname: c.key,
          label: c.label || c.key,
          fieldtype: c.multi ? 'Small Text' : 'Data',
          reqd: c.required === 0 ? 0 : 1,
          description: c.multi ? __('One per line') : '',
          default: (now[c.key] || []).join('\n'),
        })),
      ],
      primary_action_label: __('Save details'),
      primary_action(values) {
        const details = {};
        capture.forEach((c) => {
          details[c.key] = String(values[c.key] || '').split('\n').map((s) => s.trim()).filter(Boolean);
        });
        frappe.call({
          method: 'elbrit_doctor_service_fix_details',
          args: { name: frm.doc.name, details: JSON.stringify(details) },
          freeze: true,
          callback(r) {
            d.hide();
            const m = r.message || {};
            frappe.show_alert({ message: m.changed ? __('Service details corrected') : __('No change'), indicator: m.changed ? 'green' : 'blue' });
            frm.reload_doc();
          },
        });
      },
    });
    d.show();
  });
}
