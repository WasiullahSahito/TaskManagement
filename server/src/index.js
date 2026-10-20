import bcrypt from "bcrypt";
import connectPgSimple from "connect-pg-simple";
import cors from "cors";
import express from "express";
import session from "express-session";
import { body, param, query as queryValidator, validationResult } from "express-validator";
import helmet from "helmet";
import path from "node:path";
import passport from "passport";
import { fileURLToPath } from "node:url";
import { initializeDatabase, pool, query, withTransaction } from "./db.js";
import { requireAuth, requireTaskTeamMember, requireTeamMember } from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const production = process.env.NODE_ENV === "production";
const clientDist = fileURLToPath(new URL("../../client/dist/", import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for PostgreSQL data storage.");
}
if (production && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required in production.");
}

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  credentials: true,
}));
app.use(express.json({ limit: "30kb" }));
app.use(
  session({
    name: "teamtasks.sid",
    secret: process.env.SESSION_SECRET || "development-only-change-this-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: production,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
    ...(production
      ? { store: new (connectPgSimple(session))({ pool, createTableIfMissing: true }) }
      : {}),
  }),
);
app.use(passport.initialize());
app.use(passport.session());

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg, details: errors.array() });
  }
  return next();
};

const cleanText = (field, max, optional = false) => {
  const validator = body(field)
    .trim()
    .isLength({ min: optional ? 0 : 1, max })
    .withMessage(`${field} must be ${optional ? "at most" : "between 1 and"} ${max} characters.`);
  return validator;
};

app.post(
  "/api/auth/register",
  cleanText("name", 80),
  body("name").trim().escape(),
  body("email").trim().isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
  body("password")
    .isLength({ min: 8, max: 72 })
    .withMessage("Password must be between 8 and 72 characters.")
    .bail()
    .isByteLength({ max: 72 })
    .withMessage("Password must be no more than 72 bytes."),
  validate,
  async (req, res, next) => {
    try {
      const { name, email, password } = req.body;
      const passwordHash = await bcrypt.hash(password, 12);
      const result = await query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
        [name, email, passwordHash],
      );
      req.login(result.rows[0], (error) => {
        if (error) return next(error);
        return res.status(201).json({ user: result.rows[0] });
      });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      return next(error);
    }
  },
);

app.post(
  "/api/auth/login",
  body("email").trim().isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
  body("password").isString().notEmpty().withMessage("Password is required."),
  validate,
  (req, res, next) => {
    passport.authenticate("local", (error, user) => {
      if (error) return next(error);
      if (!user) return res.status(401).json({ error: "Email or password is incorrect." });
      return req.login(user, (loginError) => {
        if (loginError) return next(loginError);
        return res.json({ user });
      });
    })(req, res, next);
  },
);

app.get("/api/auth/me", (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Not signed in." });
  return res.json({ user: req.user });
});

app.post("/api/auth/logout", requireAuth, (req, res, next) => {
  req.logout((error) => {
    if (error) return next(error);
    req.session.destroy((destroyError) => {
      if (destroyError) return next(destroyError);
      res.clearCookie("teamtasks.sid", { httpOnly: true, sameSite: "lax", secure: production });
      return res.status(204).end();
    });
  });
});

