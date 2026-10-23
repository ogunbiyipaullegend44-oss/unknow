export function shouldSubmitResearchOnEnter({
  key,
  shiftKey = false,
  isComposing = false,
  isDesktop = false,
}) {
  return isDesktop && key === 'Enter' && !shiftKey && !isComposing;
}
