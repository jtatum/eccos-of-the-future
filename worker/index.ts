import { DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES, handleImageOptimization } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const EXPECTED_DIGEST = "2374cc16aec7bdf37792d86a3f82cec4dbc0643675e7fa12488553d5c0ee176b";
const CREATE_COUNTER = `CREATE TABLE IF NOT EXISTS ecco_countersign_totals (
  id INTEGER PRIMARY KEY,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
)`;
const INCREMENT_COUNTER = `INSERT INTO ecco_countersign_totals (id, accepted_count, updated_at)
VALUES (1, 1, ?)
ON CONFLICT(id) DO UPDATE SET
  accepted_count = accepted_count + 1,
  updated_at = excluded.updated_at
RETURNING accepted_count`;
const LIST_PROPOSALS = `SELECT
  id,
  created_at AS createdAt,
  mode,
  participant_kind AS participantKind,
  contributor_handle AS contributorHandle,
  title,
  question,
  desired_change AS desiredChange,
  experiment_url AS experimentUrl,
  boundary,
  content_digest AS contentDigest,
  status
FROM ecco_laboratory_proposals
ORDER BY created_at DESC
LIMIT 60`;
const INSERT_PROPOSAL = `INSERT INTO ecco_laboratory_proposals (
  id, created_at, mode, participant_kind, contributor_handle, title,
  question, desired_change, experiment_url, boundary, content_digest, status
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEIVED')`;
const FIND_PROPOSAL_BY_DIGEST = `SELECT id, created_at AS createdAt, status
FROM ecco_laboratory_proposals
WHERE content_digest = ?
LIMIT 1`;

type ProposalMode = "REQUEST" | "EXTERNAL_EXPERIMENT";
type ParticipantKind = "HUMAN" | "AGENT" | "COLLABORATIVE" | "UNDISCLOSED";

interface ProposalInput {
  mode?: unknown;
  participant_kind?: unknown;
  contributor_handle?: unknown;
  title?: unknown;
  question?: unknown;
  desired_change?: unknown;
  experiment_url?: unknown;
  boundary?: unknown;
}

function boundedText(value: unknown, name: string, maximum: number, required = true) {
  const result = String(value ?? "").normalize("NFKC").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "").trim();
  if (required && !result) throw new Error(`${name} is required.`);
  if (result.length > maximum) throw new Error(`${name} exceeds ${maximum} characters.`);
  return result || null;
}

function publicUrl(value: unknown, required: boolean) {
  const text = boundedText(value, "experiment_url", 1200, required);
  if (!text) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("experiment_url must be a complete public HTTP or HTTPS URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("experiment_url must be a public HTTP or HTTPS URL without embedded credentials.");
  }
  return url.toString();
}

