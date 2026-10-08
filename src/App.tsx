import { Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Placeholder from "./pages/Placeholder";
import { useStock } from "./lib/store";

export default function App() {
  const stock = useStock();
  return (
    <Routes>
      <Route element={<AppShell stock={stock} />}>
        <Route index element={<Dashboard />} />
        {["sales", "products", "inventory", "purchases", "customers", "settings"].map((p) => (
          <Route key={p} path={p} element={<Placeholder name={p} />} />
        ))}
      </Route>
    </Routes>
  );
}
