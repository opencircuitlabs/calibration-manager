# Calibration Manager

`calibration-manager` provides metrology control for electronics laboratories and factories: equipment records, due-date enforcement, uncertainty-aware results, traceability, out-of-tolerance impact, recalls, labels, and program reporting.

## Capabilities

- Deterministic, content-hashed measurement asset records
- Current, due-soon, overdue, never-calibrated, quarantined, and retired states
- Guard-banded measurement error and test uncertainty ratio calculations
- As-found/as-left calibration results and automatic quarantine
- Temperature and humidity limit enforcement
- Reference-standard and certificate traceability verification
- Out-of-tolerance product/test impact windows from usage history
- Recall queues for overdue and unusable equipment
- Evidence-based interval reduction or extension recommendations
- Printable calibration label data
- Program compliance metrics and Markdown reports
- Dependency-free Node.js 18+ library and CLI

## Quick start

```bash
npm install
npm test
node src/cli.js build examples/asset.json --output asset.json
node src/cli.js validate asset.json
node src/cli.js status asset.json --at 2026-10-01
node src/cli.js record asset.json examples/calibration.json
```

## Library API

```js
import { createAsset, dueStatus, recordCalibration, outOfToleranceImpact } from '@opencircuitlabs/calibration-manager';

const asset = createAsset(metadata);
const status = dueStatus(asset, '2026-10-01T00:00:00Z');
const result = recordCalibration(asset, calibrationInput);
```

This library supports a calibration program but does not itself establish metrological traceability or laboratory competence. Measurement procedures, uncertainty budgets, guard bands, intervals, impact dispositions, and accreditation requirements remain the responsibility of qualified personnel.

## License

MIT. See [LICENSE](LICENSE).
