import { createHash } from 'node:crypto';
const round = (value, places = 4) => Number(value.toFixed(places));
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const digest = (value) => createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const day = 86400000;
const time = (value) => { const result = Date.parse(value); if (!Number.isFinite(result)) throw new Error(`invalid date ${value}`); return result; };
const addDays = (value, days) => new Date(time(value) + days * day).toISOString();

export function createAsset(input) {
  const asset = { schemaVersion: 1, assetId: input.assetId, description: input.description, manufacturer: input.manufacturer ?? null, model: input.model ?? null, serial: input.serial, location: input.location, owner: input.owner ?? null, status: input.status ?? 'active', intervalDays: input.intervalDays, warningDays: input.warningDays ?? 30, capabilities: input.capabilities ?? [], environmentalLimits: input.environmentalLimits ?? null, createdAt: input.createdAt ?? null, lastCalibration: input.lastCalibration ?? null, history: input.history ?? [] };
  asset.recordHash = digest(asset); return asset;
}

export function validateAsset(asset) {
  const issues = []; if (asset?.schemaVersion !== 1) issues.push({ code: 'schema-version', path: 'schemaVersion' }); for (const field of ['assetId', 'description', 'serial', 'location']) if (!asset?.[field]) issues.push({ code: 'required', path: field }); if (!['active', 'limited', 'quarantined', 'retired'].includes(asset?.status)) issues.push({ code: 'status', path: 'status' }); if (!(asset?.intervalDays > 0)) issues.push({ code: 'interval', path: 'intervalDays' }); const ids = new Set(); for (const record of asset?.history ?? []) { if (!record.id) issues.push({ code: 'record-id', path: 'history' }); if (ids.has(record.id)) issues.push({ code: 'duplicate-record', path: 'history' }); ids.add(record.id); }
  const copy = structuredClone(asset ?? {}); delete copy.recordHash; const calculatedHash = digest(copy); if (asset?.recordHash !== calculatedHash) issues.push({ code: 'record-hash', path: 'recordHash' }); return { valid: issues.length === 0, calculatedHash, issues };
}

export function dueStatus(asset, at = new Date().toISOString()) {
  if (asset.status === 'retired') return { state: 'retired', dueAt: null, daysRemaining: null, usable: false };
  if (!asset.lastCalibration?.at) return { state: 'never-calibrated', dueAt: null, daysRemaining: null, usable: false };
  const dueAt = asset.lastCalibration.dueAt ?? addDays(asset.lastCalibration.at, asset.intervalDays); const daysRemaining = Math.ceil((time(dueAt) - time(at)) / day); const state = daysRemaining < 0 ? 'overdue' : daysRemaining <= asset.warningDays ? 'due-soon' : 'current'; return { state, dueAt, daysRemaining, usable: state !== 'overdue' && asset.status === 'active' && asset.lastCalibration.result === 'pass' };
}

export function measurementAssessment(readings, specification) {
  if (!(specification.tolerance > 0)) throw new Error('positive tolerance is required'); const assessed = readings.map((reading) => { const error = reading.indicated - reading.reference; const uncertainty = reading.uncertainty ?? 0; const guardBandLimit = specification.tolerance - uncertainty * (specification.guardBandFactor ?? 1); return { ...reading, error: round(error), guardBandLimit: round(guardBandLimit), pass: Math.abs(error) <= guardBandLimit }; }); const maximumAbsoluteError = Math.max(0, ...assessed.map((reading) => Math.abs(reading.error))); const maximumUncertainty = Math.max(0, ...assessed.map((reading) => reading.uncertainty ?? 0)); return { pass: assessed.every((reading) => reading.pass), readings: assessed, maximumAbsoluteError: round(maximumAbsoluteError), testUncertaintyRatio: maximumUncertainty ? round(specification.tolerance / maximumUncertainty) : Infinity };
}

export function environmentalCompliance(asset, environment) {
  const limits = asset.environmentalLimits; if (!limits) return { compliant: true, violations: [] }; const violations = []; for (const measure of ['temperature', 'humidity']) { const value = environment[measure]; const range = limits[measure]; if (range && (value == null || value < range.min || value > range.max)) violations.push({ measure, value, allowed: range }); } return { compliant: violations.length === 0, violations };
}

export function recordCalibration(asset, input) {
  if (!input.id || !input.at || !input.by || !input.certificateId) throw new Error('id, at, by, and certificateId are required'); const environment = environmentalCompliance(asset, input.environment ?? {}); if (!environment.compliant) throw new Error('calibration environment is outside limits'); const asFound = measurementAssessment(input.asFoundReadings, input.specification); const asLeft = input.asLeftReadings ? measurementAssessment(input.asLeftReadings, input.specification) : asFound; const result = asLeft.pass ? 'pass' : 'fail'; const record = { id: input.id, at: input.at, dueAt: input.dueAt ?? addDays(input.at, asset.intervalDays), by: input.by, certificateId: input.certificateId, standardIds: [...(input.standardIds ?? [])].sort(), environment: input.environment ?? null, specification: input.specification, asFound, asLeft, asFoundResult: asFound.pass ? 'pass' : 'fail', result, notes: input.notes ?? null }; const next = createAsset({ ...asset, status: result === 'pass' ? 'active' : 'quarantined', lastCalibration: { id: record.id, at: record.at, dueAt: record.dueAt, result }, history: [...asset.history, record] }); return { asset: next, record, outOfTolerance: !asFound.pass };
}

