export async function anthropicErrorMessage(response) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    return '';
  }

  const message = payload?.error?.message;
  return typeof message === 'string'
    ? message.replace(/\s+/g, ' ').trim().slice(0, 300)
    : '';
}
