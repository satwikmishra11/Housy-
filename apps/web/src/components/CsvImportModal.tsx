import React, { useState } from 'react';
import { Modal } from './Modal.js';
import { Button } from './Button.js';
import { Badge } from './Badge.js';
import { Select } from './Select.js';
import { Textarea } from './Textarea.js';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from 'lucide-react';
import { previewCsv, commitCsv, type PreviewCsvResult } from '../lib/api.js';
import { useToast } from './Toast.js';
import type { LeadSource } from '@housy/shared';

export interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

const DEFAULT_CSV_SAMPLE = `Name,Phone,Email,Project,Wants,Consent
Aarav Patel,9825012345,aarav@example.com,Project 1,2 BHK,true
Pooja Dave,9825098765,pooja@example.com,Project 2,3 BHK,true
Brijesh Joshi,,brijesh@example.com,,2 BHK,false
Invalid Buyer,12345,,,2 BHK,true`;

export const CsvImportModal: React.FC<CsvImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
}) => {
  const { showToast } = useToast();
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [source, setSource] = useState<LeadSource>('property_portal');
  const [csvText, setCsvText] = useState(DEFAULT_CSV_SAMPLE);
  const [isLoading, setIsLoading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewCsvResult | null>(null);

  const parseCsvToRows = (text: string): Record<string, string>[] => {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) return [];

    const headers = lines[0]!.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
    const rows: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const currentLine = lines[i]!;
      // Split on comma ignoring quotes where possible
      const values = currentLine.split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] ?? '';
      });
      rows.push(row);
    }

    return rows;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setCsvText(content);
      }
    };
    reader.readAsText(file);
  };

  const handlePreview = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const rows = parseCsvToRows(csvText);
      if (rows.length === 0) {
        showToast({
          type: 'error',
          title: 'Invalid CSV',
          message: 'Please provide at least a header row and one data row.',
        });
        return;
      }

      const preview = await previewCsv(rows, source);
      setPreviewData(preview);
      setStep('preview');
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Preview Failed',
        message: err instanceof Error ? err.message : 'Failed to parse CSV preview',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async (): Promise<void> => {
    if (!previewData) return;

    try {
      setIsCommitting(true);
      const validRowsToCommit = previewData.rows
        .filter((r) => r.classification !== 'invalid')
        .map((r) => ({
          name: r.normalized.name,
          phone: r.normalized.phone,
          email: r.normalized.email,
          wants: r.normalized.wants,
          consent: r.normalized.consent,
        }));

      const res = await commitCsv(source, validRowsToCommit);
      showToast({
        type: 'success',
        title: 'Import Successful',
        message: `Imported ${res.imported} new leads, merged ${res.merged} touchpoints.`,
      });
      onImportComplete();
      onClose();
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Import Failed',
        message: err instanceof Error ? err.message : 'Failed to commit CSV leads',
      });
    } finally {
      setIsCommitting(false);
    }
  };

  const handleReset = (): void => {
    setStep('input');
    setPreviewData(null);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 'input' ? 'Import Leads from CSV / Excel' : 'Review & Confirm Import'}
      size="xl"
    >
      {step === 'input' ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Upload an exported lead sheet or paste CSV content below. Our ingest pipeline will
            automatically normalize phone numbers, deduplicate against existing leads, and flag
            possible duplicates.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Lead Source Attribution"
              value={source}
              onChange={(e) => setSource(e.target.value as LeadSource)}
              options={[
                { value: 'property_portal', label: 'Property Portal (MagicBricks / 99acres)' },
                { value: 'social_ad', label: 'Social Media Ad (Meta / Instagram)' },
                { value: 'website', label: 'Developer Website' },
                { value: 'hoarding_call', label: 'Hoarding / Offline Call' },
              ]}
            />

            <div>
              <label className="block text-sm font-medium text-ink-base mb-1.5">
                Upload CSV File
              </label>
              <label className="flex items-center justify-center gap-2 w-full h-10 px-3 border border-dashed border-hairline rounded-token bg-surface hover:bg-surface-alt cursor-pointer text-sm text-ink-muted">
                <UploadCloud className="w-4 h-4 text-accent" />
                <span>Choose .csv file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>

          <Textarea
            label="Or Paste CSV Data"
            rows={7}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            helperText="Expected columns: Name, Phone, Email, Project, Wants, Consent"
          />

          <div className="flex justify-end gap-3 pt-3 border-t border-hairline">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handlePreview}
              isLoading={isLoading}
              leftIcon={<FileSpreadsheet className="w-4 h-4" />}
            >
              Preview & Validate Rows
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {previewData && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-surface-alt p-3.5 rounded-token border border-hairline">
              <div>
                <span className="text-xs text-ink-muted block">Total Rows</span>
                <span className="text-lg font-serif font-bold text-ink-base">
                  {previewData.total}
                </span>
              </div>
              <div>
                <span className="text-xs text-ink-muted block">Valid & Ready</span>
                <span className="text-lg font-serif font-bold text-success">
                  {previewData.validCount}
                </span>
              </div>
              <div>
                <span className="text-xs text-ink-muted block">Invalid (Skipped)</span>
                <span className="text-lg font-serif font-bold text-danger">
                  {previewData.invalidCount}
                </span>
              </div>
              <div>
                <span className="text-xs text-ink-muted block">Duplicates Detected</span>
                <span className="text-lg font-serif font-bold text-ink-muted">
                  {
                    previewData.rows.filter(
                      (r) =>
                        r.classification === 'duplicate' ||
                        r.classification === 'possible_duplicate',
                    ).length
                  }
                </span>
              </div>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto border border-hairline rounded-token">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-surface-alt sticky top-0 border-b border-hairline text-ink-muted">
                <tr>
                  <th className="py-2 px-3">#</th>
                  <th className="py-2 px-3">Buyer Name</th>
                  <th className="py-2 px-3">Phone</th>
                  <th className="py-2 px-3">Email</th>
                  <th className="py-2 px-3">Status / Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface">
                {previewData?.rows.map((row) => (
                  <tr key={row.rowIndex} className="hover:bg-surface-alt/50">
                    <td className="py-2.5 px-3 text-ink-muted font-mono">{row.rowIndex}</td>
                    <td className="py-2.5 px-3 font-medium text-ink-base">
                      {row.normalized.name || <span className="text-danger italic">Missing</span>}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-ink-muted">
                      {row.normalized.phone || '—'}
                    </td>
                    <td className="py-2.5 px-3 text-ink-muted">{row.normalized.email || '—'}</td>
                    <td className="py-2.5 px-3">
                      {row.classification === 'new' && (
                        <Badge variant="success" size="sm">
                          <CheckCircle2 className="w-3 h-3 mr-1 inline" /> New Lead
                        </Badge>
                      )}
                      {row.classification === 'duplicate' && (
                        <Badge variant="neutral" size="sm">
                          <RefreshCw className="w-3 h-3 mr-1 inline" /> Matches Existing
                        </Badge>
                      )}
                      {row.classification === 'possible_duplicate' && (
                        <Badge variant="warning" size="sm">
                          <AlertTriangle className="w-3 h-3 mr-1 inline" /> Possible Duplicate
                        </Badge>
                      )}
                      {row.classification === 'invalid' && (
                        <div className="space-y-0.5">
                          <Badge variant="danger" size="sm">
                            <AlertCircle className="w-3 h-3 mr-1 inline" /> Invalid
                          </Badge>
                          <div className="text-[11px] text-danger">{row.errors.join(', ')}</div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-hairline">
            <Button variant="ghost" onClick={handleReset}>
              Back to Edit
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleCommit}
                isLoading={isCommitting}
                disabled={!previewData || previewData.validCount === 0}
              >
                Confirm Import ({previewData?.validCount ?? 0} Leads)
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};
