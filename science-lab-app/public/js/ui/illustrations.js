const common = 'stroke="#123b45" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';

const drawings = {
  hands: `<g ${common}><path fill="#efb68f" d="M16 52c-5-9-3-16 2-18V17c0-4 6-4 6 0v13-17c0-4 6-4 6 0v16-19c0-4 6-4 6 0v19-16c0-4 6-4 6 0v18l4-7c3-5 9-1 6 5L45 45v20H25z"/><path fill="#9c84ef" d="M12 59h39v11H12z"/><g fill="#fff"><circle cx="21" cy="25" r="2"/><circle cx="31" cy="21" r="2"/><circle cx="40" cy="28" r="2"/></g></g>`,
  density: `<g ${common}><path fill="#d9f7f5" opacity=".72" d="M22 8h36l-4 61H26z"/><path fill="#b86f18" d="M27 53h26l-1 15H28z"/><path fill="#58aee5" d="M26 39h28l-1 14H27z"/><path fill="#f4d65c" d="M25 25h30l-1 14H26z"/><ellipse fill="#fff" opacity=".55" cx="40" cy="25" rx="15" ry="3"/><circle fill="#9ed887" cx="40" cy="21" r="5"/></g>`,
  filter: `<g ${common}><path fill="#c9eff2" opacity=".75" d="M15 11h50L47 44v23H33V44z"/><path fill="#817568" d="M20 19h40l-6 9H26z"/><path fill="#e6c37a" d="M26 28h28l-6 10H32z"/><path fill="#fff" d="M32 38h16v7H32z"/><path fill="#58bce5" d="M33 52h14v15H33z"/></g>`,
  circuit: `<g ${common}><path fill="#ff8268" d="M10 25h20v31H10z"/><path fill="#384c59" d="M10 25h10v31H10z"/><path d="M20 20v5M44 56v-8c0-12 18-12 18 0v8"/><path fill="#fff7b0" d="M42 30c0-15 22-15 22 0 0 6-5 8-5 14H47c0-6-5-8-5-14z"/><path d="M30 40h12M64 40h6v23H20v-7"/></g>`,
  ramp: `<g ${common}><path fill="#d5a05f" d="M10 58h60v10H10z"/><path fill="#ffd660" d="m10 52 46-30 5 8-46 30z"/><path fill="#58a8ff" d="M27 32h18v10H27z"/><circle fill="#123b45" cx="31" cy="44" r="4"/><circle fill="#123b45" cx="42" cy="37" r="4"/><path d="M12 22a20 20 0 0 1 20-12"/></g>`,
};

export function illustrationSvg(icon) {
  return `<svg viewBox="0 0 80 80" role="img" aria-hidden="true">${drawings[icon] || drawings.density}</svg>`;
}
