/** Default sample events for Plasmic `events` default and playground `config.events`. */
export const DEFAULT_SAMPLE_EVENTS = [
  {
    id: '1',
    clickable: true,
    type: 'financial',
    subtype: 'emi',
    title: 'Car EMI',
    date: '2020-10-15T10:30:00',
    data: {
      amount: 20000,
      status: 'paid',
    },
  },
  {
    id: '2',
    clickable: true,
    type: 'activity',
    subtype: 'pob',
    title: 'POB Generated',
    date: '2020-12-01',
    data: {
      qty: 200,
      value: 55000,
      items: 25,
    },
  },
  {
    id: '3',
    type: 'performance',
    subtype: 'roi',
    title: 'ROI Achieved',
    date: '2020-12-01',
    data: {
      roi: 1.2,
    },
  },
  {
    id: '4',
    clickable: true,
    type: 'financial',
    subtype: 'payslip',
    title: 'Payslip Generated',
    date: '2026-03-01',
    data: {
      salary: 65780.33,
      month: 'March',
      year: 2026,
    },
  },
  {
    id: '5',
    clickable: true,
    type: 'activity',
    subtype: 'note',
    title: 'Doctor Visit Note',
    date: '2026-03-21T10:30:00',
    data: {
      description: 'Follow-up done. Prescription updated.',
    },
  },
];

/** Shape reference for playground config (Plasmic / docs). Playground default text is JS so `onEventClick` can be a function. */
export const DEFAULT_TIMELINE_CONFIG = {
  align: 'alternate',
  events: DEFAULT_SAMPLE_EVENTS,
};
