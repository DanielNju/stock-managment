import { Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Placeholder from "./pages/Placeholder";
import ProductDetail from "./pages/ProductDetail";
import ProductForm from "./pages/ProductForm";
import Products from "./pages/Products";
import PurchaseDetail from "./pages/PurchaseDetail";
import PurchaseForm from "./pages/PurchaseForm";
import Purchases from "./pages/Purchases";
import SupplierDetail from "./pages/SupplierDetail";
import SupplierForm from "./pages/SupplierForm";
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
        <Route path="purchases" element={<Purchases />} />
        <Route path="purchases/new" element={<PurchaseForm mode="new" />} />
        <Route path="purchases/suppliers/new" element={<SupplierForm mode="new" />} />
        <Route path="purchases/suppliers/:id" element={<SupplierDetail />} />
        <Route path="purchases/suppliers/:id/edit" element={<SupplierForm mode="edit" />} />
        <Route path="purchases/:id" element={<PurchaseDetail />} />
        <Route path="purchases/:id/edit" element={<PurchaseForm mode="edit" />} />
        {["customers", "settings"].map((p) => (
          <Route key={p} path={p} element={<Placeholder name={p} />} />
        ))}
      </Route>
    </Routes>
  );
}
