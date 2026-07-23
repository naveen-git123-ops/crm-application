import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CgwAttachmentPreviewDialog } from '@/components/CgwAttachmentPreviewDialog';
import { API_ENDPOINT } from '@/lib/apiConfig';
import {
  PREVIEW_FLOW_ATTACHMENT_KEYS,
  PREVIEW_LIFECYCLE_ATTACHMENT_KEYS,
  PREVIEW_PIEZO_ATTACHMENT_KEYS,
  buildCustomerPreviewModel,
  previewCommunicationVia,
  previewDisplay,
  previewNocType,
  previewProjectStatus,
  previewTelemetryCompany,
  previewYesNo,
} from '@/lib/cgwCustomerPreview';
import { toast } from 'sonner';
import { Copy, Eye, EyeOff, FileText, X } from 'lucide-react';

const API = API_ENDPOINT;

async function copyToClipboard(text, label = 'Value') {
  const value = String(text ?? '').trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch {
    toast.error('Could not copy to clipboard');
  }
}

function CopyIconButton({ text, label }) {
  const hasValue = Boolean(String(text ?? '').trim());
  if (!hasValue) return null;
  return (
    <button
      type="button"
      onClick={() => copyToClipboard(text, label)}
      className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-200/80 hover:text-gray-900"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      <Copy className="h-4 w-4" />
    </button>
  );
}

function PreviewField({ label, value, className = '', mono = false }) {
  const display = value != null && String(value).trim() !== '' ? String(value) : '—';
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</dt>
      <dd
        className={`text-sm text-gray-900 break-words whitespace-pre-wrap rounded-md bg-white border border-gray-100 px-2.5 py-2 ${
          mono ? 'font-mono text-[13px]' : ''
        } ${display === '—' ? 'text-gray-400 italic' : ''}`}
      >
        {display}
      </dd>
    </div>
  );
}

function CopyablePreviewField({ label, value, className = '' }) {
  const raw = value != null && String(value).trim() !== '' ? String(value) : '';
  const hasValue = Boolean(raw);

  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</dt>
      <dd className="flex items-center gap-1 rounded-md bg-white border border-gray-100 px-2.5 py-2">
        <span className={`text-sm flex-1 min-w-0 break-all font-mono ${hasValue ? 'text-gray-900' : 'text-gray-400 italic'}`}>
          {hasValue ? raw : '—'}
        </span>
        {hasValue ? <CopyIconButton text={raw} label={label} /> : null}
      </dd>
    </div>
  );
}

function PasswordPreviewField({ label, password, className = '' }) {
  const [visible, setVisible] = useState(false);
  const raw = password != null && String(password).trim() !== '' ? String(password) : '';
  const hasValue = Boolean(raw);

  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</dt>
      <dd className="flex items-center gap-1 rounded-md bg-white border border-gray-100 px-2.5 py-2">
        <span className={`text-sm flex-1 min-w-0 break-all font-mono ${hasValue ? 'text-gray-900' : 'text-gray-400 italic'}`}>
          {!hasValue ? '—' : visible ? raw : '••••••••'}
        </span>
        {hasValue ? (
          <>
            <CopyIconButton text={raw} label={label} />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-200/80 hover:text-gray-900"
              title={visible ? 'Hide password' : 'Show password'}
              aria-label={visible ? 'Hide password' : 'Show password'}
            >
              {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </>
        ) : null}
      </dd>
    </div>
  );
}

function FieldGrid({ children, cols = 'sm:grid-cols-2 lg:grid-cols-3', className = '' }) {
  return <dl className={`grid grid-cols-1 ${cols} gap-3 ${className}`}>{children}</dl>;
}

