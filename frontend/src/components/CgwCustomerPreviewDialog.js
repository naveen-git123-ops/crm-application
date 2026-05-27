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
  previewPassword,
  previewProjectStatus,
  previewTelemetryCompany,
  previewYesNo,
} from '@/lib/cgwCustomerPreview';
import { Eye, FileText, X } from 'lucide-react';

const API = API_ENDPOINT;

function PreviewField({ label, value, className = '' }) {
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm text-gray-900 break-words whitespace-pre-wrap">{value}</p>
    </div>
  );
}

function SectionPanel({ step, title, accent, children, className = '' }) {
  return (
    <section
      className={`rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden ${className}`}
    >
      <div className={`px-4 py-2.5 border-b ${accent}`}>
        <p className="text-sm font-semibold text-gray-900">
          <span className="text-xs font-bold uppercase tracking-wide opacity-70 mr-2">{step}</span>
          {title}
        </p>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </section>
  );
}

function SubBox({ title, children }) {
  return (
    <div className="rounded-md border border-gray-100 bg-gray-50/60 p-3 space-y-3">
      {title ? <p className="text-xs font-semibold text-gray-700">{title}</p> : null}
      {children}
    </div>
  );
}

/** Compact chips — click file name to open preview popup. */
function AttachmentList({ label, attachments, onOpenPreview }) {
  const list = attachments || [];
  if (!list.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {list.map((att) => (
          <li key={att.id || att.file_name}>
            <button
              type="button"
              onClick={() => onOpenPreview?.(att)}
              className="inline-flex items-center gap-1 max-w-[240px] rounded-md border border-blue-200 bg-blue-50/80 px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100 hover:border-blue-300 transition-colors"
              title={`Preview: ${att.file_name || 'File'}`}
            >
              <FileText className="h-3 w-3 shrink-0 opacity-70" />
              <span className="truncate">{att.file_name || 'File'}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FlowMetrePreviewCard({ line, lineLabel, onOpenAttachmentPreview }) {
  const row = line.equipment;
  const inv = line.inventoryRow;
  const attachments = inv?.cgw_attachments || {};

  return (
    <Card className="p-4 border border-gray-200 bg-white shadow-none rounded-lg space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <p className="text-sm font-semibold text-gray-900">{lineLabel}</p>
        {inv?.inventory_id ? (
          <span className="text-[11px] font-mono text-gray-500">{inv.inventory_id}</span>
        ) : null}
      </div>

      <SubBox title="Flow metre">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PreviewField label="Make" value={previewDisplay(row.flow_meter_make)} />
          <PreviewField label="Size" value={previewDisplay(row.flow_meter_size)} />
          <PreviewField label="Serial number" value={previewDisplay(row.flow_meter_serial)} />
        </div>
        {PREVIEW_FLOW_ATTACHMENT_KEYS.map(({ key, label }) => (
          <AttachmentList
            key={key}
            label={label}
            attachments={attachments[key]}
            onOpenPreview={(att) => onOpenAttachmentPreview(att, label)}
          />
        ))}
      </SubBox>

      <SubBox title="Calibration">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PreviewField label="Valid from" value={previewDisplay(row.calibration_valid_from)} />
          <PreviewField label="Valid to" value={previewDisplay(row.calibration_valid_to)} />
        </div>
      </SubBox>

      <SubBox title="Telemetry">
        <PreviewField label="Applicable?" value={previewYesNo(row.telemetry_applicable)} />
        {row.telemetry_applicable === 'yes' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <PreviewField label="Company" value={previewTelemetryCompany(row)} />
            <PreviewField label="Communication via" value={previewCommunicationVia(row.telemetry_communication_via)} />
            {row.telemetry_communication_via === 'sim' ? (
              <>
                <PreviewField label="SIM provider" value={previewDisplay(row.telemetry_sim_provider)} />
                <PreviewField label="SIM number" value={previewDisplay(row.telemetry_sim_number)} />
                <PreviewField label="SIM valid from" value={previewDisplay(row.telemetry_sim_valid_from)} />
                <PreviewField label="SIM valid to" value={previewDisplay(row.telemetry_sim_valid_to)} />
              </>
            ) : null}
            <PreviewField label="Product code" value={previewDisplay(row.telemetry_product_code)} />
            <PreviewField label="Serial number" value={previewDisplay(row.telemetry_serial_number)} />
            <PreviewField label="Portal URL" value={previewDisplay(row.telemetry_portal_url)} />
            <PreviewField label="Username" value={previewDisplay(row.telemetry_username)} />
            <PreviewField label="Password" value={previewPassword(row.telemetry_password)} />
            <PreviewField label="Valid from" value={previewDisplay(row.telemetry_valid_from)} />
            <PreviewField label="Valid to" value={previewDisplay(row.telemetry_valid_to)} />
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
                />
                <PreviewField
                  label="Old data available?"
                  value={previewYesNo(row.telemetry_previous_data_available)}
                />
                {row.telemetry_previous_data_available === 'yes' ? (
                  <>
                    <PreviewField label="Old data from" value={previewDisplay(row.telemetry_previous_data_from)} />
                    <PreviewField label="Old data to" value={previewDisplay(row.telemetry_previous_data_to)} />
                  </>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </SubBox>
    </Card>
  );
}

function PiezometerPreviewCard({ line, index, onOpenAttachmentPreview }) {
  const pz = line.data;
  const inv = line.inventoryRow;
  const attachments = inv?.cgw_attachments || {};

  return (
    <Card className="p-4 border border-gray-200 bg-white shadow-none rounded-lg space-y-3">
      <p className="text-sm font-semibold text-gray-900 border-b border-gray-100 pb-2">
        Piezometer {index + 1}
        {line.label ? ` · ${line.label}` : ''}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <PreviewField label="Make" value={previewDisplay(pz.piezometer_make)} />
        <PreviewField label="Serial" value={previewDisplay(pz.piezometer_serial)} />
        <PreviewField label="Sensor cable length" value={previewDisplay(pz.sensor_cable_length)} />
        <PreviewField label="Calibration valid from" value={previewDisplay(pz.calibration_valid_from)} />
        <PreviewField label="Calibration valid to" value={previewDisplay(pz.calibration_valid_to)} />
        <PreviewField label="Telemetry applicable?" value={previewYesNo(pz.telemetry_applicable)} />
        {pz.telemetry_applicable === 'yes' ? (
          <>
            <PreviewField label="Telemetry company" value={previewTelemetryCompany(pz)} />
            <PreviewField label="Communication via" value={previewCommunicationVia(pz.telemetry_communication_via)} />
            <PreviewField label="Product code" value={previewDisplay(pz.telemetry_product_code)} />
            <PreviewField label="Serial number" value={previewDisplay(pz.telemetry_serial_number)} />
          </>
        ) : null}
      </div>
      {PREVIEW_PIEZO_ATTACHMENT_KEYS.map(({ key, label }) => (
        <AttachmentList
          key={key}
          label={label}
          attachments={attachments[key]}
          onOpenPreview={(att) => onOpenAttachmentPreview(att, label)}
        />
      ))}
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

  const noc = model?.nocForm || {};
  const fd = model?.formData || {};

  const openAttachmentPreview = (att, contextLabel = '') => {
    if (!att) return;
    setAttachmentPreviewItem(att);
    setAttachmentPreviewSubtitle(contextLabel);
    setAttachmentPreviewOpen(true);
  };

  const hasAdditionalAttachments = model?.equipmentLines?.some((line) => {
    const attachments = line.inventoryRow?.cgw_attachments || {};
    return (
      PREVIEW_LIFECYCLE_ATTACHMENT_KEYS.some(({ key }) => (attachments[key] || []).length > 0) ||
      line.equipment?.additional_document_type
    );
  });

  if (!model) return null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(94vh,920px)] max-h-[min(94vh,920px)] w-[min(1400px,98vw)] max-w-[min(1400px,98vw)] flex-col overflow-hidden bg-white rounded-lg border border-gray-200 shadow-xl p-0">
        <div className="bg-blue-600 text-white px-5 py-4 shrink-0">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white flex flex-wrap items-center gap-2">
              <span>Customer details</span>
              <span className="font-mono text-sm font-normal text-blue-100">{model.customerCode || '—'}</span>
            </DialogTitle>
            <p className="text-blue-100 text-sm mt-1">
              {previewDisplay(fd.customer_name)}
              {model.inventoryIds.length ? ` · ${model.inventoryIds.length} inventory line(s)` : ''}
              <span className="hidden sm:inline"> · Scroll to view all sections</span>
            </p>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 bg-slate-100/80">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Row 1: Customer + NOC portals */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <SectionPanel step="1" title="Customer" accent="bg-sky-50 border-sky-100">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <PreviewField label="Customer name" value={previewDisplay(fd.customer_name)} />
                    <PreviewField label="Customer ID" value={previewDisplay(model.customerCode)} />
                    <PreviewField label="Location" value={previewDisplay(fd.location)} />
                    <PreviewField label="Contact person" value={previewDisplay(fd.contact_person)} />
                    <PreviewField label="System mobile" value={previewDisplay(fd.system_mobile_number)} />
                    <PreviewField label="Person mobile" value={previewDisplay(fd.person_mobile_number)} />
                    <PreviewField label="Email" value={previewDisplay(fd.email_id)} />
                    <PreviewField label="Status" value={previewDisplay(fd.status)} />
                    <PreviewField label="Renewal date" value={previewDisplay(fd.renewal_date)} />
                    <PreviewField label="Commissioning date" value={previewDisplay(fd.date_of_commissioning)} />
                    <PreviewField label="Portal URL" value={previewDisplay(fd.url_link)} className="sm:col-span-2" />
                    <PreviewField label="Portal user ID" value={previewDisplay(fd.user_id)} />
                    <PreviewField label="Portal password" value={previewPassword(fd.password)} />
                    <PreviewField label="Remarks" value={previewDisplay(fd.remarks)} className="sm:col-span-2" />
                  </div>
                </SectionPanel>

                <SectionPanel step="2" title="NOC — Portals & document" accent="bg-cyan-50 border-cyan-100">
                  {model.nocDocumentUrl ? (
                    <div className="flex flex-wrap items-center gap-2 rounded-md border border-cyan-100 bg-white p-3">
                      <p className="text-sm text-gray-700 flex-1">NOC PDF on file</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs border-cyan-200"
                        onClick={() => onPreviewNoc?.(enrichedRows[0] || group?.rows?.[0])}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View NOC PDF
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No NOC PDF uploaded.</p>
                  )}
                  <SubBox title="BHUNEER / no-cap portal">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <PreviewField label="BHUNEER user ID" value={previewDisplay(noc.bhuneer_user_id)} />
                      <PreviewField label="BHUNEER password" value={previewPassword(noc.bhuneer_password)} />
                      <PreviewField label="No cap user ID" value={previewDisplay(noc.nocap_user_id)} />
                      <PreviewField label="No cap password" value={previewPassword(noc.nocap_password)} />
                    </div>
                  </SubBox>
                </SectionPanel>
              </div>

              {/* Row 2: NOC project — full width, columns inside */}
              <SectionPanel step="2" title="NOC — Project & permits" accent="bg-cyan-50/80 border-cyan-100">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  <SubBox title="Project">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <PreviewField label="Project name" value={previewDisplay(noc.project_name)} />
                      <PreviewField label="NOC number" value={previewDisplay(noc.noc_no)} />
                      <PreviewField label="Application number" value={previewDisplay(noc.application_no)} />
                      <PreviewField label="Project status" value={previewProjectStatus(noc.project_status)} />
                      <PreviewField label="NOC type" value={previewNocType(noc.noc_type)} />
                      <PreviewField label="Valid from" value={previewDisplay(noc.valid_from)} />
                      <PreviewField label="Valid up to" value={previewDisplay(noc.valid_upto)} />
                      <PreviewField
                        label="Project address"
                        value={previewDisplay(noc.project_address)}
                        className="sm:col-span-2"
                      />
                      <PreviewField
                        label="Communication address"
                        value={previewDisplay(noc.communication_address)}
                        className="sm:col-span-2"
                      />
                    </div>
                  </SubBox>
                  <SubBox title="Abstraction permitted">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <PreviewField label="M³ per day" value={previewDisplay(noc.permitted_m3_per_day)} />
                      <PreviewField label="M³ per year" value={previewDisplay(noc.permitted_m3_per_year)} />
                    </div>
                  </SubBox>
                  <SubBox title="Structure counts">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <PreviewField label="Existing BW count" value={previewDisplay(noc.existing_bw_count)} />
                      <PreviewField label="Total proposed BW count" value={previewDisplay(noc.total_proposed_bw_count)} />
                      <PreviewField label="Flowmeter applicable" value={previewYesNo(noc.flowmeter_applicable)} />
                      <PreviewField label="Flowmeter count" value={previewDisplay(noc.flowmeter_count)} />
                      <PreviewField label="Piezometer applicable" value={previewYesNo(noc.piezometer_applicable)} />
                      <PreviewField label="Piezometer count" value={previewDisplay(noc.piezometer_count)} />
                    </div>
                  </SubBox>
                </div>
              </SectionPanel>

              {/* Row 3: Flow metres */}
              <SectionPanel
                step="3"
                title="Flow metre details"
                accent="bg-violet-50 border-violet-100"
                className="col-span-full"
              >
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

              {/* Row 4: Piezometers */}
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

              {/* Row 5: Additional attachments */}
              <SectionPanel
                step={model.needsPiezometer ? '5' : '4'}
                title="Additional attachments"
                accent="bg-amber-50 border-amber-100"
              >
                {!hasAdditionalAttachments ? (
                  <p className="text-sm text-gray-500">No additional attachments on file.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {model.equipmentLines.map((line, idx) => {
                      const attachments = line.inventoryRow?.cgw_attachments || {};
                      const hasAny = PREVIEW_LIFECYCLE_ATTACHMENT_KEYS.some(
                        ({ key }) => (attachments[key] || []).length > 0,
                      );
                      const docType = line.equipment?.additional_document_type;
                      if (!hasAny && !docType) return null;
                      return (
                        <SubBox
                          key={line.inventoryRow?.id || idx}
                          title={line.inventoryRow?.inventory_id || `Line ${idx + 1}`}
                        >
                          {docType ? (
                            <PreviewField label="Document type" value={previewDisplay(docType)} />
                          ) : null}
                          {PREVIEW_LIFECYCLE_ATTACHMENT_KEYS.map(({ key, label }) => (
                            <AttachmentList
                              key={key}
                              label={label}
                              attachments={attachments[key]}
                              onOpenPreview={(att) => openAttachmentPreview(att, label)}
                            />
                          ))}
                        </SubBox>
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
