import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Command,
  Filter,
  FolderKanban,
  LayoutGrid,
  ListTodo,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Users,
  X,
} from "lucide-react";

const API = "/api";
const COLORS = ["#715be8", "#f09d68", "#4aa990", "#e56d91", "#5297db", "#9b72c7"];

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  if (response.redirected) {
    throw new Error("The API redirected this request. Make the API deployment publicly accessible in Vercel Deployment Protection settings.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("The API returned an unexpected response. Check that the Vercel API deployment is public and running correctly.");
  }
  if (!response.ok) {
    const result = await response.json();
    const error = new Error(result.error || "Something went wrong. Please try again.");
    error.status = response.status;
    if (response.status === 401 && !path.startsWith("/auth/")) {
      error.message = "Your session expired. Please sign in again.";
      window.dispatchEvent(new Event("teamtasks:session-expired"));
    }
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

function initials(name = "") {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function formatDate(value, options = { month: "short", day: "numeric" }) {
  if (!value) return "";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("en", options).format(date);
}

function isOverdue(value) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return Boolean(value && String(value).slice(0, 10) < today);
}

function Avatar({ name, color, size = "normal" }) {
  return (
    <span
      className={`avatar ${size === "small" ? "avatar-small" : ""}`}
      style={{ backgroundColor: color || "#e9e6ff" }}
      aria-label={name || "Unassigned"}
      title={name || "Unassigned"}
    >
      {name ? initials(name) : <Users size={12} />}
    </span>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="brand-mark"><Command size={19} strokeWidth={2.6} /></span>
      <span className="font-display text-[20px] font-extrabold tracking-[-0.8px] text-ink">teamo<span className="text-violet">.</span></span>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [teams, setTeams] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState("all");
  const [selectedAssignee, setSelectedAssignee] = useState("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("overview");
  const [modal, setModal] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [taskMembers, setTaskMembers] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAssignees, setShowAssignees] = useState(false);
  const [toast, setToast] = useState("");

  const loadData = useCallback(async () => {
    const [teamData, taskData] = await Promise.all([
      request("/teams"),
      request("/tasks"),
    ]);
    setTeams(teamData.teams);
    setTasks(taskData.tasks);
  }, []);

  useEffect(() => {
    request("/auth/me")
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch((authError) => {
        if (authError.status !== 401) setError(authError.message);
        setUser(null);
      })
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      setUser(null);
      setTeams([]);
      setTasks([]);
      setModal(null);
      setError("Your session expired. Please sign in again.");
    };
    window.addEventListener("teamtasks:session-expired", handleSessionExpired);
    return () => window.removeEventListener("teamtasks:session-expired", handleSessionExpired);
  }, []);

  useEffect(() => {
    if (user) loadData().catch((loadError) => setError(loadError.message));
  }, [user, loadData]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const matchesTeam = selectedTeam === "all" || String(task.team_id) === selectedTeam;
    const matchesAssignee = selectedAssignee === "all"
      || (selectedAssignee === "me" ? String(task.assignee_id) === String(user?.id) : String(task.assignee_id) === selectedAssignee);
    const search = query.trim().toLowerCase();
    const matchesSearch = !search
      || `${task.title} ${task.description} ${task.team_name} ${task.assignee_name || ""}`.toLowerCase().includes(search);
    const matchesView = view === "my-tasks"
      ? String(task.assignee_id) === String(user?.id)
      : view === "upcoming"
        ? task.status !== "done" && task.due_date
        : true;
    return matchesTeam && matchesAssignee && matchesSearch && matchesView;
  }), [tasks, selectedTeam, selectedAssignee, query, view, user]);

  const stats = useMemo(() => ({
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === "in_progress").length,
    done: tasks.filter((task) => task.status === "done").length,
    overdue: tasks.filter((task) => task.status !== "done" && isOverdue(task.due_date)).length,
  }), [tasks]);

  async function handleAuth(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      await request(`/auth/${authMode === "login" ? "login" : "register"}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const { user: authenticatedUser } = await request("/auth/me");
      setUser(authenticatedUser);
    } catch (authError) {
      setError(authError.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await request("/auth/logout", { method: "POST" });
      setUser(null);
      setTeams([]);
      setTasks([]);
    } catch (logoutError) {
      setError(logoutError.message);
    }
  }

  function openTask(task = null) {
    setEditingTask(task);
    const teamId = task?.team_id || (selectedTeam !== "all" ? selectedTeam : teams[0]?.id);
    setTaskMembers([]);
    setError("");
    setModal("task");
    if (teamId) {
      request(`/teams/${teamId}/members`)
        .then((result) => setTaskMembers(result.members))
        .catch((memberError) => setError(memberError.message));
    }
  }

  async function saveTask(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const data = Object.fromEntries(form.entries());
    const payload = {
      ...data,
      teamId: Number(data.teamId),
      assigneeId: data.assigneeId ? Number(data.assigneeId) : null,
      dueDate: data.dueDate || null,
    };
    try {
      await request(editingTask ? `/tasks/${editingTask.id}` : "/tasks", {
        method: editingTask ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setModal(null);
      await loadData();
      setToast(editingTask ? "Task updated" : "Task created");
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveTeam(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const payload = { name: form.get("name"), description: form.get("description") };
    try {
      const result = await request(editingTeam ? `/teams/${editingTeam.id}` : "/teams", {
        method: editingTeam ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      await loadData();
      if (!editingTeam) {
        setSelectedTeam(String(result.team.id));
        setToast("Your new team is ready");
      } else {
        setToast("Team updated");
      }
      setModal(null);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteTeam(team) {
    if (!window.confirm(`Delete "${team.name}" and all of its tasks? This can't be undone.`)) return;
    try {
      await request(`/teams/${team.id}`, { method: "DELETE" });
      if (selectedTeam === String(team.id)) setSelectedTeam("all");
      await loadData();
      setToast("Team deleted");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function deleteTask(task) {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await request(`/tasks/${task.id}`, { method: "DELETE" });
      await loadData();
      setToast("Task deleted");
    } catch (deleteError) {
      setError(deleteError.message);
    }
  }

  async function openTeam(team) {
    setEditingTeam(team);
    setError("");
    setMembers([]);
    setModal("team");
    if (team) {
      try {
        const result = await request(`/teams/${team.id}/members`);
        setMembers(result.members);
      } catch (memberError) {
        setError(memberError.message);
      }
    }
  }

  async function addMember(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = new FormData(form).get("email");
    setError("");
    try {
      await request(`/teams/${editingTeam.id}/members`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const result = await request(`/teams/${editingTeam.id}/members`);
      setMembers(result.members);
      form.reset();
      setToast("Team member added");
      await loadData();
    } catch (memberError) {
      setError(memberError.message);
    }
  }

  if (!authChecked) {
    return <div className="loading-screen"><span className="loading-dot" />Getting your workspace ready…</div>;
  }

  if (!user) {
    return (
      <main className="auth-page">
        <div className="auth-decoration auth-decoration-one" />
        <div className="auth-decoration auth-decoration-two" />
        <section className="auth-card">
          <Brand />
          <div className="mt-12">
            <div className="auth-sparkle"><Sparkles size={19} /></div>
            <p className="eyebrow mt-5">YOUR TEAM'S HAPPY PLACE</p>
            <h1 className="font-display mt-3 text-[36px] font-bold leading-[1.16] tracking-[-1.5px] text-ink">
              Make space for<br /><span className="text-violet">great work.</span>
            </h1>
            <p className="mt-4 max-w-[360px] text-sm leading-6 text-muted">
              Bring your team, tasks, and big ideas together. A little more organized, a lot more human.
            </p>
          </div>
          <form className="mt-8 space-y-4" onSubmit={handleAuth}>
            {authMode === "register" && <Field label="Your name" name="name" placeholder="Jamie Parker" required autoComplete="name" />}
            <Field label="Email address" name="email" type="email" placeholder="you@company.com" required autoComplete="email" />
            <Field label="Password" name="password" type="password" placeholder="At least 8 characters" required minLength={8} autoComplete={authMode === "login" ? "current-password" : "new-password"} />
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <button className="primary-button w-full justify-center !py-3.5" disabled={busy}>
              {busy ? "One moment…" : authMode === "login" ? "Sign in to your workspace" : "Create your account"}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {authMode === "login" ? "New around here?" : "Already have an account?"}{" "}
            <button className="font-semibold text-violet hover:underline" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }}>
              {authMode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <div className="auth-foot"><span /> Simple plans. Shared wins. <span /></div>
        </section>
        <aside className="auth-quote">
          <div className="quote-mark">“</div>
          <p>Great things happen when everyone knows what matters.</p>
          <div className="mt-8 flex items-center gap-3">
            <span className="quote-avatars"><Avatar name="Mia Chen" color="#ffc19c" /><Avatar name="Alex Reed" color="#aee2cc" /><Avatar name="Sam Lee" color="#c6baff" /></span>
            <span><strong className="block text-sm text-ink">Teams that click</strong><small className="text-muted">start with a little clarity</small></span>
          </div>
        </aside>
      </main>
    );
  }

  const activeTeam = teams.find((team) => String(team.id) === selectedTeam);
  const title = view === "my-tasks" ? "My tasks" : view === "upcoming" ? "Coming up" : activeTeam ? activeTeam.name : "Overview";
  const subtitle = activeTeam?.description || (view === "my-tasks"
    ? "Your personal corner of the team's work."
    : view === "upcoming" ? "A little look at what's on the horizon." : "A little clarity goes a long way.");
  const taskAssignees = [...new Map(tasks.filter((task) => task.assignee_id).map((task) => [
    task.assignee_id,
    { id: task.assignee_id, name: task.assignee_name },
  ])).values()];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><Brand /><span className="workspace-chevron"><ChevronDown size={14} /></span></div>
        <div className="workspace-card">
          <div className="workspace-icon"><Sparkles size={16} /></div>
          <div className="min-w-0"><strong>{user.name.split(" ")[0]}'s space</strong><span>Free workspace</span></div>
          <MoreHorizontal size={17} className="ml-auto text-muted" />
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <NavItem icon={<LayoutGrid size={17} />} active={view === "overview" && selectedTeam === "all"} onClick={() => { setView("overview"); setSelectedTeam("all"); }}>Overview</NavItem>
          <NavItem icon={<ListTodo size={17} />} active={view === "my-tasks"} onClick={() => setView("my-tasks")}>My tasks<span className="nav-count">{stats.total ? tasks.filter((task) => String(task.assignee_id) === String(user.id) && task.status !== "done").length : ""}</span></NavItem>
          <NavItem icon={<Clock3 size={17} />} active={view === "upcoming"} onClick={() => setView("upcoming")}>Coming up</NavItem>
        </nav>
        <div className="sidebar-section-heading"><span>YOUR TEAMS</span><button aria-label="Create a team" onClick={() => { setEditingTeam(null); setError(""); setModal("team"); }}><Plus size={15} /></button></div>
        <div className="team-nav">
          {teams.map((team, index) => (
            <button
              key={team.id}
              className={`team-nav-item ${selectedTeam === String(team.id) ? "team-nav-active" : ""}`}
              onClick={() => { setSelectedTeam(String(team.id)); setView("overview"); }}
            >
              <span className="team-color" style={{ background: COLORS[index % COLORS.length] }}>{team.name.slice(0, 1).toUpperCase()}</span>
              <span className="truncate">{team.name}</span>
              <span className="team-nav-count">{team.task_count}</span>
            </button>
          ))}
          {!teams.length && <p className="px-3 py-2 text-xs leading-5 text-muted">Your teams will show up here.</p>}
          <button className="add-team-link" onClick={() => { setEditingTeam(null); setError(""); setModal("team"); }}><span><Plus size={14} /></span> Create a team</button>
        </div>
        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-icon"><Sparkles size={15} /></div>
            <strong>Good things take teamwork.</strong>
            <p>Invite your people and make it happen.</p>
            <button onClick={() => { setEditingTeam(null); setError(""); setModal("team"); }}>Get started <ArrowRight size={13} /></button>
            <span className="upgrade-orb" />
          </div>
          <button className="profile-row" onClick={logout}>
            <Avatar name={user.name} color="#d9d0ff" />
            <span className="min-w-0 flex-1 text-left"><strong className="block truncate text-[13px] text-ink">{user.name}</strong><small className="block truncate text-[11px] text-muted">{user.email}</small></span>
            <LogOut size={16} className="text-muted" />
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><ChevronRight size={14} /><strong>{title}</strong></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find something..." /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" aria-label="Notifications"><Bell size={17} /><i /></button>
            <Avatar name={user.name} color="#d9d0ff" />
          </div>
        </header>
        <div className="mobile-brand"><Brand /><button className="mobile-logout" onClick={logout}><LogOut size={17} /></button></div>
        <section className="dashboard-content">
          {error && <div className="inline-error"><span>{error}</span><button onClick={() => setError("")} aria-label="Dismiss"><X size={15} /></button></div>}
          <div className="welcome-row">
            <div><p className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date()).toUpperCase()}</p><h1 className="font-display">{title}<span className="title-spark">✳</span></h1><p className="welcome-subtitle">{subtitle}</p></div>
            <div className="welcome-actions">
              {activeTeam && <button className="secondary-button" onClick={() => openTeam(activeTeam)}><Users size={15} /> Team details</button>}
              <button className="primary-button" onClick={() => openTask()} disabled={!teams.length} title={!teams.length ? "Create a team before adding tasks" : undefined}><Plus size={17} strokeWidth={2.4} /> Add a task</button>
            </div>
          </div>
          <label className="mobile-search"><Search size={16} /><input aria-label="Find tasks" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks and teams…" /></label>

          <div className="stats-grid">
            <StatCard label="All tasks" value={stats.total} icon={<ListTodo size={17} />} tint="violet" note="Across your teams" />
            <StatCard label="In progress" value={stats.inProgress} icon={<ArrowDownUp size={17} />} tint="blue" note="Things are moving" />
            <StatCard label="All done" value={stats.done} icon={<CheckCircle2 size={17} />} tint="green" note="Look at you go" />
            <StatCard label="Past due" value={stats.overdue} icon={<Clock3 size={17} />} tint="peach" note="Needs a little love" />
          </div>

          <section className="task-panel">
            <div className="task-panel-heading">
              <div><div className="flex items-center gap-2"><h2>Tasks to keep an eye on</h2><span className="task-count-pill">{filteredTasks.length}</span></div><p>All the little things that add up to big things.</p></div>
              <div className="task-panel-tools">
                <label className="team-filter-select"><FolderKanban size={14} /><select aria-label="Filter by team" value={selectedTeam} onChange={(event) => { setSelectedTeam(event.target.value); setView("overview"); }}><option value="all">All teams</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><ChevronDown size={12} /></label>
                <div className="assignee-filter-wrap">
                  <button className={`filter-button ${selectedAssignee !== "all" ? "filter-active" : ""}`} onClick={() => setShowAssignees(!showAssignees)}><Filter size={14} /> Assignee <ChevronDown size={13} /></button>
                  {showAssignees && <div className="filter-menu">
                    {[{ id: "all", name: "Anyone" }, { id: "me", name: "Assigned to me" }, ...taskAssignees].map((person) => (
                      <button key={person.id} onClick={() => { setSelectedAssignee(String(person.id)); setShowAssignees(false); }}>
                        {selectedAssignee === String(person.id) && <Check size={14} />}{person.name}
                      </button>
                    ))}
                  </div>}
                </div>
                <button className="filter-button view-button" onClick={() => setView(view === "my-tasks" ? "overview" : "my-tasks")}><Settings2 size={14} /> {view === "my-tasks" ? "All tasks" : "My tasks"}</button>
              </div>
            </div>

            <div className="task-table-head"><span>NAME</span><span>TEAM</span><span>ASSIGNEE</span><span>DUE DATE</span><span>PRIORITY</span><span>STATUS</span><span /></div>
            {filteredTasks.length ? (
              <div className="task-list">{filteredTasks.map((task) => (
                <TaskRow key={task.id} task={task} onEdit={() => openTask(task)} onDelete={() => deleteTask(task)} onStatus={async (status) => {
                  try {
                    await request(`/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ ...task, teamId: task.team_id, assigneeId: task.assignee_id, dueDate: task.due_date, status }) });
                    await loadData();
                    setToast(status === "done" ? "Nice work — task complete!" : "Task moved forward");
                  } catch (statusError) { setError(statusError.message); }
                }} />
              ))}</div>
            ) : (
              <div className="empty-state">
                <span className="empty-illustration"><FolderKanban size={24} /></span>
                <strong>{tasks.length ? "Nothing matches just yet" : teams.length ? "A fresh start looks good on you" : "Start with your first team"}</strong>
                <p>{tasks.length ? "Try changing your search or filters." : teams.length ? "Create your first task and get the ball rolling." : "Teams keep your tasks and teammates together."}</p>
                {!tasks.length && <button className="text-button mt-2" onClick={() => {
                  if (teams.length) openTask();
                  else { setEditingTeam(null); setError(""); setModal("team"); }
                }}><Plus size={15} /> {teams.length ? "Make a task" : "Create a team"}</button>}
              </div>
            )}
            <div className="task-panel-footer"><span>Showing <strong>{filteredTasks.length}</strong> of <strong>{tasks.length}</strong> tasks</span><button onClick={() => { setView("overview"); setSelectedTeam("all"); setSelectedAssignee("all"); setQuery(""); }}>Clear filters <ArrowRight size={13} /></button></div>
          </section>
          <footer className="dashboard-footer"><span>Made for the work that matters <span className="footer-heart">♥</span></span><span>{teams.length} {teams.length === 1 ? "team" : "teams"} · {tasks.filter((task) => task.status !== "done").length} things in motion</span></footer>
        </section>
      </main>

      {modal === "task" && <Modal title={editingTask ? "A little task tune-up" : "Add a new task"} subtitle="Good work starts with a clear next step." onClose={() => setModal(null)}>
        <form className="modal-form" onSubmit={saveTask}>
          <Field label="Task name" name="title" placeholder="What needs doing?" required maxLength={120} defaultValue={editingTask?.title || ""} />
          <label className="form-field"><span>A few more details <small>· optional</small></span><textarea name="description" rows="3" maxLength="1000" placeholder="Add a little context for your team…" defaultValue={editingTask?.description || ""} /></label>
          <div className="form-grid">
            <label className="form-field"><span>Team</span><select name="teamId" required defaultValue={editingTask?.team_id || (selectedTeam !== "all" ? selectedTeam : teams[0]?.id || "")} onChange={(event) => { event.currentTarget.form.elements.assigneeId.value = ""; request(`/teams/${event.target.value}/members`).then((result) => setTaskMembers(result.members)).catch((memberError) => setError(memberError.message)); }}><option value="" disabled>Choose a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
            <label className="form-field"><span>Assign to</span><select name="assigneeId" defaultValue={editingTask?.assignee_id || ""}><option value="">Nobody yet</option>{taskMembers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="form-field"><span>Due date</span><input type="date" name="dueDate" defaultValue={editingTask?.due_date ? String(editingTask.due_date).slice(0, 10) : ""} /></label>
            <label className="form-field"><span>Priority</span><select name="priority" defaultValue={editingTask?.priority || "medium"}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
          </div>
          <label className="form-field"><span>Where's it at?</span><select name="status" defaultValue={editingTask?.status || "todo"}><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Maybe later</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editingTask ? "Save changes" : "Create task"} <ArrowRight size={15} /></button></div>
        </form>
      </Modal>}

      {modal === "team" && <Modal title={editingTeam ? "Your team, your way" : "Start a new team"} subtitle={editingTeam?.role === "member" ? "Meet the people you work with." : editingTeam ? "Keep the team details up to date." : "A little space for a whole lot of good work."} onClose={() => setModal(null)}>
        {(editingTeam?.role === "owner" || !editingTeam) && <form className="modal-form" onSubmit={saveTeam}>
          <Field label="Team name" name="name" placeholder="The dream team" required maxLength={80} defaultValue={editingTeam?.name || ""} />
          <label className="form-field"><span>What are you working on? <small>· optional</small></span><textarea name="description" rows="2" maxLength="240" placeholder="A few words about this team…" defaultValue={editingTeam?.description || ""} /></label>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModal(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editingTeam ? "Save team" : "Create team"} <ArrowRight size={15} /></button></div>
        </form>}
        {editingTeam && editingTeam.role !== "owner" && error && <div className="mt-4"><ErrorMessage>{error}</ErrorMessage></div>}
        {editingTeam && <>
          <div className="member-section">
            <div className="member-section-title"><div><h3>Your people</h3><p>{members.length} {members.length === 1 ? "member" : "members"} on this team</p></div><Users size={17} /></div>
            <div className="member-list">{members.map((member, index) => <div className="member-row" key={member.id}><Avatar size="small" name={member.name} color={COLORS[index % COLORS.length]} /><span><strong>{member.name}</strong><small>{member.email}</small></span><em>{member.role}</em></div>)}</div>
            {editingTeam.role === "owner" && <form className="add-member-form" onSubmit={addMember}><input type="email" name="email" placeholder="Add someone by email" required aria-label="Member email" /><button aria-label="Add member"><Plus size={16} /></button></form>}
          </div>
          {editingTeam.role === "owner" && <button className="danger-link" onClick={() => { setModal(null); deleteTeam(editingTeam); }}>Delete this team</button>}
        </>}
      </Modal>}

      {toast && <div className="toast"><span><Check size={15} /></span>{toast}</div>}
    </div>
  );
}

function NavItem({ icon, active, onClick, children }) {
  return <button className={`nav-item ${active ? "nav-active" : ""}`} onClick={onClick}>{icon}<span>{children}</span></button>;
}

function StatCard({ label, value, icon, tint, note }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon stat-${tint}`}>{icon}</span></div><div className="stat-bottom"><strong>{value}</strong><span>{note}</span></div></div>;
}

function TaskRow({ task, onEdit, onDelete, onStatus }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const actionsRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!actionsRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  return (
    <article className="task-row">
      <div className="task-name-cell">
        <button className={`task-check ${task.status === "done" ? "task-check-done" : ""}`} onClick={() => onStatus(task.status === "done" ? "todo" : "done")} aria-label={task.status === "done" ? "Mark task as to do" : "Mark task as done"}>{task.status === "done" ? <Check size={12} /> : <span />}</button>
        <button className="task-title-button" onClick={onEdit}><strong className={task.status === "done" ? "completed-title" : ""}>{task.title}</strong><small>{task.description || "No extra details"}</small></button>
      </div>
      <span className="task-team-cell"><i style={{ background: COLORS[(Number(task.team_id) - 1) % COLORS.length] }} />{task.team_name}</span>
      <div className="task-assignee-cell">{task.assignee_name ? <><Avatar size="small" name={task.assignee_name} color={COLORS[(Number(task.assignee_id) + 2) % COLORS.length]} /><span>{task.assignee_name.split(" ")[0]}</span></> : <span className="unassigned"><Circle size={15} /> —</span>}</div>
      <span className={`task-due-cell ${isOverdue(task.due_date) && task.status !== "done" ? "overdue" : ""}`}>{task.due_date ? <><Clock3 size={13} />{formatDate(task.due_date)}</> : <span className="no-date">No date</span>}</span>
      <span><span className={`priority-pill priority-${task.priority}`}><i />{task.priority}</span></span>
      <span><button className={`status-pill status-${task.status}`} onClick={() => onStatus(task.status === "todo" ? "in_progress" : task.status === "in_progress" ? "done" : "todo")} title="Click to move to the next status">{task.status === "in_progress" ? "In progress" : task.status === "done" ? "Done" : "To do"}</button></span>
      <div className={`task-actions ${menuOpen ? "task-actions-open" : ""}`} ref={actionsRef}>
        <button
          type="button"
          className="task-menu-trigger"
          aria-label={`More actions for ${task.title}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MoreHorizontal size={17} />
        </button>
        {menuOpen && <div className="task-action-menu" role="menu">
          <button role="menuitem" onClick={() => { setMenuOpen(false); onEdit(); }}>Edit task</button>
          <button role="menuitem" className="delete-action" onClick={() => { setMenuOpen(false); onDelete(); }}>Delete task</button>
        </div>}
      </div>
    </article>
  );
}

function Field({ label, name, type = "text", ...props }) {
  return <label className="form-field"><span>{label}</span><input type={type} name={name} {...props} /></label>;
}

function ErrorMessage({ children }) {
  return <p className="error-message" role="alert"><span>!</span>{children}</p>;
}

function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const handleKey = (event) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><span className="modal-icon"><Sparkles size={18} /></span><button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div>{children}</section></div>;
}

export default App;
