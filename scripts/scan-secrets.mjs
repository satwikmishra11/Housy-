import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATTERNS = [
  { name: 'Anthropic API Key', regex: /sk-ant-api\d{2}-[a-zA-Z0-9_-]{30,}/g },
  { name: 'OpenAI API Key', regex: /sk-[a-zA-Z0-9]{32,}/g },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{35}/g },
  { name: 'Generic Secret Token', regex: /(?:bearer|secret|password|private_key|apikey|api_key)\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/gi },
  { name: 'Private Key', regex: /-----BEGIN (?:RSA|EC|DSA|OPENSSH)? ?PRIVATE KEY-----/g },
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Personal Access Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g },
];

const IGNORED_PATHS = [
  '.git',
  'node_modules',
  'dist',
  'coverage',
  '.system_generated',
  'package-lock.json',
];

const ALLOWED_MOCK_STRINGS = new Set([
  'housy-dev-jwt-secret-min-32-chars-long!',
  'housy-dev-session-secret-min-32-chars-long!',
  'housy-internal-cron-key-12345',
  'postgres://housy_user:housy_password@localhost:5432/housy_db',
  'DemoPass123!',
]);

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  for (const pattern of SECRET_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      for (const match of matches) {
        if (!ALLOWED_MOCK_STRINGS.has(match.trim()) && !match.includes('example.com') && !match.includes('localhost')) {
          issues.push({ pattern: pattern.name, match: match.slice(0, 15) + '...' });
        }
      }
    }
  }

  return issues;
}

function scanDirectory(dir) {
  let issuesCount = 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_PATHS.includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      issuesCount += scanDirectory(fullPath);
    } else if (entry.isFile()) {
      const issues = scanFile(fullPath);
      if (issues.length > 0) {
        console.error(`[SECRET FOUND] in ${fullPath}:`);
        for (const issue of issues) {
          console.error(`  - ${issue.pattern}: ${issue.match}`);
        }
        issuesCount += issues.length;
      }
    }
  }

  return issuesCount;
}

console.info('Running secret scan on working directory...');
const workingDirIssues = scanDirectory(process.cwd());

console.info('Scanning recent git commits...');
try {
  const gitLog = execSync('git log -n 50 -p', { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  let gitIssues = 0;
  for (const pattern of SECRET_PATTERNS) {
    const matches = gitLog.match(pattern.regex);
    if (matches) {
      for (const match of matches) {
        if (!ALLOWED_MOCK_STRINGS.has(match.trim()) && !match.includes('example.com') && !match.includes('localhost')) {
          console.error(`[SECRET IN GIT LOG] ${pattern.name}: ${match.slice(0, 15)}...`);
          gitIssues++;
        }
      }
    }
  }

  if (workingDirIssues === 0 && gitIssues === 0) {
    console.info('✅ Secret scan completed: 0 secrets found across files and git history.');
    process.exit(0);
  } else {
    console.error(`❌ Secret scan failed: ${workingDirIssues + gitIssues} potential secret(s) found.`);
    process.exit(1);
  }
} catch (err) {
  console.error('Error running git log:', err);
  process.exit(1);
}
