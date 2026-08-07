export const escapeHtml = (value: string): string => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const containsHtml = (value: string): boolean => /<[a-z][^>]*>|&(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i.test(String(value ?? ''));

const ALLOWED_BLOCK_LIST = 'script, style, iframe, object, embed, link, meta, form, input, button, textarea, select';

export const sanitizeHtml = (html: string): string => {
  const source = String(html ?? '');
  if (typeof document === 'undefined') {
    return source
      .replace(/<\s*(script|style|iframe|object|embed|link|meta|form|input|button|textarea|select)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/(href|src|xlink:href)\s*=\s*(["']?)\s*javascript:[^"'>]*\2/gi, '$1$2');
  }
  const template = document.createElement('template');
  template.innerHTML = source;
  template.content.querySelectorAll(ALLOWED_BLOCK_LIST).forEach(node => node.remove());
  template.content.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attr => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) element.removeAttribute(attr.name);
      else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(attr.value)) element.removeAttribute(attr.name);
    });
  });
  return template.innerHTML;
};

export const toEditorHtml = (value: string): string => {
  const source = String(value ?? '');
  return containsHtml(source) ? source : escapeHtml(source);
};

export const toDisplayHtml = (value: string): string => {
  const source = String(value ?? '');
  if (containsHtml(source)) return sanitizeHtml(source);
  return escapeHtml(source).replace(/\r\n|\r/g, '\n').replace(/\n/g, '<br />');
};

export const stripHtml = (value: string): string => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/gi, "'")
  .replace(/\s+/g, ' ')
  .trim();
