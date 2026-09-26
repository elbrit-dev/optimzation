'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Field, Icon } from '@/design-system';
import { Checkbox } from 'primereact/checkbox';
import { ConfirmDialog, confirmDialog } from 'primereact/confirmdialog';
import { Dialog } from 'primereact/dialog';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { refreshGlobalTokenRows, saveGlobalTokenRows } from '@/app/graphql-playground/constants';

function emptyRow() {
  return { name: '', endpoint: '', token: '', isDefault: false };
}

function TokensPageInner() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingIndex, setEditingIndex] = useState(-1);
  const [form, setForm] = useState(emptyRow());
  const [showToken, setShowToken] = useState(false);
  const [revealedTokenRows, setRevealedTokenRows] = useState({});
  const toastRef = useRef(null);

  const loadRows = async () => {
    setLoading(true);
    try {
      const tokenRows = await refreshGlobalTokenRows(true);
      setRows(tokenRows || []);
    } catch (error) {
      toastRef.current?.show({ severity: 'error', summary: 'Load failed', detail: error?.message || 'Failed to load tokens' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const openAdd = () => {
    setEditingIndex(-1);
    setForm(emptyRow());
    setShowToken(false);
    setDialogVisible(true);
  };

  const openEdit = (index) => {
    setEditingIndex(index);
    setForm({ ...rows[index] });
    setShowToken(false);
    setDialogVisible(true);
  };

  const upsertRow = async () => {
    const normalized = {
      name: String(form.name || '').trim().toUpperCase(),
      endpoint: String(form.endpoint || '').trim(),
      token: String(form.token || '').trim(),
      isDefault: Boolean(form.isDefault),
    };
    if (!normalized.name || !normalized.endpoint) {
      toastRef.current?.show({ severity: 'warn', summary: 'Missing fields', detail: 'Name and endpoint are required' });
      return;
    }
    const next = [...rows];
    if (editingIndex >= 0) next[editingIndex] = normalized;
    else next.push(normalized);
    const adjusted = normalized.isDefault
      ? next.map((row, idx) => ({ ...row, isDefault: idx === (editingIndex >= 0 ? editingIndex : next.length - 1) }))
      : next;

    setLoading(true);
    try {
      const saved = await saveGlobalTokenRows(adjusted);
      setRows(saved || []);
      setDialogVisible(false);
      toastRef.current?.show({
        severity: 'success',
        summary: editingIndex >= 0 ? 'Updated' : 'Added',
        detail: 'Token saved to Firebase',
      });
    } catch (error) {
      toastRef.current?.show({
        severity: 'error',
        summary: 'Save failed',
        detail: error?.message || 'Failed to save token to Firebase',
      });
    } finally {
      setLoading(false);
    }
  };

  const removeRow = async (index) => {
    const next = rows.filter((_, idx) => idx !== index);
    if (next.length > 0 && !next.some((row) => row.isDefault)) {
      next[0] = { ...next[0], isDefault: true };
    }
    setRows(next);
    setLoading(true);
    try {
      const saved = await saveGlobalTokenRows(next);
      setRows(saved || []);
      toastRef.current?.show({ severity: 'success', summary: 'Deleted', detail: 'Token removed from Firebase' });
    } catch (error) {
      toastRef.current?.show({ severity: 'error', summary: 'Delete failed', detail: error?.message || 'Failed to delete token' });
      await loadRows();
    } finally {
      setLoading(false);
    }
  };

  const confirmRemoveRow = (index) => {
    const row = rows[index];
    confirmDialog({
      header: 'Delete Token',
      message: `Delete token "${row?.name || 'this token'}"?`,
      icon: 'pi pi-exclamation-triangle',
      acceptClassName: 'ds-button-danger',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      accept: () => {
        removeRow(index);
      },
    });
  };

  const setDefault = async (index) => {
    const updatedRows = rows.map((row, idx) => ({ ...row, isDefault: idx === index }));
    setRows(updatedRows);
    setLoading(true);
    try {
      const saved = await saveGlobalTokenRows(updatedRows);
      setRows(saved || []);
      toastRef.current?.show({ severity: 'success', summary: 'Default updated', detail: 'Default token saved to Firebase' });
    } catch (error) {
      toastRef.current?.show({ severity: 'error', summary: 'Save failed', detail: error?.message || 'Failed to update default token' });
      await loadRows();
    } finally {
      setLoading(false);
    }
  };

  const toggleRowTokenVisibility = (index) => {
    setRevealedTokenRows((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  return (
    <div className="min-h-screen bg-sunken">
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-surface rounded-lg border border-line-subtle shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-semibold text-body">Global Tokens</h1>
              <p className="text-sm text-ds-secondary">Manage GraphQL endpoint tokens stored in `#__GLOBAL__#`.</p>
            </div>
            <div className="flex gap-2">
              <Button type="default" icon={<i className="pi pi-refresh" />} onClick={loadRows} loading={loading}>Refresh</Button>
              <Button icon={<i className="pi pi-plus" />} onClick={openAdd}>Add Token</Button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-line-subtle">
                  <th className="py-2">Default</th>
                  <th className="py-2">Name</th>
                  <th className="py-2">Endpoint</th>
                  <th className="py-2">Token</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.name}-${index}`} className="border-b border-line-subtle">
                    <td className="py-2">
                      <Checkbox unstyled checked={Boolean(row.isDefault)} onChange={() => setDefault(index)} />
                    </td>
                    <td className="py-2 font-medium">{row.name}</td>
                    <td className="py-2">{row.endpoint}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span>
                          {revealedTokenRows[index]
                            ? (row.token || '-')
                            : (row.token ? `${'*'.repeat(Math.min(12, row.token.length))}` : '-')}
                        </span>
                        {row.token ? (
                          <Button type="text" shape="round" className="p-0" icon={<i className={`pi ${revealedTokenRows[index] ? 'pi-eye-slash' : 'pi-eye'}`} />} onClick={() => toggleRowTokenVisibility(index)} aria-label={revealedTokenRows[index] ? 'Hide token' : 'Show token'}/>
                        ) : null}
                      </div>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <Button type="text" onClick={() => openEdit(index)}>Edit</Button>
                        <Button type="text" danger onClick={() => confirmRemoveRow(index)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-ds-secondary">No token rows yet. Add one to start.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      <Dialog unstyled header={editingIndex >= 0 ? 'Edit Token' : 'Add Token'} visible={dialogVisible} onHide={() => setDialogVisible(false)} style={{ width: '34rem' }}>
        {/* DS Fields, not bare InputTexts: the labels were raw text-sm (larger
            than the inputs), and the token's `p-inputgroup` is lara CSS that
            `unstyled` drops — the eye button fell onto its own line. The
            Field's suffix puts it inside the input. */}
        <div className="flex flex-col gap-3">
          <Field
            label="Name"
            value={form.name}
            onChange={(v) => setForm((prev) => ({ ...prev, name: v }))}
            placeholder="ERP / UAT / DEV"
          />
          <Field
            label="Endpoint"
            value={form.endpoint}
            onChange={(v) => setForm((prev) => ({ ...prev, endpoint: v }))}
            placeholder="https://.../api/method/graphql"
          />
          <Field
            label="Token"
            type={showToken ? 'text' : 'password'}
            value={form.token}
            onChange={(v) => setForm((prev) => ({ ...prev, token: v }))}
            placeholder="key:secret"
            autoComplete="off"
            suffix={
              <button
                type="button"
                onClick={() => setShowToken((prev) => !prev)}
                aria-label={showToken ? 'Hide token' : 'Show token'}
                className="flex items-center text-ds-secondary hover:text-brand-text"
              >
                <Icon name={showToken ? 'eye-slash' : 'eye'} size="sm" />
              </button>
            }
          />
          <label className="flex cursor-pointer items-center gap-2 type-app-body text-body">
            <Checkbox unstyled checked={Boolean(form.isDefault)} onChange={(e) => setForm((prev) => ({ ...prev, isDefault: e.checked }))} />
            Set as default
          </label>
          <div className="flex justify-end gap-2 mt-2">
            <Button type="default" onClick={() => setDialogVisible(false)}>Cancel</Button>
            <Button onClick={upsertRow}>{editingIndex >= 0 ? 'Update' : 'Add'}</Button>
          </div>
        </div>
      </Dialog>
      <ConfirmDialog unstyled />
      <Toast unstyled ref={toastRef} />
    </div>
  );
}

export default function TokensPage() {
  return (
    <ProtectedRoute>
      <TokensPageInner />
    </ProtectedRoute>
  );
}