function SectionPanel({ step, title, accent, children, className = '' }) {
  return (
    <section
      className={`rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}
    >
      <div className={`px-4 py-3 border-b ${accent}`}>
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-white/80 px-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-700">
            {step}
          </span>
          {title}
        </p>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SubSection({ title, children, variant = 'default' }) {
  const styles =
    variant === 'attachments'
      ? 'rounded-lg border-2 border-dashed border-blue-200 bg-blue-50/40 p-4'
      : 'rounded-lg border border-gray-200 bg-slate-50/80 p-4';
  return (
    <div className={styles}>
      {title ? (
        <h4 className="text-xs font-bold uppercase tracking-wide text-gray-700 mb-3 pb-2 border-b border-gray-200/80">
          {title}
        </h4>
      ) : null}
      {children}
    </div>
  );
}

/** One attachment category with clear preview actions per file. */
function AttachmentCategoryBlock({ label, attachments, onOpenPreview }) {
  const list = attachments || [];
  if (!list.length) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <p className="text-xs font-semibold text-gray-800">{label}</p>
        <span className="text-[10px] font-medium text-gray-500 tabular-nums">{list.length} file(s)</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {list.map((att) => (
          <li
            key={att.id || att.file_name}
            className="flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50/80"
          >
            <FileText className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
            <span
              className="flex-1 min-w-0 text-sm text-gray-800 truncate"
              title={att.file_name || 'File'}
            >
              {att.file_name || 'Unnamed file'}
            </span>
            <Button
              type="button"
              size="sm"
              className="h-8 shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-xs px-3"
              onClick={() => onOpenPreview?.(att)}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Preview
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttachmentsPanel({ attachmentKeyGroups, attachments, onOpenPreview }) {
  const blocks = attachmentKeyGroups
    .map(({ key, label }) => ({
      key,
      label,
      list: attachments[key] || [],
    }))
    .filter((b) => b.list.length > 0);

  if (!blocks.length) {
    return <p className="text-sm text-gray-500 italic py-1">No files in this section.</p>;
  }

  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <AttachmentCategoryBlock
          key={block.key}
          label={block.label}
          attachments={block.list}
          onOpenPreview={(att) => onOpenPreview(att, block.label)}
        />
      ))}
    </div>
  );
}

function FlowMetrePreviewCard({ line, lineLabel, onOpenAttachmentPreview }) {
  const row = line.equipment;
  const inv = line.inventoryRow;
  const attachments = inv?.cgw_attachments || {};

  return (
    <Card className="border border-gray-200 bg-white shadow-sm rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-indigo-50/90 border-b border-indigo-100">
        <p className="text-sm font-semibold text-indigo-950">{lineLabel}</p>
        {inv?.inventory_id ? (
          <span className="text-xs font-mono font-medium text-indigo-700 bg-white/80 px-2 py-0.5 rounded border border-indigo-100">
            {inv.inventory_id}
          </span>
        ) : null}
      </div>

      <div className="p-4 space-y-4">
        <SubSection title="Flow metre">
          <FieldGrid cols="sm:grid-cols-3">
            <PreviewField label="Make" value={previewDisplay(row.flow_meter_make)} />
            <PreviewField label="Size" value={previewDisplay(row.flow_meter_size)} />
            <PreviewField label="Serial number" value={previewDisplay(row.flow_meter_serial)} mono />
          </FieldGrid>
        </SubSection>

        <SubSection title="Calibration">
          <FieldGrid cols="sm:grid-cols-2">
            <PreviewField label="Valid from" value={previewDisplay(row.calibration_valid_from)} mono />
            <PreviewField label="Valid to" value={previewDisplay(row.calibration_valid_to)} mono />
          </FieldGrid>
        </SubSection>

        <SubSection title="Telemetry">
          <PreviewField label="Applicable?" value={previewYesNo(row.telemetry_applicable)} />
          {row.telemetry_applicable === 'yes' ? (
            <FieldGrid className="mt-3">
              <PreviewField label="Company" value={previewTelemetryCompany(row)} />
              <PreviewField label="Communication via" value={previewCommunicationVia(row.telemetry_communication_via)} />
              {row.telemetry_communication_via === 'sim' ? (
                <>
                  <PreviewField label="SIM provider" value={previewDisplay(row.telemetry_sim_provider)} />
                  <PreviewField label="SIM number" value={previewDisplay(row.telemetry_sim_number)} mono />
                  <PreviewField label="SIM valid from" value={previewDisplay(row.telemetry_sim_valid_from)} mono />
                  <PreviewField label="SIM valid to" value={previewDisplay(row.telemetry_sim_valid_to)} mono />
                </>
              ) : null}
              <PreviewField label="Product code" value={previewDisplay(row.telemetry_product_code)} mono />
              <PreviewField label="Serial number" value={previewDisplay(row.telemetry_serial_number)} mono />
              <PreviewField label="Portal URL" value={previewDisplay(row.telemetry_portal_url)} className="sm:col-span-2 lg:col-span-3" />
              <CopyablePreviewField label="Username" value={row.telemetry_username} />
              <PasswordPreviewField label="Password" password={row.telemetry_password} />
              <PreviewField label="Valid from" value={previewDisplay(row.telemetry_valid_from)} mono />
              <PreviewField label="Valid to" value={previewDisplay(row.telemetry_valid_to)} mono />
              <PreviewField
                label="Uploaded in previous year?"
                value={previewYesNo(row.telemetry_uploaded_previous_year)}
              />
              {row.telemetry_uploaded_previous_year === 'yes' ? (
                <>
                  <PreviewField
                    label="Prior serial"
                    value={previewDisplay(
                      row.telemetry_previous_serial_pick === '__manual__'
                        ? row.telemetry_previous_serial_free
                        : row.telemetry_previous_serial_pick,
                    )}
                    mono
                  />
                  <PreviewField
                    label="Old data available?"
                    value={previewYesNo(row.telemetry_previous_data_available)}
                  />
                  {row.telemetry_previous_data_available === 'yes' ? (
                    <>
                      <PreviewField label="Old data from" value={previewDisplay(row.telemetry_previous_data_from)} mono />
                      <PreviewField label="Old data to" value={previewDisplay(row.telemetry_previous_data_to)} mono />
                    </>
                  ) : null}
                </>
              ) : null}
            </FieldGrid>
          ) : null}
        </SubSection>

        <SubSection title="Flow metre attachments" variant="attachments">
          <AttachmentsPanel
            attachmentKeyGroups={PREVIEW_FLOW_ATTACHMENT_KEYS}
            attachments={attachments}
            onOpenPreview={onOpenAttachmentPreview}
          />
        </SubSection>
      </div>
    </Card>
  );
}

function PiezometerPreviewCard({ line, index, onOpenAttachmentPreview }) {
  const pz = line.data;
  const inv = line.inventoryRow;
  const attachments = inv?.cgw_attachments || {};

  return (
    <Card className="border border-gray-200 bg-white shadow-sm rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-emerald-50/90 border-b border-emerald-100">
        <p className="text-sm font-semibold text-emerald-950">
          Piezometer {index + 1}
          {line.label ? ` · ${line.label}` : ''}
        </p>
      </div>

      <div className="p-4 space-y-4">
        <SubSection title="Piezometer details">
          <FieldGrid>
            <PreviewField label="Make" value={previewDisplay(pz.piezometer_make)} />
            <PreviewField label="Serial" value={previewDisplay(pz.piezometer_serial)} mono />
            <PreviewField label="Sensor cable length" value={previewDisplay(pz.sensor_cable_length)} />
            <PreviewField label="Calibration valid from" value={previewDisplay(pz.calibration_valid_from)} mono />
            <PreviewField label="Calibration valid to" value={previewDisplay(pz.calibration_valid_to)} mono />
            <PreviewField label="Telemetry applicable?" value={previewYesNo(pz.telemetry_applicable)} />
            {pz.telemetry_applicable === 'yes' ? (
              <>
                <PreviewField label="Telemetry company" value={previewTelemetryCompany(pz)} />
                <PreviewField label="Communication via" value={previewCommunicationVia(pz.telemetry_communication_via)} />
                <PreviewField label="Product code" value={previewDisplay(pz.telemetry_product_code)} mono />
                <PreviewField label="Serial number" value={previewDisplay(pz.telemetry_serial_number)} mono />
              </>
            ) : null}
          </FieldGrid>
        </SubSection>

        <SubSection title="Piezometer attachments" variant="attachments">
          <AttachmentsPanel
            attachmentKeyGroups={PREVIEW_PIEZO_ATTACHMENT_KEYS}
            attachments={attachments}
            onOpenPreview={onOpenAttachmentPreview}
          />
        </SubSection>
      </div>
    </Card>
  );
}

export function CgwCustomerPreviewDialog({
  open,
  onOpenChange,
  group,
  customerCode = '',
  onPreviewNoc,
}) {
  const [loading, setLoading] = useState(false);
  const [enrichedRows, setEnrichedRows] = useState([]);
  const [attachmentPreviewOpen, setAttachmentPreviewOpen] = useState(false);
  const [attachmentPreviewItem, setAttachmentPreviewItem] = useState(null);
  const [attachmentPreviewSubtitle, setAttachmentPreviewSubtitle] = useState('');

  useEffect(() => {
    if (!open || !group?.rows?.length) {
      setEnrichedRows([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const results = await Promise.all(
          group.rows.map(async (row) => {
            try {
              const res = await axios.get(`${API}/cgw-flow-metres/${row.id}`, { headers });
              return res.data;
            } catch {
              return row;
            }
          }),
        );
        if (!cancelled) setEnrichedRows(results);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, group]);

  const model = useMemo(() => {
    const rows = enrichedRows.length ? enrichedRows : group?.rows || [];
    return buildCustomerPreviewModel(rows, customerCode);
  }, [enrichedRows, group, customerCode]);

  const hasAdditionalAttachments = useMemo(() => {
    if (!model?.equipmentLines?.length) return false;
    return model.equipmentLines.some((line) => {
      const attachments = line.inventoryRow?.cgw_attachments || {};
      return (
        PREVIEW_LIFECYCLE_ATTACHMENT_KEYS.some(({ key }) => (attachments[key] || []).length > 0) ||
        Boolean(line.equipment?.additional_document_type)
      );
    });
  }, [model]);

  if (!model) return null;

  const noc = model.nocForm || {};
  const fd = model.formData || {};

  const openAttachmentPreview = (att, contextLabel = '') => {
    if (!att) return;
    setAttachmentPreviewItem(att);
    setAttachmentPreviewSubtitle(contextLabel);
    setAttachmentPreviewOpen(true);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[min(94vh,920px)] max-h-[min(94vh,920px)] w-[min(1400px,98vw)] max-w-[min(1400px,98vw)] flex-col overflow-hidden bg-white rounded-xl border border-gray-200 shadow-xl p-0">
          <div className="bg-gradient-to-r from-blue-700 to-blue-600 text-white px-5 py-4 shrink-0">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-white flex flex-wrap items-center gap-2">
                Customer details
                <span className="font-mono text-sm font-normal text-blue-100 bg-white/10 px-2 py-0.5 rounded">
                  {model.customerCode || '—'}
                </span>
              </DialogTitle>
              <p className="text-blue-100 text-sm mt-1.5">
                {previewDisplay(fd.customer_name)}
                {model.inventoryIds.length ? ` · ${model.inventoryIds.length} inventory line(s)` : ''}
              </p>
            </DialogHeader>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 bg-slate-100">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
              </div>
            ) : (
              <div className="space-y-5 max-w-[1320px] mx-auto">
                {/* 1 — Customer */}
                <SectionPanel step="1" title="Customer & portal access" accent="bg-sky-50 border-sky-100">
                  <div className="space-y-4">
                    <SubSection title="Contact & location">
                      <FieldGrid>
                        <PreviewField label="Customer name" value={previewDisplay(fd.customer_name)} />
                        <PreviewField label="Customer ID" value={previewDisplay(model.customerCode)} mono />
                        <PreviewField label="Location" value={previewDisplay(fd.location)} />
                        <PreviewField label="Contact person" value={previewDisplay(fd.contact_person)} />
                        <PreviewField label="System mobile" value={previewDisplay(fd.system_mobile_number)} mono />
                        <PreviewField label="Person mobile" value={previewDisplay(fd.person_mobile_number)} mono />
                        <PreviewField label="Email" value={previewDisplay(fd.email_id)} />
                        <PreviewField label="Status" value={previewDisplay(fd.status)} />
                      </FieldGrid>
                    </SubSection>
                    <SubSection title="Lifecycle dates">
                      <FieldGrid cols="sm:grid-cols-2 lg:grid-cols-4">
                        <PreviewField label="Renewal date" value={previewDisplay(fd.renewal_date)} mono />
                        <PreviewField label="Commissioning date" value={previewDisplay(fd.date_of_commissioning)} mono />
                        <PreviewField label="Portal URL" value={previewDisplay(fd.url_link)} className="sm:col-span-2" />
                      </FieldGrid>
                    </SubSection>
                    <SubSection title="Customer portal credentials">
                      <FieldGrid cols="sm:grid-cols-2">
                        <CopyablePreviewField label="Portal user ID" value={fd.user_id} />
                        <PasswordPreviewField label="Portal password" password={fd.password} />
                        <PreviewField label="Remarks" value={previewDisplay(fd.remarks)} className="sm:col-span-2" />
                      </FieldGrid>
                    </SubSection>
                  </div>
                </SectionPanel>

                {/* 2 — NOC */}
                <SectionPanel step="2" title="NOC (No Objection Certificate)" accent="bg-cyan-50 border-cyan-100">
                  <div className="space-y-4">
                    {model.nocDocumentUrl ? (
                      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-cyan-200 bg-white p-4">
                        <div className="flex-1 min-w-[200px]">
                          <p className="text-sm font-medium text-gray-900">NOC document</p>
                          <p className="text-xs text-gray-500 mt-0.5">PDF uploaded for this customer</p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          className="h-9 bg-cyan-700 hover:bg-cyan-800 text-white shrink-0"
                          onClick={() => onPreviewNoc?.(enrichedRows[0] || group?.rows?.[0])}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View NOC PDF
                        </Button>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 bg-white px-4 py-3">
                        No NOC PDF uploaded.
                      </p>
                    )}

                    <SubSection title="BHUNEER / no-cap portal">
                      <FieldGrid cols="sm:grid-cols-2">
                        <CopyablePreviewField label="BHUNEER user ID" value={noc.bhuneer_user_id} />
                        <PasswordPreviewField label="BHUNEER password" password={noc.bhuneer_password} />
                        <CopyablePreviewField label="No cap user ID" value={noc.nocap_user_id} />
                        <PasswordPreviewField label="No cap password" password={noc.nocap_password} />
                      </FieldGrid>
                    </SubSection>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <SubSection title="Project">
                        <FieldGrid cols="sm:grid-cols-1">
                          <PreviewField label="Project name" value={previewDisplay(noc.project_name)} />
                          <PreviewField label="NOC number" value={previewDisplay(noc.noc_no)} mono />
                          <PreviewField label="Application number" value={previewDisplay(noc.application_no)} mono />
                          <PreviewField label="Project status" value={previewProjectStatus(noc.project_status)} />
                          <PreviewField label="NOC type" value={previewNocType(noc.noc_type)} />
                          <PreviewField label="Valid from" value={previewDisplay(noc.valid_from)} mono />
                          <PreviewField label="Valid up to" value={previewDisplay(noc.valid_upto)} mono />
                          <PreviewField label="Project address" value={previewDisplay(noc.project_address)} />
                          <PreviewField label="Communication address" value={previewDisplay(noc.communication_address)} />
                        </FieldGrid>
                      </SubSection>
                      <SubSection title="Abstraction permitted">
                        <FieldGrid cols="sm:grid-cols-1">
                          <PreviewField label="M³ per day" value={previewDisplay(noc.permitted_m3_per_day)} />
                          <PreviewField label="M³ per year" value={previewDisplay(noc.permitted_m3_per_year)} />
                        </FieldGrid>
                      </SubSection>
                      <SubSection title="Structure counts">
                        <FieldGrid cols="sm:grid-cols-1">
                          <PreviewField label="Existing BW count" value={previewDisplay(noc.existing_bw_count)} />
                          <PreviewField label="Total proposed BW count" value={previewDisplay(noc.total_proposed_bw_count)} />
                          <PreviewField label="Flowmeter applicable" value={previewYesNo(noc.flowmeter_applicable)} />
                          <PreviewField label="Flowmeter count" value={previewDisplay(noc.flowmeter_count)} />
                          <PreviewField label="Piezometer applicable" value={previewYesNo(noc.piezometer_applicable)} />
                          <PreviewField label="Piezometer count" value={previewDisplay(noc.piezometer_count)} />
                        </FieldGrid>
                      </SubSection>
                    </div>
                  </div>
                </SectionPanel>

                {/* 3 — Flow metres */}
                <SectionPanel step="3" title="Flow metre details" accent="bg-violet-50 border-violet-100">
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {model.equipmentLines.map((line, idx) => {
                      const base = model.customerCode || 'Line';
                      const label =
                        model.equipmentLines.length > 1 ? `${base} · Flow metre ${idx + 1}` : 'Flow metre';
                      return (
                        <FlowMetrePreviewCard
                          key={line.inventoryRow?.id || idx}
                          line={line}
                          lineLabel={label}
                          onOpenAttachmentPreview={openAttachmentPreview}
                        />
                      );
                    })}
                  </div>
                </SectionPanel>

                {/* 4 — Piezometers */}
                {model.needsPiezometer ? (
                  <SectionPanel step="4" title="Piezometer" accent="bg-emerald-50 border-emerald-100">
                    {model.piezometerLines.length === 0 ? (
                      <p className="text-sm text-gray-500">No piezometer details recorded yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        {model.piezometerLines.map((line, idx) => (
                          <PiezometerPreviewCard
                            key={`${line.inventoryRow?.id || 'pz'}-${idx}`}
                            line={line}
                            index={idx}
                            onOpenAttachmentPreview={openAttachmentPreview}
                          />
                        ))}
                      </div>
                    )}
                  </SectionPanel>
                ) : null}

                {/* Additional / lifecycle attachments */}
                <SectionPanel
                  step={model.needsPiezometer ? '5' : '4'}
                  title="Additional / lifecycle attachments"
                  accent="bg-amber-50 border-amber-100"
                >
                  {!hasAdditionalAttachments ? (
                    <p className="text-sm text-gray-500">No additional attachments on file.</p>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {model.equipmentLines.map((line, idx) => {
                        const attachments = line.inventoryRow?.cgw_attachments || {};
                        const hasAny = PREVIEW_LIFECYCLE_ATTACHMENT_KEYS.some(
                          ({ key }) => (attachments[key] || []).length > 0,
                        );
                        const docType = line.equipment?.additional_document_type;
                        if (!hasAny && !docType) return null;
                        return (
                          <div
                            key={line.inventoryRow?.id || idx}
                            className="rounded-xl border border-amber-200/80 bg-white p-4 space-y-3"
                          >
                            <p className="text-sm font-semibold text-amber-950 border-b border-amber-100 pb-2">
                              {line.inventoryRow?.inventory_id || `Inventory line ${idx + 1}`}
                            </p>
                            {docType ? (
                              <PreviewField label="Document type" value={previewDisplay(docType)} />
                            ) : null}
                            <AttachmentsPanel
                              attachmentKeyGroups={PREVIEW_LIFECYCLE_ATTACHMENT_KEYS}
                              attachments={attachments}
                              onOpenPreview={openAttachmentPreview}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </SectionPanel>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-white shrink-0">
            <Button type="button" variant="outline" className="h-9 border-gray-300" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4 mr-1" />
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CgwAttachmentPreviewDialog
        open={attachmentPreviewOpen}
        onOpenChange={setAttachmentPreviewOpen}
        attachment={attachmentPreviewItem}
        subtitle={attachmentPreviewSubtitle}
      />
    </>
  );
}

export default CgwCustomerPreviewDialog;
