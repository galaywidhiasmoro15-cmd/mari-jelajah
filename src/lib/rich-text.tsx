import React from "react";

// Regex: markdown image ![alt](url), markdown link [text](url), or bare URL
const TOKEN_RE = /(!\[[^\]]*\]\([^)\s]+\))|(\[[^\]]+\]\([^)\s]+\))|((?:https?:\/\/|www\.)[^\s<]+)/gi;
const MD_IMG = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const MD_LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

function normalizeHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function renderSegment(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  text.replace(TOKEN_RE, (match, _img, _lnk, _bare, offset: number) => {
    if (offset > last) nodes.push(text.slice(last, offset));
    const imgMatch = match.match(MD_IMG);
    const lnkMatch = match.match(MD_LINK);
    if (imgMatch) {
      nodes.push(
        <img
          key={`${keyPrefix}-${i++}`}
          src={imgMatch[2]}
          alt={imgMatch[1]}
          className="rounded-lg max-w-full my-2"
          loading="lazy"
        />
      );
    } else if (lnkMatch) {
      nodes.push(
        <a
          key={`${keyPrefix}-${i++}`}
          href={normalizeHref(lnkMatch[2])}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 underline hover:text-emerald-800 break-words"
        >
          {lnkMatch[1]}
        </a>
      );
    } else {
      // bare URL — strip trailing punctuation
      let url = match;
      let trail = "";
      const m = url.match(/[.,;:!?)]+$/);
      if (m) {
        trail = m[0];
        url = url.slice(0, -trail.length);
      }
      nodes.push(
        <a
          key={`${keyPrefix}-${i++}`}
          href={normalizeHref(url)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-700 underline hover:text-emerald-800 break-words"
        >
          {url}
        </a>
      );
      if (trail) nodes.push(trail);
    }
    last = offset + match.length;
    return match;
  });
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className={className}>
      {lines.map((line, idx) => (
        <React.Fragment key={idx}>
          {renderSegment(line, `l${idx}`)}
          {idx < lines.length - 1 && <br />}
        </React.Fragment>
      ))}
    </div>
  );
}