app.get("/api/teams", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT t.id, t.name, t.description, t.created_by, t.created_at,
              tm.role, COUNT(DISTINCT m.user_id)::int AS member_count,
              COUNT(DISTINCT task.id)::int AS task_count
       FROM teams t
       JOIN team_members tm ON tm.team_id = t.id AND tm.user_id = $1
       LEFT JOIN team_members m ON m.team_id = t.id
       LEFT JOIN tasks task ON task.team_id = t.id
       GROUP BY t.id, tm.role
       ORDER BY t.created_at DESC`,
      [req.user.id],
    );
    return res.json({ teams: result.rows });
  } catch (error) {
    return next(error);
  }
});

app.post(
  "/api/teams",
  requireAuth,
  cleanText("name", 80),
  cleanText("description", 240, true),
  validate,
  async (req, res, next) => {
    try {
      const team = await withTransaction(async (client) => {
        const result = await client.query(
          "INSERT INTO teams (name, description, created_by) VALUES ($1, $2, $3) RETURNING id, name, description, created_by, created_at",
          [req.body.name, req.body.description || "", req.user.id],
        );
        await client.query(
          "INSERT INTO team_members (team_id, user_id, role) VALUES ($1, $2, 'owner')",
          [result.rows[0].id, req.user.id],
        );
        return result.rows[0];
      });
      return res.status(201).json({ team: { ...team, role: "owner", member_count: 1, task_count: 0 } });
    } catch (error) {
      return next(error);
    }
  },
);

app.patch(
  "/api/teams/:id",
  requireAuth,
  param("id").isInt({ min: 1 }).withMessage("Invalid team."),
  cleanText("name", 80),
  cleanText("description", 240, true),
  validate,
  requireTeamMember,
  async (req, res, next) => {
    if (req.teamRole !== "owner") return res.status(403).json({ error: "Only team owners can edit a team." });
    try {
      const result = await query(
        "UPDATE teams SET name = $1, description = $2 WHERE id = $3 RETURNING id, name, description, created_by, created_at",
        [req.body.name, req.body.description || "", req.params.id],
      );
      return res.json({ team: { ...result.rows[0], role: req.teamRole } });
    } catch (error) {
      return next(error);
    }
  },
);

app.delete(
  "/api/teams/:id",
  requireAuth,
  param("id").isInt({ min: 1 }).withMessage("Invalid team."),
  validate,
  requireTeamMember,
  async (req, res, next) => {
    if (req.teamRole !== "owner") return res.status(403).json({ error: "Only team owners can delete a team." });
    try {
      await query("DELETE FROM teams WHERE id = $1", [req.params.id]);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);

app.get(
  "/api/teams/:id/members",
  requireAuth,
  param("id").isInt({ min: 1 }),
  validate,
  requireTeamMember,
  async (req, res, next) => {
    try {
      const result = await query(
        `SELECT u.id, u.name, u.email, tm.role
         FROM team_members tm JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = $1 ORDER BY tm.joined_at`,
        [req.params.id],
      );
      return res.json({ members: result.rows });
    } catch (error) {
      return next(error);
    }
  },
);

app.post(
  "/api/teams/:id/members",
  requireAuth,
  param("id").isInt({ min: 1 }),
  body("email").trim().isEmail().withMessage("Enter a valid email address.").normalizeEmail(),
  validate,
  requireTeamMember,
  async (req, res, next) => {
    if (req.teamRole !== "owner") return res.status(403).json({ error: "Only team owners can add members." });
    try {
      const result = await query("SELECT id, name, email FROM users WHERE email = $1", [req.body.email]);
      const member = result.rows[0];
      if (!member) return res.status(404).json({ error: "No account exists for that email yet." });
      await query(
        "INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [req.params.id, member.id],
      );
      return res.status(201).json({ member: { ...member, role: "member" } });
    } catch (error) {
      return next(error);
    }
  },
);

app.get(
  "/api/tasks",
  requireAuth,
  queryValidator("teamId").optional().isInt({ min: 1 }).withMessage("Invalid team filter."),
  queryValidator("assigneeId").optional().isInt({ min: 1 }).withMessage("Invalid assignee filter."),
  validate,
  async (req, res, next) => {
    try {
      const values = [req.user.id];
      const filters = ["tm.user_id = $1"];
      if (req.query.teamId) {
        values.push(Number(req.query.teamId));
        filters.push(`t.team_id = $${values.length}`);
      }
      if (req.query.assigneeId) {
        values.push(Number(req.query.assigneeId));
        filters.push(`t.assignee_id = $${values.length}`);
      }
      const result = await query(
        `SELECT t.id, t.team_id, t.title, t.description, t.status, t.priority,
               t.assignee_id, t.due_date::text AS due_date, t.created_by, t.created_at, t.updated_at,
                team.name AS team_name, assignee.name AS assignee_name, assignee.email AS assignee_email
         FROM tasks t
         JOIN team_members tm ON tm.team_id = t.team_id
         JOIN teams team ON team.id = t.team_id
         LEFT JOIN users assignee ON assignee.id = t.assignee_id
         WHERE ${filters.join(" AND ")}
         ORDER BY t.due_date ASC NULLS LAST, t.updated_at DESC`,
        values,
      );
      return res.json({ tasks: result.rows });
    } catch (error) {
      return next(error);
    }
  },
);

const taskFields = [
  cleanText("title", 120),
  cleanText("description", 1000, true),
  body("status").isIn(["todo", "in_progress", "done"]).withMessage("Choose a valid task status."),
  body("priority").isIn(["low", "medium", "high"]).withMessage("Choose a valid priority."),
  body("assigneeId").optional({ nullable: true }).isInt({ min: 1 }).withMessage("Invalid assignee."),
  body("dueDate").optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage("Enter a valid due date."),
];

async function validateTaskAssignee(teamId, assigneeId) {
  if (!assigneeId) return true;
  const member = await query(
    "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
    [teamId, assigneeId],
  );
  return member.rowCount > 0;
}

app.post(
  "/api/tasks",
  requireAuth,
  ...taskFields,
  body("teamId").isInt({ min: 1 }).withMessage("Choose a team."),
  validate,
  async (req, res, next) => {
    try {
      const membership = await query(
        "SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2",
        [req.body.teamId, req.user.id],
      );
      if (!membership.rowCount) return res.status(404).json({ error: "Team not found." });
      if (!(await validateTaskAssignee(req.body.teamId, req.body.assigneeId))) {
        return res.status(400).json({ error: "Assignee must be a member of this team." });
      }
      const result = await query(
        `INSERT INTO tasks (team_id, title, description, status, priority, assignee_id, due_date, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, team_id, title, description, status, priority, assignee_id, due_date::text AS due_date, created_by, created_at, updated_at`,
        [
          req.body.teamId,
          req.body.title,
          req.body.description || "",
          req.body.status,
          req.body.priority,
          req.body.assigneeId || null,
          req.body.dueDate || null,
          req.user.id,
        ],
      );
      return res.status(201).json({ task: result.rows[0] });
    } catch (error) {
      return next(error);
    }
  },
);

app.patch(
  "/api/tasks/:id",
  requireAuth,
  param("id").isInt({ min: 1 }).withMessage("Invalid task."),
  ...taskFields,
  validate,
  requireTaskTeamMember,
  async (req, res, next) => {
    try {
      const task = await query("SELECT team_id FROM tasks WHERE id = $1", [req.params.id]);
      if (!(await validateTaskAssignee(task.rows[0].team_id, req.body.assigneeId))) {
        return res.status(400).json({ error: "Assignee must be a member of this team." });
      }
      const result = await query(
        `UPDATE tasks
         SET title = $1, description = $2, status = $3, priority = $4,
             assignee_id = $5, due_date = $6, updated_at = NOW()
         WHERE id = $7
         RETURNING id, team_id, title, description, status, priority, assignee_id, due_date::text AS due_date, created_by, created_at, updated_at`,
        [
          req.body.title,
          req.body.description || "",
          req.body.status,
          req.body.priority,
          req.body.assigneeId || null,
          req.body.dueDate || null,
          req.params.id,
        ],
      );
      return res.json({ task: result.rows[0] });
    } catch (error) {
      return next(error);
    }
  },
);

app.delete(
  "/api/tasks/:id",
  requireAuth,
  param("id").isInt({ min: 1 }).withMessage("Invalid task."),
  validate,
  requireTaskTeamMember,
  async (req, res, next) => {
    try {
      await query("DELETE FROM tasks WHERE id = $1", [req.params.id]);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  },
);

app.use(express.static(clientDist));
app.use("/api", (req, res) => res.status(404).json({ error: "API route not found." }));
app.get("*", (req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (error) => {
    if (error) next();
  });
});
app.use((error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
});

await initializeDatabase();
app.listen(port, () => {
  console.log(`Team Task Manager API listening on port ${port}`);
  if (!production) console.warn("Using in-memory sessions for development; sessions will not survive a restart.");
});
