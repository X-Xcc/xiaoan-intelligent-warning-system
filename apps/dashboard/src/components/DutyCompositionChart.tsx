type Category = { label: string; value: number; color: string };

export function DutyCompositionChart({ items, run }: { items: Category[]; run: number }) {
  const categories = items.filter(item => item.value > 0);
  const total = categories.reduce((sum, item) => sum + item.value, 0);
  const smallest = categories.reduce((best, item, index) => item.value < categories[best].value ? index : best, 0);
  const beforeSmallest = categories.slice(0, smallest).reduce((sum, item) => sum + item.value, 0);
  // Center the smallest slice at three o'clock so its two-line label stays readable.
  let angle = total ? -(beforeSmallest + categories[smallest].value / 2) / total * Math.PI * 2 : 0;
  const point = (theta: number, radius: number) => [200 + Math.cos(theta) * radius, 200 + Math.sin(theta) * radius];

  return <svg className="duty-composition-chart" viewBox="0 0 400 400" role="img"
    aria-label={`警情类型构成：${items.map(item => `${item.label} ${item.value}%`).join('，')}`}>
    <g key={run} className="duty-pie-segments">
      {categories.map(item => {
        const sweep = item.value / total * Math.PI * 2;
        const start = point(angle, 194);
        const end = point(angle + sweep, 194);
        const middle = angle + sweep / 2;
        const small = item.value / total < 0.08;
        const [x, y] = point(middle, categories.length === 1 ? 0 : small ? 155 : 112);
        angle += sweep;
        return <g key={item.label} data-category={item.label} data-value={item.value}>
          <title>{item.label} {item.value}%</title>
          {categories.length === 1 ? <circle cx="200" cy="200" r="194" fill={item.color} />
            : <path d={`M 200 200 L ${start[0]} ${start[1]} A 194 194 0 ${sweep > Math.PI ? 1 : 0} 1 ${end[0]} ${end[1]} Z`}
              fill={item.color} stroke="#fff" strokeWidth="2" strokeLinejoin="round" />}
          <text className={`duty-pie-label${small ? ' is-small' : ''}`} x={x} y={y} textAnchor="middle" aria-hidden="true">
            <tspan x={x} dy={small ? 0 : -8}>{item.label}</tspan>
            <tspan className="duty-pie-value" x={x} dy={small ? 15 : 29}>{item.value}<tspan className="duty-pie-unit">%</tspan></tspan>
          </text>
        </g>;
      })}
    </g>
  </svg>;
}
