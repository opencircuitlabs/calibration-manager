#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { calibrationLabel, createAsset, dueStatus, optimizeInterval, outOfToleranceImpact, programMetrics, recallPlan, recordCalibration, reportMarkdown, validateAsset, verifyTraceability } from './index.js';
const args = process.argv.slice(2); const [command, first, second, third] = args; const option = (name) => { const index = args.indexOf(`--${name}`); return index < 0 ? undefined : args[index + 1]; }; const load = async (path) => JSON.parse(await readFile(path, 'utf8')); const emit = async (value) => { const output = `${JSON.stringify(value, null, 2)}\n`; if (option('output')) await writeFile(option('output'), output); else process.stdout.write(output); };
try { if (!command || command === 'help') process.stdout.write('Usage: calibration-manager <build input.json|validate asset.json|status asset.json|record asset.json calibration.json|trace record.json standards.json certificates.json|impact asset.json record.json usage.json|recall assets.json|interval asset.json|label asset.json|metrics assets.json|report assets.json> [--at ISO] [--output file]\n');
  else if (command === 'build' && first) await emit(createAsset(await load(first)));
  else if (command === 'validate' && first) { const result = validateAsset(await load(first)); await emit(result); if (!result.valid) process.exitCode = 2; }
  else if (command === 'status' && first) await emit(dueStatus(await load(first), option('at')));
  else if (command === 'record' && first && second) await emit(recordCalibration(await load(first), await load(second)));
  else if (command === 'trace' && first && second && third) await emit(verifyTraceability(await load(first), await load(second), await load(third), option('at')));
  else if (command === 'impact' && first && second && third) await emit(outOfToleranceImpact(await load(first), await load(second), await load(third)));
  else if (command === 'recall' && first) await emit(recallPlan(await load(first), option('at')));
  else if (command === 'interval' && first) await emit(optimizeInterval(await load(first)));
  else if (command === 'label' && first) await emit(calibrationLabel(await load(first), option('at')));
  else if (command === 'metrics' && first) await emit(programMetrics(await load(first), option('at')));
  else if (command === 'report' && first) { const output = reportMarkdown(await load(first), option('at')); if (option('output')) await writeFile(option('output'), output); else process.stdout.write(output); }
  else throw new Error('invalid command or arguments'); } catch (error) { process.stderr.write(`calibration-manager: ${error.message}\n`); process.exitCode = 1; }
