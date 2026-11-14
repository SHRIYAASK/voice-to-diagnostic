/**
 * ApplianceCare AI — Scorecard Exporter
 *
 * Exports structured benchmark reports to JSON and Markdown artifacts.
 */

import fs from 'fs';
import path from 'path';
import { BenchmarkSuiteReport } from '../types';

export class ScorecardExporter {
  public static exportToJson(report: BenchmarkSuiteReport, outputPath?: string): string {
    const targetPath = outputPath || path.resolve(process.cwd(), 'reports/benchmark_scorecard.json');
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(targetPath, JSON.stringify(report, null, 2), 'utf-8');
    return targetPath;
  }
}

