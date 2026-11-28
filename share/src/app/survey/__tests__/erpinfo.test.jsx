import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuestionCard } from '../components/QuestionCard';

/* 28 Nov 2026 · "Show from ERP": the doctor's saved location is readable, with a link to the map */
describe('Show from ERP card', () => {
  it('shows a saved location as coordinates with a map link, not the raw value', () => {
    const q = { id: 'e1', type: 'erp_info', label: "Doctor's saved details", fields: [
      { tag: 'custom_latitude_and_longitude', label: 'Latitude and Longitude', value: '{"x":26.7767633,"y":82.1782783}' },
      { tag: 'city', label: 'City', value: 'Ayodhya' },
      { tag: 'custom_visits', label: 'Visits', value: '10, 20' },
    ] };
    render(<QuestionCard q={q} index={1} value={undefined} onChange={() => {}} />);
    const link = screen.getByRole('link', { name: /26\.776763, 82\.178278/ });
    expect(link.getAttribute('href')).toBe('https://www.google.com/maps?q=26.7767633,82.1782783');
    expect(screen.queryByText(/"x"/)).toBeNull();
    expect(screen.getByText('Ayodhya')).toBeTruthy();
    expect(screen.getByText('10, 20')).toBeTruthy(); // ordinary numbers are left as they are
  });
});
