const { getConfig, saveConfig, getProviders } = require('./config');
const { detectTools } = require('./detect');
const { pickList } = require('./picker');

function resolveProviderId(tool) {
  if (tool.kind === 'terminal') return null;
  const cfg = getConfig();
  const routing = (cfg.providerRouting && cfg.providerRouting.tools) || {};
  return routing[tool.id] || tool.provider || (cfg.providerRouting && cfg.providerRouting.default) || null;
}

function printProviders() {
  const providers = getProviders();
  const cfg = getConfig();

  console.log('Providers:');
  for (const [id, provider] of Object.entries(providers)) {
    const extra = provider.baseUrl ? `  ${provider.baseUrl}` : '';
    console.log(`- ${id}  ${provider.label}${extra}`);
  }

  console.log('\nRouting:');
  const tools = detectTools();
  for (const tool of tools) {
    console.log(`  ${tool.label}  ->  ${resolveProviderId(tool) || '(none)'}`);
  }

  if (cfg.providerRouting && cfg.providerRouting.default) {
    console.log(`\nDefault provider: ${cfg.providerRouting.default}`);
  }
}

async function configureProvider() {
  const tools = detectTools().filter((tool) => tool.kind !== 'terminal');
  if (!tools.length) {
    console.log('No non-terminal tools detected.');
    return;
  }

  const toolPick = await pickList({
    title: 'Select a tool to route a provider for:',
    items: tools.map((tool) => ({ value: tool, label: `${tool.label} [${tool.kind}]` })),
  });
  if (!toolPick) {
    console.log('Cancelled.');
    return;
  }

  const providers = getProviders();
  const providerPick = await pickList({
    title: `Choose provider for ${toolPick.value.label}:`,
    items: Object.entries(providers).map(([id, provider]) => ({
      value: id,
      label: `${id} — ${provider.label}`,
    })),
  });
  if (!providerPick) {
    console.log('Cancelled.');
    return;
  }

  const cfg = getConfig();
  cfg.providerRouting = cfg.providerRouting || {};
  cfg.providerRouting.tools = cfg.providerRouting.tools || {};
  cfg.providerRouting.tools[toolPick.value.id] = providerPick.value;
  saveConfig(cfg);
  console.log(`Set ${toolPick.value.label} -> ${providerPick.value}`);
}

module.exports = { printProviders, configureProvider, resolveProviderId };
