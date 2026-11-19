/* Page « Méthode » : rend le document d'analyse (docs/ANALYSE.md) avec un mini moteur Markdown. */
import { useMemo, type ReactNode } from 'react';
import analyse from '../../docs/ANALYSE.md?raw';

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const mm = t.match(/\[([^\]]+)\]\(([^)\s]+)\)/)!;
      const safe = /^https?:\/\//.test(mm[2]) ? mm[2] : '#';
      out.push(
        <a key={k} href={safe} target="_blank" rel="noopener noreferrer">
          {mm[1]}
        </a>,
      );
    } else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ src }: { src: string }) {
  const blocks = useMemo(() => {
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const out: ReactNode[] = [];
    let i = 0;
    let k = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i++;
        continue;
      }
      const h = line.match(/^(#{1,4})\s+(.*)$/);
      if (h) {
        const level = h[1].length;
        const content = inline(h[2], `h${k}`);
        out.push(
          level === 1 ? <h1 key={k++}>{content}</h1> : level === 2 ? <h2 key={k++}>{content}</h2> : level === 3 ? <h3 key={k++}>{content}</h3> : <h4 key={k++}>{content}</h4>,
        );
        i++;
        continue;
      }
      if (/^\s*\|/.test(line)) {
        const rows: string[][] = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) {
          const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
          if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
          i++;
        }
        const [head, ...body] = rows;
        out.push(
          <table key={k++}>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c, `th${k}-${j}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>{inline(c, `td${k}-${ri}-${j}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>,
        );
        continue;
      }
      if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\./.test(line);
        const items: string[] = [];
        while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
          i++;
        }
        const lis = items.map((it, j) => <li key={j}>{inline(it, `li${k}-${j}`)}</li>);
        out.push(ordered ? <ol key={k++}>{lis}</ol> : <ul key={k++}>{lis}</ul>);
        continue;
      }
      if (line.startsWith('>')) {
        const q: string[] = [];
        while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
        out.push(<blockquote key={k++}>{inline(q.join(' '), `q${k}`)}</blockquote>);
        continue;
      }
      if (/^---+$/.test(line.trim())) {
        out.push(<hr key={k++} />);
        i++;
        continue;
      }
      const para: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|\s*\||\s*[-*]\s|\s*\d+\.\s|>)/.test(lines[i])) para.push(lines[i++]);
      out.push(<p key={k++}>{inline(para.join(' '), `p${k}`)}</p>);
    }
    return out;
  }, [src]);
  return <div className="md">{blocks}</div>;
}

export default function Method() {
  return (
    <div className="narrow">
      <div className="card">
        <Markdown src={analyse} />
      </div>
    </div>
  );
}
