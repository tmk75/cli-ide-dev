const fs = require('fs');
const path = require('path');

const TEXT_EXT = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rs', '.go', '.java',
  '.cs', '.php', '.rb', '.json', '.yaml', '.yml', '.toml', '.env', '.config',
  '.sql', '.html', '.vue', '.svelte', '.htm', '.css', '.scss', '.less', '.sh',
  '.ps1', '.bat', '.cmd', '.md', '.txt', '.csv',
]);

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__',
  'target', '.next', '.nuxt', '.cache', '.idea', '.vscode', '.expo', 'coverage',
]);

const POSITIVE_CHECKS = [
  {
    id: 'hardcoded_secret',
    law: 'CSL Art. 21',
    severity: 'high',
    message: 'Hardcoded credential or API key found',
    regex: /(?:api[_-]?key|apikey|secret|password|token|private[_-]?key)\s*[:=]\s*["'][^"'\s]{8,}["']/i,
  },
  {
    id: 'sensitive_pi',
    law: 'PIPL Art. 28-32',
    severity: 'high',
    message: 'Sensitive personal information fields detected',
    regex: /biometric|medical|health[_-]?record|financial[_-]?account|bank[_-]?account|location[_-]?tracking|minor|under[_-]?14|生物识别|医疗|健康|金融账户|位置信息|未成年|儿童/i,
  },
  {
    id: 'cross_border',
    law: 'PIPL Art. 38-40 / DSL Art. 31',
    severity: 'high',
    message: 'Potential cross-border data transfer endpoint',
    regex: /https?:\/\/(?:[a-z0-9.-]+\.)*(?:openai\.com|anthropic\.com|x\.ai|dashscope-intl\.aliyuncs\.com|amazonaws\.com|googleapis\.com|supabase\.co|vercel\.app|railway\.app|mongodb\.net|sentry\.io|stripe\.com|posthog\.com|cloudflare\.com|clerk\.com|resend\.com|upstash\.com|neon\.tech|prisma\.io)\b/i,
  },
  {
    id: 'personal_info',
    law: 'PIPL Art. 4',
    severity: 'medium',
    message: 'Personal information fields detected',
    regex: /\b(phone|mobile|email|id[_-]?card|passport|身份证|手机号|邮箱|地址|生日|性别)\b/i,
  },
  {
    id: 'insecure_http',
    law: 'CSL Art. 21',
    severity: 'medium',
    message: 'Insecure HTTP URL (TLS not enforced)',
    regex: /http:\/\/(?!(localhost|127\.0\.0\.1|0\.0\.0\.0))[^\s"']+/i,
  },
];

const PRESENCE_CHECKS = [
  { id: 'consent', pattern: /consent|opt[_-]?in|同意|授权|permission/i },
  { id: 'rights', pattern: /delete|remove|export|portability|access|correction|数据删除|导出|访问/i },
  { id: 'retention', pattern: /retention|ttl|expire|purge|auto[_-]?delete|保留期|自动删除/i },
  { id: 'classification', pattern: /classification|important[_-]?data|core[_-]?national|数据分类|分级|重要数据/i },
  { id: 'audit_log', pattern: /audit|logging|logger|日志|审计/i },
  { id: 'access_control', pattern: /auth|login|rbac|role|permission|authorize|鉴权|权限|登录/i },
  { id: 'rate_limit', pattern: /rate[_-]?limit|sanitize|validator|validate|input[_-]?validation|限流|校验/i },
  { id: 'encryption', pattern: /encrypt|decrypt|crypto|bcrypt|argon2|scrypt|sha256|aes|加密/i },
];

function collectFiles(root, maxDepth, maxFiles) {
  const files = [];

  function walk(dir, depth) {
    if (files.length >= maxFiles || depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        const nameLower = entry.name.toLowerCase();
        if (TEXT_EXT.has(ext) || nameLower.startsWith('.env') || nameLower === 'dockerfile') {
          files.push(full);
        }
      }
    }
  }

  walk(root, 0);
  return files.slice(0, maxFiles);
}

