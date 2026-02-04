// 测试脚本：检查配置保存和加载
const SORA_CONFIG_KEY = 'sora_storage_config';

function getSoraStorageConfig() {
  const stored = localStorage.getItem(SORA_CONFIG_KEY);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('解析配置失败:', e);
    return {};
  }
}

function saveSoraStorageConfig(config) {
  localStorage.setItem(SORA_CONFIG_KEY, JSON.stringify(config));
  console.log('配置已保存:', config);
}

function getSoraProvider() {
  const config = getSoraStorageConfig();
  const provider = config.provider || 'sutu';
  console.log('获取到的提供商:', provider, '(完整配置:', config, ')');
  return provider;
}

function saveSoraProvider(provider) {
  const config = getSoraStorageConfig();
  config.provider = provider;
  saveSoraStorageConfig(config);
  console.log('提供商已设置为:', provider);
}

// 测试流程
console.log('=== 测试开始 ===');
console.log('1. 当前配置:', getSoraStorageConfig());
console.log('2. 当前提供商:', getSoraProvider());

console.log('\n3. 设置为云雾 API...');
saveSoraProvider('yunwu');

console.log('\n4. 重新获取提供商:');
const newProvider = getSoraProvider();
console.log('新提供商:', newProvider);

console.log('\n5. 完整配置:', getSoraStorageConfig());
console.log('=== 测试结束 ===');
