import { Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Placeholder from "./pages/Placeholder";
import ProductDetail from "./pages/ProductDetail";
import ProductForm from "./pages/ProductForm";
import Products from "./pages/Products";
import Sales from "./pages/Sales";
import { useStock } from "./lib/store";

export default function App() {
  const stock = useStock();
  return (
    <Routes>
      <Route element={<AppShell stock={stock} />}>
        <Route index element={<Dashboard />} />
        <Route path="sales" element={<Sales />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="products" element={<Products />} />
        <Route path="products/new" element={<ProductForm mode="new" />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="products/:id/edit" element={<ProductForm mode="edit" />} />
        {["purchases", "customers", "settings"].map((p) => (
          <Route key={p} path={p} element={<Placeholder name={p} />} />
        ))}
      </Route>
    </Routes>
  );
}
