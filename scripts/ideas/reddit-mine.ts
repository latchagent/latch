import "dotenv/config";

type RedditPost = {
  title: string;
  subreddit: string;
  permalink: string;
  url: string;
  score: number;
  num_comments: number;
  created_utc: number;
  selftext?: string;
};

type MineResult = {
  query: string;
  scope: string;
  posts: RedditPost[];
};

const USER_AGENT = process.env.REDDIT_UA || "latch-ideas-miner/0.1 (contact: dev@localhost)";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

async function fetchJson(url: string) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
    },
  });
  if (res.status === 429) {
    throw new Error(`HTTP 429 (rate limited) ${url}`);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${url}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

function parseListing(json: any): RedditPost[] {
  const children = json?.data?.children;
  if (!Array.isArray(children)) return [];
  const out: RedditPost[] = [];
  for (const c of children) {
    const d = c?.data;
    if (!d) continue;
    if (d.over_18) continue;
    if (d.stickied) continue;
    const permalink = typeof d.permalink === "string" ? `https://www.reddit.com${d.permalink}` : "";
    out.push({
      title: String(d.title || ""),
      subreddit: String(d.subreddit || ""),
      permalink,
      url: String(d.url || permalink || ""),
      score: Number(d.score || 0),
      num_comments: Number(d.num_comments || 0),
      created_utc: Number(d.created_utc || 0),
      selftext: typeof d.selftext === "string" ? d.selftext : undefined,
    });
  }
  return out;
}

function dedupePosts(posts: RedditPost[]): RedditPost[] {
  const seen = new Set<string>();
  const out: RedditPost[] = [];
  for (const p of posts) {
    const key = p.permalink || p.url || `${p.subreddit}:${p.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function scorePost(p: RedditPost): number {
  // Lightweight ranking: prefers high engagement and recency.
  const ageDays = (Date.now() / 1000 - p.created_utc) / (60 * 60 * 24);
  const recency = 1 / Math.max(1, Math.log10(ageDays + 2));
  return (p.score + p.num_comments * 3) * recency;
}

async function mine({
  queries,
  subreddits,
  limitPerQuery,
  timeframe,
  delayMs,
}: {
  queries: string[];
  subreddits: string[];
  limitPerQuery: number;
  timeframe: "month" | "year" | "all";
  delayMs: number;
}): Promise<{ results: MineResult[]; all: RedditPost[] }> {
  const results: MineResult[] = [];
  let all: RedditPost[] = [];

  async function safeFetch(url: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await fetchJson(url);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("HTTP 429")) {
          const backoff = (attempt + 1) * 2500;
          await sleep(backoff);
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Failed after retries (rate limited): ${url}`);
  }

  // Global search
  for (const q of queries) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=relevance&t=${timeframe}&limit=${limitPerQuery}`;
    const json = await safeFetch(url);
    const posts = parseListing(json);
    results.push({ query: q, scope: "all", posts });
    all = all.concat(posts);
    await sleep(delayMs);
  }

  // Subreddit search
  for (const sr of subreddits) {
    for (const q of queries) {
      const url = `https://www.reddit.com/r/${encodeURIComponent(sr)}/search.json?q=${encodeURIComponent(
        q
      )}&restrict_sr=1&sort=relevance&t=${timeframe}&limit=${Math.max(5, Math.floor(limitPerQuery / 2))}`;
      const json = await safeFetch(url);
      const posts = parseListing(json);
      results.push({ query: q, scope: `r/${sr}`, posts });
      all = all.concat(posts);
      await sleep(delayMs);
    }
  }

  all = dedupePosts(all);
  all.sort((a, b) => scorePost(b) - scorePost(a));

  return { results, all };
}

function clusterHeuristics(posts: RedditPost[]) {
  const clusters: Record<string, RedditPost[]> = {
    "still using spreadsheets / manual tracking": [],
    "invoicing & payments": [],
    "insurance / claims": [],
    "construction / trades ops": [],
    "accounting / close / AR": [],
    "healthcare admin / billing": [],
    "logistics / dispatch": [],
    "compliance / audits": [],
    "customer support / ticketing": [],
    "other": [],
  };

  const rules: Array<[string, RegExp]> = [
    ["still using spreadsheets / manual tracking", /spreadsheet|excel|google sheets|manual tracking|tracking in a sheet/i],
    ["invoicing & payments", /invoice|invoicing|accounts payable|ap\b|accounts receivable|ar\b|collections|payment/i],
    ["insurance / claims", /insurance|claim|adjuster|policyholder|underwrite|underwriting/i],
    ["construction / trades ops", /construction|contractor|HVAC|plumbing|electrician|roofing|permit|change order|estimate/i],
    ["accounting / close / AR", /accounting|bookkeeping|quickbooks|xero|close\b|reconcil/i],
    ["healthcare admin / billing", /medical billing|prior auth|authorization|denial|EOB|CPT|ICD|clinic|dental/i],
    ["logistics / dispatch", /dispatch|freight|broker|trucking|load|rate confirmation|bill of lading/i],
    ["compliance / audits", /compliance|SOC2|audit|HIPAA|OSHA|ISO|policy/i],
    ["customer support / ticketing", /ticket|zendesk|intercom|support inbox|helpdesk/i],
  ];

  for (const p of posts) {
    const text = `${p.title}\n${p.selftext || ""}`;
    let matched = false;
    for (const [name, re] of rules) {
      if (re.test(text)) {
        clusters[name].push(p);
        matched = true;
        break;
      }
    }
    if (!matched) clusters.other.push(p);
  }

  // sort within each cluster
  for (const k of Object.keys(clusters)) {
    clusters[k].sort((a, b) => scorePost(b) - scorePost(a));
  }

  return clusters;
}

async function main() {
  const timeframe = (process.env.REDDIT_T || "year") as "month" | "year" | "all";
  const limitPerQuery = Number(process.env.REDDIT_LIMIT || 12);
  const delayMs = Number(process.env.REDDIT_DELAY_MS || 1200);

  const queries = [
    '"still using" spreadsheet',
    '"does anyone" spreadsheet',
    '"manual" paperwork',
    '"what software" invoicing',
    '"what software" dispatch',
    '"what software" medical billing',
    '"quickbooks" nightmare',
    '"we built" internal tool',
    '"I wish there was" software',
    '"any tool" to automate',
  ];

  const subreddits = [
    "smallbusiness",
    "Entrepreneur",
    "accounting",
    "bookkeeping",
    "Construction",
    "HVAC",
    "Insurance",
    "freightbrokers",
    "logistics",
    "medicalbilling",
    "sysadmin",
    "ITManagers",
  ];

  const { all } = await mine({ queries, subreddits, limitPerQuery, timeframe, delayMs });
  const clusters = clusterHeuristics(all.slice(0, 250));

  const lines: string[] = [];
  lines.push(`# Reddit pain scan (Cursor-for-copilot)\n`);
  lines.push(`- Generated: ${new Date().toISOString()}\n- Timeframe: ${timeframe}\n- Posts scanned (deduped): ${all.length}\n`);

  lines.push(`## Top posts (overall)\n`);
  for (const p of all.slice(0, 30)) {
    lines.push(
      `- [${clamp(p.title, 140)}](${p.permalink}) — r/${p.subreddit} • score ${p.score} • comments ${p.num_comments}`
    );
  }

  lines.push(`\n## Clusters (heuristic)\n`);
  const clusterNames = Object.keys(clusters)
    .map((k) => ({ k, n: clusters[k].length }))
    .sort((a, b) => b.n - a.n);

  for (const { k, n } of clusterNames) {
    lines.push(`\n### ${k} (${n})\n`);
    for (const p of clusters[k].slice(0, 8)) {
      lines.push(
        `- [${clamp(p.title, 140)}](${p.permalink}) — r/${p.subreddit} • score ${p.score} • comments ${p.num_comments}`
      );
    }
  }

  lines.push(`\n## Candidate "Cursor for ___" wedges (draft)\n`);
  lines.push(`- Cursor for invoice + collections follow-up (AR)\n- Cursor for contractor change orders + permits\n- Cursor for insurance agency endorsements / COIs\n- Cursor for dispatch + rate confirmations\n- Cursor for medical billing denials + appeals\n- Cursor for compliance evidence collection (SOC2/HIPAA-ish)\n`);

  const outPath = process.env.REDDIT_OUT || "./workspace/reddit-scan.md";
  const fs = await import("node:fs/promises");
  await fs.mkdir(outPath.split("/").slice(0, -1).join("/") || ".", { recursive: true });
  await fs.writeFile(outPath, lines.join("\n"), "utf8");

  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
