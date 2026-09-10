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
 *
 * Luna is the one model-specific exception: its default reasoning effort
 * cannot accompany function tools on Chat Completions. Hob cannot operate
 * without those tools, so direct OpenAI Luna requests explicitly disable
 * reasoning while this application uses the compatibility adapter.
 */
export const chatCompletionConfig = (
  apiUrl: string,
  model: string,
  maxTokens: number,
): Record<string, unknown> => {
  const isOpenAi = new URL(apiUrl).hostname === "api.openai.com";
  const isLuna = model === "gpt-5.6-luna" || model.startsWith("gpt-5.6-luna-");

  return {
    ...(isOpenAi ? { max_completion_tokens: maxTokens } : { max_output_tokens: maxTokens }),
    // Luna defaults to medium reasoning, but OpenAI's Chat Completions endpoint
    // accepts function tools for this model only when reasoning is disabled.
    // The Responses API supports both together; this pinned compatibility
    // adapter deliberately targets Chat Completions.
    ...(isOpenAi && isLuna ? { reasoning_effort: "none" } : {}),
  };
};
