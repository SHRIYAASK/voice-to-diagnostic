import fs from 'fs';
import path from 'path';

function findDataDir(): string {
  if (process.env.DATA_DIR && fs.existsSync(process.env.DATA_DIR)) {
    return path.resolve(process.env.DATA_DIR);
  }
  const candidates = [
    path.resolve(__dirname, '../../docs/lg-airconditioner'),
    path.resolve(process.cwd(), 'docs/lg-airconditioner'),
    path.resolve(__dirname, '../../../docs/lg-airconditioner'),
    path.resolve(process.cwd(), '../docs/lg-airconditioner'),
    path.resolve(__dirname, '../docs/lg-airconditioner'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(__dirname, '../../docs/lg-airconditioner');
}

const DATA_DIR = findDataDir();

// ── Types ────────────────────────────────────────────────────────────────────

export interface ErrorCode {
  code: string;
  display: string;
  category: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  customer_action: string;
  technician_action?: string;
  likely_parts: string[];
  safety_flag: boolean;
  aliases?: string[];
}

export interface NodeOption {
  label: string;
  next_node?: string;
  conclusion?: string;
  resolution?: string;
  redirect_issue?: string;
  action?: string;
}

export interface DiagnosticNode {
  id: string;
  type: string;
  text_en: string;
  text_hi?: string;
  options: NodeOption[];
}

export interface ConclusionRecord {
  probable_cause: string;
  confidence?: number;
  parts?: string[];
  priority?: string;
  safety_flag?: boolean;
  rag_query?: string;
  technician_note?: string;
}

export interface DiagnosticTree {
  issue_id: string;
  title: string;
  start_node: string;
  nodes: DiagnosticNode[];
  conclusions: Record<string, ConclusionRecord>;
}

export interface GetTreeRequest {
  issueId: string;
  appliance?: string;
  model?: string;
}

// ── Loaders ──────────────────────────────────────────────────────────────────

let _errorCodes: ErrorCode[] | null = null;
let _trees: Map<string, DiagnosticTree> | null = null;
let _maintenanceText: string | null = null;
let _warrantyText: string | null = null;

export function getErrorCodes(): ErrorCode[] {
  if (_errorCodes) return _errorCodes;
  const raw = fs.readFileSync(path.join(DATA_DIR, 'lg_ac_error_codes.json'), 'utf-8');
  _errorCodes = JSON.parse(raw) as ErrorCode[];
  return _errorCodes;
}

export function getAllTrees(): Map<string, DiagnosticTree> {
  if (_trees) return _trees;
  _trees = new Map();
  for (let i = 1; i <= 16; i++) {
    const id = `AC${String(i).padStart(2, '0')}`;
    const filePath = path.join(DATA_DIR, `diagnostic_tree_ac${String(i).padStart(2, '0')}.json`);
    if (!fs.existsSync(filePath)) continue;
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const tree = JSON.parse(raw) as DiagnosticTree;
      _trees.set(tree.issue_id, tree);
    } catch (e) {
      console.warn(`[DataStore] Failed to parse ${filePath}:`, (e as Error).message);
    }
  }
  return _trees;
}

export function getTree(request: GetTreeRequest): DiagnosticTree | undefined;
export function getTree(issueId: string): DiagnosticTree | undefined;
export function getTree(param: string | GetTreeRequest): DiagnosticTree | undefined {
  const id = typeof param === 'string' ? param : param?.issueId;
  if (!id) return undefined;
  return getAllTrees().get(id.toUpperCase());
}

export function getMaintenanceText(): string {
  if (_maintenanceText) return _maintenanceText;
  _maintenanceText = fs.readFileSync(
    path.join(DATA_DIR, 'manual_disassembly_maintenance.txt'), 'utf-8'
  );
  return _maintenanceText;
}

export function getWarrantyText(): string {
  if (_warrantyText) return _warrantyText;
  _warrantyText = fs.readFileSync(
    path.join(DATA_DIR, 'warranty_policy_rules.txt'), 'utf-8'
  );
  return _warrantyText;
}

// ── Error-code search ────────────────────────────────────────────────────────

export function findErrorCode(query: string): ErrorCode | null {
  const normalised = query.toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
  const codes = getErrorCodes();
  return codes.find(ec => {
    const code = ec.code.toUpperCase().replace(/\s+/g, '');
    if (code === normalised) return true;
    if (ec.aliases) {
      return ec.aliases.some(a => a.toUpperCase().replace(/\s+/g, '') === normalised);
    }
    return false;
  }) || null;
}

export function searchErrorCodes(query: string): ErrorCode[] {
  if (!query || query.trim().length < 2) return [];
  const q = query.toLowerCase();
  return getErrorCodes().filter(ec =>
    ec.code.toLowerCase().includes(q) ||
    ec.description.toLowerCase().includes(q) ||
    ec.category.toLowerCase().includes(q) ||
    (ec.aliases || []).some(a => a.toLowerCase().includes(q))
  ).slice(0, 10);
}

// ── Validation ───────────────────────────────────────────────────────────────

export function validateTree(tree: DiagnosticTree): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(tree.nodes.map(n => n.id));

  for (const node of tree.nodes) {
    for (const opt of node.options) {
      if (opt.next_node && !nodeIds.has(opt.next_node)) {
        errors.push(`Node "${node.id}" → option "${opt.label}" references missing node "${opt.next_node}"`);
      }
      if (opt.conclusion && !tree.conclusions[opt.conclusion]) {
        errors.push(`Node "${node.id}" → option "${opt.label}" references missing conclusion "${opt.conclusion}"`);
      }
    }
  }
  if (!nodeIds.has(tree.start_node)) {
    errors.push(`start_node "${tree.start_node}" not found in nodes`);
  }
  return errors;
}
