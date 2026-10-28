
import { useEffect, useState } from "react";
import { api } from "../services/api";

export default function TeamManagement() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "writer",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await api.listUsers();
      setUsers(data.users || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await api.createUser(form);
      setMessage("Team member created successfully.");
      setForm({
        name: "",
        email: "",
        password: "",
        role: "writer",
      });
      await loadUsers();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px",
    marginTop: "6px",
    borderRadius: "8px",
    border: "1px solid #334155",
    background: "#0f172a",
    color: "#f8fafc",
  };

  return (
    <section style={{ padding: "24px", color: "inherit" }}>
      <h2>Team Management</h2>
      <p>Create accounts and manage your organisation's team.</p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          padding: "20px",
          border: "1px solid #334155",
          borderRadius: "14px",
          marginBottom: "24px",
        }}
      >
        <label>
          Full name
          <input
            style={fieldStyle}
            required
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            placeholder="Enter full name"
          />
        </label>

        <label>
          Email
          <input
            style={fieldStyle}
            type="email"
            required
            value={form.email}
            onChange={(e) =>
              setForm({ ...form, email: e.target.value })
            }
            placeholder="name@example.com"
          />
        </label>

        <label>
          Temporary password
          <input
            style={fieldStyle}
            type="password"
            required
            value={form.password}
            onChange={(e) =>
              setForm({ ...form, password: e.target.value })
            }
            placeholder="Create a password"
          />
        </label>

        <label>
          Role
          <select
            style={fieldStyle}
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value })
            }
          >
            <option value="writer">Writer</option>
            <option value="reviewer">Reviewer</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        <button
          type="submit"
          disabled={saving}
          style={{
            padding: "12px 18px",
            border: 0,
            borderRadius: "8px",
            background: "#2563eb",
            color: "white",
            fontWeight: 600,
            cursor: saving ? "wait" : "pointer",
            alignSelf: "end",
          }}
        >
          {saving ? "Creating..." : "Create User"}
        </button>
      </form>

      {message && <p role="status">{message}</p>}
      {error && <p role="alert" style={{ color: "#ef4444" }}>{error}</p>}

      <h3>Organisation Members</h3>

      {loading ? (
        <p>Loading users...</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Name</th>
                <th align="left">Email</th>
                <th align="left">Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td style={{ padding: "12px 8px" }}>{user.name}</td>
                  <td style={{ padding: "12px 8px" }}>{user.email}</td>
                  <td style={{ padding: "12px 8px" }}>{user.role}</td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: "12px 8px" }}>
                    No team members found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
