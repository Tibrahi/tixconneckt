import {
  customType,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

/** Professional profile data attached to a user. */
export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  educationLevel: text("education_level"),
  objectives: text("objectives"),
  major: text("major"),
  skills: jsonb("skills").$type<string[]>().notNull().default([]),
  strengths: jsonb("strengths").$type<string[]>().notNull().default([]),
  fields: jsonb("fields").$type<string[]>().notNull().default([]),
  bio: text("bio"),
  location: text("location"),
  /** public | connections | private */
  contactVisibility: text("contact_visibility").notNull().default("connections"),
  financialVisibility: text("financial_visibility").notNull().default("private"),
  /** public | connections | private; private profiles retain only identity/photos for discovery. */
  profileVisibility: text("profile_visibility").notNull().default("public"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

const profileImageBytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/** Small, user-owned avatar and cover images stored as binary data. */
export const profileMedia = pgTable("profile_media", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  contentType: text("content_type").notNull(),
  data: profileImageBytes("data").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("profile_media_user_kind_unique").on(t.userId, t.kind)]);

export const badges = pgTable(
  "badges",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    reason: text("reason"),
    groupId: text("group_id"),
    awardedAt: timestamp("awarded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("badges_user_idx").on(t.userId)],
);

export const groups = pgTable(
  "groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    description: text("description"),
    objective: text("objective"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("groups_owner_idx").on(t.ownerId)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** admin | member */
    role: text("role").notNull().default("member"),
    /** pending | active | removed */
    status: text("status").notNull().default("active"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("group_member_unique").on(t.groupId, t.userId),
    index("group_member_user_idx").on(t.userId),
    index("group_member_user_status_idx").on(t.userId, t.status),
  ],
);

/** Votes/approvals for group decisions (provider connections, funding, withdrawals). */
export const groupApprovals = pgTable(
  "group_approvals",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    groupId: text("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** provider_connection | funding | withdrawal | membership */
    kind: text("kind").notNull(),
    referenceType: text("reference_type"),
    referenceId: text("reference_id"),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("group_approval_group_idx").on(t.groupId, t.status),
    index("group_approval_ref_idx").on(t.referenceType, t.referenceId),
  ],
);

export const connections = pgTable(
  "connections",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    requesterId: text("requester_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** pending | accepted | rejected | blocked */
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("connection_pair_unique").on(t.requesterId, t.addresseeId),
    index("connection_addressee_idx").on(t.addresseeId, t.status),
    index("connection_requester_idx").on(t.requesterId, t.status),
  ],
);

/** Individual/group connections with funding or support providers. */
export const providerLinks = pgTable(
  "provider_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    providerId: text("provider_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    individualId: text("individual_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    groupId: text("group_id").references(() => groups.id, {
      onDelete: "cascade",
    }),
    projectId: text("project_id"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** pending | approved | rejected */
    status: text("status").notNull().default("pending"),
    decidedBy: text("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [
    index("provider_link_provider_idx").on(t.providerId, t.status),
    index("provider_link_group_idx").on(t.groupId),
  ],
);
