import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { query } from "./db.js";

passport.use(
  new LocalStrategy(
    { usernameField: "email", passwordField: "password" },
    async (email, password, done) => {
      try {
        const result = await query(
          "SELECT id, name, email, password_hash FROM users WHERE email = $1",
          [email.toLowerCase()],
        );
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
          return done(null, false, { message: "Email or password is incorrect." });
        }
        return done(null, { id: user.id, name: user.name, email: user.email });
      } catch (error) {
        return done(error);
      }
    },
  ),
);

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const result = await query("SELECT id, name, email FROM users WHERE id = $1", [id]);
    done(null, result.rows[0] || false);
  } catch (error) {
    done(error);
  }
});

export function requireAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  return res.status(401).json({ error: "Please sign in to continue." });
}

export function requireTeamMember(req, res, next) {
  query(
    "SELECT role FROM team_members WHERE team_id = $1 AND user_id = $2",
    [req.params.id || req.params.teamId, req.user.id],
  )
    .then(({ rows }) => {
      if (!rows[0]) return res.status(404).json({ error: "Team not found." });
      req.teamRole = rows[0].role;
      return next();
    })
    .catch(next);
}

export function requireTaskTeamMember(req, res, next) {
  query(
    `SELECT tm.role FROM tasks t
     JOIN team_members tm ON tm.team_id = t.team_id
     WHERE t.id = $1 AND tm.user_id = $2`,
    [req.params.id, req.user.id],
  )
    .then(({ rows }) => {
      if (!rows[0]) return res.status(404).json({ error: "Task not found." });
      req.taskRole = rows[0].role;
      return next();
    })
    .catch(next);
}
