const { getConfig, getProviders } = require('./config');
const { detectTools } = require('./detect');

function str(value) {
  return typeof value === 'string' ? value : '';
}

function slug(text) {
  const value = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return value || 'new-project';
}

function extractJson(text) {
  let value = String(text || '').trim();
  const fence = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) value = fence[1].trim();
  const start = value.indexOf('{');
  if (start === -1) throw new Error('No JSON object found in response');

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < value.length; i++) {
    const ch = value[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = value.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch (firstError) {
          try {
            return JSON.parse(candidate.replace(/,\s*([}\]])/g, '$1'));
          } catch {
            throw firstError;
          }
        }
      }
    }
  }

  throw new Error('Could not isolate a JSON object from response');
}

function getPlanSettings() {
  const cfg = getConfig();
  const plan = (cfg && cfg.plan) || {};
  const providers = getProviders();
  const requestedId = plan.provider || 'deepseek';

  const hasKey = (candidate) =>
    candidate &&
    !candidate.native &&
    candidate.baseUrl &&
    candidate.apiKeyEnv &&
    Boolean(process.env[candidate.apiKeyEnv]);

  let provider = hasKey(providers[requestedId]) ? providers[requestedId] : null;
  let providerId = requestedId;

  if (!provider) {
    const entry = Object.entries(providers).find(([, candidate]) => hasKey(candidate));
    if (entry) {
      providerId = entry[0];
      provider = entry[1];
    }
  }

  const model =
    plan.model ||
    (provider && Array.isArray(provider.models) && provider.models[0]) ||
    'deepseek-chat';
  const apiKey = provider ? process.env[provider.apiKeyEnv] : null;

  return { providerId, provider, model, apiKey };
}

function systemPrompt(tools) {
  const toolList = tools.length
    ? tools.map((tool) => `${tool.id} — ${tool.label} [${tool.kind}]`).join('\n')
    : '(no host tools detected)';

  return [
    'You are the project planner inside IntelliDev, a Windows launcher for developers.',
    'Given a short project description, return a single JSON object with EXACTLY these keys and no surrounding prose or markdown:',
    '{"name":"...","summary":"...","ux":"...","frontend":{"stack":"...","reason":"..."},"backend":{"stack":"...","reason":"..."},"database":{"name":"...","reason":"..."},"tool":"...","toolReason":"...","nextSteps":["...","...","..."]}',
    'name: a short kebab-case slug.',
    'summary: one sentence.',
    'ux: a 1-2 sentence UI/UX direction.',
    'frontend.stack / backend.stack: pragmatic, current, mainstream choices; use "None" when not needed.',
    'database.name: the recommended database (e.g. SQLite, PostgreSQL, MySQL, MongoDB) or "None" when not needed.',
    'tool: pick ONE tool id from the list below that best fits the project.',
    'toolReason: one short sentence explaining the tool choice.',
    'nextSteps: exactly 3 short, concrete first steps.',
    'Available tools:',
    toolList,
  ].join('\n');
}

function pickTool(description, tools) {
  if (!tools.length) return null;
  const text = description.toLowerCase();
  const byKind = (kind) => tools.find((tool) => tool.kind === kind);
  if (/script|cli|command|terminal|automation|tooling|ops/.test(text)) {
    return byKind('terminal') || byKind('ide') || tools[0];
  }
  if (/agent|ai|copilot|codex|claude|grok|qwen|assist/.test(text)) {
    return byKind('agent') || byKind('ide') || tools[0];
  }
  return byKind('ide') || byKind('agent') || tools[0];
}

