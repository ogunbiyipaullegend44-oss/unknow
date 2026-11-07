export function isPdfSourceUrl(href) {
  try {
    const url = new URL(href, 'https://brinfolynk.invalid');
    if (url.pathname.toLocaleLowerCase().endsWith('.pdf')) return true;

    return ['format', 'type', 'mime', 'content-type', 'filename', 'file']
      .some((key) => {
        const value = url.searchParams.get(key)?.toLocaleLowerCase();
        return value === 'pdf' ||
          value === 'application/pdf' ||
          value?.endsWith('.pdf') === true;
      });
  } catch {
    return false;
  }
}