function readText(file) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 200 * 1024) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function scanCompliance(projectPath, opts = {}) {
  const quick = Boolean(opts.quick);
  const files = collectFiles(projectPath, quick ? 0 : 4, quick ? 200 : 2000);
  const checks = quick
    ? POSITIVE_CHECKS.filter((check) => check.severity === 'high')
    : POSITIVE_CHECKS;

  const matches = {};
  const presence = {};

  for (const file of files) {
    const text = readText(file);
    if (!text) continue;

    for (const check of checks) {
      if (check.regex.test(text)) {
        (matches[check.id] = matches[check.id] || []).push(file);
      }
    }

    for (const pc of PRESENCE_CHECKS) {
      if (!presence[pc.id] && pc.pattern.test(text)) presence[pc.id] = true;
    }
  }

  const findings = [];
  const add = (id, law, severity, message, evidence) =>
    findings.push({ id, law, severity, message, evidence: evidence.slice(0, 5) });

  for (const check of checks) {
    if (matches[check.id] && matches[check.id].length) {
      add(check.id, check.law, check.severity, check.message, matches[check.id]);
    }
  }

  if (!quick) {
    const hasPI = Boolean(matches.personal_info) || Boolean(matches.sensitive_pi);
    if (hasPI && !presence.consent) {
      add('missing_consent', 'PIPL Art. 13-14', 'high', 'No explicit consent mechanism detected for personal information', []);
    }
    if (hasPI && !presence.rights) {
      add('missing_rights', 'PIPL Art. 44-50', 'medium', 'No data subject rights endpoints detected (access/correct/delete/export)', []);
    }
    if (hasPI && !presence.retention) {
      add('missing_retention', 'PIPL Art. 19', 'low', 'No retention/deletion schedule detected', []);
    }
    if (Boolean(matches.sensitive_pi) && !presence.encryption) {
      add('missing_encryption', 'PIPL Art. 51', 'high', 'Sensitive PI without detectable encryption controls', []);
    }
    if (!presence.classification) {
      add('missing_classification', 'DSL Art. 21', 'medium', 'No data classification/grading labels detected', []);
    }
    if (!presence.audit_log) {
      add('missing_audit_log', 'CSL Art. 21', 'medium', 'No audit logging detected (>=6 month retention cannot be verified)', []);
    }
    if (!presence.access_control) {
      add('missing_access_control', 'CSL Art. 21 / PIPL Art. 51', 'medium', 'No access control / auth patterns detected', []);
    }
    if (!presence.rate_limit) {
      add('missing_rate_limit', 'CSL Art. 21', 'low', 'No rate limiting / input validation patterns detected', []);
    }
  }

  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  findings.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  return {
    enabled: fs.existsSync(path.join(projectPath, '.compliance-framework.json')),
    filesScanned: files.length,
    findings,
    risk: findings.length ? findings[0].severity : 'none',
  };
}

function complianceStatus(projectPath) {
  const result = scanCompliance(projectPath, { quick: true });
  return { enabled: result.enabled, risk: result.risk, count: result.findings.length };
}

function formatComplianceReport(projectName, projectPath, result) {
  const lines = [];
  lines.push(`# Compliance Check: ${projectName}`);
  lines.push(`- Laws applicable: CSL / DSL / PIPL`);
  lines.push(`- Framework marker: ${result.enabled ? 'enabled' : 'not enabled'}`);
  lines.push(`- Files scanned: ${result.filesScanned}`);
  lines.push(`- Overall risk: ${result.risk.toUpperCase()}`);
  lines.push('');

  if (!result.findings.length) {
    lines.push('No code-level findings detected.');
  }

  for (const finding of result.findings) {
    lines.push(`## [${finding.severity.toUpperCase()}] ${finding.message}`);
    lines.push(`- Law: ${finding.law}`);
    if (finding.evidence.length) {
      lines.push('- Evidence:');
      for (const file of finding.evidence) lines.push(`  - ${file}`);
    }
    lines.push('');
  }

  lines.push('## Limitations');
  lines.push('- This is a heuristic code scan, not a legal certification.');
  lines.push('- Organizational/process obligations (MLPS filing, DPIA, CII determination, incident response plans) cannot be verified from code alone.');
  lines.push('- Review findings with legal counsel before relying on them for release decisions.');
  return lines.join('\n');
}

module.exports = { scanCompliance, complianceStatus, formatComplianceReport };
