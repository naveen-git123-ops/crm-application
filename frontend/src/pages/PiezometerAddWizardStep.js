import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { CgwMultiFilePicker } from '@/components/CgwMultiFilePicker';

export const EMPTY_PIEZO_ROW = {
  piezometer_make: '',
  piezometer_serial: '',
  sensor_cable_length: '',
  commissioning_date: '',
  calibration_valid_from: '',
  calibration_valid_to: '',
  telemetry_applicable: '',
  telemetry_company: '',
  telemetry_company_other: '',
  telemetry_communication_via: '',
  telemetry_sim_provider: '',
  telemetry_sim_provider_other: '',
  telemetry_sim_number: '',
  telemetry_sim_valid_from: '',
  telemetry_sim_valid_to: '',
  telemetry_product_code: '',
  telemetry_serial_number: '',
  telemetry_commissioning_date: '',
  telemetry_sim_changed_count: '',
  telemetry_recharge_count: '',
  telemetry_portal_url: '',
  telemetry_username: '',
  telemetry_password: '',
  telemetry_valid_from: '',
  telemetry_valid_to: '',
  telemetry_uploaded_previous_year: '',
  telemetry_previous_serial_pick: '',
  telemetry_previous_serial_free: '',
  telemetry_previous_data_available: '',
  telemetry_previous_data_from: '',
  telemetry_previous_data_to: '',
};

export const EMPTY_PIEZO_FILES = () => ({
  bwPhotos: [],
  calibrationCert: [],
  telemetryPhotos: [],
  telemetryExcel: [],
  priorTelemetryService: [],
  serviceReport: [],
  telemetryServiceReport: [],
});

export function piezoRowToPersist(r) {
  const pick = (r.telemetry_previous_serial_pick || '').trim();
  const free = (r.telemetry_previous_serial_free || '').trim();
  const telemetry_previous_serial = pick === '__manual__' ? free : pick;
  const { telemetry_previous_serial_pick: _p, telemetry_previous_serial_free: _f, ...rest } = r;
  return { ...rest, telemetry_previous_serial: telemetry_previous_serial || null };
}

const PIEZO_FILE_CATEGORIES = {
  bwPhotos: 'piezometer_bw',
  calibrationCert: 'piezometer_calibration',
  telemetryPhotos: 'piezometer_telemetry',
  telemetryExcel: 'piezometer_excel_prior',
  priorTelemetryService: 'piezometer_service_report',
  serviceReport: 'piezometer_service',
  telemetryServiceReport: 'piezometer_telemetry_service',
};

