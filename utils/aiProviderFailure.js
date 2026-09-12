/** Provider responses are untrusted: classify, never echo their text or URLs. */
export function aiProviderFailure(status, detail = "") {
  let code = "AI_PROVIDER_UNAVAILABLE";
  if (status === 401 || status === 403 || /API_KEY_INVALID|invalid.?api.?key|authentication_error/i.test(detail)) code = "AI_PROVIDER_KEY_INVALID";
  else if (status === 404 || /model_not_found|model.*(not found|not supported|deprecated|unavailable)/i.test(detail)) code = "AI_MODEL_UNAVAILABLE";
  else if (status === 429) code = "AI_PROVIDER_QUOTA";
  else if (status === 400) code = "AI_PROVIDER_CONFIG_INVALID";
  return { code, statusCode: status === 429 ? 429 : 502 };
}
