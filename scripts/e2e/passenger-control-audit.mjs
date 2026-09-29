/** Browser-evaluated assertions; checks real rendered dimensions, not source tokens. */
export const passengerControlAudit = `(() => {
  const visible = (element) => {
    const r = element.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(element).visibility !== 'hidden';
  };
  const icons = [...document.querySelectorAll('svg[data-presentation-icon]')].filter(visible);
  const undersizedIcons = icons.filter(icon => {
    const r = icon.getBoundingClientRect();
    const role = icon.getAttribute('data-presentation-icon');
    const min = role === 'feature' ? 32 : role === 'action' ? 28 : role === 'status' ? 24 : 0;
    return r.width < min - 0.5 || r.height < min - 0.5;
  }).map(icon => ({role: icon.getAttribute('data-presentation-icon'), width: icon.getBoundingClientRect().width}));
  const controls = [...document.querySelectorAll('[role="button"], [role="checkbox"], [role="radio"]')]
    .filter(visible).filter(element => element.querySelector('svg[data-presentation-icon]'));
  const undersizedControls = controls.filter(element => {
    const r = element.getBoundingClientRect();
    return r.width < 55.5 || r.height < 55.5;
  }).map(element => element.getAttribute('aria-label') || element.textContent);
  const rgb = color => {
    const channels = color.match(/[\\d.]+/g)?.map(Number);
    return channels?.length >= 3 && (channels.length < 4 || channels[3] >= 0.99) ? channels.slice(0, 3) : null;
  };
  const luminance = channels => channels.map(channel => {
    const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
  const contrast = (element, foreground) => {
    const fg = rgb(foreground);
    if (!fg || element.closest('[aria-disabled="true"]')) return null;
    let parent = element;
    while (parent) {
      const style = getComputedStyle(parent);
      if (Number(style.opacity) < 1) return null;
      const bg = rgb(style.backgroundColor);
      if (bg) {
        const a = luminance(fg), b = luminance(bg);
        return (Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
      }
      parent = parent.parentElement;
    }
    return null;
  };
  const lowContrastIcons = icons.map(icon => ({
    role: icon.getAttribute('data-presentation-icon'),
    ratio: contrast(icon, getComputedStyle(icon).stroke),
  })).filter(icon => icon.ratio !== null && icon.ratio < 2.99);
  const lowContrastLabels = controls.flatMap(control => [...control.querySelectorAll('div, span')])
    .filter(element => !element.children.length && element.textContent.trim() && visible(element))
    .map(element => ({text: element.textContent.slice(0, 60), ratio: contrast(element, getComputedStyle(element).color)}))
    .filter(label => label.ratio !== null && label.ratio < 4.49);
  return {
    iconCount: icons.length,
    undersizedIcons,
    undersizedControls,
    lowContrastIcons,
    lowContrastLabels,
    horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
  };
})()`;
