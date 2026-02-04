# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please email: **a@ggbo.com**

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We will respond within 48 hours and patch the issue promptly.

## Security Best Practices

### For Users

- Never commit `.env` files or API keys
- Use environment variables for sensitive data
- Keep dependencies updated
- Report vulnerabilities privately

### For Developers

- Never hardcode secrets
- Validate all user inputs
- Use parameterized queries to prevent SQL injection
- Sanitize HTML to prevent XSS attacks
- Enable CSRF protection
- Implement rate limiting
- Don't leak sensitive information in error messages

### Secret Management

```typescript
// ❌ WRONG: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ✅ RIGHT: Environment variables
const apiKey = process.env.GEMINI_API_KEY

if (!apiKey) {
  throw new Error('GEMINI_API_KEY not configured')
}
```

### Environment Variables

Always use `.env.example` as a template:

```env
# server/.env.example
OSS_BUCKET=your_bucket_name
OSS_REGION=ap-guangzhou
OSS_SECRET_ID=your_secret_id
OSS_SECRET_KEY=your_secret_key
PORT=3001
```

### Pre-commit Hooks

Consider using pre-commit hooks to prevent accidental commits:

```bash
# .git/hooks/pre-commit
if git diff --cached --name-only | grep -E "\.env$"; then
  echo "ERROR: Attempting to commit .env file"
  exit 1
fi
```

---

## 安全政策 (中文)

### 漏洞报告

如果您发现安全漏洞，请发送邮件至：**a@ggbo.com**

请包含：
- 漏洞描述
- 复现步骤
- 潜在影响
- 建议修复方案（如有）

我们将在 48 小时内响应并及时修复问题。

### 安全最佳实践

#### 对于用户

- 永远不要提交 `.env` 文件或 API 密钥
- 使用环境变量存储敏感数据
- 保持依赖项更新
- 私下报告漏洞

#### 对于开发者

- 永远不要硬编码密钥
- 验证所有用户输入
- 使用参数化查询防止 SQL 注入
- 清理 HTML 以防止 XSS 攻击
- 启用 CSRF 保护
- 实施速率限制
- 不要在错误消息中泄露敏感信息

#### 密钥管理

```typescript
// ❌ 错误：硬编码密钥
const apiKey = "sk-proj-xxxxx"

// ✅ 正确：环境变量
const apiKey = process.env.GEMINI_API_KEY

if (!apiKey) {
  throw new Error('GEMINI_API_KEY not configured')
}
```

#### 环境变量

始终使用 `.env.example` 作为模板：

```env
# server/.env.example
OSS_BUCKET=your_bucket_name
OSS_REGION=ap-guangzhou
OSS_SECRET_ID=your_secret_id
OSS_SECRET_KEY=your_secret_key
PORT=3001
```

#### Pre-commit 钩子

考虑使用 pre-commit 钩子防止意外提交：

```bash
# .git/hooks/pre-commit
if git diff --cached --name-only | grep -E "\.env$"; then
  echo "ERROR: Attempting to commit .env file"
  exit 1
fi
```
