export interface BotMatch {
  name: string
  vendor: string
}

// Conservative: only well-known, documented crawler/agent tokens. Matching is a
// case-insensitive substring test on a length-bounded User-Agent. The result is
// observed evidence only — User-Agent headers are client-controlled and can be spoofed.
const BOT_TOKENS: ReadonlyArray<readonly [token: string, name: string, vendor: string]> = [
  ["gptbot", "GPTBot", "openai"],
  ["chatgpt-user", "ChatGPT-User", "openai"],
  ["oai-searchbot", "OAI-SearchBot", "openai"],
  ["claudebot", "ClaudeBot", "anthropic"],
  ["claude-user", "Claude-User", "anthropic"],
  ["claude-searchbot", "Claude-SearchBot", "anthropic"],
  ["anthropic-ai", "anthropic-ai", "anthropic"],
  ["perplexitybot", "PerplexityBot", "perplexity"],
  ["perplexity-user", "Perplexity-User", "perplexity"],
  ["google-extended", "Google-Extended", "google"],
  ["googlebot", "Googlebot", "google"],
  ["bingbot", "Bingbot", "microsoft"],
  ["applebot", "Applebot", "apple"],
  ["bytespider", "Bytespider", "bytedance"],
  ["ccbot", "CCBot", "commoncrawl"],
  ["meta-externalagent", "Meta-ExternalAgent", "meta"],
  ["amazonbot", "Amazonbot", "amazon"],
  ["duckassistbot", "DuckAssistBot", "duckduckgo"],
  ["mistralai-user", "MistralAI-User", "mistral"],
  ["cohere-ai", "cohere-ai", "cohere"],
]

export const MAX_USER_AGENT_LENGTH = 512

export function classifyUserAgent(userAgent: unknown): BotMatch | undefined {
  if (typeof userAgent !== "string" || userAgent.length === 0) return undefined
  const ua = userAgent.slice(0, MAX_USER_AGENT_LENGTH).toLowerCase()
  for (const [token, name, vendor] of BOT_TOKENS) {
    if (ua.includes(token)) return { name, vendor }
  }
  return undefined
}
