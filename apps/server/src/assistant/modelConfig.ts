/**
 * The pinned OpenAI-compatible adapter maps its portable
 * `max_output_tokens` option to Chat Completions' legacy `max_tokens` field.
 * OpenAI's current endpoint rejects that field for newer models and requires
 * `max_completion_tokens`; local compatible servers still commonly implement
 * only the legacy spelling.
 *
 * The endpoint, rather than the model name, decides the dialect. A local model
 * may use any alias, while every request sent directly to OpenAI can use the
 * current field regardless of which supported model is selected.
 */
export const outputTokenConfig = (
  apiUrl: string,
  maxTokens: number,
): { readonly max_completion_tokens: number } | { readonly max_output_tokens: number } =>
  new URL(apiUrl).hostname === "api.openai.com"
    ? { max_completion_tokens: maxTokens }
    : { max_output_tokens: maxTokens };