export function verifyTraceability(record, standards, certificates, at = record.at) {
  const standardMap = new Map(standards.map((standard) => [standard.assetId, standard])); const certificateMap = new Map(certificates.map((certificate) => [certificate.id, certificate])); const issues = []; for (const id of record.standardIds) { const standard = standardMap.get(id); if (!standard) { issues.push({ code: 'missing-standard', id }); continue; } const status = dueStatus(standard, at); if (!status.usable) issues.push({ code: 'standard-not-current', id, state: status.state }); }
  const certificate = certificateMap.get(record.certificateId); if (!certificate) issues.push({ code: 'missing-certificate', id: record.certificateId }); else if (certificate.sha256 && !/^[a-f0-9]{64}$/.test(certificate.sha256)) issues.push({ code: 'certificate-hash', id: certificate.id }); return { traceable: issues.length === 0, issues };
}

export function outOfToleranceImpact(asset, record, usageEvents) {
  if (record.asFoundResult !== 'fail') return { required: false, window: null, affected: [] }; const previous = [...asset.history].filter((item) => time(item.at) < time(record.at) && item.result === 'pass').sort((a, b) => time(b.at) - time(a.at))[0]; const from = previous?.at ?? asset.createdAt ?? null; const affected = usageEvents.filter((event) => event.assetId === asset.assetId && (!from || time(event.at) >= time(from)) && time(event.at) <= time(record.at)).map((event) => ({ eventId: event.id, at: event.at, productIds: event.productIds ?? [], testIds: event.testIds ?? [] })); return { required: true, window: { from, to: record.at }, affected, productIds: [...new Set(affected.flatMap((event) => event.productIds))].sort(), testIds: [...new Set(affected.flatMap((event) => event.testIds))].sort() };
}

export function recallPlan(assets, at = new Date().toISOString()) {
  const groups = { overdue: [], dueSoon: [], unusable: [] }; for (const asset of assets) { const status = dueStatus(asset, at); const row = { assetId: asset.assetId, location: asset.location, dueAt: status.dueAt, daysRemaining: status.daysRemaining }; if (status.state === 'overdue') groups.overdue.push(row); if (status.state === 'due-soon') groups.dueSoon.push(row); if (!status.usable && !['overdue', 'retired'].includes(status.state)) groups.unusable.push({ ...row, state: status.state }); } return { actionRequired: groups.overdue.length + groups.unusable.length > 0, ...groups };
}

export function optimizeInterval(asset, policy = {}) {
  const records = asset.history.filter((record) => record.asFoundResult); const failures = records.filter((record) => record.asFoundResult === 'fail').length; const consecutivePasses = [...records].reverse().findIndex((record) => record.asFoundResult === 'fail'); const passes = consecutivePasses < 0 ? records.length : consecutivePasses; let intervalDays = asset.intervalDays; let reason = 'unchanged'; if (failures && records.at(-1)?.asFoundResult === 'fail') { intervalDays = Math.max(policy.minimumDays ?? 30, Math.floor(intervalDays * (policy.failureFactor ?? 0.5))); reason = 'recent-failure'; } else if (passes >= (policy.passesToExtend ?? 3)) { intervalDays = Math.min(policy.maximumDays ?? 730, Math.ceil(intervalDays * (policy.extensionFactor ?? 1.25))); reason = 'stable-history'; } return { currentDays: asset.intervalDays, recommendedDays: intervalDays, reason, evidence: { records: records.length, failures, consecutivePasses: passes } };
}

export function calibrationLabel(asset, at = new Date().toISOString()) { const status = dueStatus(asset, at); return { assetId: asset.assetId, serial: asset.serial, status: status.state, calibratedAt: asset.lastCalibration?.at ?? null, dueAt: status.dueAt, calibrationId: asset.lastCalibration?.id ?? null, usable: status.usable, text: `${asset.assetId} | ${status.state.toUpperCase()} | DUE ${status.dueAt?.slice(0, 10) ?? 'N/A'}` }; }

export function programMetrics(assets, at = new Date().toISOString()) { const statuses = assets.map((asset) => dueStatus(asset, at)); const current = statuses.filter((status) => status.usable).length; return { assetCount: assets.length, usableCount: current, compliancePercent: assets.length ? round(current / assets.length * 100, 2) : 100, overdueCount: statuses.filter((status) => status.state === 'overdue').length, dueSoonCount: statuses.filter((status) => status.state === 'due-soon').length, neverCalibratedCount: statuses.filter((status) => status.state === 'never-calibrated').length }; }

export function reportMarkdown(assets, at = new Date().toISOString()) { const metrics = programMetrics(assets, at); const lines = ['# Calibration program report', '', `Assets: ${metrics.assetCount} | Usable: ${metrics.usableCount} | Compliance: ${metrics.compliancePercent}%`, '', '| Asset | Location | State | Due | Usable |', '| --- | --- | --- | --- | --- |']; for (const asset of assets) { const status = dueStatus(asset, at); lines.push(`| ${asset.assetId} | ${asset.location} | ${status.state} | ${status.dueAt?.slice(0, 10) ?? '-'} | ${status.usable ? 'yes' : 'no'} |`); } return `${lines.join('\n')}\n`; }
