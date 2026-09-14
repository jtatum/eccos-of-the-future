import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const countersignTotals = sqliteTable("ecco_countersign_totals", {
  id: integer("id").primaryKey(),
  acceptedCount: integer("accepted_count").notNull().default(0),
  updatedAt: text("updated_at").notNull()
});

export const laboratoryProposals = sqliteTable("ecco_laboratory_proposals", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  mode: text("mode").notNull(),
  participantKind: text("participant_kind").notNull(),
  contributorHandle: text("contributor_handle"),
  title: text("title").notNull(),
  question: text("question").notNull(),
  desiredChange: text("desired_change").notNull(),
  experimentUrl: text("experiment_url"),
  boundary: text("boundary").notNull(),
  contentDigest: text("content_digest").notNull(),
  status: text("status").notNull().default("RECEIVED")
}, (table) => [
  uniqueIndex("idx_ecco_laboratory_proposals_digest").on(table.contentDigest),
  index("idx_ecco_laboratory_proposals_created_at").on(table.createdAt)
]);
