export function measuredResponse(response, rate) {
  const usage=response.usage;
  if(!Number.isInteger(usage?.prompt_tokens)||!Number.isInteger(usage?.completion_tokens)||usage.prompt_tokens<0||usage.completion_tokens<0) throw new Error('Missing valid billed token usage');
  const choice=response.choices?.[0];
  if(!choice?.message) throw new Error('Missing assistant message');
  return {answer:String(choice.message.content??'').replace(/<think>[\s\S]*?<\/think>/g,'').trim(),reasoning:choice.message.reasoning??choice.message.reasoning_content??null,finishReason:choice.finish_reason,inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,usage,costUsd:(usage.prompt_tokens*rate.input+usage.completion_tokens*rate.output)/1e6};
}