function fallbackPlan(description, tools) {
  const text = description.toLowerCase();

  let frontend = { stack: 'None', reason: 'No web frontend requested.' };
  if (/react/.test(text)) {
    frontend = { stack: 'React + Vite + TypeScript', reason: 'React fits a component-driven UI.' };
  } else if (/vue/.test(text)) {
    frontend = { stack: 'Vue 3 + Vite + TypeScript', reason: 'Vue is a lightweight fit for a single-page UI.' };
  } else if (/next\.?js|nextjs/.test(text)) {
    frontend = { stack: 'Next.js + TypeScript', reason: 'Next.js covers rendering and API routes together.' };
  } else if (/dashboard|web|ui|spa|frontend|landing|portal|app/.test(text)) {
    frontend = { stack: 'React + Vite + Tailwind', reason: 'A fast default for a modern web interface.' };
  }

  let backend = { stack: 'None', reason: 'No backend requested.' };
  if (/python|django|flask|fastapi|machine learning|ml|ai|data|scrape|crawl/.test(text)) {
    backend = { stack: 'FastAPI + SQLite', reason: 'FastAPI is quick for APIs and data work; SQLite keeps it self-contained.' };
  } else if (/node|express|nest|api|backend/.test(text)) {
    backend = { stack: 'Node.js + Express', reason: 'Node keeps one language across the stack.' };
  } else if (/golang|\bgo\b/.test(text)) {
    backend = { stack: 'Go + net/http', reason: 'Go suits a small, fast service.' };
  } else if (/rust/.test(text)) {
    backend = { stack: 'Rust + Axum', reason: 'Rust suits a performance-focused service.' };
  } else if (/sqlite|postgres|database/.test(text)) {
    backend = { stack: 'FastAPI + SQLite', reason: 'A simple data backend.' };
  }

  let database = { name: 'None', reason: 'No database required.' };
  if (/sqlite/.test(text)) {
    database = { name: 'SQLite', reason: 'Zero-config, file-based, and great for a single-service app.' };
  } else if (/postgres|postgresql|pg/.test(text)) {
    database = { name: 'PostgreSQL', reason: 'A robust relational database for production data.' };
  } else if (/mongo|mongodb/.test(text)) {
    database = { name: 'MongoDB', reason: 'Document storage for flexible, schema-light data.' };
  } else if (/mysql/.test(text)) {
    database = { name: 'MySQL', reason: 'A widely used relational database.' };
  } else if (/data|store|records|holdings|crud|api/.test(text) && backend.stack !== 'None') {
    database = { name: 'SQLite', reason: 'A sensible default to start; easy to swap later.' };
  }

  const tool = pickTool(text, tools);
  return {
    name: slug(description),
    summary: description.trim(),
    ux: 'Clean, single-purpose interface with a clear primary action; keep the layout minimal and information-dense.',
    frontend,
    backend,
    database,
    tool: tool ? tool.id : null,
    toolReason: tool ? 'Best matching installed tool for this kind of project.' : '',
    nextSteps: [
      'Initialize the scaffold',
      'Set up the chosen stack and its dependencies',
      'Open the project in the selected tool',
    ],
  };
}

function normalizePlan(raw, tools) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const toolIds = new Set(tools.map((tool) => tool.id));
  const tool = toolIds.has(obj.tool) ? obj.tool : tools[0] ? tools[0].id : null;

  return {
    name: slug(obj.name),
    summary: str(obj.summary),
    ux: str(obj.ux),
    frontend: {
      stack: str(obj.frontend && obj.frontend.stack) || 'None',
      reason: str(obj.frontend && obj.frontend.reason),
    },
    backend: {
      stack: str(obj.backend && obj.backend.stack) || 'None',
      reason: str(obj.backend && obj.backend.reason),
    },
    database: {
      name: str(obj.database && obj.database.name) || 'None',
      reason: str(obj.database && obj.database.reason),
    },
    tool,
    toolReason: str(obj.toolReason),
    nextSteps: Array.isArray(obj.nextSteps)
      ? obj.nextSteps.filter((step) => typeof step === 'string').slice(0, 5)
      : [],
  };
}

async function buildPlan(description) {
  const { providerId, provider, model, apiKey } = getPlanSettings();
  const tools = detectTools();

  if (!apiKey || !provider || !provider.baseUrl) {
    return {
      plan: fallbackPlan(description, tools),
      mode: 'fallback',
      warning: 'No callable AI provider configured; using offline recommendations.',
    };
  }

  try {
    const url = provider.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [
          { role: 'system', content: systemPrompt(tools) },
          { role: 'user', content: description },
        ],
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new Error(
        'Provider ' + providerId + ' returned HTTP ' + response.status +
        (bodyText ? ': ' + bodyText.slice(0, 160) : ''),
      );
    }

    const data = await response.json();
    const content =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;
    if (!content) throw new Error('Provider returned no plan text.');

    return {
      plan: normalizePlan(extractJson(content), tools),
      mode: 'ai',
      provider: providerId,
      model,
    };
  } catch (error) {
    return {
      plan: fallbackPlan(description, tools),
      mode: 'fallback',
      warning: 'AI planning failed (' + error.message + '); used offline recommendations.',
    };
  }
}

module.exports = { buildPlan, fallbackPlan, getPlanSettings };