function normalizeProposal(input: ProposalInput) {
  const mode = String(input.mode ?? "").toUpperCase() as ProposalMode;
  const participantKind = String(input.participant_kind ?? "UNDISCLOSED").toUpperCase() as ParticipantKind;
  if (!["REQUEST", "EXTERNAL_EXPERIMENT"].includes(mode)) throw new Error("mode must be REQUEST or EXTERNAL_EXPERIMENT.");
  if (!["HUMAN", "AGENT", "COLLABORATIVE", "UNDISCLOSED"].includes(participantKind)) throw new Error("participant_kind is invalid.");
  return {
    mode,
    participantKind,
    contributorHandle: boundedText(input.contributor_handle, "contributor_handle", 80, false),
    title: boundedText(input.title, "title", 120),
    question: boundedText(input.question, "question", 1200),
    desiredChange: boundedText(input.desired_change, "desired_change", 1200),
    experimentUrl: publicUrl(input.experiment_url, mode === "EXTERNAL_EXPERIMENT"),
    boundary: boundedText(input.boundary, "boundary", 800)
  };
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function listLaboratoryProposals(env: Env) {
  try {
    const result = await env.DB.prepare(LIST_PROPOSALS).all();
    return json({
      spec: "ecco-open-laboratory/0.1",
      proposals: result.results ?? [],
      count: result.results?.length ?? 0,
      notice: "These are public participant proposals, not ECCO endorsements or findings."
    });
  } catch (error) {
    console.error("laboratory list failed", error);
    return json({ error: "LABORATORY_UNAVAILABLE", proposals: [] }, 503);
  }
}

async function submitLaboratoryProposal(request: Request, env: Env) {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") return json({ error: "JSON_REQUIRED" }, 415);
  if (Number(request.headers.get("content-length") ?? 0) > 12000) return json({ error: "PROPOSAL_TOO_LARGE" }, 413);

  let body: { gate_digest?: unknown; proposal?: ProposalInput };
  try {
    const raw = await request.text();
    if (raw.length > 12000) return json({ error: "PROPOSAL_TOO_LARGE" }, 413);
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }
  if (body.gate_digest !== EXPECTED_DIGEST) return json({ error: "FIELD_KEY_REJECTED" }, 403);

  let proposal: ReturnType<typeof normalizeProposal>;
  try {
    proposal = normalizeProposal(body.proposal ?? {});
  } catch (error) {
    return json({ error: "INVALID_PROPOSAL", message: error instanceof Error ? error.message : "Invalid proposal." }, 400);
  }

  const canonical = JSON.stringify([
    proposal.mode, proposal.participantKind, proposal.contributorHandle, proposal.title,
    proposal.question, proposal.desiredChange, proposal.experimentUrl, proposal.boundary
  ]);
  const contentDigest = await sha256Hex(canonical);
  const id = `experiment-${crypto.randomUUID()}`;
  const createdAt = new Date().toISOString();

  try {
    await env.DB.prepare(INSERT_PROPOSAL).bind(
      id, createdAt, proposal.mode, proposal.participantKind, proposal.contributorHandle,
      proposal.title, proposal.question, proposal.desiredChange, proposal.experimentUrl,
      proposal.boundary, contentDigest
    ).run();
    return json({ accepted: true, id, createdAt, status: "RECEIVED", contentDigest }, 201);
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      const existing = await env.DB.prepare(FIND_PROPOSAL_BY_DIGEST).bind(contentDigest).first();
      return json({ accepted: true, duplicate: true, ...existing, contentDigest }, 200);
    }
    console.error("laboratory submission failed", error);
    return json({ error: "LABORATORY_UNAVAILABLE" }, 503);
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" }
  });
}

async function recordAcceptedCountersign(request: Request, env: Env) {
  if (request.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
    return json({ accepted: false }, 415);
  }
  if (Number(request.headers.get("content-length") ?? 0) > 512) {
    return json({ accepted: false }, 413);
  }
  let digest: unknown;
  try {
    ({ digest } = await request.json() as { digest?: unknown });
  } catch {
    return json({ accepted: false }, 400);
  }
  if (digest !== EXPECTED_DIGEST) return json({ accepted: false }, 403);

  await env.DB.prepare(CREATE_COUNTER).run();
  await env.DB.prepare(INCREMENT_COUNTER).bind(new Date().toISOString()).first();
  return json({ accepted: true }, 202);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/countersign-success") {
      if (request.method !== "POST") return json({ accepted: false }, 405);
      return recordAcceptedCountersign(request, env);
    }

    if (url.pathname === "/api/laboratory/proposals") {
      if (request.method === "GET") return listLaboratoryProposals(env);
      if (request.method === "POST") return submitLaboratoryProposal(request, env);
      return json({ error: "METHOD_NOT_ALLOWED" }, 405);
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        }
      }, allowedWidths);
    }

    if (url.pathname === "/") {
      return env.ASSETS.fetch(new Request(new URL("/index-static.html", request.url), request));
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) return asset;
    return handler.fetch(request, env, ctx);
  }
};

export default worker;
