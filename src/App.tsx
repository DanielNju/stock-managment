import { Route, Routes } from "react-router-dom";
import AppShell from "./components/AppShell";
import CustomerDetail from "./pages/CustomerDetail";
import CustomerForm from "./pages/CustomerForm";
import Customers from "./pages/Customers";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import ProductDetail from "./pages/ProductDetail";
import ProductForm from "./pages/ProductForm";
import Products from "./pages/Products";
import PurchaseDetail from "./pages/PurchaseDetail";
import PurchaseForm from "./pages/PurchaseForm";
import Purchases from "./pages/Purchases";
import SupplierDetail from "./pages/SupplierDetail";
import SupplierForm from "./pages/SupplierForm";
import Sales from "./pages/Sales";
import Settings from "./pages/Settings";
import Setup from "./pages/Setup";
import { useStock } from "./lib/store";

export default function App() {
  const stock = useStock();
  if (stock.state?.setup) return <Setup stock={stock} />;
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
        <Route path="settings" element={<Settings />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/new" element={<CustomerForm mode="new" />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="customers/:id/edit" element={<CustomerForm mode="edit" />} />
      </Route>
    </Routes>
  );
}