function PiezometerAddWizardStep({
  piezometerRows,
  setPiezometerRows,
  piezometerFiles,
  setPiezometerFiles,
  telemetrySerialOptions,
  countLabel,
  onSubmit,
  submitting,
  editingItem = null,
  onPreviewSaved = null,
  onRemoveSaved = null,
}) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Piezometer details</h3>
        <p className="text-xs text-muted-foreground mt-1">
          NOC specifies {countLabel}. Enter details for each piezometer below. Inventory rows are created only when you click Submit—piezometer
          data is stored as JSON on each new row; file uploads run after the records exist (by row index when possible).
        </p>
      </div>
      <div className="space-y-4 max-h-[min(72vh,720px)] overflow-y-auto pr-1">
        {piezometerRows.map((row, idx) => {
          const patchRow = (patch) =>
            setPiezometerRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
          const bundle = piezometerFiles[idx] || {};
          const patchBundle = (patch) =>
            setPiezometerFiles((prev) => prev.map((b, i) => (i === idx ? { ...b, ...patch } : b)));
          const pzSaved = (bundleKey) => {
            const cat = PIEZO_FILE_CATEGORIES[bundleKey];
            return {
              existingAttachments: editingItem?.cgw_attachments?.[cat] || [],
              onPreviewExisting: (att) => onPreviewSaved?.(att, cat),
              onRemoveExisting: onRemoveSaved ? (att) => onRemoveSaved(att, cat) : null,
            };
          };
          return (
            <Card key={idx} className="p-4 border border-border bg-white shadow-none rounded-lg space-y-4">
              <p className="text-sm font-semibold text-foreground">Piezometer {idx + 1}</p>

              <div className="rounded-lg border border-border bg-white p-3 space-y-3">
                <p className="text-sm font-semibold text-foreground">Piezometer</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Make</Label>
                    <Input
                      value={row.piezometer_make}
                      onChange={(e) => patchRow({ piezometer_make: e.target.value })}
                      className="h-11 border border-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Serial number</Label>
                    <Input
                      value={row.piezometer_serial}
                      onChange={(e) => patchRow({ piezometer_serial: e.target.value })}
                      className="h-11 border border-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Length of sensor cable</Label>
                    <Input
                      value={row.sensor_cable_length}
                      onChange={(e) => patchRow({ sensor_cable_length: e.target.value })}
                      className="h-11 border border-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Commissioning date</Label>
                    <Input
                      type="date"
                      value={row.commissioning_date}
                      onChange={(e) => patchRow({ commissioning_date: e.target.value })}
                      className="h-11 border border-input"
                    />
                  </div>
                </div>
                <CgwMultiFilePicker
                  label="Service Report"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                  files={bundle.serviceReport}
                  onChange={(serviceReport) => patchBundle({ serviceReport })}
                  hint="Optional; uploads after save (S3)."
                  className="border-t border-border pt-3"
                  {...pzSaved('serviceReport')}
                />
                <CgwMultiFilePicker
                  label="BW with piezometer photo"
                  accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                  imageOnly
                  files={bundle.bwPhotos}
                  onChange={(bwPhotos) => patchBundle({ bwPhotos })}
                  hint="Click + to add photos. Uploads after save (S3)."
                  className="border-t border-border pt-3"
                  {...pzSaved('bwPhotos')}
                />
              </div>

              <div className="rounded-lg border border-border p-3 space-y-3">
                <p className="text-sm font-semibold text-foreground">Calibration certificate</p>
                <CgwMultiFilePicker
                  label="Certificate (file)"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                  files={bundle.calibrationCert}
                  onChange={(calibrationCert) => patchBundle({ calibrationCert })}
                  hint="Uploads after save (S3)."
                  {...pzSaved('calibrationCert')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Valid from</Label>
                    <Input
                      type="date"
                      value={row.calibration_valid_from}
                      onChange={(e) => patchRow({ calibration_valid_from: e.target.value })}
                      className="h-11"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Valid to</Label>
                    <Input
                      type="date"
                      value={row.calibration_valid_to}
                      onChange={(e) => patchRow({ calibration_valid_to: e.target.value })}
                      className="h-11"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">Is applicable telemetry system?</Label>
                <select
                  value={row.telemetry_applicable}
                  onChange={(e) => patchRow({ telemetry_applicable: e.target.value })}
                  className="w-full border border-input rounded-lg px-3 h-11"
                >
                  <option value="">Select</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              {row.telemetry_applicable === 'yes' ? (
                <div className="rounded-lg border border-border bg-white p-3 space-y-4">
                  <p className="text-sm font-semibold text-foreground">Telemetry system</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Telemetry company</Label>
                      <select
                        value={row.telemetry_company}
                        onChange={(e) => patchRow({ telemetry_company: e.target.value })}
                        className="w-full border border-input rounded-lg px-3 h-11"
                      >
                        <option value="">Select</option>
                        <option value="frinso">FRINSO</option>
                        <option value="ubiqedge">UBIQEDGE</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                    {row.telemetry_company === 'other' ? (
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">Company name (manual)</Label>
                        <Input
                          value={row.telemetry_company_other}
                          onChange={(e) => patchRow({ telemetry_company_other: e.target.value })}
                          className="h-11"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-sm font-medium text-foreground">Telemetry communication via</Label>
                      <select
                        value={row.telemetry_communication_via}
                        onChange={(e) => patchRow({ telemetry_communication_via: e.target.value })}
                        className="w-full border border-input rounded-lg px-3 h-11 max-w-md"
                      >
                        <option value="">Select</option>
                        <option value="sim">SIM</option>
                        <option value="wifi">Wi-Fi</option>
                        <option value="ethernet">Ethernet</option>
                      </select>
                    </div>
                  </div>

                  {row.telemetry_communication_via === 'sim' ? (
                    <div className="rounded-md border border-border bg-white p-3 space-y-3">
                      <p className="text-xs font-semibold text-foreground uppercase tracking-wide">Telemetry SIM</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">SIM provider</Label>
                          <select
                            value={row.telemetry_sim_provider}
                            onChange={(e) => patchRow({ telemetry_sim_provider: e.target.value })}
                            className="w-full border border-input rounded-lg px-3 h-11"
                          >
                            <option value="">Select</option>
                            <option value="airtel">Airtel</option>
                            <option value="jio">Jio</option>
                            <option value="bsnl">BSNL</option>
                            <option value="vodafone">Vodafone</option>
                            <option value="other">Other</option>
                          </select>
                        </div>
                        {row.telemetry_sim_provider === 'other' ? (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">Provider (manual)</Label>
                            <Input
                              value={row.telemetry_sim_provider_other}
                              onChange={(e) => patchRow({ telemetry_sim_provider_other: e.target.value })}
                              className="h-11"
                            />
                          </div>
                        ) : null}
                        <div className="space-y-2 sm:col-span-2">
                          <Label className="text-sm font-medium text-foreground">SIM number</Label>
                          <Input
                            value={row.telemetry_sim_number}
                            onChange={(e) => patchRow({ telemetry_sim_number: e.target.value })}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">SIM valid from</Label>
                          <Input
                            type="date"
                            value={row.telemetry_sim_valid_from}
                            onChange={(e) => patchRow({ telemetry_sim_valid_from: e.target.value })}
                            className="h-11"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">SIM valid to</Label>
                          <Input
                            type="date"
                            value={row.telemetry_sim_valid_to}
                            onChange={(e) => patchRow({ telemetry_sim_valid_to: e.target.value })}
                            className="h-11"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Telemetry product code</Label>
                      <Input
                        value={row.telemetry_product_code}
                        onChange={(e) => patchRow({ telemetry_product_code: e.target.value })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Telemetry serial number</Label>
                      <Input
                        value={row.telemetry_serial_number}
                        onChange={(e) => patchRow({ telemetry_serial_number: e.target.value })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Commissioning date of telemetry</Label>
                      <Input
                        type="date"
                        value={row.telemetry_commissioning_date}
                        onChange={(e) => patchRow({ telemetry_commissioning_date: e.target.value })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">How many telemetry SIM changed?</Label>
                      <Input
                        type="number"
                        min="0"
                        value={row.telemetry_sim_changed_count}
                        onChange={(e) => patchRow({ telemetry_sim_changed_count: e.target.value })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">How many times recharge done?</Label>
                      <Input
                        type="number"
                        min="0"
                        value={row.telemetry_recharge_count}
                        onChange={(e) => patchRow({ telemetry_recharge_count: e.target.value })}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <CgwMultiFilePicker
                    label="Telemetry Service Report"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                    files={bundle.telemetryServiceReport}
                    onChange={(telemetryServiceReport) => patchBundle({ telemetryServiceReport })}
                    hint="Optional; uploads after save (S3)."
                    {...pzSaved('telemetryServiceReport')}
                  />

                  <CgwMultiFilePicker
                    label="Upload telemetry photo"
                    accept="image/*,.jpg,.jpeg,.png,.webp,.gif"
                    imageOnly
                    files={bundle.telemetryPhotos}
                    onChange={(telemetryPhotos) => patchBundle({ telemetryPhotos })}
                    hint="Click + to add telemetry photos."
                    {...pzSaved('telemetryPhotos')}
                  />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-sm font-medium text-foreground">Telemetry portal URL</Label>
                      <Input aria-label="https://…"
                        type="url"
                        value={row.telemetry_portal_url}
                        onChange={(e) => patchRow({ telemetry_portal_url: e.target.value })}
                        placeholder="https://…"
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Username</Label>
                      <Input
                        value={row.telemetry_username}
                        onChange={(e) => patchRow({ telemetry_username: e.target.value })}
                        className="h-11"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Password</Label>
                      <Input
                        type="password"
                        value={row.telemetry_password}
                        onChange={(e) => patchRow({ telemetry_password: e.target.value })}
                        className="h-11"
                        autoComplete="new-password"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Telemetry valid from</Label>
                      <Input
                        type="date"
                        value={row.telemetry_valid_from}
                        onChange={(e) => patchRow({ telemetry_valid_from: e.target.value })}
                        className="h-11"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">Telemetry valid to</Label>
                      <Input
                        type="date"
                        value={row.telemetry_valid_to}
                        onChange={(e) => patchRow({ telemetry_valid_to: e.target.value })}
                        className="h-11"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Is telemetry uploaded previous year?</Label>
                    <select
                      value={row.telemetry_uploaded_previous_year}
                      onChange={(e) => patchRow({ telemetry_uploaded_previous_year: e.target.value })}
                      className="w-full border border-input rounded-lg px-3 h-11 max-w-md"
                    >
                      <option value="">Select</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>

                  {row.telemetry_uploaded_previous_year === 'yes' ? (
                    <div className="rounded-md border border-border bg-white p-3 space-y-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">Telemetry serial number</Label>
                        <select
                          value={row.telemetry_previous_serial_pick}
                          onChange={(e) => patchRow({ telemetry_previous_serial_pick: e.target.value })}
                          className="w-full border border-input rounded-lg px-3 h-11"
                        >
                          <option value="">Select serial</option>
                          {telemetrySerialOptions.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                          <option value="__manual__">Other (enter manually)</option>
                        </select>
                      </div>
                      {row.telemetry_previous_serial_pick === '__manual__' ? (
                        <div className="space-y-2">
                          <Label className="text-sm font-medium text-foreground">Serial number (manual)</Label>
                          <Input
                            value={row.telemetry_previous_serial_free}
                            onChange={(e) => patchRow({ telemetry_previous_serial_free: e.target.value })}
                            className="h-11"
                          />
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-foreground">If old telemetry data is available</Label>
                        <select
                          value={row.telemetry_previous_data_available}
                          onChange={(e) => patchRow({ telemetry_previous_data_available: e.target.value })}
                          className="w-full border border-input rounded-lg px-3 h-11 max-w-md"
                        >
                          <option value="">Select</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </div>

                      {row.telemetry_previous_data_available === 'yes' ? (
                        <div className="space-y-3 pt-1 border-t border-border">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-foreground">From date</Label>
                              <Input
                                type="date"
                                value={row.telemetry_previous_data_from}
                                onChange={(e) => patchRow({ telemetry_previous_data_from: e.target.value })}
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-sm font-medium text-foreground">To date</Label>
                              <Input
                                type="date"
                                value={row.telemetry_previous_data_to}
                                onChange={(e) => patchRow({ telemetry_previous_data_to: e.target.value })}
                                className="h-11"
                              />
                            </div>
                          </div>
                          <CgwMultiFilePicker
                            label="Upload Excel data"
                            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                            files={bundle.telemetryExcel}
                            onChange={(telemetryExcel) => patchBundle({ telemetryExcel })}
                            {...pzSaved('telemetryExcel')}
                          />
                          <CgwMultiFilePicker
                            label="Upload service report"
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,application/pdf,image/*"
                            files={bundle.priorTelemetryService}
                            onChange={(priorTelemetryService) => patchBundle({ priorTelemetryService })}
                            hint="Optional prior-year service report."
                            {...pzSaved('priorTelemetryService')}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>
      {typeof onSubmit === 'function' ? (
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground order-2 sm:order-1">Submit creates the flow metre record(s), then uploads flow metre and piezometer attachments.</p>
          <Button
            type="button"
            disabled={!!submitting}
            className="order-1 w-full bg-primary text-white hover:bg-primary/90 disabled:opacity-60 sm:order-2 sm:w-auto min-w-[8rem]"
            onClick={onSubmit}
          >
            {submitting ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default PiezometerAddWizardStep;
