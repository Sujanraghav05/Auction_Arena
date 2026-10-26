import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login() {
  const { loginWithCredentials, register } = useAuth();
  const [mode, setMode] = useState("login"); // login | register
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "login") {
        await loginWithCredentials(form.email, form.password);
      } else {
        await register(form);
      }
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.error ||
          (err.request
            ? "Could not reach the server. Check that the backend is running and VITE_API_URL is correct."
            : err.message)
      );
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 bg-slate-900 p-6 rounded-lg border border-slate-800">
      <h1 className="text-xl font-bold mb-4">{mode === "login" ? "Login" : "Create account"}</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {mode === "register" && (
          <input
            placeholder="Name"
            className="bg-slate-800 rounded px-3 py-2 outline-none"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        )}
        <input
          placeholder="Email"
          type="email"
          className="bg-slate-800 rounded px-3 py-2 outline-none"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          placeholder="Password"
          type="password"
          className="bg-slate-800 rounded px-3 py-2 outline-none"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button className="bg-amber-500 text-slate-950 font-medium rounded py-2">
          {mode === "login" ? "Login" : "Register"}
        </button>
      </form>
      <button
        className="text-sm text-slate-400 mt-3 underline"
        onClick={() => setMode(mode === "login" ? "register" : "login")}
      >
        {mode === "login" ? "Need an account? Register" : "Have an account? Login"}
      </button>
      <p className="text-xs text-slate-500 mt-4">
        New accounts start as viewers. An admin must promote you to a team or admin role.
      </p>
    </div>
  );
}
